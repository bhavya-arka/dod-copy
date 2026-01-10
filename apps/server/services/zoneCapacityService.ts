import { db } from "../db";
import { 
  warehouseZones, 
  warehouseInventoryItems, 
  warehouseLocations,
  warehouseZoneCapacityHistory 
} from "@shared/schema";
import { eq, and, sql, gte, lte, sum, count, isNull } from "drizzle-orm";
import { matchLocationToZone, type ZoneMatchResult } from "./zoneMatchingService";
import type { WarehouseZone } from "@shared/schema";

export interface ZoneCapacityData {
  zoneId: number;
  zoneName: string;
  zoneCode: string;
  itemCount: number;
  totalWeightLbs: number;
  totalCapacity: number;
  utilizationPercent: number;
}

export interface SiteCapacitySummary {
  siteId: number;
  totalZones: number;
  totalCapacity: number;
  totalItemCount: number;
  totalWeightLbs: number;
  averageUtilization: number;
  zones: ZoneCapacityData[];
}

export interface ResyncResult {
  success: boolean;
  zonesUpdated: number;
  itemsProcessed: number;
  itemsBackfilled: number;
  errors: string[];
}

export interface BackfillResult {
  success: boolean;
  itemsUpdated: number;
  itemsProcessed: number;
  errors: string[];
}

export async function backfillZoneIds(siteId: number): Promise<BackfillResult> {
  const result: BackfillResult = {
    success: true,
    itemsUpdated: 0,
    itemsProcessed: 0,
    errors: []
  };

  try {
    const zones = await db.select()
      .from(warehouseZones)
      .where(eq(warehouseZones.site_id, siteId));

    if (zones.length === 0) {
      console.log(`[ZoneCapacity] No zones found for site ${siteId}, skipping backfill`);
      return result;
    }

    const itemsWithNullZone = await db.select()
      .from(warehouseInventoryItems)
      .where(and(
        eq(warehouseInventoryItems.site_id, siteId),
        isNull(warehouseInventoryItems.zone_id)
      ));

    result.itemsProcessed = itemsWithNullZone.length;

    if (itemsWithNullZone.length === 0) {
      console.log(`[ZoneCapacity] No items with NULL zone_id for site ${siteId}`);
      return result;
    }

    console.log(`[ZoneCapacity] Backfilling zone_id for ${itemsWithNullZone.length} items in site ${siteId}`);

    const locationToZoneMap = new Map<number, number>();
    const locations = await db.select()
      .from(warehouseLocations)
      .where(eq(warehouseLocations.site_id, siteId));
    
    for (const loc of locations) {
      if (loc.zone_id !== null) {
        locationToZoneMap.set(loc.id, loc.zone_id);
      }
    }

    for (const item of itemsWithNullZone) {
      let matchedZoneId: number | null = null;

      if (item.location_id !== null && locationToZoneMap.has(item.location_id)) {
        matchedZoneId = locationToZoneMap.get(item.location_id)!;
      }
      else if (item.location) {
        const matchResult = matchLocationToZone(item.location, zones);
        if (matchResult.zoneId !== null) {
          matchedZoneId = matchResult.zoneId;
        }
      }

      if (matchedZoneId !== null) {
        try {
          await db.update(warehouseInventoryItems)
            .set({ zone_id: matchedZoneId })
            .where(eq(warehouseInventoryItems.id, item.id));
          result.itemsUpdated++;
        } catch (error) {
          result.errors.push(`Failed to update item ${item.id}: ${error}`);
        }
      }
    }

    console.log(`[ZoneCapacity] Backfilled ${result.itemsUpdated}/${result.itemsProcessed} items for site ${siteId}`);
  } catch (error) {
    result.success = false;
    result.errors.push(`Backfill failed: ${error}`);
    console.error("[ZoneCapacity] Backfill error:", error);
  }

  return result;
}

export async function resyncZoneCapacity(
  siteId: number, 
  zoneId?: number
): Promise<ResyncResult> {
  const result: ResyncResult = {
    success: true,
    zonesUpdated: 0,
    itemsProcessed: 0,
    itemsBackfilled: 0,
    errors: []
  };

  try {
    const backfillResult = await backfillZoneIds(siteId);
    result.itemsBackfilled = backfillResult.itemsUpdated;
    if (backfillResult.errors.length > 0) {
      result.errors.push(...backfillResult.errors);
    }

    const zonesQuery = zoneId 
      ? db.select().from(warehouseZones).where(and(
          eq(warehouseZones.site_id, siteId),
          eq(warehouseZones.id, zoneId)
        ))
      : db.select().from(warehouseZones).where(eq(warehouseZones.site_id, siteId));

    const zones = await zonesQuery;

    if (zones.length === 0) {
      result.errors.push("No zones found for the specified site");
      result.success = false;
      return result;
    }

    const inventoryItems = await db.select()
      .from(warehouseInventoryItems)
      .where(eq(warehouseInventoryItems.site_id, siteId));

    result.itemsProcessed = inventoryItems.length;

    const locations = await db.select()
      .from(warehouseLocations)
      .where(eq(warehouseLocations.site_id, siteId));

    const locationToZoneMap = new Map<number, number>();
    for (const loc of locations) {
      if (loc.zone_id !== null) {
        locationToZoneMap.set(loc.id, loc.zone_id);
      }
    }

    const zoneStats = new Map<number, { itemCount: number; totalWeight: number }>();

    for (const zone of zones) {
      zoneStats.set(zone.id, { itemCount: 0, totalWeight: 0 });
    }

    for (const item of inventoryItems) {
      let assignedZoneId: number | null = null;

      // Priority 1: Use zone_id directly if set on the inventory item
      if (item.zone_id !== null && item.zone_id !== undefined) {
        assignedZoneId = item.zone_id;
      }
      // Priority 2: Fall back to location_id lookup if zone_id is null
      else if (item.location_id !== null && locationToZoneMap.has(item.location_id)) {
        assignedZoneId = locationToZoneMap.get(item.location_id)!;
      }
      // Priority 3: Fall back to pattern matching if both zone_id and location_id are null
      else if (item.location) {
        const matchResult = matchLocationToZone(item.location, zones);
        if (matchResult.zoneId !== null) {
          assignedZoneId = matchResult.zoneId;
        }
      }

      if (assignedZoneId !== null && zoneStats.has(assignedZoneId)) {
        const stats = zoneStats.get(assignedZoneId)!;
        stats.itemCount += item.quantity || 1;
        const rawWeight = parseFloat(String(item.weight_lbs || 0));
        const weight = isNaN(rawWeight) ? 0 : rawWeight * (item.quantity || 1);
        stats.totalWeight += weight;
      }
    }

    const now = new Date();
    for (const zone of zones) {
      const stats = zoneStats.get(zone.id)!;
      
      try {
        const roundedWeight = Math.round(stats.totalWeight);
        await db.update(warehouseZones)
          .set({
            current_item_count: stats.itemCount,
            current_weight_lbs: String(isNaN(roundedWeight) ? 0 : roundedWeight),
            last_synced_at: now
          })
          .where(eq(warehouseZones.id, zone.id));
        
        result.zonesUpdated++;
      } catch (error) {
        result.errors.push(`Failed to update zone ${zone.code}: ${error}`);
      }
    }

    console.log(`[ZoneCapacity] Resynced ${result.zonesUpdated} zones for site ${siteId}`);
  } catch (error) {
    result.success = false;
    result.errors.push(`Resync failed: ${error}`);
    console.error("[ZoneCapacity] Resync error:", error);
  }

  return result;
}

