import { db } from "../db";
import { vehiclePrioritySettings, landVehicleTypes, warehouseInventoryItems } from "@shared/schema";
import { eq, asc, and, inArray } from "drizzle-orm";

export interface VehiclePriorityItem {
  id: number;
  vehicleTypeId: number;
  vehicleCode: string;
  vehicleName: string;
  priorityOrder: number;
  isEnabled: boolean;
  payloadLbs: number;
  payloadOverrideLbs: number | null;
  effectivePayloadLbs: number;
  notes: string | null;
}

export interface VehicleAllocationResult {
  vehicleTypeId: number;
  vehicleCode: string;
  vehicleName: string;
  payloadLbs: number;
  vehicleCount: number;
  totalCapacity: number;
}

export interface TransferVehiclePreview {
  totalWeightLbs: number;
  itemCount: number;
  allocations: VehicleAllocationResult[];
  totalVehicles: number;
  totalCapacity: number;
  utilizationPercent: number;
}

const DEFAULT_WEIGHT_LBS = 500;
const DENSITY_LBS_PER_CUBIC_INCH = 0.02;

function estimateItemWeight(item: {
  weight_lbs: string | number | null;
  length_in: string | number | null;
  width_in: string | number | null;
  height_in: string | number | null;
}): number {
  if (item.weight_lbs) {
    const weight = parseFloat(String(item.weight_lbs));
    if (weight > 0) return weight;
  }
  
  const length = item.length_in ? parseFloat(String(item.length_in)) : 0;
  const width = item.width_in ? parseFloat(String(item.width_in)) : 0;
  const height = item.height_in ? parseFloat(String(item.height_in)) : 0;
  
  if (length > 0 && width > 0 && height > 0) {
    const volumeCubicIn = length * width * height;
    return Math.round(volumeCubicIn * DENSITY_LBS_PER_CUBIC_INCH);
  }
  
  return DEFAULT_WEIGHT_LBS;
}

export async function getVehiclePriorityList(): Promise<VehiclePriorityItem[]> {
  const results = await db
    .select({
      id: vehiclePrioritySettings.id,
      vehicleTypeId: vehiclePrioritySettings.vehicle_type_id,
      priorityOrder: vehiclePrioritySettings.priority_order,
      isEnabled: vehiclePrioritySettings.is_enabled,
      payloadOverrideLbs: vehiclePrioritySettings.payload_override_lbs,
      notes: vehiclePrioritySettings.notes,
      vehicleCode: landVehicleTypes.code,
      vehicleName: landVehicleTypes.name,
      payloadLbs: landVehicleTypes.payload_lbs,
    })
    .from(vehiclePrioritySettings)
    .innerJoin(landVehicleTypes, eq(vehiclePrioritySettings.vehicle_type_id, landVehicleTypes.id))
    .where(eq(vehiclePrioritySettings.is_enabled, true))
    .orderBy(asc(vehiclePrioritySettings.priority_order));

  return results.map((row) => ({
    id: row.id,
    vehicleTypeId: row.vehicleTypeId,
    vehicleCode: row.vehicleCode,
    vehicleName: row.vehicleName,
    priorityOrder: row.priorityOrder,
    isEnabled: row.isEnabled,
    payloadLbs: row.payloadLbs,
    payloadOverrideLbs: row.payloadOverrideLbs,
    effectivePayloadLbs: row.payloadOverrideLbs ?? row.payloadLbs,
    notes: row.notes,
  }));
}

export async function calculateVehicleAllocation(totalWeightLbs: number): Promise<VehicleAllocationResult[]> {
  if (totalWeightLbs <= 0) {
    return [];
  }

  const priorityList = await getVehiclePriorityList();
  
  if (priorityList.length === 0) {
    return [];
  }

  const allocations: VehicleAllocationResult[] = [];
  let remainingWeight = totalWeightLbs;

  for (const vehicle of priorityList) {
    if (remainingWeight <= 0) {
      break;
    }

    const effectivePayload = vehicle.effectivePayloadLbs;
    if (effectivePayload <= 0) {
      continue;
    }

    const vehicleCount = Math.ceil(remainingWeight / effectivePayload);
    const totalCapacity = vehicleCount * effectivePayload;

    allocations.push({
      vehicleTypeId: vehicle.vehicleTypeId,
      vehicleCode: vehicle.vehicleCode,
      vehicleName: vehicle.vehicleName,
      payloadLbs: effectivePayload,
      vehicleCount,
      totalCapacity,
    });

    remainingWeight = 0;
  }

  return allocations;
}

