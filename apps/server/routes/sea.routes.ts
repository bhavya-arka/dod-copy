import { Router } from "express";
import { db } from "../db";
import { eq, and, or, isNull, isNotNull, asc, desc, gte, lte, inArray } from "drizzle-orm";
import {
  seaVoyages,
  seaContainers,
  seaVesselTypes,
  warehouseTransfers,
  warehouseSites,
  crossModalManifests,
} from "@shared/schema";
import { AuthRequest, authMiddleware, validatePaginationParam } from "../middleware";
import { seedSeaVessels } from "../seeds/seaVessels";

const router = Router();

// ============================================================================
// SEA FREIGHT API (PROTECTED) - MSC Maritime Operations
// ============================================================================

// POST /api/sea/seed-vessels - Seed vessel types
router.post("/sea/seed-vessels", authMiddleware, async (req: AuthRequest, res) => {
  try {
    console.log("[Sea] Seeding MSC vessel types...");
    await seedSeaVessels();
    res.json({ success: true, message: "MSC vessel types seeded successfully" });
  } catch (error) {
    console.error("[Sea] Failed to seed vessel types:", error);
    res.status(500).json({ error: "Failed to seed MSC vessel types" });
  }
});

// GET /api/sea/vessel-types - Fetch all MSC vessel types
router.get("/sea/vessel-types", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const vesselTypes = await db.select().from(seaVesselTypes).orderBy(asc(seaVesselTypes.category), asc(seaVesselTypes.code));
    res.json(vesselTypes);
  } catch (error) {
    console.error("[Sea] Error fetching vessel types:", error);
    res.status(500).json({ error: "Failed to fetch vessel types" });
  }
});

// GET /api/sea/vessel-types/:id - Fetch single vessel type
router.get("/sea/vessel-types/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid vessel type ID" });
    }
    const [vesselType] = await db.select().from(seaVesselTypes).where(eq(seaVesselTypes.id, id));
    if (!vesselType) {
      return res.status(404).json({ error: "Vessel type not found" });
    }
    res.json(vesselType);
  } catch (error) {
    console.error("[Sea] Error fetching vessel type:", error);
    res.status(500).json({ error: "Failed to fetch vessel type" });
  }
});

// GET /api/sea/voyages - Fetch all voyages for user with computed cargo weight/count
router.get("/sea/voyages", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const voyages = await db.select().from(seaVoyages)
      .where(eq(seaVoyages.user_id, req.user!.id))
      .orderBy(desc(seaVoyages.created_at));
    
    // Compute cargo stats from containers for each voyage
    const voyageIds = voyages.map(v => v.id);
    const containers = voyageIds.length > 0
      ? await db.select().from(seaContainers).where(inArray(seaContainers.voyage_id, voyageIds))
      : [];
    
    // Group containers by voyage_id
    const containersByVoyage = containers.reduce((acc, c) => {
      const vid = c.voyage_id;
      if (vid) {
        if (!acc[vid]) acc[vid] = [];
        acc[vid].push(c);
      }
      return acc;
    }, {} as Record<number, typeof containers>);
    
    const enrichedVoyages = voyages.map(voyage => {
      const voyageContainers = containersByVoyage[voyage.id] || [];
      const totalWeight = voyageContainers.reduce((sum, c) => sum + (c.weight_lbs || 0), 0);
      return {
        ...voyage,
        container_count: voyageContainers.length,
        cargo_count: voyageContainers.length,
        total_weight_lbs: totalWeight,
      };
    });
    
    res.json(enrichedVoyages);
  } catch (error) {
    console.error("[Sea] Error fetching voyages:", error);
    res.status(500).json({ error: "Failed to fetch voyages" });
  }
});

// GET /api/sea/voyages/:id - Fetch single voyage with full details
router.get("/sea/voyages/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid voyage ID" });
    }
    const [voyage] = await db.select().from(seaVoyages)
      .where(and(eq(seaVoyages.id, id), eq(seaVoyages.user_id, req.user!.id)));
    
    if (!voyage) {
      return res.status(404).json({ error: "Voyage not found" });
    }
    
    // Get containers for this voyage
    const containers = await db.select().from(seaContainers)
      .where(eq(seaContainers.voyage_id, id));
    
    // Get vessel type details if assigned
    let vesselType = null;
    if (voyage.vessel_type_id) {
      const [vt] = await db.select().from(seaVesselTypes).where(eq(seaVesselTypes.id, voyage.vessel_type_id));
      vesselType = vt || null;
    }
    
    const totalWeight = containers.reduce((sum, c) => sum + (c.weight_lbs || 0), 0);
    
    res.json({
      ...voyage,
      containers,
      vessel_type: vesselType,
      container_count: containers.length,
      total_weight_lbs: totalWeight,
    });
  } catch (error) {
    console.error("[Sea] Error fetching voyage:", error);
    res.status(500).json({ error: "Failed to fetch voyage" });
  }
});

