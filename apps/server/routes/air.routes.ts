import { Router } from "express";
import { AuthRequest, authMiddleware, validatePaginationParam } from "../middleware";
import {
  flightPlans,
  flightSchedules,
  splitSessions,
  flightNodes,
  flightEdges,
  portInventory,
  warehouseTransfers,
  warehouseSites,
  warehouseInventoryItems
} from "@shared/schema";
import { db } from "../db";
import { eq, and, or, ilike, isNull, desc, inArray } from "drizzle-orm";
import { storage } from "../storage";

const router = Router();

// ============================================================================
// AIR PENDING TRANSFERS (GET /api/air/pending-transfers)
// ============================================================================

router.get("/air/pending-transfers", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const transfers = await db.select({
      transfer: warehouseTransfers,
      source_site: warehouseSites,
    })
      .from(warehouseTransfers)
      .leftJoin(warehouseSites, eq(warehouseTransfers.source_site_id, warehouseSites.id))
      .where(and(
        eq(warehouseTransfers.user_id, req.user!.id),
        eq(warehouseTransfers.transport_mode, "air"),
        or(
          eq(warehouseTransfers.status, "pending"),
          eq(warehouseTransfers.status, "manifest_created")
        ),
        isNull(warehouseTransfers.assigned_flight_plan_id)
      ))
      .orderBy(desc(warehouseTransfers.created_at));

    const destSiteIds = transfers.map(t => t.transfer.destination_site_id);
    const destSites = destSiteIds.length > 0 
      ? await db.select().from(warehouseSites).where(inArray(warehouseSites.id, destSiteIds))
      : [];
    const destSiteMap = new Map(destSites.map(s => [s.id, s]));

    const enrichedTransfers = transfers.map(t => ({
      ...t.transfer,
      source_site: t.source_site,
      destination_site: destSiteMap.get(t.transfer.destination_site_id) || null,
    }));

    res.json(enrichedTransfers);
  } catch (error) {
    console.error("[Air] Error fetching pending transfers:", error);
    res.status(500).json({ error: "Failed to fetch pending air transfers" });
  }
});

// ============================================================================
// FLIGHT PLANS API (PROTECTED)
// ============================================================================

router.get("/flight-plans", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const plans = await storage.getFlightPlans(req.user!.id);
    res.json(plans);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch flight plans" });
  }
});

router.get("/flight-plans/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid flight plan ID" });
    }
    const plan = await storage.getFlightPlan(id, req.user!.id);
    if (!plan) {
      return res.status(404).json({ error: "Flight plan not found" });
    }
    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch flight plan" });
  }
});

router.post("/flight-plans", authMiddleware, async (req: AuthRequest, res) => {
  try {
    console.log('Creating flight plan with data:', JSON.stringify({
      name: req.body.name,
      status: req.body.status,
      movement_items_count: req.body.movement_items_count,
      total_weight_lb: req.body.total_weight_lb,
      aircraft_count: req.body.aircraft_count,
      has_allocation_data: !!req.body.allocation_data
    }));
    
    const plan = await storage.createFlightPlan({
      ...req.body,
      user_id: req.user!.id
    });
    console.log('Flight plan created successfully:', plan.id);
    res.status(201).json(plan);
  } catch (error) {
    console.error('Failed to create flight plan:', error);
    res.status(500).json({ error: "Failed to create flight plan", details: String(error) });
  }
});

router.put("/flight-plans/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid flight plan ID" });
    }
    const plan = await storage.updateFlightPlan(
      id,
      req.user!.id,
      req.body
    );
    if (!plan) {
      return res.status(404).json({ error: "Flight plan not found" });
    }
    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: "Failed to update flight plan" });
  }
});

router.patch("/flight-plans/:id/status", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid flight plan ID" });
    }
    const { status } = req.body;
    const validStatuses = ['draft', 'complete', 'archived'];
    
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: "Invalid status", 
        validStatuses 
      });
    }
    
    const plan = await storage.updateFlightPlan(
      id,
      req.user!.id,
      { status }
    );
    
    if (!plan) {
      return res.status(404).json({ error: "Flight plan not found" });
    }
    
    res.json(plan);
  } catch (error) {
    console.error('Failed to update flight plan status:', error);
    res.status(500).json({ error: "Failed to update flight plan status" });
  }
});

