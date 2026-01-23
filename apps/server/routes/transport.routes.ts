import { Router } from "express";
import { db } from "../db";
import { 
  crossModalManifests,
  manifestItems,
  flightPlans,
  seaVoyages,
  landConvoys,
  militaryInstallations,
  warehouseSites,
  warehouseTransfers,
  warehouseInventoryItems,
} from "@shared/schema";
import { eq, and, sql, count, ilike, or } from "drizzle-orm";
import { AuthRequest, authMiddleware, requireSuperAdmin, validatePaginationParam } from "../middleware";
import * as transportService from "../services/transportService";
import * as transportStatsService from "../services/transportStatsService";
import * as vehicleAllocationService from "../services/vehicleAllocationService";
import * as multiModalRoutingService from "../services/multiModalRoutingService";
import { getAllSiteCapacities } from "../services/capacityService";
import type { TransportMode, TransportStatus } from "../../../packages/shared/transportTypes";

const router = Router();

// ============================================================================
// CROSS-MODAL MANIFESTS API
// ============================================================================

router.get("/manifests", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const manifests = await db.query.crossModalManifests.findMany({
      where: eq(crossModalManifests.user_id, req.user!.id),
      orderBy: (m, { desc }) => [desc(m.created_at)],
    });
    res.json(manifests);
  } catch (error) {
    console.error("[Manifest] Error fetching manifests:", error);
    res.status(500).json({ error: "Failed to fetch manifests" });
  }
});

router.get("/manifests/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid manifest ID" });
    }
    const manifest = await db.query.crossModalManifests.findFirst({
      where: and(eq(crossModalManifests.id, id), eq(crossModalManifests.user_id, req.user!.id)),
    });
    if (!manifest) {
      return res.status(404).json({ error: "Manifest not found" });
    }
    
    const items = await db.query.manifestItems.findMany({
      where: eq(manifestItems.manifest_id, id),
    });
    
    res.json({ ...manifest, items });
  } catch (error) {
    console.error("[Manifest] Error fetching manifest:", error);
    res.status(500).json({ error: "Failed to fetch manifest" });
  }
});