// POST /api/sea/voyages - Create voyage
router.post("/sea/voyages", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const voyageData = {
      ...req.body,
      user_id: req.user!.id,
    };
    const [voyage] = await db.insert(seaVoyages).values(voyageData).returning();
    res.status(201).json(voyage);
  } catch (error) {
    console.error("[Sea] Error creating voyage:", error);
    res.status(500).json({ error: "Failed to create voyage" });
  }
});

// PUT /api/sea/voyages/:id - Update voyage
router.put("/sea/voyages/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid voyage ID" });
    }
    const [voyage] = await db.update(seaVoyages)
      .set({ ...req.body, updated_at: new Date() })
      .where(and(eq(seaVoyages.id, id), eq(seaVoyages.user_id, req.user!.id)))
      .returning();
    if (!voyage) {
      return res.status(404).json({ error: "Voyage not found" });
    }
    res.json(voyage);
  } catch (error) {
    console.error("[Sea] Error updating voyage:", error);
    res.status(500).json({ error: "Failed to update voyage" });
  }
});

// PUT /api/sea/voyages/:id/status - Update voyage status
router.put("/sea/voyages/:id/status", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid voyage ID" });
    }
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }
    
    const validStatuses = ['draft', 'planned', 'loading', 'underway', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }
    
    const updateData: any = { status, updated_at: new Date() };
    
    // Set actual times based on status changes
    if (status === 'underway') {
      updateData.actual_departure = new Date();
    } else if (status === 'completed') {
      updateData.actual_arrival = new Date();
    }
    
    const [voyage] = await db.update(seaVoyages)
      .set(updateData)
      .where(and(eq(seaVoyages.id, id), eq(seaVoyages.user_id, req.user!.id)))
      .returning();
    
    if (!voyage) {
      return res.status(404).json({ error: "Voyage not found" });
    }
    res.json(voyage);
  } catch (error) {
    console.error("[Sea] Error updating voyage status:", error);
    res.status(500).json({ error: "Failed to update voyage status" });
  }
});

// DELETE /api/sea/voyages/:id - Delete voyage
router.delete("/sea/voyages/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid voyage ID" });
    }
    // Unassign containers first
    await db.update(seaContainers)
      .set({ voyage_id: null, updated_at: new Date() })
      .where(eq(seaContainers.voyage_id, id));
    
    const [voyage] = await db.delete(seaVoyages)
      .where(and(eq(seaVoyages.id, id), eq(seaVoyages.user_id, req.user!.id)))
      .returning();
    
    if (!voyage) {
      return res.status(404).json({ error: "Voyage not found" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("[Sea] Error deleting voyage:", error);
    res.status(500).json({ error: "Failed to delete voyage" });
  }
});

// GET /api/sea/containers - Fetch containers (optionally filter by voyage_id)
router.get("/sea/containers", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { voyage_id } = req.query;
    
    if (voyage_id) {
      const voyageIdParsed = parseInt(voyage_id as string);
      if (isNaN(voyageIdParsed)) {
        return res.status(400).json({ error: "Invalid voyage_id" });
      }
      const containers = await db.select().from(seaContainers)
        .where(and(
          eq(seaContainers.user_id, req.user!.id),
          eq(seaContainers.voyage_id, voyageIdParsed)
        ))
        .orderBy(desc(seaContainers.created_at));
      return res.json(containers);
    }
    
    const containers = await db.select().from(seaContainers)
      .where(eq(seaContainers.user_id, req.user!.id))
      .orderBy(desc(seaContainers.created_at));
    res.json(containers);
  } catch (error) {
    console.error("[Sea] Error fetching containers:", error);
    res.status(500).json({ error: "Failed to fetch containers" });
  }
});