router.delete("/flight-plans/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid flight plan ID" });
    }
    await storage.deleteFlightPlan(id, req.user!.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: "Failed to delete flight plan" });
  }
});

// ============================================================================
// FLIGHT SCHEDULES API (PROTECTED)
// ============================================================================

router.get("/flight-schedules", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const schedules = await storage.getFlightSchedules(req.user!.id);
    res.json(schedules);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch flight schedules" });
  }
});

router.get("/flight-schedules/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid flight schedule ID" });
    }
    const schedule = await storage.getFlightSchedule(id, req.user!.id);
    if (!schedule) {
      return res.status(404).json({ error: "Flight schedule not found" });
    }
    res.json(schedule);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch flight schedule" });
  }
});

router.post("/flight-schedules", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const schedule = await storage.createFlightSchedule({
      ...req.body,
      user_id: req.user!.id
    });
    res.status(201).json(schedule);
  } catch (error) {
    res.status(500).json({ error: "Failed to create flight schedule" });
  }
});

router.delete("/flight-schedules/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid flight schedule ID" });
    }
    await storage.deleteFlightSchedule(id, req.user!.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: "Failed to delete flight schedule" });
  }
});

router.get("/flight-plans/:planId/schedules", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const planId = parseInt(req.params.planId);
    if (isNaN(planId)) {
      return res.status(400).json({ error: "Invalid flight plan ID" });
    }
    const plan = await storage.getFlightPlan(planId, req.user!.id);
    if (!plan) {
      return res.status(404).json({ error: "Flight plan not found" });
    }
    const schedules = await storage.getFlightSchedulesByPlanId(planId, req.user!.id);
    res.json(schedules);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch flight schedules" });
  }
});

router.post("/flight-plans/:planId/schedules", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const planId = parseInt(req.params.planId);
    if (isNaN(planId)) {
      return res.status(400).json({ error: "Invalid flight plan ID" });
    }
    const plan = await storage.getFlightPlan(planId, req.user!.id);
    if (!plan) {
      return res.status(404).json({ error: "Flight plan not found" });
    }
    
    const { schedules } = req.body;
    if (!Array.isArray(schedules)) {
      return res.status(400).json({ error: "schedules must be an array" });
    }
    
    await storage.deleteFlightSchedulesByPlanId(planId, req.user!.id);
    
    const createdSchedules = [];
    for (const schedule of schedules) {
      const created = await storage.createFlightSchedule({
        user_id: req.user!.id,
        flight_plan_id: planId,
        name: schedule.name || schedule.callsign || `Flight ${createdSchedules.length + 1}`,
        schedule_data: schedule,
        total_flights: 1
      });
      createdSchedules.push(created);
    }
    
    if (schedules.length > 0) {
      await storage.updateFlightPlan(planId, req.user!.id, {
        aircraft_count: schedules.length
      });
    }
    
    res.status(201).json(createdSchedules);
  } catch (error) {
    console.error('Failed to save flight schedules:', error);
    res.status(500).json({ error: "Failed to save flight schedules" });
  }
});

// ============================================================================
// SPLIT SESSIONS API (PROTECTED)
// ============================================================================

router.get("/split-sessions", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const sessions = await storage.getSplitSessions(req.user!.id);
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch split sessions" });
  }
});

router.get("/split-sessions/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid split session ID" });
    }
    const session = await storage.getSplitSession(id, req.user!.id);
    if (!session) {
      return res.status(404).json({ error: "Split session not found" });
    }
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch split session" });
  }
});

router.post("/split-sessions", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const session = await storage.createSplitSession({
      ...req.body,
      user_id: req.user!.id
    });
    res.status(201).json(session);
  } catch (error) {
    res.status(500).json({ error: "Failed to create split session" });
  }
});

router.put("/split-sessions/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid split session ID" });
    }
    const session = await storage.updateSplitSession(
      id,
      req.user!.id,
      req.body
    );
    if (!session) {
      return res.status(404).json({ error: "Split session not found" });
    }
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: "Failed to update split session" });
  }
});