router.post("/manifests", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { manifest, items: selectedItems } = req.body;
    
    const manifestNumber = manifest.manifest_number || `MAN-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    
    const DEFAULT_WEIGHT_LBS = 500;
    const DENSITY_LBS_PER_CUBIC_INCH = 0.02;
    
    const estimateWeight = (item: any): number => {
      if (item.weight_lbs && parseFloat(item.weight_lbs) > 0) {
        return parseFloat(item.weight_lbs);
      }
      const l = parseFloat(item.length_in) || 0;
      const w = parseFloat(item.width_in) || 0;
      const h = parseFloat(item.height_in) || 0;
      if (l > 0 && w > 0 && h > 0) {
        return Math.round(l * w * h * DENSITY_LBS_PER_CUBIC_INCH);
      }
      return DEFAULT_WEIGHT_LBS;
    };
    
    let totalWeightLbs = 0;
    let totalCubeFt = 0;
    
    if (selectedItems && selectedItems.length > 0) {
      for (const item of selectedItems) {
        totalWeightLbs += estimateWeight(item) * (item.quantity || 1);
        totalCubeFt += (item.cube_ft || 0) * (item.quantity || 1);
      }
    }
    
    const [newManifest] = await db.insert(crossModalManifests).values({
      ...manifest,
      manifest_number: manifestNumber,
      user_id: req.user!.id,
      total_weight_lbs: totalWeightLbs,
      total_cube_ft: String(totalCubeFt),
      total_items: selectedItems?.length || 0,
    }).returning();
    
    if (selectedItems && selectedItems.length > 0) {
      for (const item of selectedItems) {
        await db.insert(manifestItems).values({
          manifest_id: newManifest.id,
          inventory_item_id: item.inventory_item_id || null,
          nsn: item.nsn,
          part_number: item.part_number,
          nomenclature: item.nomenclature || 'Unknown Item',
          quantity: item.quantity || 1,
          unit_of_issue: item.unit_of_issue || 'EA',
          weight_lbs: item.weight_lbs,
          length_in: item.length_in,
          width_in: item.width_in,
          height_in: item.height_in,
          cube_ft: item.cube_ft,
          hazmat_class: item.hazmat_class,
          is_hazmat: item.is_hazmat || false,
          is_sensitive: item.is_sensitive || false,
        });
      }
    }
    
    res.status(201).json(newManifest);
  } catch (error) {
    console.error("[Manifest] Error creating manifest:", error);
    res.status(500).json({ error: "Failed to create manifest" });
  }
});

router.put("/manifests/:id/assign-transport", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid manifest ID" });
    }
    const { transport_mode, flight_plan_id, convoy_id, voyage_id, estimated_cost_usd, estimated_duration_hours, estimated_distance_miles } = req.body;
    
    const updateData: any = {
      transport_mode,
      status: 'assigned',
      updated_at: new Date(),
    };
    
    if (transport_mode === 'air' && flight_plan_id) {
      updateData.flight_plan_id = flight_plan_id;
    } else if (transport_mode === 'land' && convoy_id) {
      updateData.convoy_id = convoy_id;
    } else if (transport_mode === 'sea' && voyage_id) {
      updateData.voyage_id = voyage_id;
    }
    
    if (estimated_cost_usd) updateData.estimated_cost_usd = String(estimated_cost_usd);
    if (estimated_duration_hours) updateData.estimated_duration_hours = String(estimated_duration_hours);
    if (estimated_distance_miles) updateData.estimated_distance_miles = String(estimated_distance_miles);
    
    const [manifest] = await db.update(crossModalManifests)
      .set(updateData)
      .where(and(eq(crossModalManifests.id, id), eq(crossModalManifests.user_id, req.user!.id)))
      .returning();
    
    if (!manifest) {
      return res.status(404).json({ error: "Manifest not found" });
    }
    res.json(manifest);
  } catch (error) {
    console.error("[Manifest] Error assigning transport:", error);
    res.status(500).json({ error: "Failed to assign transport" });
  }
});

router.put("/manifests/:id/status", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid manifest ID" });
    }
    const { status, actual_departure, actual_arrival } = req.body;
    
    const updateData: any = { status, updated_at: new Date() };
    if (actual_departure) updateData.actual_departure = new Date(actual_departure);
    if (actual_arrival) updateData.actual_arrival = new Date(actual_arrival);
    
    const [manifest] = await db.update(crossModalManifests)
      .set(updateData)
      .where(and(eq(crossModalManifests.id, id), eq(crossModalManifests.user_id, req.user!.id)))
      .returning();
    
    if (!manifest) {
      return res.status(404).json({ error: "Manifest not found" });
    }
    res.json(manifest);
  } catch (error) {
    console.error("[Manifest] Error updating status:", error);
    res.status(500).json({ error: "Failed to update status" });
  }
});

router.delete("/manifests/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid manifest ID" });
    }
    
    await db.delete(manifestItems).where(eq(manifestItems.manifest_id, id));
    
    const [manifest] = await db.delete(crossModalManifests)
      .where(and(eq(crossModalManifests.id, id), eq(crossModalManifests.user_id, req.user!.id)))
      .returning();
    
    if (!manifest) {
      return res.status(404).json({ error: "Manifest not found" });
    }
    res.json({ success: true, message: "Manifest deleted" });
  } catch (error) {
    console.error("[Manifest] Error deleting manifest:", error);
    res.status(500).json({ error: "Failed to delete manifest" });
  }
});

router.patch("/manifests/:id/items/:itemIndex", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const manifestId = parseInt(req.params.id);
    const itemIndex = parseInt(req.params.itemIndex);
    if (isNaN(manifestId)) {
      return res.status(400).json({ error: "Invalid manifest ID" });
    }
    if (isNaN(itemIndex) || itemIndex < 0) {
      return res.status(400).json({ error: "Invalid item index" });
    }
    const itemData = req.body;
    
    const manifest = await db.query.crossModalManifests.findFirst({
      where: and(eq(crossModalManifests.id, manifestId), eq(crossModalManifests.user_id, req.user!.id)),
    });
    
    if (!manifest) {
      return res.status(404).json({ error: "Manifest not found" });
    }
    
    const items = await db.query.manifestItems.findMany({
      where: eq(manifestItems.manifest_id, manifestId),
      orderBy: (m, { asc }) => [asc(m.id)],
    });
    
    if (itemIndex >= items.length) {
      return res.status(404).json({ error: "Item not found at specified index" });
    }
    
    const targetItem = items[itemIndex];
    
    const [updatedItem] = await db.update(manifestItems)
      .set({
        ...itemData,
        updated_at: new Date(),
      })
      .where(eq(manifestItems.id, targetItem.id))
      .returning();
    
    const allItems = await db.query.manifestItems.findMany({
      where: eq(manifestItems.manifest_id, manifestId),
    });
    
    res.json({ ...manifest, items: allItems });
  } catch (error) {
    console.error("[Manifest] Error updating manifest item:", error);
    res.status(500).json({ error: "Failed to update manifest item" });
  }
});

// ============================================================================
// UNIFIED TRANSPORT DATA PIPELINE
// ============================================================================

router.get("/operations/transport-pipeline", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const UTILIZATION_THRESHOLD = 80;
    
    const [
      userSites,
      pendingTransfers,
      userFlightPlans,
      convoys,
      voyages,
      siteCapacities,
    ] = await Promise.all([
      db.query.warehouseSites.findMany({ where: eq(warehouseSites.user_id, userId) }),
      db.query.warehouseTransfers.findMany({
        where: and(
          eq(warehouseTransfers.user_id, userId),
          sql`${warehouseTransfers.status} IN ('pending', 'manifest_created', 'transport_assigned', 'in_transit')`
        )
      }),
      db.select().from(flightPlans).where(eq(flightPlans.user_id, userId)),
      db.query.landConvoys.findMany({ where: eq(landConvoys.user_id, userId) }),
      db.query.seaVoyages.findMany({ where: eq(seaVoyages.user_id, userId) }),
      getAllSiteCapacities(userId),
    ]);
    
    type TransportRecord = {
      id: number;
      type: 'transfer' | 'flight' | 'convoy' | 'voyage';
      transportMode: 'air' | 'land' | 'sea';
      sourceSiteId: number | null;
      sourceSiteName: string | null;
      destinationSiteId: number | null;
      destinationSiteName: string | null;
      weightLbs: number;
      status: string;
      scheduledDate: string | null;
      assignedTransportId: number | null;
      assignedTransportName: string | null;
    };
    
    const siteMap = new Map(userSites.map(s => [s.id, s.name]));
    const transportRecords: TransportRecord[] = [];
    
    pendingTransfers.forEach(t => {
      const mode = t.transport_mode === 'ground' ? 'land' : t.transport_mode as 'air' | 'sea';
      let assignedId: number | null = null;
      let assignedName: string | null = null;
      
      if (t.assigned_convoy_id) {
        const convoy = convoys.find(c => c.id === t.assigned_convoy_id);
        assignedId = t.assigned_convoy_id;
        assignedName = convoy?.name || null;
      } else if (t.assigned_flight_plan_id) {
        const flight = userFlightPlans.find((f: any) => f.id === t.assigned_flight_plan_id);
        assignedId = t.assigned_flight_plan_id;
        assignedName = flight?.name || null;
      } else if (t.assigned_voyage_id) {
        const voyage = voyages.find(v => v.id === t.assigned_voyage_id);
        assignedId = t.assigned_voyage_id;
        assignedName = voyage?.name || null;
      }
      
      transportRecords.push({
        id: t.id,
        type: 'transfer',
        transportMode: mode,
        sourceSiteId: t.source_site_id,
        sourceSiteName: siteMap.get(t.source_site_id) || null,
        destinationSiteId: t.destination_site_id,
        destinationSiteName: siteMap.get(t.destination_site_id) || null,
        weightLbs: parseFloat(t.total_weight_lbs?.toString() || '0'),
        status: t.status,
        scheduledDate: t.scheduled_date?.toISOString() || null,
        assignedTransportId: assignedId,
        assignedTransportName: assignedName,
      });
    });
    
    type WarehouseInbound = {
      siteId: number;
      siteName: string;
      currentUtilizationPercent: number;
      currentWeightLbs: number;
      totalCapacityLbs: number;
      inboundByMode: {
        air: { count: number; weightLbs: number };
        land: { count: number; weightLbs: number };
        sea: { count: number; weightLbs: number };
      };
      totalInboundLbs: number;
      projectedWeightLbs: number;
      projectedUtilizationPercent: number;
      isAboveThreshold: boolean;
      willExceedThreshold: boolean;
      thresholdPercent: number;
      transfers: TransportRecord[];
    };
    
    const warehouseData: WarehouseInbound[] = siteCapacities.map(site => {
      const inboundTransfers = transportRecords.filter(r => r.destinationSiteId === site.siteId);
      
      const airInbound = inboundTransfers.filter(r => r.transportMode === 'air');
      const landInbound = inboundTransfers.filter(r => r.transportMode === 'land');
      const seaInbound = inboundTransfers.filter(r => r.transportMode === 'sea');
      
      const totalInboundLbs = inboundTransfers.reduce((sum, r) => sum + r.weightLbs, 0);
      const projectedWeightLbs = (site.currentWeightLbs ?? 0) + totalInboundLbs;
      const maxCapacity = Math.max(1, site.totalWeightCapacityLbs ?? 0);
      const projectedUtilization = Math.min(100, (projectedWeightLbs / maxCapacity) * 100);
      
      const isAboveThreshold = (site.utilizationPercent ?? 0) >= UTILIZATION_THRESHOLD;
      const willExceedThreshold = !isAboveThreshold && projectedUtilization >= UTILIZATION_THRESHOLD;
      
      return {
        siteId: site.siteId,
        siteName: site.siteName,
        currentUtilizationPercent: Math.round(site.utilizationPercent * 10) / 10,
        currentWeightLbs: site.currentWeightLbs || 0,
        totalCapacityLbs: site.totalWeightCapacityLbs || 0,
        inboundByMode: {
          air: { count: airInbound.length, weightLbs: Math.round(airInbound.reduce((s, r) => s + r.weightLbs, 0)) },
          land: { count: landInbound.length, weightLbs: Math.round(landInbound.reduce((s, r) => s + r.weightLbs, 0)) },
          sea: { count: seaInbound.length, weightLbs: Math.round(seaInbound.reduce((s, r) => s + r.weightLbs, 0)) },
        },
        totalInboundLbs: Math.round(totalInboundLbs),
        projectedWeightLbs: Math.round(projectedWeightLbs),
        projectedUtilizationPercent: Math.round(projectedUtilization * 10) / 10,
        isAboveThreshold,
        willExceedThreshold,
        thresholdPercent: UTILIZATION_THRESHOLD,
        transfers: inboundTransfers,
      };
    });
    
    const thresholdAlerts = warehouseData
      .filter(w => w.isAboveThreshold || w.willExceedThreshold)
      .map(w => ({
        siteId: w.siteId,
        siteName: w.siteName,
        alertType: w.isAboveThreshold ? 'above_threshold' : 'will_exceed',
        currentUtilization: w.currentUtilizationPercent,
        projectedUtilization: w.projectedUtilizationPercent,
        inboundLbs: w.totalInboundLbs,
        message: w.isAboveThreshold
          ? `${w.siteName} is currently at ${w.currentUtilizationPercent}% utilization (above ${UTILIZATION_THRESHOLD}% threshold)`
          : `${w.siteName} will reach ${w.projectedUtilizationPercent}% utilization after ${w.totalInboundLbs.toLocaleString()} lbs of inbound cargo`,
      }));
    
    res.json({
      generatedAt: new Date().toISOString(),
      thresholdPercent: UTILIZATION_THRESHOLD,
      summary: {
        totalWarehouses: warehouseData.length,
        warehousesAboveThreshold: warehouseData.filter(w => w.isAboveThreshold).length,
        warehousesWillExceedThreshold: warehouseData.filter(w => w.willExceedThreshold).length,
        totalPendingTransfers: transportRecords.length,
        totalInboundCargoLbs: Math.round(transportRecords.reduce((s, r) => s + r.weightLbs, 0)),
        byMode: {
          air: { transfers: transportRecords.filter(r => r.transportMode === 'air').length },
          land: { transfers: transportRecords.filter(r => r.transportMode === 'land').length },
          sea: { transfers: transportRecords.filter(r => r.transportMode === 'sea').length },
        },
      },
      thresholdAlerts,
      warehouses: warehouseData,
    });
  } catch (error) {
    console.error("[Transport Pipeline] Error fetching transport data:", error);
    res.status(500).json({ error: "Failed to fetch transport pipeline data" });
  }
});

// ============================================================================
// UNIFIED TRANSPORT API (Mode-Agnostic)
// ============================================================================

const VALID_TRANSPORT_MODES: TransportMode[] = ['air', 'land', 'sea'];

function validateTransportMode(mode: string): mode is TransportMode {
  return VALID_TRANSPORT_MODES.includes(mode as TransportMode);
}

router.get("/transport/:mode/plans", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { mode } = req.params;
    if (!validateTransportMode(mode)) {
      return res.status(400).json({ error: `Invalid transport mode. Must be one of: ${VALID_TRANSPORT_MODES.join(', ')}` });
    }
    const plans = await transportService.getPlans(mode, req.user!.id);
    res.json({ plans });
  } catch (error) {
    console.error("[Transport API] Error fetching plans:", error);
    res.status(500).json({ error: "Failed to fetch transport plans" });
  }
});

router.get("/transport/:mode/plans/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { mode, id } = req.params;
    if (!validateTransportMode(mode)) {
      return res.status(400).json({ error: `Invalid transport mode. Must be one of: ${VALID_TRANSPORT_MODES.join(', ')}` });
    }
    const planId = parseInt(id);
    if (isNaN(planId)) {
      return res.status(400).json({ error: "Invalid plan ID" });
    }
    const plan = await transportService.getPlan(mode, planId, req.user!.id);
    if (!plan) {
      return res.status(404).json({ error: "Plan not found" });
    }
    res.json({ plan });
  } catch (error) {
    console.error("[Transport API] Error fetching plan:", error);
    res.status(500).json({ error: "Failed to fetch transport plan" });
  }
});

router.post("/transport/:mode/plans", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { mode } = req.params;
    if (!validateTransportMode(mode)) {
      return res.status(400).json({ error: `Invalid transport mode. Must be one of: ${VALID_TRANSPORT_MODES.join(', ')}` });
    }
    const plan = await transportService.createPlan(mode, req.user!.id, req.body);
    res.status(201).json({ plan });
  } catch (error) {
    console.error("[Transport API] Error creating plan:", error);
    res.status(500).json({ error: "Failed to create transport plan" });
  }
});

router.put("/transport/:mode/plans/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { mode, id } = req.params;
    if (!validateTransportMode(mode)) {
      return res.status(400).json({ error: `Invalid transport mode. Must be one of: ${VALID_TRANSPORT_MODES.join(', ')}` });
    }
    const planId = parseInt(id);
    if (isNaN(planId)) {
      return res.status(400).json({ error: "Invalid plan ID" });
    }
    const plan = await transportService.updatePlan(mode, planId, req.user!.id, req.body);
    if (!plan) {
      return res.status(404).json({ error: "Plan not found" });
    }
    res.json({ plan });
  } catch (error) {
    console.error("[Transport API] Error updating plan:", error);
    res.status(500).json({ error: "Failed to update transport plan" });
  }
});

router.post("/transport/:mode/plans/:id/transition", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { mode, id } = req.params;
    const { to_status } = req.body;
    if (!validateTransportMode(mode)) {
      return res.status(400).json({ error: `Invalid transport mode. Must be one of: ${VALID_TRANSPORT_MODES.join(', ')}` });
    }
    const planId = parseInt(id);
    if (isNaN(planId)) {
      return res.status(400).json({ error: "Invalid plan ID" });
    }
    if (!to_status) {
      return res.status(400).json({ error: "to_status is required" });
    }
    const result = await transportService.transitionStatus(mode, planId, req.user!.id, to_status as TransportStatus);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ plan: result.plan });
  } catch (error) {
    console.error("[Transport API] Error transitioning status:", error);
    res.status(500).json({ error: "Failed to transition plan status" });
  }
});

router.get("/transport/:mode/statistics", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { mode } = req.params;
    if (!validateTransportMode(mode)) {
      return res.status(400).json({ error: `Invalid transport mode. Must be one of: ${VALID_TRANSPORT_MODES.join(', ')}` });
    }
    const stats = await transportStatsService.getModeStatistics(mode, req.user!.id);
    res.json(stats);
  } catch (error) {
    console.error("[Transport API] Error fetching statistics:", error);
    res.status(500).json({ error: "Failed to fetch transport statistics" });
  }
});

router.get("/transport/statistics", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const stats = await transportStatsService.getAllModesStatistics(req.user!.id);
    res.json(stats);
  } catch (error) {
    console.error("[Transport API] Error fetching all statistics:", error);
    res.status(500).json({ error: "Failed to fetch transport statistics" });
  }
});

router.get("/transport/assets/:mode", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { mode } = req.params;
    if (!validateTransportMode(mode)) {
      return res.status(400).json({ error: `Invalid transport mode. Must be one of: ${VALID_TRANSPORT_MODES.join(', ')}` });
    }
    const assets = await transportService.getAssets(mode, req.user!.id);
    res.json({ assets });
  } catch (error) {
    console.error("[Transport API] Error fetching assets:", error);
    res.status(500).json({ error: "Failed to fetch transport assets" });
  }
});

// ============================================================================
// MILITARY INSTALLATIONS API
// ============================================================================

router.get("/military-installations", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { region, branch, type, search, limit } = req.query;
    
    const conditions = [eq(militaryInstallations.is_active, true)];
    
    if (region && typeof region === 'string') {
      conditions.push(eq(militaryInstallations.region, region));
    }
    if (branch && typeof branch === 'string') {
      conditions.push(eq(militaryInstallations.branch, branch));
    }
    if (type && typeof type === 'string') {
      conditions.push(eq(militaryInstallations.type, type));
    }
    if (search && typeof search === 'string') {
      const searchPattern = `%${search}%`;
      conditions.push(
        or(
          ilike(militaryInstallations.name, searchPattern),
          ilike(militaryInstallations.code, searchPattern),
          ilike(militaryInstallations.city, searchPattern)
        )!
      );
    }
    
    let query = db.select()
      .from(militaryInstallations)
      .where(and(...conditions));
    
    if (limit && !isNaN(parseInt(limit as string))) {
      query = query.limit(parseInt(limit as string)) as any;
    }
    
    const installations = await query;
    
    res.json({
      installations,
      count: installations.length,
      filters: {
        region: region || null,
        branch: branch || null,
        type: type || null,
        search: search || null,
      }
    });
  } catch (error) {
    console.error("[Military Installations] Error fetching installations:", error);
    res.status(500).json({ error: "Failed to fetch military installations" });
  }
});

router.post("/admin/seed-military-installations", authMiddleware, requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const installationsData = [
      { code: 'TRAVIS', name: 'Travis Air Force Base', type: 'air_base', branch: 'air_force', city: 'Fairfield', state: 'CA', country: 'USA', region: 'CONUS', latitude: '38.2721', longitude: '-121.9399', address: 'Travis AFB, CA 94535' },
      { code: 'DOVER', name: 'Dover Air Force Base', type: 'air_base', branch: 'air_force', city: 'Dover', state: 'DE', country: 'USA', region: 'CONUS', latitude: '39.1305', longitude: '-75.4660', address: 'Dover AFB, DE 19902' },
      { code: 'ANDREWS', name: 'Joint Base Andrews', type: 'joint_base', branch: 'air_force', city: 'Camp Springs', state: 'MD', country: 'USA', region: 'CONUS', latitude: '38.8108', longitude: '-76.8670', address: 'Joint Base Andrews, MD 20762' },
      { code: 'RAMSTEIN', name: 'Ramstein Air Base', type: 'air_base', branch: 'air_force', city: 'Ramstein', state: null, country: 'Germany', region: 'Europe', latitude: '49.4369', longitude: '7.6003', address: 'Ramstein Air Base, Germany' },
      { code: 'KADENA', name: 'Kadena Air Base', type: 'air_base', branch: 'air_force', city: 'Kadena', state: 'Okinawa', country: 'Japan', region: 'Pacific', latitude: '26.3556', longitude: '127.7678', address: 'Kadena AB, Okinawa, Japan' },
      { code: 'EDWARDS', name: 'Edwards Air Force Base', type: 'air_base', branch: 'air_force', city: 'Edwards', state: 'CA', country: 'USA', region: 'CONUS', latitude: '34.9054', longitude: '-117.8840', address: 'Edwards AFB, CA 93524' },
      { code: 'NELLIS', name: 'Nellis Air Force Base', type: 'air_base', branch: 'air_force', city: 'Las Vegas', state: 'NV', country: 'USA', region: 'CONUS', latitude: '36.2362', longitude: '-115.0336', address: 'Nellis AFB, NV 89191' },
      { code: 'HILL', name: 'Hill Air Force Base', type: 'air_base', branch: 'air_force', city: 'Ogden', state: 'UT', country: 'USA', region: 'CONUS', latitude: '41.1210', longitude: '-111.9728', address: 'Hill AFB, UT 84056' },
      { code: 'MCCONNELL', name: 'McConnell Air Force Base', type: 'air_base', branch: 'air_force', city: 'Wichita', state: 'KS', country: 'USA', region: 'CONUS', latitude: '37.6217', longitude: '-97.2683', address: 'McConnell AFB, KS 67221' },
      { code: 'SCOTT', name: 'Scott Air Force Base', type: 'air_base', branch: 'air_force', city: 'Belleville', state: 'IL', country: 'USA', region: 'CONUS', latitude: '38.5422', longitude: '-89.8519', address: 'Scott AFB, IL 62225' },
      { code: 'LIBERTY', name: 'Fort Liberty', type: 'army_base', branch: 'army', city: 'Fayetteville', state: 'NC', country: 'USA', region: 'CONUS', latitude: '35.1418', longitude: '-79.0063', address: 'Fort Liberty, NC 28310' },
      { code: 'CAVAZOS', name: 'Fort Cavazos', type: 'army_base', branch: 'army', city: 'Killeen', state: 'TX', country: 'USA', region: 'CONUS', latitude: '31.1145', longitude: '-97.7769', address: 'Fort Cavazos, TX 76544' },
      { code: 'CAMPBELL', name: 'Fort Campbell', type: 'army_base', branch: 'army', city: 'Clarksville', state: 'TN', country: 'USA', region: 'CONUS', latitude: '36.6681', longitude: '-87.4753', address: 'Fort Campbell, KY 42223' },
      { code: 'JBLM', name: 'Joint Base Lewis-McChord', type: 'joint_base', branch: 'army', city: 'Tacoma', state: 'WA', country: 'USA', region: 'CONUS', latitude: '47.1376', longitude: '-122.4764', address: 'Joint Base Lewis-McChord, WA 98433' },
      { code: 'BLISS', name: 'Fort Bliss', type: 'army_base', branch: 'army', city: 'El Paso', state: 'TX', country: 'USA', region: 'CONUS', latitude: '31.8111', longitude: '-106.4225', address: 'Fort Bliss, TX 79916' },
      { code: 'NORFOLK', name: 'Naval Station Norfolk', type: 'navy_base', branch: 'navy', city: 'Norfolk', state: 'VA', country: 'USA', region: 'CONUS', latitude: '36.9466', longitude: '-76.2916', address: 'Naval Station Norfolk, VA 23511' },
      { code: 'NBSD', name: 'Naval Base San Diego', type: 'navy_base', branch: 'navy', city: 'San Diego', state: 'CA', country: 'USA', region: 'CONUS', latitude: '32.6836', longitude: '-117.1286', address: 'Naval Base San Diego, CA 92136' },
      { code: 'PEARL', name: 'Naval Station Pearl Harbor', type: 'navy_base', branch: 'navy', city: 'Honolulu', state: 'HI', country: 'USA', region: 'Pacific', latitude: '21.3505', longitude: '-157.9744', address: 'Naval Station Pearl Harbor, HI 96860' },
      { code: 'CORONADO', name: 'Naval Base Coronado', type: 'navy_base', branch: 'navy', city: 'Coronado', state: 'CA', country: 'USA', region: 'CONUS', latitude: '32.6812', longitude: '-117.1668', address: 'Naval Base Coronado, CA 92118' },
      { code: 'NASJAX', name: 'Naval Air Station Jacksonville', type: 'navy_base', branch: 'navy', city: 'Jacksonville', state: 'FL', country: 'USA', region: 'CONUS', latitude: '30.2358', longitude: '-81.6806', address: 'NAS Jacksonville, FL 32212' },
      { code: 'PENDLETON', name: 'Marine Corps Base Camp Pendleton', type: 'marine_base', branch: 'marines', city: 'Oceanside', state: 'CA', country: 'USA', region: 'CONUS', latitude: '33.3869', longitude: '-117.5653', address: 'Camp Pendleton, CA 92055' },
      { code: 'LEJEUNE', name: 'Marine Corps Base Camp Lejeune', type: 'marine_base', branch: 'marines', city: 'Jacksonville', state: 'NC', country: 'USA', region: 'CONUS', latitude: '34.6178', longitude: '-77.3692', address: 'Camp Lejeune, NC 28547' },
      { code: 'MIRAMAR', name: 'Marine Corps Air Station Miramar', type: 'marine_base', branch: 'marines', city: 'San Diego', state: 'CA', country: 'USA', region: 'CONUS', latitude: '32.8683', longitude: '-117.1424', address: 'MCAS Miramar, CA 92145' },
      { code: 'DDSP', name: 'DLA Distribution Susquehanna', type: 'depot', branch: 'dla', city: 'New Cumberland', state: 'PA', country: 'USA', region: 'CONUS', latitude: '40.2218', longitude: '-76.8595', address: 'DLA Distribution Susquehanna, PA 17070' },
      { code: 'DDJC', name: 'DLA Distribution San Joaquin', type: 'depot', branch: 'dla', city: 'Tracy', state: 'CA', country: 'USA', region: 'CONUS', latitude: '37.7063', longitude: '-121.4362', address: 'DLA Distribution San Joaquin, CA 95304' },
      { code: 'DDRV', name: 'DLA Distribution Red River', type: 'depot', branch: 'dla', city: 'Texarkana', state: 'TX', country: 'USA', region: 'CONUS', latitude: '33.4359', longitude: '-94.0469', address: 'DLA Distribution Red River, TX 75507' },
      { code: 'DDAA', name: 'DLA Distribution Anniston', type: 'depot', branch: 'dla', city: 'Anniston', state: 'AL', country: 'USA', region: 'CONUS', latitude: '33.7597', longitude: '-85.8364', address: 'DLA Distribution Anniston, AL 36201' },
      { code: 'DDOO', name: 'DLA Distribution Oklahoma City', type: 'depot', branch: 'dla', city: 'Oklahoma City', state: 'OK', country: 'USA', region: 'CONUS', latitude: '35.4147', longitude: '-97.3866', address: 'DLA Distribution Oklahoma City, OK 73145' },
      { code: 'JBPHH', name: 'Joint Base Pearl Harbor-Hickam', type: 'joint_base', branch: 'joint', city: 'Honolulu', state: 'HI', country: 'USA', region: 'Pacific', latitude: '21.3387', longitude: '-157.9444', address: 'JBPHH, HI 96860' },
      { code: 'JBSA', name: 'Joint Base San Antonio', type: 'joint_base', branch: 'joint', city: 'San Antonio', state: 'TX', country: 'USA', region: 'CONUS', latitude: '29.3844', longitude: '-98.5811', address: 'JBSA, TX 78236' },
      { code: 'JBLE', name: 'Joint Base Langley-Eustis', type: 'joint_base', branch: 'joint', city: 'Hampton', state: 'VA', country: 'USA', region: 'CONUS', latitude: '37.0828', longitude: '-76.3605', address: 'JBLE, VA 23665' },
      { code: 'JBER', name: 'Joint Base Elmendorf-Richardson', type: 'joint_base', branch: 'joint', city: 'Anchorage', state: 'AK', country: 'USA', region: 'CONUS', latitude: '61.2509', longitude: '-149.8073', address: 'JBER, AK 99506' },
      { code: 'MOTSP', name: 'Military Ocean Terminal Sunny Point', type: 'port', branch: 'army', city: 'Southport', state: 'NC', country: 'USA', region: 'CONUS', latitude: '33.9639', longitude: '-77.9528', address: 'MOTSU, Southport, NC 28461' },
      { code: 'MOTCO', name: 'Military Ocean Terminal Concord', type: 'port', branch: 'army', city: 'Concord', state: 'CA', country: 'USA', region: 'CONUS', latitude: '38.0127', longitude: '-122.0353', address: 'MOTCO, Concord, CA 94520' },
    ];

    const existingCount = await db.select({ count: count() }).from(militaryInstallations);
    
    if (existingCount[0].count > 0) {
      const clearExisting = req.query.force === 'true';
      if (!clearExisting) {
        return res.status(409).json({ 
          error: "Military installations already exist. Use ?force=true to clear and reseed.",
          existing_count: existingCount[0].count
        });
      }
      await db.delete(militaryInstallations);
    }

    const inserted = await db.insert(militaryInstallations).values(
      installationsData.map(inst => ({
        ...inst,
        is_active: true
      }))
    ).returning();

    res.status(201).json({
      message: "Military installations seeded successfully",
      count: inserted.length,
      installations: inserted.map(i => ({ id: i.id, code: i.code, name: i.name }))
    });
  } catch (error) {
    console.error("[Military Installations] Error seeding installations:", error);
    res.status(500).json({ error: "Failed to seed military installations" });
  }
});

// ============================================================================
// VEHICLE PRIORITY SETTINGS API (SUPERADMIN ONLY)
// ============================================================================

router.get("/admin/vehicle-priorities", authMiddleware, requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const priorities = await vehicleAllocationService.getAllVehiclePrioritySettings();
    res.json(priorities);
  } catch (error) {
    console.error("[Vehicle Priorities] Error fetching priorities:", error);
    res.status(500).json({ error: "Failed to fetch vehicle priorities" });
  }
});

router.post("/admin/vehicle-priorities", authMiddleware, requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const priorities = req.body.priorities;
    if (Array.isArray(priorities)) {
      const seenVehicleTypes = new Set<number>();
      const seenPriorityOrders = new Set<number>();
      
      for (const p of priorities) {
        const vehicleTypeId = p.vehicleTypeId || p.vehicle_type_id;
        const priorityOrder = p.priorityOrder ?? p.priority ?? 1;
        const isEnabled = p.isEnabled ?? p.enabled ?? true;
        
        if (vehicleTypeId && isEnabled) {
          if (seenVehicleTypes.has(vehicleTypeId)) {
            return res.status(400).json({ error: `Duplicate vehicle type ID: ${vehicleTypeId}` });
          }
          seenVehicleTypes.add(vehicleTypeId);
          
          if (priorityOrder < 1) {
            return res.status(400).json({ error: "Priority order must be a positive number" });
          }
          
          if (seenPriorityOrders.has(priorityOrder)) {
            return res.status(400).json({ error: `Duplicate priority order: ${priorityOrder}. Each enabled vehicle must have a unique priority.` });
          }
          seenPriorityOrders.add(priorityOrder);
        }
      }
      
      const results = [];
      for (const p of priorities) {
        const vehicleTypeId = p.vehicleTypeId || p.vehicle_type_id;
        const priorityOrder = p.priorityOrder ?? p.priority ?? 1;
        const isEnabled = p.isEnabled ?? p.enabled ?? true;
        const payloadOverrideLbs = p.payloadOverrideLbs ?? p.payload_override_lbs ?? null;
        const notes = p.notes ?? null;

        if (vehicleTypeId) {
          const result = await vehicleAllocationService.upsertVehiclePriority(
            vehicleTypeId,
            Math.max(1, priorityOrder),
            isEnabled,
            payloadOverrideLbs,
            notes,
            req.user!.id
          );
          results.push(result);
        }
      }
      return res.json({ success: true, message: "Vehicle priorities saved", count: results.length, results });
    }

    const vehicleTypeId = req.body.vehicleTypeId || req.body.vehicle_type_id;
    const priorityOrder = req.body.priorityOrder ?? req.body.priority ?? 1;
    const isEnabled = req.body.isEnabled ?? req.body.enabled ?? true;
    const payloadOverrideLbs = req.body.payloadOverrideLbs ?? req.body.payload_override_lbs ?? null;
    const notes = req.body.notes ?? null;

    if (!vehicleTypeId) {
      return res.status(400).json({ error: "vehicleTypeId (or vehicle_type_id) is required" });
    }

    const result = await vehicleAllocationService.upsertVehiclePriority(
      vehicleTypeId,
      priorityOrder,
      isEnabled,
      payloadOverrideLbs,
      notes,
      req.user!.id
    );

    res.json(result);
  } catch (error) {
    console.error("[Vehicle Priorities] Error upserting priority:", error);
    res.status(500).json({ error: "Failed to save vehicle priority" });
  }
});

router.delete("/admin/vehicle-priorities/:id", authMiddleware, requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid priority ID" });
    }

    const deleted = await vehicleAllocationService.deleteVehiclePriority(id);
    if (!deleted) {
      return res.status(404).json({ error: "Vehicle priority not found" });
    }

    res.json({ message: "Vehicle priority deleted", deleted });
  } catch (error) {
    console.error("[Vehicle Priorities] Error deleting priority:", error);
    res.status(500).json({ error: "Failed to delete vehicle priority" });
  }
});

// ============================================================================
// WAREHOUSE TRANSFER VEHICLE PREVIEW API
// ============================================================================

router.post("/warehouse/transfers/preview-vehicles", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const itemIds = req.body.itemIds || req.body.item_ids;
    const siteId = req.body.siteId || req.body.site_id;

    if (!Array.isArray(itemIds) || typeof siteId !== 'number') {
      return res.status(400).json({ error: "item_ids (array) and site_id (number) are required" });
    }

    const preview = await vehicleAllocationService.previewTransferVehicles(itemIds, siteId);
    res.json(preview);
  } catch (error) {
    console.error("[Transfer Preview] Error previewing vehicles:", error);
    res.status(500).json({ error: "Failed to preview transfer vehicles" });
  }
});

// ============================================================================
// MULTI-MODAL ROUTE PLANNING API
// ============================================================================

router.post("/routing/plan-multi-modal", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { sourceSiteId, destinationSiteId, cargoWeightLbs } = req.body;

    if (!sourceSiteId || !destinationSiteId) {
      return res.status(400).json({ error: "sourceSiteId and destinationSiteId are required" });
    }

    const route = await multiModalRoutingService.planMultiModalRoute(
      sourceSiteId,
      destinationSiteId,
      cargoWeightLbs || 0
    );

    res.json(route);
  } catch (error) {
    console.error("[Multi-Modal Routing] Error planning route:", error);
    res.status(500).json({ error: "Failed to plan multi-modal route" });
  }
});

router.post("/routing/execute-multi-modal", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { route, transferId, cargoWeightLbs, cargoManifest } = req.body;

    if (!route || !transferId) {
      return res.status(400).json({ error: "route and transferId are required" });
    }

    const result = await multiModalRoutingService.createTransportAssetsForRoute(
      route,
      transferId,
      userId,
      cargoWeightLbs || 0,
      cargoManifest || []
    );

    res.json(result);
  } catch (error) {
    console.error("[Multi-Modal Routing] Error executing route:", error);
    res.status(500).json({ error: "Failed to execute multi-modal route" });
  }
});

export default router;