// GET /api/sea/containers/:id - Fetch single container
router.get("/sea/containers/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid container ID" });
    }
    const [container] = await db.select().from(seaContainers)
      .where(and(eq(seaContainers.id, id), eq(seaContainers.user_id, req.user!.id)));
    
    if (!container) {
      return res.status(404).json({ error: "Container not found" });
    }
    res.json(container);
  } catch (error) {
    console.error("[Sea] Error fetching container:", error);
    res.status(500).json({ error: "Failed to fetch container" });
  }
});

// POST /api/sea/containers - Create container
router.post("/sea/containers", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const containerData = {
      ...req.body,
      user_id: req.user!.id,
    };
    const [container] = await db.insert(seaContainers).values(containerData).returning();
    res.status(201).json(container);
  } catch (error) {
    console.error("[Sea] Error creating container:", error);
    res.status(500).json({ error: "Failed to create container" });
  }
});

// PUT /api/sea/containers/:id - Update container
router.put("/sea/containers/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid container ID" });
    }
    const [container] = await db.update(seaContainers)
      .set({ ...req.body, updated_at: new Date() })
      .where(and(eq(seaContainers.id, id), eq(seaContainers.user_id, req.user!.id)))
      .returning();
    if (!container) {
      return res.status(404).json({ error: "Container not found" });
    }
    res.json(container);
  } catch (error) {
    console.error("[Sea] Error updating container:", error);
    res.status(500).json({ error: "Failed to update container" });
  }
});

// DELETE /api/sea/containers/:id - Delete container
router.delete("/sea/containers/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid container ID" });
    }
    const [container] = await db.delete(seaContainers)
      .where(and(eq(seaContainers.id, id), eq(seaContainers.user_id, req.user!.id)))
      .returning();
    if (!container) {
      return res.status(404).json({ error: "Container not found" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("[Sea] Error deleting container:", error);
    res.status(500).json({ error: "Failed to delete container" });
  }
});

// POST /api/sea/containers/:id/assign - Assign container to voyage
router.post("/sea/containers/:id/assign", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid container ID" });
    }
    const { voyage_id } = req.body;
    
    // Verify container belongs to user
    const [container] = await db.select().from(seaContainers)
      .where(and(eq(seaContainers.id, id), eq(seaContainers.user_id, req.user!.id)));
    
    if (!container) {
      return res.status(404).json({ error: "Container not found" });
    }
    
    // Verify voyage exists and belongs to user if voyage_id provided
    if (voyage_id) {
      const voyageIdParsed = parseInt(voyage_id);
      if (isNaN(voyageIdParsed)) {
        return res.status(400).json({ error: "Invalid voyage_id" });
      }
      const [voyage] = await db.select().from(seaVoyages)
        .where(and(eq(seaVoyages.id, voyageIdParsed), eq(seaVoyages.user_id, req.user!.id)));
      
      if (!voyage) {
        return res.status(404).json({ error: "Voyage not found" });
      }
    }
    
    const [updatedContainer] = await db.update(seaContainers)
      .set({ voyage_id: voyage_id || null, updated_at: new Date() })
      .where(eq(seaContainers.id, id))
      .returning();
    
    res.json(updatedContainer);
  } catch (error) {
    console.error("[Sea] Error assigning container:", error);
    res.status(500).json({ error: "Failed to assign container to voyage" });
  }
});