router.delete("/split-sessions/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid split session ID" });
    }
    await storage.deleteSplitSession(id, req.user!.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: "Failed to delete split session" });
  }
});

// ============================================================================
// FLIGHT NODES API (PROTECTED)
// ============================================================================

router.get("/flight-plans/:planId/nodes", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const planId = parseInt(req.params.planId);
    if (isNaN(planId)) {
      return res.status(400).json({ error: "Invalid flight plan ID" });
    }
    const plan = await storage.getFlightPlan(planId, req.user!.id);
    if (!plan) {
      return res.status(404).json({ error: "Flight plan not found" });
    }
    const nodes = await storage.getFlightNodes(planId, req.user!.id);
    res.json(nodes);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch flight nodes" });
  }
});

router.get("/flight-nodes/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid flight node ID" });
    }
    const node = await storage.getFlightNode(id, req.user!.id);
    if (!node) {
      return res.status(404).json({ error: "Flight node not found" });
    }
    res.json(node);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch flight node" });
  }
});

router.get("/flight-nodes/:id/children", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid flight node ID" });
    }
    const children = await storage.getFlightNodeChildren(id, req.user!.id);
    res.json(children);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch node children" });
  }
});

router.post("/flight-plans/:planId/nodes", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const planId = parseInt(req.params.planId);
    if (isNaN(planId)) {
      return res.status(400).json({ error: "Invalid flight plan ID" });
    }
    const plan = await storage.getFlightPlan(planId, req.user!.id);
    if (!plan) {
      return res.status(404).json({ error: "Flight plan not found" });
    }
    const node = await storage.createFlightNode({
      ...req.body,
      flight_plan_id: planId,
      user_id: req.user!.id
    });
    res.status(201).json(node);
  } catch (error) {
    res.status(500).json({ error: "Failed to create flight node" });
  }
});

router.put("/flight-nodes/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const nodeId = parseInt(req.params.id);
    if (isNaN(nodeId)) {
      return res.status(400).json({ error: "Invalid flight node ID" });
    }
    const { user_id, flight_plan_id, id, ...safeData } = req.body;
    const node = await storage.updateFlightNode(nodeId, req.user!.id, safeData);
    if (!node) {
      return res.status(404).json({ error: "Flight node not found" });
    }
    res.json(node);
  } catch (error) {
    res.status(500).json({ error: "Failed to update flight node" });
  }
});

router.delete("/flight-nodes/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid flight node ID" });
    }
    await storage.deleteFlightNode(id, req.user!.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: "Failed to delete flight node" });
  }
});

// ============================================================================
// FLIGHT EDGES API (PROTECTED)
// ============================================================================

router.get("/flight-plans/:planId/edges", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const planId = parseInt(req.params.planId);
    if (isNaN(planId)) {
      return res.status(400).json({ error: "Invalid flight plan ID" });
    }
    const plan = await storage.getFlightPlan(planId, req.user!.id);
    if (!plan) {
      return res.status(404).json({ error: "Flight plan not found" });
    }
    const edges = await storage.getFlightEdges(planId, req.user!.id);
    res.json(edges);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch flight edges" });
  }
});

router.get("/flight-edges/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid flight edge ID" });
    }
    const edge = await storage.getFlightEdge(id, req.user!.id);
    if (!edge) {
      return res.status(404).json({ error: "Flight edge not found" });
    }
    res.json(edge);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch flight edge" });
  }
});

router.post("/flight-plans/:planId/edges", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const planId = parseInt(req.params.planId);
    if (isNaN(planId)) {
      return res.status(400).json({ error: "Invalid flight plan ID" });
    }
    const plan = await storage.getFlightPlan(planId, req.user!.id);
    if (!plan) {
      return res.status(404).json({ error: "Flight plan not found" });
    }
    const edge = await storage.createFlightEdge({
      ...req.body,
      flight_plan_id: planId,
      user_id: req.user!.id
    });
    res.status(201).json(edge);
  } catch (error) {
    res.status(500).json({ error: "Failed to create flight edge" });
  }
});

