import { Router } from "express";
import { db } from "../db";
import { eq, and, or, isNull, asc, desc, inArray } from "drizzle-orm";
import {
  landRoutes,
  landConvoys,
  landVehicleTypes,
  landConvoyVehicles,
  warehouseTransfers,
  warehouseSites,
} from "@shared/schema";
import { AuthRequest, authMiddleware, validatePaginationParam } from "../middleware";
import { googleMapsService } from "../services";
import { seedLandVehicles } from "../seeds/landVehicles";

const router = Router();

// ============================================================================
// LAND LOGISTICS API (PROTECTED)
// ============================================================================

// POST /api/land/seed-vehicles - Seed land vehicle types
router.post("/land/seed-vehicles", authMiddleware, async (req: AuthRequest, res) => {
  try {
    console.log("[Land] Seeding land vehicle types...");
    await seedLandVehicles();
    res.json({ success: true, message: "Land vehicle types seeded successfully" });
  } catch (error) {
    console.error("[Land] Failed to seed vehicle types:", error);
    res.status(500).json({ error: "Failed to seed land vehicle types" });
  }
});

// ============================================================================
// LAND LOGISTICS API - Routes, Convoys, Vehicles
// ============================================================================

// Get all land vehicle types
router.get("/land/vehicle-types", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const vehicles = await db.select().from(landVehicleTypes).orderBy(asc(landVehicleTypes.category), asc(landVehicleTypes.code));
    res.json(vehicles);
  } catch (error) {
    console.error("[Land] Error fetching vehicle types:", error);
    res.status(500).json({ error: "Failed to fetch vehicle types" });
  }
});

// Get single vehicle type
router.get("/land/vehicle-types/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid vehicle type ID" });
    }
    const [vehicle] = await db.select().from(landVehicleTypes).where(eq(landVehicleTypes.id, id));
    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle type not found" });
    }
    res.json(vehicle);
  } catch (error) {
    console.error("[Land] Error fetching vehicle type:", error);
    res.status(500).json({ error: "Failed to fetch vehicle type" });
  }
});

// GET /api/land/pending-transfers - Get pending ground transfers awaiting convoy assignment
router.get("/land/pending-transfers", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const transfers = await db.select({
      transfer: warehouseTransfers,
      source_site: warehouseSites,
    })
      .from(warehouseTransfers)
      .leftJoin(warehouseSites, eq(warehouseTransfers.source_site_id, warehouseSites.id))
      .where(and(
        eq(warehouseTransfers.user_id, req.user!.id),
        eq(warehouseTransfers.transport_mode, "ground"),
        or(
          eq(warehouseTransfers.status, "pending"),
          eq(warehouseTransfers.status, "manifest_created")
        ),
        isNull(warehouseTransfers.assigned_convoy_id)
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
    console.error("[Land] Error fetching pending transfers:", error);
    res.status(500).json({ error: "Failed to fetch pending transfers" });
  }
});

// --- LAND ROUTES ---

// Get all routes for user
router.get("/land/routes", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const routes = await db.select().from(landRoutes)
      .where(eq(landRoutes.user_id, req.user!.id))
      .orderBy(desc(landRoutes.created_at));
    res.json(routes);
  } catch (error) {
    console.error("[Land] Error fetching routes:", error);
    res.status(500).json({ error: "Failed to fetch routes" });
  }
});

// Create new route
router.post("/land/routes", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const routeData = {
      ...req.body,
      user_id: req.user!.id,
    };
    const [route] = await db.insert(landRoutes).values(routeData).returning();
    res.status(201).json(route);
  } catch (error) {
    console.error("[Land] Error creating route:", error);
    res.status(500).json({ error: "Failed to create route" });
  }
});

// Update route
router.put("/land/routes/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid route ID" });
    }
    const [route] = await db.update(landRoutes)
      .set({ ...req.body, updated_at: new Date() })
      .where(and(eq(landRoutes.id, id), eq(landRoutes.user_id, req.user!.id)))
      .returning();
    if (!route) {
      return res.status(404).json({ error: "Route not found" });
    }
    res.json(route);
  } catch (error) {
    console.error("[Land] Error updating route:", error);
    res.status(500).json({ error: "Failed to update route" });
  }
});

// Delete route
router.delete("/land/routes/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid route ID" });
    }
    const [route] = await db.delete(landRoutes)
      .where(and(eq(landRoutes.id, id), eq(landRoutes.user_id, req.user!.id)))
      .returning();
    if (!route) {
      return res.status(404).json({ error: "Route not found" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("[Land] Error deleting route:", error);
    res.status(500).json({ error: "Failed to delete route" });
  }
});

// --- LAND CONVOYS ---