// GET /api/sea/statistics - Compute sea freight statistics
router.get("/sea/statistics", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const voyages = await db.select().from(seaVoyages)
      .where(eq(seaVoyages.user_id, req.user!.id));
    
    const containers = await db.select().from(seaContainers)
      .where(eq(seaContainers.user_id, req.user!.id));
    
    // Get pending sea transfers
    const pendingTransfers = await db.select().from(warehouseTransfers)
      .where(and(
        eq(warehouseTransfers.user_id, req.user!.id),
        eq(warehouseTransfers.transport_mode, "sea"),
        or(
          eq(warehouseTransfers.status, "pending"),
          eq(warehouseTransfers.status, "manifest_created")
        ),
        isNull(warehouseTransfers.assigned_voyage_id)
      ));
    
    const activeVoyages = voyages.filter(v => ['planned', 'loading', 'underway'].includes(v.status));
    const inTransit = voyages.filter(v => v.status === 'underway').length;
    const atPort = voyages.filter(v => v.status === 'loading').length;
    
    // Completed this month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const completedThisMonth = voyages.filter(v => 
      v.status === 'completed' && 
      v.actual_arrival && 
      new Date(v.actual_arrival) >= startOfMonth
    ).length;
    
    const totalCargoLbs = containers.reduce((sum, c) => sum + (c.weight_lbs || 0), 0);
    
    res.json({
      totalVoyages: voyages.length,
      activeVoyages: activeVoyages.length,
      inTransit,
      atPort,
      completedThisMonth,
      totalContainers: containers.length,
      totalCargoLbs,
      pendingTransfers: pendingTransfers.length,
    });
  } catch (error) {
    console.error("[Sea] Error fetching statistics:", error);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

// GET /api/sea/port-schedule - Get upcoming arrivals/departures
router.get("/sea/port-schedule", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const daysAhead = validatePaginationParam(req.query.days, 1, 365, 30);
    const now = new Date();
    const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    
    // Get voyages with scheduled departures or arrivals in the date range
    const voyages = await db.select().from(seaVoyages)
      .where(and(
        eq(seaVoyages.user_id, req.user!.id),
        or(
          and(
            isNotNull(seaVoyages.scheduled_departure),
            gte(seaVoyages.scheduled_departure, now),
            lte(seaVoyages.scheduled_departure, futureDate)
          ),
          and(
            isNotNull(seaVoyages.scheduled_arrival),
            gte(seaVoyages.scheduled_arrival, now),
            lte(seaVoyages.scheduled_arrival, futureDate)
          )
        )
      ))
      .orderBy(asc(seaVoyages.scheduled_departure));
    
    // Build schedule entries
    const scheduleEntries: any[] = [];
    
    for (const voyage of voyages) {
      // Departure entry
      if (voyage.scheduled_departure && new Date(voyage.scheduled_departure) >= now && new Date(voyage.scheduled_departure) <= futureDate) {
        scheduleEntries.push({
          voyageId: voyage.id,
          voyageName: voyage.name,
          vesselName: voyage.vessel_name,
          vesselHullNumber: voyage.vessel_hull_number,
          port: voyage.origin_port,
          eventType: 'departure',
          scheduledTime: voyage.scheduled_departure,
          actualTime: voyage.actual_departure,
          status: voyage.status,
        });
      }
      
      // Arrival entry
      if (voyage.scheduled_arrival && new Date(voyage.scheduled_arrival) >= now && new Date(voyage.scheduled_arrival) <= futureDate) {
        scheduleEntries.push({
          voyageId: voyage.id,
          voyageName: voyage.name,
          vesselName: voyage.vessel_name,
          vesselHullNumber: voyage.vessel_hull_number,
          port: voyage.destination_port,
          eventType: 'arrival',
          scheduledTime: voyage.scheduled_arrival,
          actualTime: voyage.actual_arrival,
          status: voyage.status,
        });
      }
      
      // Port calls
      const portCalls = voyage.port_calls as any[];
      if (portCalls && Array.isArray(portCalls)) {
        for (const pc of portCalls) {
          if (pc.eta) {
            const eta = new Date(pc.eta);
            if (eta >= now && eta <= futureDate) {
              scheduleEntries.push({
                voyageId: voyage.id,
                voyageName: voyage.name,
                vesselName: voyage.vessel_name,
                vesselHullNumber: voyage.vessel_hull_number,
                port: pc.port,
                eventType: 'arrival',
                scheduledTime: pc.eta,
                actualTime: null,
                status: voyage.status,
              });
            }
          }
          if (pc.etd) {
            const etd = new Date(pc.etd);
            if (etd >= now && etd <= futureDate) {
              scheduleEntries.push({
                voyageId: voyage.id,
                voyageName: voyage.name,
                vesselName: voyage.vessel_name,
                vesselHullNumber: voyage.vessel_hull_number,
                port: pc.port,
                eventType: 'departure',
                scheduledTime: pc.etd,
                actualTime: null,
                status: voyage.status,
              });
            }
          }
        }
      }
    }
    
    // Sort by scheduled time
    scheduleEntries.sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
    
    res.json(scheduleEntries);
  } catch (error) {
    console.error("[Sea] Error fetching port schedule:", error);
    res.status(500).json({ error: "Failed to fetch port schedule" });
  }
});