export async function getZoneCapacitySummary(siteId: number): Promise<SiteCapacitySummary | null> {
  try {
    const zones = await db.select()
      .from(warehouseZones)
      .where(eq(warehouseZones.site_id, siteId));

    if (zones.length === 0) {
      return null;
    }

    let totalCapacity = 0;
    let totalItemCount = 0;
    let totalWeightLbs = 0;
    let totalUtilization = 0;

    const zoneData: ZoneCapacityData[] = zones.map(zone => {
      const capacity = zone.total_capacity || zone.capacity_pallets || 0;
      const itemCount = zone.current_item_count || 0;
      const weightLbs = parseFloat(String(zone.current_weight_lbs) || "0");
      const utilization = capacity > 0 ? (itemCount / capacity) * 100 : 0;

      totalCapacity += capacity;
      totalItemCount += itemCount;
      totalWeightLbs += weightLbs;
      totalUtilization += utilization;

      return {
        zoneId: zone.id,
        zoneName: zone.name,
        zoneCode: zone.code,
        itemCount,
        totalWeightLbs: weightLbs,
        totalCapacity: capacity,
        utilizationPercent: Math.round(utilization * 100) / 100
      };
    });

    return {
      siteId,
      totalZones: zones.length,
      totalCapacity,
      totalItemCount,
      totalWeightLbs: Math.round(totalWeightLbs * 100) / 100,
      averageUtilization: zones.length > 0 
        ? Math.round((totalUtilization / zones.length) * 100) / 100 
        : 0,
      zones: zoneData
    };
  } catch (error) {
    console.error("[ZoneCapacity] Failed to get summary:", error);
    return null;
  }
}

export async function recordCapacityHistory(
  zoneId: number,
  siteId: number,
  data: {
    itemCount: number;
    totalWeightLbs: number;
    totalCapacity?: number;
  }
): Promise<{ success: boolean; historyId?: number; error?: string }> {
  try {
    const [history] = await db.insert(warehouseZoneCapacityHistory).values({
      zone_id: zoneId,
      site_id: siteId,
      current_item_count: data.itemCount,
      current_weight_lbs: Math.round(data.totalWeightLbs),
      total_capacity: data.totalCapacity || 0
    }).returning();

    console.log(`[ZoneCapacity] Recorded history for zone ${zoneId}`);
    return { success: true, historyId: history.id };
  } catch (error) {
    console.error("[ZoneCapacity] Failed to record history:", error);
    return { success: false, error: String(error) };
  }
}

export async function getZoneCapacityHistory(
  zoneId: number,
  startDate?: Date,
  endDate?: Date
): Promise<typeof warehouseZoneCapacityHistory.$inferSelect[]> {
  try {
    let query = db.select()
      .from(warehouseZoneCapacityHistory)
      .where(eq(warehouseZoneCapacityHistory.zone_id, zoneId));

    if (startDate && endDate) {
      query = db.select()
        .from(warehouseZoneCapacityHistory)
        .where(and(
          eq(warehouseZoneCapacityHistory.zone_id, zoneId),
          gte(warehouseZoneCapacityHistory.snapshot_date, startDate),
          lte(warehouseZoneCapacityHistory.snapshot_date, endDate)
        ));
    } else if (startDate) {
      query = db.select()
        .from(warehouseZoneCapacityHistory)
        .where(and(
          eq(warehouseZoneCapacityHistory.zone_id, zoneId),
          gte(warehouseZoneCapacityHistory.snapshot_date, startDate)
        ));
    } else if (endDate) {
      query = db.select()
        .from(warehouseZoneCapacityHistory)
        .where(and(
          eq(warehouseZoneCapacityHistory.zone_id, zoneId),
          lte(warehouseZoneCapacityHistory.snapshot_date, endDate)
        ));
    }

    const history = await query;
    return history;
  } catch (error) {
    console.error("[ZoneCapacity] Failed to get history:", error);
    return [];
  }
}