// Get all convoys for user
router.get("/land/convoys", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const convoys = await db.select().from(landConvoys)
      .where(eq(landConvoys.user_id, req.user!.id))
      .orderBy(desc(landConvoys.created_at));
    
    const mappedConvoys = convoys.map(c => ({
      id: c.id,
      name: c.name,
      route_id: c.route_id,
      origin: c.origin || "",
      destination: c.destination || "",
      status: c.status,
      vehicle_count: c.vehicle_count,
      total_weight_lbs: c.total_cargo_weight_lbs || 0,
      departure_time: c.departure_time,
      arrival_time: c.arrival_time,
      scheduled_departure: c.scheduled_departure,
      scheduled_arrival: c.scheduled_arrival,
      actual_departure: c.actual_departure,
      actual_arrival: c.actual_arrival,
      cargo_manifest: c.cargo_manifest,
      created_at: c.created_at,
      updated_at: c.updated_at,
    }));
    
    res.json(mappedConvoys);
  } catch (error) {
    console.error("[Land] Error fetching convoys:", error);
    res.status(500).json({ error: "Failed to fetch convoys" });
  }
});

// Get single convoy with vehicles
router.get("/land/convoys/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid convoy ID" });
    }
    const [convoy] = await db.select().from(landConvoys)
      .where(and(eq(landConvoys.id, id), eq(landConvoys.user_id, req.user!.id)));
    if (!convoy) {
      return res.status(404).json({ error: "Convoy not found" });
    }
    
    const vehicles = await db.select().from(landConvoyVehicles)
      .where(eq(landConvoyVehicles.convoy_id, id))
      .orderBy(asc(landConvoyVehicles.position_in_convoy));
    
    const mappedConvoy = {
      id: convoy.id,
      name: convoy.name,
      route_id: convoy.route_id,
      origin: convoy.origin || "",
      destination: convoy.destination || "",
      status: convoy.status,
      vehicle_count: convoy.vehicle_count,
      total_weight_lbs: convoy.total_cargo_weight_lbs || 0,
      departure_time: convoy.departure_time,
      arrival_time: convoy.arrival_time,
      scheduled_departure: convoy.scheduled_departure,
      scheduled_arrival: convoy.scheduled_arrival,
      actual_departure: convoy.actual_departure,
      actual_arrival: convoy.actual_arrival,
      cargo_manifest: convoy.cargo_manifest,
      created_at: convoy.created_at,
      updated_at: convoy.updated_at,
      vehicles,
    };
    
    res.json(mappedConvoy);
  } catch (error) {
    console.error("[Land] Error fetching convoy:", error);
    res.status(500).json({ error: "Failed to fetch convoy" });
  }
});

// Create new convoy
router.post("/land/convoys", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const convoyData = {
      ...req.body,
      user_id: req.user!.id,
    };
    const [convoy] = await db.insert(landConvoys).values(convoyData).returning();
    res.status(201).json(convoy);
  } catch (error) {
    console.error("[Land] Error creating convoy:", error);
    res.status(500).json({ error: "Failed to create convoy" });
  }
});

// Update convoy
router.put("/land/convoys/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid convoy ID" });
    }
    const [convoy] = await db.update(landConvoys)
      .set({ ...req.body, updated_at: new Date() })
      .where(and(eq(landConvoys.id, id), eq(landConvoys.user_id, req.user!.id)))
      .returning();
    if (!convoy) {
      return res.status(404).json({ error: "Convoy not found" });
    }
    res.json(convoy);
  } catch (error) {
    console.error("[Land] Error updating convoy:", error);
    res.status(500).json({ error: "Failed to update convoy" });
  }
});

// Delete convoy
router.delete("/land/convoys/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid convoy ID" });
    }
    await db.delete(landConvoyVehicles).where(eq(landConvoyVehicles.convoy_id, id));
    const [convoy] = await db.delete(landConvoys)
      .where(and(eq(landConvoys.id, id), eq(landConvoys.user_id, req.user!.id)))
      .returning();
    if (!convoy) {
      return res.status(404).json({ error: "Convoy not found" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("[Land] Error deleting convoy:", error);
    res.status(500).json({ error: "Failed to delete convoy" });
  }
});

// --- CONVOY VEHICLES ---

// Add vehicle to convoy
router.post("/land/convoys/:convoyId/vehicles", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const convoyId = parseInt(req.params.convoyId);
    if (isNaN(convoyId)) {
      return res.status(400).json({ error: "Invalid convoy ID" });
    }
    
    const [convoy] = await db.select().from(landConvoys)
      .where(and(eq(landConvoys.id, convoyId), eq(landConvoys.user_id, req.user!.id)));
    if (!convoy) {
      return res.status(404).json({ error: "Convoy not found" });
    }
    
    const vehicleData = {
      ...req.body,
      convoy_id: convoyId,
    };
    const [vehicle] = await db.insert(landConvoyVehicles).values(vehicleData).returning();
    res.status(201).json(vehicle);
  } catch (error) {
    console.error("[Land] Error adding convoy vehicle:", error);
    res.status(500).json({ error: "Failed to add vehicle to convoy" });
  }
});