// GET /api/sea/pending-transfers - Get pending sea transfers
router.get("/sea/pending-transfers", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const transfers = await db.select({
      transfer: warehouseTransfers,
      source_site: warehouseSites,
    })
      .from(warehouseTransfers)
      .leftJoin(warehouseSites, eq(warehouseTransfers.source_site_id, warehouseSites.id))
      .where(and(
        eq(warehouseTransfers.user_id, req.user!.id),
        eq(warehouseTransfers.transport_mode, "sea"),
        or(
          eq(warehouseTransfers.status, "pending"),
          eq(warehouseTransfers.status, "manifest_created")
        ),
        isNull(warehouseTransfers.assigned_voyage_id)
      ))
      .orderBy(desc(warehouseTransfers.created_at));

    // Get destination sites
    const destSiteIds = transfers.map(t => t.transfer.destination_site_id);
    const destSites = destSiteIds.length > 0 
      ? await db.select().from(warehouseSites).where(inArray(warehouseSites.id, destSiteIds))
      : [];
    const destSiteMap = new Map(destSites.map(s => [s.id, s]));

    const enrichedTransfers = transfers.map(t => {
      const items = (t.transfer.transfer_items as any[]) || [];
      const totalWeight = items.reduce((sum, item) => {
        const weight = parseFloat(String(item.weight_lbs || 0)) || 0;
        return sum + (weight * (item.quantity || 1));
      }, 0);
      
      return {
        id: t.transfer.id,
        sourceWarehouse: t.source_site?.name || `Site ${t.transfer.source_site_id}`,
        destinationWarehouse: destSiteMap.get(t.transfer.destination_site_id)?.name || `Site ${t.transfer.destination_site_id}`,
        sourceSiteId: t.transfer.source_site_id,
        destinationSiteId: t.transfer.destination_site_id,
        itemCount: items.length,
        totalWeightLbs: Math.round(totalWeight),
        scheduledDate: t.transfer.scheduled_date?.toISOString() || null,
        status: t.transfer.status,
        transportMode: t.transfer.transport_mode,
      };
    });

    res.json(enrichedTransfers);
  } catch (error) {
    console.error("[Sea] Error fetching pending transfers:", error);
    res.status(500).json({ error: "Failed to fetch pending transfers" });
  }
});