router.put("/flight-edges/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const edgeId = parseInt(req.params.id);
    if (isNaN(edgeId)) {
      return res.status(400).json({ error: "Invalid flight edge ID" });
    }
    const { user_id, flight_plan_id, id, ...safeData } = req.body;
    const edge = await storage.updateFlightEdge(edgeId, req.user!.id, safeData);
    if (!edge) {
      return res.status(404).json({ error: "Flight edge not found" });
    }
    res.json(edge);
  } catch (error) {
    res.status(500).json({ error: "Failed to update flight edge" });
  }
});

router.delete("/flight-edges/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid flight edge ID" });
    }
    await storage.deleteFlightEdge(id, req.user!.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: "Failed to delete flight edge" });
  }
});

// ============================================================================
// PORT INVENTORY API (PROTECTED)
// ============================================================================

router.get("/flight-plans/:planId/port-inventory", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const planId = parseInt(req.params.planId);
    if (isNaN(planId)) {
      return res.status(400).json({ error: "Invalid flight plan ID" });
    }
    const plan = await storage.getFlightPlan(planId, req.user!.id);
    if (!plan) {
      return res.status(404).json({ error: "Flight plan not found" });
    }
    const inventories = await storage.getPortInventories(planId, req.user!.id);
    res.json(inventories);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch port inventories" });
  }
});

router.get("/flight-plans/:planId/port-inventory/:airbaseId", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const planId = parseInt(req.params.planId);
    if (isNaN(planId)) {
      return res.status(400).json({ error: "Invalid flight plan ID" });
    }
    const plan = await storage.getFlightPlan(planId, req.user!.id);
    if (!plan) {
      return res.status(404).json({ error: "Flight plan not found" });
    }
    const inventory = await storage.getPortInventory(planId, req.params.airbaseId, req.user!.id);
    if (!inventory) {
      return res.json({ 
        flight_plan_id: planId, 
        airbase_id: req.params.airbaseId, 
        incoming_cargo: [], 
        outgoing_cargo: [], 
        available_cargo: [] 
      });
    }
    res.json(inventory);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch port inventory" });
  }
});

router.post("/flight-plans/:planId/port-inventory", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const planId = parseInt(req.params.planId);
    if (isNaN(planId)) {
      return res.status(400).json({ error: "Invalid flight plan ID" });
    }
    const plan = await storage.getFlightPlan(planId, req.user!.id);
    if (!plan) {
      return res.status(404).json({ error: "Flight plan not found" });
    }
    const inventory = await storage.upsertPortInventory({
      ...req.body,
      flight_plan_id: planId,
      user_id: req.user!.id
    });
    res.status(201).json(inventory);
  } catch (error) {
    res.status(500).json({ error: "Failed to create/update port inventory" });
  }
});

router.put("/flight-plans/:planId/port-inventory/:airbaseId", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const planId = parseInt(req.params.planId);
    if (isNaN(planId)) {
      return res.status(400).json({ error: "Invalid flight plan ID" });
    }
    const plan = await storage.getFlightPlan(planId, req.user!.id);
    if (!plan) {
      return res.status(404).json({ error: "Flight plan not found" });
    }
    
    const { incoming_cargo, outgoing_cargo, available_cargo } = req.body;
    if (incoming_cargo !== undefined && !Array.isArray(incoming_cargo)) {
      return res.status(400).json({ error: "incoming_cargo must be an array" });
    }
    if (outgoing_cargo !== undefined && !Array.isArray(outgoing_cargo)) {
      return res.status(400).json({ error: "outgoing_cargo must be an array" });
    }
    if (available_cargo !== undefined && !Array.isArray(available_cargo)) {
      return res.status(400).json({ error: "available_cargo must be an array" });
    }
    
    const inventory = await storage.upsertPortInventory({
      incoming_cargo: incoming_cargo || [],
      outgoing_cargo: outgoing_cargo || [],
      available_cargo: available_cargo || [],
      flight_plan_id: planId,
      airbase_id: req.params.airbaseId,
      user_id: req.user!.id
    });
    res.json(inventory);
  } catch (error) {
    res.status(500).json({ error: "Failed to update port inventory" });
  }
});

export default router;