export async function previewTransferVehicles(
  itemIds: number[],
  siteId: number
): Promise<TransferVehiclePreview & { warning?: string; error?: string }> {
  if (itemIds.length === 0) {
    return {
      totalWeightLbs: 0,
      itemCount: 0,
      allocations: [],
      totalVehicles: 0,
      totalCapacity: 0,
      utilizationPercent: 0,
    };
  }

  const items = await db
    .select({
      id: warehouseInventoryItems.id,
      weight_lbs: warehouseInventoryItems.weight_lbs,
      quantity: warehouseInventoryItems.quantity,
      length_in: warehouseInventoryItems.length_in,
      width_in: warehouseInventoryItems.width_in,
      height_in: warehouseInventoryItems.height_in,
    })
    .from(warehouseInventoryItems)
    .where(
      and(
        eq(warehouseInventoryItems.site_id, siteId),
        inArray(warehouseInventoryItems.id, itemIds)
      )
    );

  let totalWeightLbs = 0;
  for (const item of items) {
    const itemWeight = estimateItemWeight(item);
    const qty = item.quantity || 1;
    totalWeightLbs += itemWeight * qty;
  }

  const allocations = await calculateVehicleAllocation(totalWeightLbs);

  const totalVehicles = allocations.reduce((sum, a) => sum + a.vehicleCount, 0);
  const totalCapacity = allocations.reduce((sum, a) => sum + a.totalCapacity, 0);
  const utilizationPercent = totalCapacity > 0 ? (totalWeightLbs / totalCapacity) * 100 : 0;

  // Check if no allocations returned but there's weight to move
  if (allocations.length === 0 && totalWeightLbs > 0) {
    return {
      totalWeightLbs,
      itemCount: items.length,
      allocations: [],
      totalVehicles: 0,
      totalCapacity: 0,
      utilizationPercent: 0,
      warning: "No vehicle priorities configured",
    };
  }

  return {
    totalWeightLbs,
    itemCount: items.length,
    allocations,
    totalVehicles,
    totalCapacity,
    utilizationPercent: Math.round(utilizationPercent * 100) / 100,
  };
}

export async function getAllVehiclePrioritySettings() {
  const results = await db
    .select({
      id: vehiclePrioritySettings.id,
      vehicleTypeId: vehiclePrioritySettings.vehicle_type_id,
      priorityOrder: vehiclePrioritySettings.priority_order,
      isEnabled: vehiclePrioritySettings.is_enabled,
      payloadOverrideLbs: vehiclePrioritySettings.payload_override_lbs,
      notes: vehiclePrioritySettings.notes,
      updatedBy: vehiclePrioritySettings.updated_by,
      createdAt: vehiclePrioritySettings.created_at,
      updatedAt: vehiclePrioritySettings.updated_at,
      vehicleCode: landVehicleTypes.code,
      vehicleName: landVehicleTypes.name,
      payloadLbs: landVehicleTypes.payload_lbs,
    })
    .from(vehiclePrioritySettings)
    .innerJoin(landVehicleTypes, eq(vehiclePrioritySettings.vehicle_type_id, landVehicleTypes.id))
    .orderBy(asc(vehiclePrioritySettings.priority_order));

  return results;
}

export async function upsertVehiclePriority(
  vehicleTypeId: number,
  priorityOrder: number,
  isEnabled: boolean,
  payloadOverrideLbs: number | null,
  notes: string | null,
  updatedBy: number
) {
  const existing = await db
    .select()
    .from(vehiclePrioritySettings)
    .where(eq(vehiclePrioritySettings.vehicle_type_id, vehicleTypeId))
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(vehiclePrioritySettings)
      .set({
        priority_order: priorityOrder,
        is_enabled: isEnabled,
        payload_override_lbs: payloadOverrideLbs,
        notes,
        updated_by: updatedBy,
        updated_at: new Date(),
      })
      .where(eq(vehiclePrioritySettings.vehicle_type_id, vehicleTypeId))
      .returning();
    return updated;
  } else {
    const [created] = await db
      .insert(vehiclePrioritySettings)
      .values({
        vehicle_type_id: vehicleTypeId,
        priority_order: priorityOrder,
        is_enabled: isEnabled,
        payload_override_lbs: payloadOverrideLbs,
        notes,
        updated_by: updatedBy,
      })
      .returning();
    return created;
  }
}

export async function deleteVehiclePriority(id: number) {
  const [deleted] = await db
    .delete(vehiclePrioritySettings)
    .where(eq(vehiclePrioritySettings.id, id))
    .returning();
  return deleted;
}