// POST /api/sea/transfers/:id/propose-voyage - Auto-calculate voyage proposal for sea transfer
router.post("/sea/transfers/:id/propose-voyage", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const transferId = parseInt(req.params.id);
    if (isNaN(transferId)) {
      return res.status(400).json({ error: "Invalid transfer ID" });
    }
    const userId = req.user!.id;
    
    // Verify transfer exists and belongs to user
    const transferResult = await db.select({
      transfer: warehouseTransfers,
      sourceSite: warehouseSites,
    })
      .from(warehouseTransfers)
      .leftJoin(warehouseSites, eq(warehouseTransfers.source_site_id, warehouseSites.id))
      .where(and(
        eq(warehouseTransfers.id, transferId),
        eq(warehouseTransfers.user_id, userId)
      ));
    
    if (transferResult.length === 0) {
      return res.status(404).json({ error: "Transfer not found" });
    }
    
    const { transfer, sourceSite } = transferResult[0];
    
    if (transfer.transport_mode !== "sea") {
      return res.status(400).json({ error: "Transfer is not a sea transport" });
    }
    
    // Get destination site
    const [destSite] = await db.select()
      .from(warehouseSites)
      .where(eq(warehouseSites.id, transfer.destination_site_id));
    
    // Calculate total weight with estimation for missing weights
    const DEFAULT_WEIGHT_LBS = 500;
    const DENSITY_LBS_PER_CUBIC_INCH = 0.02;
    
    const estimateWeight = (item: any): number => {
      if (item.weight_lbs && parseFloat(String(item.weight_lbs)) > 0) {
        return parseFloat(String(item.weight_lbs));
      }
      const l = parseFloat(String(item.length_in)) || 0;
      const w = parseFloat(String(item.width_in)) || 0;
      const h = parseFloat(String(item.height_in)) || 0;
      if (l > 0 && w > 0 && h > 0) {
        return Math.round(l * w * h * DENSITY_LBS_PER_CUBIC_INCH);
      }
      return DEFAULT_WEIGHT_LBS;
    };
    
    const items = (transfer.transfer_items as any[]) || [];
    const hasEstimatedWeights = items.some(item => !item.weight_lbs || parseFloat(String(item.weight_lbs)) <= 0);
    const totalWeight = items.reduce((sum, item) => {
      return sum + (estimateWeight(item) * (item.quantity || 1));
    }, 0);
    
    // Get all vessel types and recommend suitable ones
    const vesselTypes = await db.select().from(seaVesselTypes)
      .orderBy(asc(seaVesselTypes.cargo_capacity_lbs));
    
    // Find suitable vessel types (capacity >= total weight)
    const recommendedVesselTypes = vesselTypes
      .filter(vt => vt.cargo_capacity_lbs >= totalWeight)
      .slice(0, 5)
      .map(vt => ({
        vesselTypeId: vt.id,
        code: vt.code,
        name: vt.name,
        cargoCapacityLbs: vt.cargo_capacity_lbs,
        utilizationPercent: Math.round((totalWeight / vt.cargo_capacity_lbs) * 100 * 100) / 100,
        isRecommended: true,
      }));
    
    // If no vessel type can handle the load, include largest ones anyway with warning
    let hasSufficientCapacity = recommendedVesselTypes.length > 0;
    if (!hasSufficientCapacity && vesselTypes.length > 0) {
      const largestVessels = vesselTypes.slice(-3).reverse();
      for (const vt of largestVessels) {
        recommendedVesselTypes.push({
          vesselTypeId: vt.id,
          code: vt.code,
          name: vt.name,
          cargoCapacityLbs: vt.cargo_capacity_lbs,
          utilizationPercent: Math.round((totalWeight / vt.cargo_capacity_lbs) * 100 * 100) / 100,
          isRecommended: false,
        });
      }
    }
    
    // Build proposal
    const voyageName = `Transfer-${transferId}-Voyage`;
    const originPort = sourceSite?.name || `Port ${transfer.source_site_id}`;
    const destinationPort = destSite?.name || `Port ${transfer.destination_site_id}`;
    
    const estimatedCapacity = recommendedVesselTypes.length > 0 
      ? recommendedVesselTypes[0].utilizationPercent 
      : 100;
    
    res.json({
      proposal: {
        transferId,
        voyageName,
        originPort,
        destinationPort,
        totalWeightLbs: Math.round(totalWeight),
        itemCount: items.length,
        recommendedVesselTypes,
        estimatedCapacityPercent: estimatedCapacity,
        scheduledDate: transfer.scheduled_date?.toISOString() || null,
        hasEstimatedWeights,
      },
      hasSufficientCapacity,
      warning: !hasSufficientCapacity 
        ? "No single vessel type can carry this cargo. Consider splitting the shipment."
        : null,
      info: hasEstimatedWeights
        ? `Weights estimated for ${items.filter(i => !i.weight_lbs || parseFloat(String(i.weight_lbs)) <= 0).length} items using 500 lbs default per unit.`
        : null,
    });
  } catch (error) {
    console.error("[Sea] Failed to propose voyage:", error);
    res.status(500).json({ error: "Failed to calculate voyage proposal" });
  }
});