// Update convoy vehicle
router.put("/land/convoys/:convoyId/vehicles/:vehicleId", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const convoyId = parseInt(req.params.convoyId);
    const vehicleId = parseInt(req.params.vehicleId);
    if (isNaN(convoyId) || isNaN(vehicleId)) {
      return res.status(400).json({ error: "Invalid convoy or vehicle ID" });
    }
    
    const [vehicle] = await db.update(landConvoyVehicles)
      .set({ ...req.body, updated_at: new Date() })
      .where(and(
        eq(landConvoyVehicles.id, vehicleId),
        eq(landConvoyVehicles.convoy_id, convoyId)
      ))
      .returning();
    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }
    res.json(vehicle);
  } catch (error) {
    console.error("[Land] Error updating convoy vehicle:", error);
    res.status(500).json({ error: "Failed to update vehicle" });
  }
});

// Remove vehicle from convoy
router.delete("/land/convoys/:convoyId/vehicles/:vehicleId", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const convoyId = parseInt(req.params.convoyId);
    const vehicleId = parseInt(req.params.vehicleId);
    if (isNaN(convoyId) || isNaN(vehicleId)) {
      return res.status(400).json({ error: "Invalid convoy or vehicle ID" });
    }
    
    const [vehicle] = await db.delete(landConvoyVehicles)
      .where(and(
        eq(landConvoyVehicles.id, vehicleId),
        eq(landConvoyVehicles.convoy_id, convoyId)
      ))
      .returning();
    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("[Land] Error removing convoy vehicle:", error);
    res.status(500).json({ error: "Failed to remove vehicle" });
  }
});

// --- LAND STATISTICS ---

// Get land logistics statistics
router.get("/land/statistics", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const routes = await db.select().from(landRoutes)
      .where(eq(landRoutes.user_id, req.user!.id));
    
    const convoys = await db.select().from(landConvoys)
      .where(eq(landConvoys.user_id, req.user!.id));
    
    const activeConvoys = convoys.filter(c => c.status === 'en_route').length;
    const completedToday = convoys.filter(c => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return c.status === 'completed' && c.arrival_time && new Date(c.arrival_time) >= today;
    }).length;
    
    res.json({
      totalRoutes: routes.length,
      activeRoutes: routes.filter(r => r.status === 'active').length,
      totalConvoys: convoys.length,
      activeConvoys,
      inTransit: convoys.filter(c => c.status === 'en_route').length,
      pendingConvoys: convoys.filter(c => c.status === 'planning').length,
      completedToday,
      totalPayloadLbs: convoys.reduce((sum, c) => sum + (c.total_cargo_weight_lbs || 0), 0),
    });
  } catch (error) {
    console.error("[Land] Error fetching statistics:", error);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

// --- LAND GOOGLE MAPS INTEGRATION ---

// POST /api/land/routes/calculate - Calculate route between two locations
router.post("/land/routes/calculate", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { origin, destination, waypoints, avoidTolls, avoidHighways } = req.body;
    
    if (!origin || !destination) {
      return res.status(400).json({ error: "Origin and destination are required" });
    }

    const route = await googleMapsService.calculateRoute(origin, destination, {
      waypoints,
      avoidTolls,
      avoidHighways,
      vehicleType: 'truck',
    });

    if (!route) {
      return res.status(404).json({ error: "Could not calculate route" });
    }

    res.json(route);
  } catch (error) {
    console.error("[Land] Error calculating route:", error);
    res.status(500).json({ error: "Failed to calculate route" });
  }
});

// GET /api/land/places/autocomplete - Location autocomplete
router.get("/land/places/autocomplete", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { input, sessionToken } = req.query;
    
    if (!input || typeof input !== 'string') {
      return res.status(400).json({ error: "Input query is required" });
    }

    const predictions = await googleMapsService.placeAutocomplete(
      input,
      typeof sessionToken === 'string' ? sessionToken : undefined
    );

    if (!predictions) {
      return res.status(500).json({ error: "Could not fetch autocomplete results" });
    }

    res.json({ predictions });
  } catch (error) {
    console.error("[Land] Error fetching autocomplete:", error);
    res.status(500).json({ error: "Failed to fetch autocomplete results" });
  }
});

// GET /api/land/places/:placeId - Get place details
router.get("/land/places/:placeId", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { placeId } = req.params;
    
    if (!placeId) {
      return res.status(400).json({ error: "Place ID is required" });
    }

    const place = await googleMapsService.getPlaceDetails(placeId);

    if (!place) {
      return res.status(404).json({ error: "Place not found" });
    }

    res.json(place);
  } catch (error) {
    console.error("[Land] Error fetching place details:", error);
    res.status(500).json({ error: "Failed to fetch place details" });
  }
});

// POST /api/land/routes/optimize - Get distance matrix for multiple stops
router.post("/land/routes/optimize", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { locations } = req.body;
    
    if (!locations || !Array.isArray(locations) || locations.length < 2) {
      return res.status(400).json({ error: "At least 2 locations are required" });
    }

    const matrix = await googleMapsService.getDistanceMatrix(locations, locations);

    if (!matrix) {
      return res.status(500).json({ error: "Could not calculate distance matrix" });
    }

    res.json(matrix);
  } catch (error) {
    console.error("[Land] Error calculating distance matrix:", error);
    res.status(500).json({ error: "Failed to calculate distance matrix" });
  }
});

export default router;