// POST /api/sea/transfers/:id/auto-create-voyage - Auto-create voyage from transfer
router.post("/sea/transfers/:id/auto-create-voyage", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const transferId = parseInt(req.params.id);
    if (isNaN(transferId)) {
      return res.status(400).json({ error: "Invalid transfer ID" });
    }
    const userId = req.user!.id;
    const { vessel_type_id } = req.body;
    
    // Verify transfer exists and belongs to user
    const transferResult = await db.select({
      transfer: warehouseTransfers,
      sourceSite: warehouseSites,
    })
      .from(warehouseTransfers)
      .leftJoin(warehouseSites, eq(warehouseTransfers.source_site_id, warehouseSites.id))
      .where(and(
        eq(warehouseTransfers.id, transferId),
        eq(warehouseTransfers.user_id, userId)
      ));
    
    if (transferResult.length === 0) {
      return res.status(404).json({ error: "Transfer not found" });
    }
    
    const { transfer, sourceSite } = transferResult[0];
    
    if (transfer.transport_mode !== "sea") {
      return res.status(400).json({ error: "Transfer is not a sea transport" });
    }
    
    if (transfer.assigned_voyage_id) {
      return res.status(400).json({ error: "Transfer already has a voyage assigned" });
    }
    
    // Get destination site
    const [destSite] = await db.select()
      .from(warehouseSites)
      .where(eq(warehouseSites.id, transfer.destination_site_id));
    
    // Get vessel type if specified
    let vesselType = null;
    if (vessel_type_id) {
      const [vt] = await db.select().from(seaVesselTypes).where(eq(seaVesselTypes.id, vessel_type_id));
      vesselType = vt || null;
    }
    
    // Build voyage data
    const voyageName = `Transfer-${transferId}-Voyage`;
    const originPort = sourceSite?.name || `Port ${transfer.source_site_id}`;
    const destinationPort = destSite?.name || `Port ${transfer.destination_site_id}`;
    
    // Create voyage
    const [newVoyage] = await db.insert(seaVoyages)
      .values({
        user_id: userId,
        name: voyageName,
        vessel_type_id: vessel_type_id || null,
        vessel_name: vesselType?.name || null,
        vessel_class: vesselType?.category || null,
        origin_port: originPort,
        destination_port: destinationPort,
        status: "planned",
        scheduled_departure: transfer.scheduled_date || new Date(),
        port_calls: [],
        metadata: { transfer_id: transferId },
      })
      .returning();
    
    // Update transfer with voyage assignment
    await db.update(warehouseTransfers)
      .set({ 
        assigned_voyage_id: newVoyage.id,
        status: "transport_assigned",
        updated_at: new Date()
      })
      .where(eq(warehouseTransfers.id, transferId));
    
    // Update manifest if exists
    if (transfer.manifest_id) {
      await db.update(crossModalManifests)
        .set({ 
          voyage_id: newVoyage.id,
          status: "assigned",
          updated_at: new Date()
        })
        .where(eq(crossModalManifests.id, transfer.manifest_id));
    }
    
    console.log(`[Sea] Auto-created voyage ${newVoyage.id} for transfer ${transferId}`);
    
    res.status(201).json({
      message: "Voyage created and assigned successfully",
      voyage: {
        id: newVoyage.id,
        name: newVoyage.name,
        origin_port: newVoyage.origin_port,
        destination_port: newVoyage.destination_port,
        status: newVoyage.status,
        vessel_type_id: newVoyage.vessel_type_id,
      },
      transfer_id: transferId,
      transfer_status: "transport_assigned"
    });
  } catch (error) {
    console.error("[Sea] Failed to auto-create voyage:", error);
    res.status(500).json({ error: "Failed to create voyage for transfer" });
  }
});

// POST /api/sea/transfers/:id/assign-voyage - Assign existing voyage to transfer
router.post("/sea/transfers/:id/assign-voyage", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const transferId = parseInt(req.params.id);
    if (isNaN(transferId)) {
      return res.status(400).json({ error: "Invalid transfer ID" });
    }
    const { voyage_id } = req.body;
    
    if (!voyage_id) {
      return res.status(400).json({ error: "voyage_id is required" });
    }
    
    // Verify transfer exists and belongs to user
    const [transfer] = await db.select()
      .from(warehouseTransfers)
      .where(and(
        eq(warehouseTransfers.id, transferId),
        eq(warehouseTransfers.user_id, req.user!.id)
      ));
    
    if (!transfer) {
      return res.status(404).json({ error: "Transfer not found" });
    }
    
    if (transfer.transport_mode !== "sea") {
      return res.status(400).json({ error: "Transfer is not a sea transport" });
    }
    
    // Verify voyage exists and belongs to user
    const [voyage] = await db.select()
      .from(seaVoyages)
      .where(and(
        eq(seaVoyages.id, voyage_id),
        eq(seaVoyages.user_id, req.user!.id)
      ));
    
    if (!voyage) {
      return res.status(404).json({ error: "Voyage not found" });
    }
    
    // Update transfer with voyage assignment
    await db.update(warehouseTransfers)
      .set({ 
        assigned_voyage_id: voyage_id,
        status: "transport_assigned",
        updated_at: new Date()
      })
      .where(eq(warehouseTransfers.id, transferId));
    
    // Update manifest if exists
    if (transfer.manifest_id) {
      await db.update(crossModalManifests)
        .set({ 
          voyage_id: voyage_id,
          status: "assigned",
          updated_at: new Date()
        })
        .where(eq(crossModalManifests.id, transfer.manifest_id));
    }
    
    console.log(`[Sea] Transfer ${transferId} assigned to voyage ${voyage_id}`);
    
    res.json({
      message: "Transfer assigned to voyage successfully",
      transfer_id: transferId,
      voyage_id: voyage_id,
      status: "transport_assigned"
    });
  } catch (error) {
    console.error("[Sea] Failed to assign voyage:", error);
    res.status(500).json({ error: "Failed to assign voyage to transfer" });
  }
});

export default router;
