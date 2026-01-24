import { Router } from "express";
import multer from "multer";
import { db } from "../db";
import {
  warehouseSites,
  warehouseInventoryItems,
  warehouseTransfers,
  warehouseBuildings,
  warehouseZones,
  warehouseZoneCapacityHistory,
  warehouseLocations,
  warehouseSettings,
  warehouseAgingThresholds,
  warehouseAnalyticsSnapshots,
  warehouseOptimizationRuns,
  warehouseOptimizationPlans,
  warehouseOptimizationActions,
  warehouseOptimizationEvents,
  warehouseAlerts,
  warehouseStateVersions,
  warehouseItemVersions,
  aiInsights,
  crossModalManifests,
  manifestItems,
  landConvoys,
  landConvoyVehicles,
  flightPlans,
  seaVoyages,
  militaryInstallations,
  users,
  siteThresholds,
  capacityForecasts,
  rebalancingSuggestions,
  transportReservations,
  siteMetricsDaily
} from "@shared/schema";
import * as multiModalRoutingService from "../services/multiModalRoutingService";
import { eq, and, or, ilike, sql, gt, lt, gte, lte, isNull, isNotNull, asc, desc, count, inArray } from "drizzle-orm";
import {
  AuthRequest,
  authMiddleware,
  requireAdmin,
  requireSuperAdmin,
  validatePaginationParam,
  sanitizeSearchTerm,
  validateSortColumn,
  escapeRegexPattern,
  ALLOWED_INVENTORY_SORT_COLUMNS
} from "../middleware";
import { warehouseAnalyticsService } from "../services/warehouseAnalyticsService";
import {
  getSiteCapacity,
  getAllSiteCapacities,
  getLocationCapacities,
  canAcceptItems
} from "../services/capacityService";
import { matchLocationToZone } from "../services/zoneMatchingService";
import { parseFile, getUploadSession, deleteUploadSession, getSessionStats } from "../services/fileIngestionService";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'text/csv', 
      'application/pdf', 
      'text/plain', 
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream'
    ];
    const allowedExts = ['.csv', '.pdf', '.xlsx', '.xls'];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    
    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Only CSV, PDF, XLSX, and XLS files are allowed.`));
    }
  },
});

  // ============================================================================
  // WAREHOUSE MANAGEMENT API (PROTECTED)
  // ============================================================================

  // GET /api/warehouse/inventory-columns - Get available inventory column definitions (dynamic)
router.get("/warehouse/inventory-columns", authMiddleware, async (_req: AuthRequest, res) => {
    try {
      // Dynamically generate column definitions from database schema
      const { INVENTORY_COLUMN_DEFINITIONS } = await import("@arka/shared/inventoryColumns");
      res.json({
        columns: INVENTORY_COLUMN_DEFINITIONS,
        version: Date.now(), // Cache-busting version
      });
    } catch (error) {
      console.error("[Warehouse] Failed to fetch column definitions:", error);
      res.status(500).json({ error: "Failed to fetch column definitions" });
    }
  });

  // GET /api/warehouse/sites - Get all warehouse sites for the current user with inventory counts
router.get("/warehouse/sites", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const sites = await db.select({
        id: warehouseSites.id,
        user_id: warehouseSites.user_id,
        code: warehouseSites.code,
        name: warehouseSites.name,
        address: warehouseSites.address,
        city: warehouseSites.city,
        country: warehouseSites.country,
        timezone: warehouseSites.timezone,
        latitude: warehouseSites.latitude,
        longitude: warehouseSites.longitude,
        active: warehouseSites.active,
        created_at: warehouseSites.created_at,
        updated_at: warehouseSites.updated_at,
        item_count: sql<number>`CAST(COUNT(${warehouseInventoryItems.id}) AS INTEGER)`,
        total_quantity: sql<number>`CAST(COALESCE(SUM(${warehouseInventoryItems.quantity}), 0) AS INTEGER)`,
      })
        .from(warehouseSites)
        .leftJoin(warehouseInventoryItems, eq(warehouseSites.id, warehouseInventoryItems.site_id))
        .where(eq(warehouseSites.user_id, req.user!.id))
        .groupBy(warehouseSites.id);
      res.json(sites);
    } catch (error) {
      console.error("[Warehouse] Failed to fetch sites:", error);
      res.status(500).json({ error: "Failed to fetch warehouse sites" });
    }
  });

  // POST /api/warehouse/sites - Create a new warehouse site
router.post("/warehouse/sites", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { 
        code, name, address, address_line_1, address_line_2, 
        city, state, zip_code, country, timezone, 
        latitude, longitude, active, aor, shipyard_code, dodaac 
      } = req.body;
      
      if (!code || !name) {
        return res.status(400).json({ error: "Code and name are required" });
      }

      // If coordinates not provided but we have address info, try to geocode
      let finalLat = latitude;
      let finalLng = longitude;
      
      if (!latitude && !longitude && (address_line_1 || city)) {
        const { geocodeAddress } = await import("../services/googleMapsService");
        const addressParts = [address_line_1, address_line_2, city, state, zip_code, country].filter(Boolean);
        const fullAddress = addressParts.join(", ");
        
        if (fullAddress) {
          const geocodeResult = await geocodeAddress(fullAddress);
          if (geocodeResult) {
            finalLat = geocodeResult.lat.toString();
            finalLng = geocodeResult.lng.toString();
          }
        }
      }

      const [site] = await db.insert(warehouseSites).values({
        user_id: req.user!.id,
        code,
        name,
        address: address || null,
        address_line_1: address_line_1 || null,
        address_line_2: address_line_2 || null,
        city: city || null,
        state: state || null,
        zip_code: zip_code || null,
        country: country || "USA",
        timezone: timezone || "UTC",
        latitude: finalLat || null,
        longitude: finalLng || null,
        active: active !== undefined ? active : true,
        aor: aor || null,
        shipyard_code: shipyard_code || null,
        dodaac: dodaac || null,
      }).returning();

      res.status(201).json(site);
    } catch (error) {
      console.error("[Warehouse] Failed to create site:", error);
      res.status(500).json({ error: "Failed to create warehouse site" });
    }
  });

  // GET /api/warehouse/sites/:siteId/deletion-preview - Get counts of data that will be deleted
router.get("/warehouse/sites/:siteId/deletion-preview", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Get building IDs for this site
      const buildings = await db.select({ id: warehouseBuildings.id })
        .from(warehouseBuildings)
        .where(eq(warehouseBuildings.site_id, siteId));
      const buildingIds = buildings.map(b => b.id);

      // Get optimization plan IDs for this site
      const plans = await db.select({ id: warehouseOptimizationPlans.id })
        .from(warehouseOptimizationPlans)
        .where(eq(warehouseOptimizationPlans.site_id, siteId));
      const planIds = plans.map(p => p.id);

      // Count buildings
      const [buildingsCount] = await db.select({ count: count() })
        .from(warehouseBuildings)
        .where(eq(warehouseBuildings.site_id, siteId));

      // Count zones (through building_id)
      let zonesTotal = 0;
      if (buildingIds.length > 0) {
        const [zonesCount] = await db.select({ count: count() })
          .from(warehouseZones)
          .where(inArray(warehouseZones.building_id, buildingIds));
        zonesTotal = Number(zonesCount?.count || 0);
      }

      // Count locations
      const [locationsCount] = await db.select({ count: count() })
        .from(warehouseLocations)
        .where(eq(warehouseLocations.site_id, siteId));

      // Count inventory items
      const [inventoryCount] = await db.select({ count: count() })
        .from(warehouseInventoryItems)
        .where(eq(warehouseInventoryItems.site_id, siteId));

      // Count optimization plans
      const [plansCount] = await db.select({ count: count() })
        .from(warehouseOptimizationPlans)
        .where(eq(warehouseOptimizationPlans.site_id, siteId));

      // Count optimization actions (through plan_id)
      let actionsTotal = 0;
      if (planIds.length > 0) {
        const [actionsCount] = await db.select({ count: count() })
          .from(warehouseOptimizationActions)
          .where(inArray(warehouseOptimizationActions.plan_id, planIds));
        actionsTotal = Number(actionsCount?.count || 0);
      }

      res.json({
        siteName: site.name,
        counts: {
          buildings: Number(buildingsCount?.count || 0),
          zones: zonesTotal,
          locations: Number(locationsCount?.count || 0),
          inventoryItems: Number(inventoryCount?.count || 0),
          optimizationPlans: Number(plansCount?.count || 0),
          optimizationActions: actionsTotal
        }
      });
    } catch (error) {
      console.error("[Warehouse] Failed to get deletion preview:", error);
      res.status(500).json({ error: "Failed to get deletion preview" });
    }
  });

  // DELETE /api/warehouse/sites/:siteId - Delete a warehouse site and all related data
router.delete("/warehouse/sites/:siteId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Get counts before deletion for response
      const buildings = await db.select({ id: warehouseBuildings.id })
        .from(warehouseBuildings)
        .where(eq(warehouseBuildings.site_id, siteId));
      const buildingIds = buildings.map(b => b.id);

      const plans = await db.select({ id: warehouseOptimizationPlans.id })
        .from(warehouseOptimizationPlans)
        .where(eq(warehouseOptimizationPlans.site_id, siteId));
      const planIds = plans.map(p => p.id);

      // Count items before deletion
      const [buildingsCount] = await db.select({ count: count() })
        .from(warehouseBuildings)
        .where(eq(warehouseBuildings.site_id, siteId));

      let zonesTotal = 0;
      if (buildingIds.length > 0) {
        const [zonesCount] = await db.select({ count: count() })
          .from(warehouseZones)
          .where(inArray(warehouseZones.building_id, buildingIds));
        zonesTotal = Number(zonesCount?.count || 0);
      }

      const [locationsCount] = await db.select({ count: count() })
        .from(warehouseLocations)
        .where(eq(warehouseLocations.site_id, siteId));

      const [inventoryCount] = await db.select({ count: count() })
        .from(warehouseInventoryItems)
        .where(eq(warehouseInventoryItems.site_id, siteId));

      const [plansCount] = await db.select({ count: count() })
        .from(warehouseOptimizationPlans)
        .where(eq(warehouseOptimizationPlans.site_id, siteId));

      let actionsTotal = 0;
      if (planIds.length > 0) {
        const [actionsCount] = await db.select({ count: count() })
          .from(warehouseOptimizationActions)
          .where(inArray(warehouseOptimizationActions.plan_id, planIds));
        actionsTotal = Number(actionsCount?.count || 0);
      }

      // Delete in correct order due to foreign key constraints:
      // 1. Delete related transfers first
      await db.delete(warehouseTransfers)
        .where(or(
          eq(warehouseTransfers.source_site_id, siteId),
          eq(warehouseTransfers.destination_site_id, siteId)
        ));

      // 2. Delete optimization actions (through plan_id)
      if (planIds.length > 0) {
        await db.delete(warehouseOptimizationActions)
          .where(inArray(warehouseOptimizationActions.plan_id, planIds));
        
        // Delete optimization events
        await db.delete(warehouseOptimizationEvents)
          .where(inArray(warehouseOptimizationEvents.plan_id, planIds));
      }

      // 3. Delete optimization plans
      await db.delete(warehouseOptimizationPlans)
        .where(eq(warehouseOptimizationPlans.site_id, siteId));

      // 4. Delete inventory items
      await db.delete(warehouseInventoryItems)
        .where(eq(warehouseInventoryItems.site_id, siteId));

      // 5. Delete locations
      await db.delete(warehouseLocations)
        .where(eq(warehouseLocations.site_id, siteId));

      // 6. Delete zones for all buildings in this site
      if (buildingIds.length > 0) {
        for (const buildingId of buildingIds) {
          await db.delete(warehouseZones)
            .where(eq(warehouseZones.building_id, buildingId));
        }
      }

      // 7. Delete buildings
      await db.delete(warehouseBuildings)
        .where(eq(warehouseBuildings.site_id, siteId));

      // 8. Delete the site itself
      await db.delete(warehouseSites)
        .where(eq(warehouseSites.id, siteId));

      res.json({ 
        success: true, 
        message: "Site and all related data deleted successfully",
        deletedCounts: {
          buildings: Number(buildingsCount?.count || 0),
          zones: zonesTotal,
          locations: Number(locationsCount?.count || 0),
          inventoryItems: Number(inventoryCount?.count || 0),
          optimizationPlans: Number(plansCount?.count || 0),
          optimizationActions: actionsTotal
        }
      });
    } catch (error) {
      console.error("[Warehouse] Failed to delete site:", error);
      res.status(500).json({ error: "Failed to delete warehouse site" });
    }
  });

  // GET /api/warehouse/sites/:siteId/buildings - Get buildings for a site with capacity info
router.get("/warehouse/sites/:siteId/buildings", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Fetch all buildings for this site
      const buildings = await db.select()
        .from(warehouseBuildings)
        .where(eq(warehouseBuildings.site_id, siteId))
        .orderBy(asc(warehouseBuildings.code));

      // For each building, calculate capacity from zones
      const buildingsWithCapacity = await Promise.all(
        buildings.map(async (building) => {
          // Get zones for this building
          const zones = await db.select()
            .from(warehouseZones)
            .where(eq(warehouseZones.building_id, building.id));

          // Calculate total pallet capacity from zones
          const totalPalletCapacity = zones.reduce((sum, zone) => {
            return sum + (zone.capacity_pallets || 0);
          }, 0);

          // Get count of inventory items in locations within this building
          const [inventoryCount] = await db.select({ count: count() })
            .from(warehouseLocations)
            .where(and(
              eq(warehouseLocations.building_id, building.id),
              eq(warehouseLocations.occupied, true)
            ));

          const occupiedCount = inventoryCount?.count || 0;
          const capacityPercent = totalPalletCapacity > 0 
            ? Math.round((Number(occupiedCount) / totalPalletCapacity) * 100) 
            : 0;

          // Format dimensions from meters
          const lengthM = building.length_m ? parseFloat(building.length_m as string) : null;
          const widthM = building.width_m ? parseFloat(building.width_m as string) : null;
          const heightM = building.height_m ? parseFloat(building.height_m as string) : null;

          let dimensions = "";
          if (lengthM && widthM && heightM) {
            // Convert meters to feet (1m = 3.28084ft)
            const lengthFt = Math.round(lengthM * 3.28084);
            const widthFt = Math.round(widthM * 3.28084);
            const heightFt = Math.round(heightM * 3.28084);
            dimensions = `${lengthFt}×${widthFt}×${heightFt} ft`;
          } else if (lengthM && widthM) {
            const lengthFt = Math.round(lengthM * 3.28084);
            const widthFt = Math.round(widthM * 3.28084);
            dimensions = `${lengthFt}×${widthFt} ft`;
          }

          return {
            id: building.id,
            code: building.code,
            name: building.name,
            dimensions,
            capacity_percent: capacityPercent,
            pallet_count: totalPalletCapacity,
            geometry_notes: building.geometry_notes,
            active: building.active
          };
        })
      );

      res.json(buildingsWithCapacity);
    } catch (error) {
      console.error("[Warehouse] Failed to fetch buildings:", error);
      res.status(500).json({ error: "Failed to fetch buildings" });
    }
  });

  // POST /api/warehouse/sites/:siteId/buildings - Create a new building
router.post("/warehouse/sites/:siteId/buildings", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const { code, name, length_ft, width_ft, height_ft, geometry_notes, capacity_pallets } = req.body;

      if (!code || !name) {
        return res.status(400).json({ error: "Building code and name are required" });
      }

      // Convert feet to meters for storage (1ft = 0.3048m)
      const length_m = length_ft ? (parseFloat(length_ft) * 0.3048).toFixed(3) : null;
      const width_m = width_ft ? (parseFloat(width_ft) * 0.3048).toFixed(3) : null;
      const height_m = height_ft ? (parseFloat(height_ft) * 0.3048).toFixed(3) : null;

      const [building] = await db.insert(warehouseBuildings).values({
        site_id: siteId,
        code: code.trim(),
        name: name.trim(),
        length_m,
        width_m,
        height_m,
        geometry_notes: geometry_notes || null,
        active: true,
      }).returning();

      // If capacity_pallets is provided, create a default zone for this building
      if (capacity_pallets && parseInt(capacity_pallets) > 0) {
        await db.insert(warehouseZones).values({
          site_id: siteId,
          building_id: building.id,
          code: `${code}-MAIN`,
          name: `${name} Main Storage`,
          zone_type: 'rack',
          is_outdoor: false,
          usage_type: 'general',
          weight_limit_lbs: 2000,
          capacity_pallets: parseInt(capacity_pallets),
        });
      }

      console.log(`[Warehouse] Created building ${code} for site ${siteId}`);
      res.status(201).json(building);
    } catch (error) {
      console.error("[Warehouse] Failed to create building:", error);
      res.status(500).json({ error: "Failed to create building" });
    }
  });

  // PUT /api/warehouse/sites/:siteId/buildings/:buildingId - Update a building
router.put("/warehouse/sites/:siteId/buildings/:buildingId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      const buildingId = parseInt(req.params.buildingId);
      if (isNaN(siteId) || isNaN(buildingId)) {
        return res.status(400).json({ error: "Invalid site or building ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Verify building exists and belongs to this site
      const [existingBuilding] = await db.select()
        .from(warehouseBuildings)
        .where(and(
          eq(warehouseBuildings.id, buildingId),
          eq(warehouseBuildings.site_id, siteId)
        ));

      if (!existingBuilding) {
        return res.status(404).json({ error: "Building not found" });
      }

      const { code, name, length_ft, width_ft, height_ft, geometry_notes, active, capacity_pallets } = req.body;

      // Convert feet to meters for storage
      const updateData: Record<string, any> = {};
      if (code !== undefined) updateData.code = code.trim();
      if (name !== undefined) updateData.name = name.trim();
      if (length_ft !== undefined) updateData.length_m = length_ft ? (parseFloat(length_ft) * 0.3048).toFixed(3) : null;
      if (width_ft !== undefined) updateData.width_m = width_ft ? (parseFloat(width_ft) * 0.3048).toFixed(3) : null;
      if (height_ft !== undefined) updateData.height_m = height_ft ? (parseFloat(height_ft) * 0.3048).toFixed(3) : null;
      if (geometry_notes !== undefined) updateData.geometry_notes = geometry_notes;
      if (active !== undefined) updateData.active = active;

      const [updated] = await db.update(warehouseBuildings)
        .set(updateData)
        .where(eq(warehouseBuildings.id, buildingId))
        .returning();

      // Update the default zone's capacity if capacity_pallets is provided
      if (capacity_pallets !== undefined) {
        const [existingZone] = await db.select()
          .from(warehouseZones)
          .where(eq(warehouseZones.building_id, buildingId))
          .limit(1);

        if (existingZone) {
          await db.update(warehouseZones)
            .set({ capacity_pallets: parseInt(capacity_pallets) || 0 })
            .where(eq(warehouseZones.id, existingZone.id));
        } else if (capacity_pallets && parseInt(capacity_pallets) > 0) {
          await db.insert(warehouseZones).values({
            site_id: siteId,
            building_id: buildingId,
            code: `${updated.code}-MAIN`,
            name: `${updated.name} Main Storage`,
            zone_type: 'rack',
            is_outdoor: false,
            usage_type: 'general',
            weight_limit_lbs: 2000,
            capacity_pallets: parseInt(capacity_pallets),
          });
        }
      }

      console.log(`[Warehouse] Updated building ${buildingId}`);
      res.json(updated);
    } catch (error) {
      console.error("[Warehouse] Failed to update building:", error);
      res.status(500).json({ error: "Failed to update building" });
    }
  });

  // DELETE /api/warehouse/sites/:siteId/buildings/:buildingId - Delete a building
router.delete("/warehouse/sites/:siteId/buildings/:buildingId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      const buildingId = parseInt(req.params.buildingId);
      if (isNaN(siteId) || isNaN(buildingId)) {
        return res.status(400).json({ error: "Invalid site or building ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Verify building exists and belongs to this site
      const [existingBuilding] = await db.select()
        .from(warehouseBuildings)
        .where(and(
          eq(warehouseBuildings.id, buildingId),
          eq(warehouseBuildings.site_id, siteId)
        ));

      if (!existingBuilding) {
        return res.status(404).json({ error: "Building not found" });
      }

      // Delete zones first (cascade)
      await db.delete(warehouseZones)
        .where(eq(warehouseZones.building_id, buildingId));

      // Delete the building
      await db.delete(warehouseBuildings)
        .where(eq(warehouseBuildings.id, buildingId));

      console.log(`[Warehouse] Deleted building ${buildingId} and its zones`);
      res.json({ success: true, message: "Building deleted successfully" });
    } catch (error) {
      console.error("[Warehouse] Failed to delete building:", error);
      res.status(500).json({ error: "Failed to delete building" });
    }
  });

  // ============================================================================
  // WAREHOUSE ZONES ROUTES
  // ============================================================================

  // GET /api/warehouse/sites/:siteId/zones - List zones for a site with optional filters
router.get("/warehouse/sites/:siteId/zones", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const { zone_type, usage_type, is_outdoor, min_capacity, max_capacity } = req.query;

      const conditions = [eq(warehouseZones.site_id, siteId)];

      if (zone_type && typeof zone_type === 'string') {
        conditions.push(eq(warehouseZones.zone_type, zone_type));
      }

      if (usage_type && typeof usage_type === 'string') {
        conditions.push(eq(warehouseZones.usage_type, usage_type));
      }

      if (is_outdoor !== undefined) {
        const isOutdoorBool = is_outdoor === 'true' || is_outdoor === '1';
        conditions.push(eq(warehouseZones.is_outdoor, isOutdoorBool));
      }

      if (min_capacity) {
        const minCap = parseInt(min_capacity as string);
        if (!isNaN(minCap)) {
          conditions.push(gte(warehouseZones.total_capacity, minCap));
        }
      }

      if (max_capacity) {
        const maxCap = parseInt(max_capacity as string);
        if (!isNaN(maxCap)) {
          conditions.push(lte(warehouseZones.total_capacity, maxCap));
        }
      }

      const zones = await db.select()
        .from(warehouseZones)
        .where(and(...conditions));

      res.json(zones);
    } catch (error) {
      console.error("[Warehouse] Failed to fetch zones:", error);
      res.status(500).json({ error: "Failed to fetch zones" });
    }
  });

  // POST /api/warehouse/sites/:siteId/zones - Create a new zone
router.post("/warehouse/sites/:siteId/zones", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const { 
        code, 
        name, 
        building_id,
        zone_type,
        is_outdoor,
        usage_type,
        bulk_available,
        bulk_open,
        rack_available,
        rack_open,
        location_pattern,
        weight_limit_lbs,
        capacity_pallets
      } = req.body;

      if (!code || !name) {
        return res.status(400).json({ error: "Zone code and name are required" });
      }

      const [zone] = await db.insert(warehouseZones).values({
        site_id: siteId,
        building_id: building_id || null,
        code: code.trim(),
        name: name.trim(),
        zone_type: zone_type || 'rack',
        is_outdoor: is_outdoor || false,
        usage_type: usage_type || 'general',
        bulk_available: bulk_available || 0,
        bulk_open: bulk_open || 0,
        rack_available: rack_available || 0,
        rack_open: rack_open || 0,
        location_pattern: location_pattern || null,
        weight_limit_lbs: weight_limit_lbs || 2000,
        capacity_pallets: capacity_pallets || null,
        metadata: {},
      }).returning();

      console.log(`[Warehouse] Created zone ${code} for site ${siteId}`);
      res.status(201).json(zone);
    } catch (error) {
      console.error("[Warehouse] Failed to create zone:", error);
      res.status(500).json({ error: "Failed to create zone" });
    }
  });

  // POST /api/warehouse/sites/:siteId/zones/seed - Seed default zones for the site
router.post("/warehouse/sites/:siteId/zones/seed", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const existingZones = await db.select()
        .from(warehouseZones)
        .where(eq(warehouseZones.site_id, siteId));

      if (existingZones.length > 0) {
        return res.status(400).json({ 
          error: "Site already has zones defined",
          existingZoneCount: existingZones.length
        });
      }

      const { zoneMatchingService } = await import('../services');
      const zonePatterns = zoneMatchingService.createDefaultZonePatterns();

      const zonesData = zonePatterns.map(pattern => ({
        site_id: siteId,
        building_id: null,
        code: pattern.code,
        name: pattern.name,
        zone_type: pattern.is_outdoor ? 'outdoor' : 'indoor',
        is_outdoor: pattern.is_outdoor,
        usage_type: pattern.usage_type,
        bulk_available: pattern.is_outdoor ? 50 : 0,
        bulk_open: pattern.is_outdoor ? 50 : 0,
        rack_available: pattern.is_outdoor ? 0 : 100,
        rack_open: pattern.is_outdoor ? 0 : 100,
        location_pattern: pattern.location_pattern,
        weight_limit_lbs: 2000,
        capacity_pallets: pattern.is_outdoor ? 50 : 100,
        metadata: {},
      }));

      const insertedZones = await db.insert(warehouseZones).values(zonesData).returning();

      // After inserting zones, resync capacity using pallet position service
      const { palletPositionService } = await import('../services');
      const updateResult = await palletPositionService.updateZoneMetrics(siteId);
      palletPositionService.invalidateMetricsCache(siteId);

      console.log(`[Warehouse] Seeded ${insertedZones.length} zones for site ${siteId}, resync: ${updateResult.zonesUpdated} zones updated`);
      res.status(201).json({
        success: true,
        message: `Created ${insertedZones.length} default zones`,
        zones: insertedZones,
        resync: updateResult
      });
    } catch (error) {
      console.error("[Warehouse] Failed to seed zones:", error);
      res.status(500).json({ error: "Failed to seed zones" });
    }
  });

  // DELETE /api/warehouse/sites/:siteId/zones/:zoneId - Delete a zone
router.delete("/warehouse/sites/:siteId/zones/:zoneId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      const zoneId = parseInt(req.params.zoneId);
      if (isNaN(siteId) || isNaN(zoneId)) {
        return res.status(400).json({ error: "Invalid site or zone ID" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const [existingZone] = await db.select()
        .from(warehouseZones)
        .where(and(
          eq(warehouseZones.id, zoneId),
          eq(warehouseZones.site_id, siteId)
        ));

      if (!existingZone) {
        return res.status(404).json({ error: "Zone not found" });
      }

      await db.delete(warehouseZones)
        .where(eq(warehouseZones.id, zoneId));

      console.log(`[Warehouse] Deleted zone ${zoneId}`);
      res.json({ success: true, message: "Zone deleted successfully" });
    } catch (error) {
      console.error("[Warehouse] Failed to delete zone:", error);
      res.status(500).json({ error: "Failed to delete zone" });
    }
  });

  // POST /api/warehouse/sites/:siteId/zones/resync - Trigger resync for all zones at site
router.post("/warehouse/sites/:siteId/zones/resync", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const { palletPositionService, zoneCapacityService } = await import('../services');
      
      const config = {
        countBoxAsSeparate: req.body.countBoxAsSeparate || false,
        whseRule: req.body.whseRule || 'ignore',
        bulkMode: req.body.bulkMode || 'estimate',
        bulkIdColumnName: req.body.bulkIdColumnName || null
      };

      const metrics = await palletPositionService.computePalletMetrics(siteId, config);
      const updateResult = await palletPositionService.updateZoneMetrics(siteId, config);
      palletPositionService.invalidateMetricsCache(siteId);

      const zones = await db.select()
        .from(warehouseZones)
        .where(eq(warehouseZones.site_id, siteId));

      for (const zone of zones) {
        const zoneMetric = metrics.zones.find(z => z.zoneId === zone.id);
        if (zoneMetric) {
          await zoneCapacityService.recordCapacityHistory(zone.id, siteId, {
            itemCount: zoneMetric.rack.occupied + zoneMetric.bulk.occupied,
            totalWeightLbs: parseFloat(String(zone.current_weight_lbs) || "0"),
            totalCapacity: zoneMetric.rack.available + zoneMetric.bulk.available
          });
        }
      }

      console.log(`[Warehouse] Resynced zones for site ${siteId}: ${updateResult.zonesUpdated} zones updated`);
      res.json({
        success: updateResult.success,
        zonesUpdated: updateResult.zonesUpdated,
        metrics,
        errors: updateResult.errors
      });
    } catch (error) {
      console.error("[Warehouse] Failed to resync zones:", error);
      res.status(500).json({ error: "Failed to resync zones" });
    }
  });

  // GET /api/warehouse/sites/:siteId/zones/pallet-metrics - Get pallet position metrics (PDF-style)
router.get("/warehouse/sites/:siteId/zones/pallet-metrics", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const { palletPositionService } = await import('../services');
      
      const forceRefresh = req.query.refresh === 'true';
      const config = {
        countBoxAsSeparate: req.query.countBoxAsSeparate === 'true',
        whseRule: (req.query.whseRule as any) || 'ignore',
        bulkMode: (req.query.bulkMode as any) || 'estimate',
        bulkIdColumnName: (req.query.bulkIdColumnName as string) || null
      };

      const metrics = await palletPositionService.getCachedPalletMetrics(siteId, config, forceRefresh);
      res.json(metrics);
    } catch (error) {
      console.error("[Warehouse] Failed to get pallet metrics:", error);
      res.status(500).json({ error: "Failed to get pallet metrics" });
    }
  });

  // GET /api/warehouse/sites/:siteId/zones/summary - Return capacity summary
router.get("/warehouse/sites/:siteId/zones/summary", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const { zoneCapacityService } = await import('../services');
      const summary = await zoneCapacityService.getZoneCapacitySummary(siteId);

      // Return empty summary instead of 404 for sites without zones
      if (!summary) {
        return res.json({
          site_id: siteId,
          zones: [],
          totals: {
            total_zones: 0,
            total_capacity: 0,
            total_used: 0,
            utilization_percent: 0
          }
        });
      }

      res.json(summary);
    } catch (error) {
      console.error("[Warehouse] Failed to get zones summary:", error);
      res.status(500).json({ error: "Failed to get zones summary" });
    }
  });

  // GET /api/warehouse/zones/:zoneId/history - Get capacity history for a zone
router.get("/warehouse/zones/:zoneId/history", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const zoneId = parseInt(req.params.zoneId);
      if (isNaN(zoneId)) {
        return res.status(400).json({ error: "Invalid zone ID" });
      }

      const [zone] = await db.select()
        .from(warehouseZones)
        .where(eq(warehouseZones.id, zoneId));

      if (!zone) {
        return res.status(404).json({ error: "Zone not found" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, zone.site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied to this zone" });
      }

      const { start_date, end_date } = req.query;
      const startDate = start_date ? new Date(start_date as string) : undefined;
      const endDate = end_date ? new Date(end_date as string) : undefined;

      const { zoneCapacityService } = await import('../services');
      const history = await zoneCapacityService.getZoneCapacityHistory(zoneId, startDate, endDate);

      res.json(history);
    } catch (error) {
      console.error("[Warehouse] Failed to get zone history:", error);
      res.status(500).json({ error: "Failed to get zone history" });
    }
  });

  // PATCH /api/warehouse/zones/:zoneId/capacity - Update rack_available and bulk_available
router.patch("/warehouse/zones/:zoneId/capacity", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const zoneId = parseInt(req.params.zoneId);
      if (isNaN(zoneId)) {
        return res.status(400).json({ error: "Invalid zone ID" });
      }

      const { rack_available, bulk_available } = req.body;
      if (rack_available === undefined || typeof rack_available !== 'number') {
        return res.status(400).json({ error: "rack_available must be a number" });
      }
      if (bulk_available === undefined || typeof bulk_available !== 'number') {
        return res.status(400).json({ error: "bulk_available must be a number" });
      }

      const [zone] = await db.select()
        .from(warehouseZones)
        .where(eq(warehouseZones.id, zoneId));

      if (!zone) {
        return res.status(404).json({ error: "Zone not found" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, zone.site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied to this zone" });
      }

      const [updated] = await db.update(warehouseZones)
        .set({ rack_available, bulk_available })
        .where(eq(warehouseZones.id, zoneId))
        .returning();

      console.log(`[Warehouse] Updated zone ${zoneId} capacity: rack_available=${rack_available}, bulk_available=${bulk_available}`);
      res.json(updated);
    } catch (error) {
      console.error("[Warehouse] Failed to update zone capacity:", error);
      res.status(500).json({ error: "Failed to update zone capacity" });
    }
  });

  // GET /api/warehouse/sites/:siteId/inventory - Get inventory items for a site with pagination
router.get("/warehouse/sites/:siteId/inventory", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Parse pagination params with validation
      const page = validatePaginationParam(req.query.page, 1, 10000, 1);
      const pageSize = validatePaginationParam(req.query.pageSize, 1, 100, 25);
      // Validate sortBy against whitelist to prevent SQL injection via column name
      const sortBy = validateSortColumn((req.query.sortBy as string) || "id");
      const sortOrder = (req.query.sortOrder as string) === "desc" ? "desc" : "asc";
      const searchTermsJson = req.query.searchTerms as string;
      const filtersJson = req.query.filters as string;

      // Parse and sanitize search terms array (supports multiple LIKE queries)
      let searchTerms: string[] = [];
      if (searchTermsJson) {
        try {
          const parsed = JSON.parse(searchTermsJson);
          if (Array.isArray(parsed)) {
            // Sanitize each search term to prevent injection
            searchTerms = parsed
              .filter(t => typeof t === 'string' && t.trim())
              .map(t => sanitizeSearchTerm(t.trim(), 200))
              .filter(t => t.length > 0);
          }
        } catch (e) {
          console.warn("[Warehouse] Invalid searchTerms JSON:", e);
        }
      }
      const filterLogic = (req.query.filterLogic as string) === "or" ? "or" : "and";

      // Parse and validate filters if provided
      const ALLOWED_FILTER_FIELDS = [
        'requisition_no', 'nsn', 'niin', 'fsc', 'description', 'quantity',
        'condition', 'mission_id', 'serial_no', 'lin_esd', 'unit_price', 'weight_lbs'
      ];
      const ALLOWED_OPERATORS = [
        'contains', 'equals', 'not_equals', 'greater_than', 'less_than', 'is_empty', 'is_not_empty'
      ];
      
      let filterConditions: Array<{field: string; operator: string; value: string}> = [];
      if (filtersJson) {
        try {
          const parsed = JSON.parse(filtersJson);
          if (Array.isArray(parsed)) {
            filterConditions = parsed.filter(f => 
              f && typeof f === 'object' &&
              ALLOWED_FILTER_FIELDS.includes(f.field) &&
              ALLOWED_OPERATORS.includes(f.operator)
            );
          }
        } catch (e) {
          console.warn("[Warehouse] Invalid filters JSON:", e);
        }
      }

      // Parse zone_id filter for zone-specific inventory queries
      const zoneIdParam = req.query.zone_id as string;
      const zoneId = zoneIdParam ? parseInt(zoneIdParam) : null;

      // Build where conditions
      const baseCondition = eq(warehouseInventoryItems.site_id, siteId);
      const whereConditions: any[] = [baseCondition];

      // Add zone filter if provided - use location pattern matching
      if (zoneId !== null && !isNaN(zoneId)) {
        const [zone] = await db.select()
          .from(warehouseZones)
          .where(eq(warehouseZones.id, zoneId));
        
        if (zone && zone.location_pattern) {
          whereConditions.push(
            sql`${warehouseInventoryItems.location} ~ ${zone.location_pattern}`
          );
        } else if (zone) {
          const zoneCode = zone.code;
          if (/^\d{4}$/.test(zoneCode)) {
            const prefix = zoneCode.charAt(0);
            whereConditions.push(
              sql`${warehouseInventoryItems.location} ~ ${`^${prefix}\\d{3}`}`
            );
          } else {
            whereConditions.push(eq(warehouseInventoryItems.zone_id, zoneId));
          }
        }
      }

      // Add search conditions - each term must match at least one searchable field
      // Multiple terms are AND'ed together (all must match)
      for (const term of searchTerms) {
        const searchPattern = `%${term.toLowerCase()}%`;
        whereConditions.push(
          or(
            ilike(warehouseInventoryItems.requisition_no, searchPattern),
            ilike(warehouseInventoryItems.description, searchPattern),
            ilike(warehouseInventoryItems.nsn, searchPattern),
            ilike(warehouseInventoryItems.niin, searchPattern),
            ilike(warehouseInventoryItems.serial_no, searchPattern),
            ilike(warehouseInventoryItems.location, searchPattern),
            ilike(warehouseInventoryItems.cage, searchPattern),
            ilike(warehouseInventoryItems.manufacturer, searchPattern)
          )
        );
      }

      // Build filter conditions - values are sanitized and parameterized via Drizzle ORM
      const buildFilterCondition = (filter: {field: string; operator: string; value: string}) => {
        // Field is already validated against ALLOWED_FILTER_FIELDS whitelist
        const col = (warehouseInventoryItems as any)[filter.field];
        if (!col) return null;
        
        // Sanitize filter value to prevent injection attacks
        const sanitizedValue = sanitizeSearchTerm(filter.value, 500);

        switch (filter.operator) {
          case "contains":
            return ilike(col, `%${sanitizedValue}%`);
          case "equals":
            return eq(col, sanitizedValue);
          case "not_equals":
            return sql`${col} != ${sanitizedValue}`;
          case "greater_than":
            return gt(col, parseFloat(sanitizedValue) || 0);
          case "less_than":
            return lt(col, parseFloat(sanitizedValue) || 0);
          case "is_empty":
            return or(isNull(col), eq(col, ""));
          case "is_not_empty":
            return and(isNotNull(col), sql`${col} != ''`);
          default:
            return null;
        }
      };

      if (filterConditions.length > 0) {
        const builtFilters = filterConditions
          .map(buildFilterCondition)
          .filter((c): c is NonNullable<typeof c> => c !== null);

        if (builtFilters.length > 0) {
          if (filterLogic === "or") {
            whereConditions.push(or(...builtFilters));
          } else {
            whereConditions.push(...builtFilters);
          }
        }
      }

      const finalWhere = and(...whereConditions);

      // Get total count for pagination
      const [countResult] = await db.select({ count: count() })
        .from(warehouseInventoryItems)
        .where(finalWhere);
      const totalCount = countResult?.count || 0;
      const totalPages = Math.ceil(totalCount / pageSize);

      // Build sort order
      const sortColumn = (warehouseInventoryItems as any)[sortBy] || warehouseInventoryItems.id;
      const orderByClause = sortOrder === "desc" ? desc(sortColumn) : asc(sortColumn);

      // Fetch paginated items
      const offset = (page - 1) * pageSize;
      const items = await db.select()
        .from(warehouseInventoryItems)
        .where(finalWhere)
        .orderBy(orderByClause)
        .limit(pageSize)
        .offset(offset);

      // Transform items to include dimensions from raw_row
      const transformedItems = items.map(item => {
        const rawRow = item.raw_row as Record<string, any> | null;
        const dims = rawRow?.dimensions || {};
        return {
          ...item,
          length_in: dims.l?.toString() || rawRow?.length?.toString() || null,
          width_in: dims.w?.toString() || rawRow?.width?.toString() || null,
          height_in: dims.h?.toString() || rawRow?.height?.toString() || null,
          weight_lb: rawRow?.price_weight?.toString() || null,
          nsn: item.nsn || null,
          fsc: item.fsc || null,
          niin: item.niin || null,
        };
      });

      res.json({
        items: transformedItems,
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages,
        }
      });
    } catch (error) {
      console.error("[Warehouse] Failed to fetch inventory:", error);
      res.status(500).json({ error: "Failed to fetch inventory items" });
    }
  });

  // POST /api/warehouse/sites/:siteId/inventory - Add a single inventory item
router.post("/warehouse/sites/:siteId/inventory", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const { requisition_no, description, quantity, length_in, width_in, height_in, unit_price, nsn, fsc, niin } = req.body;
      
      if (!requisition_no) {
        return res.status(400).json({ error: "requisition_no is required" });
      }

      const [item] = await db.insert(warehouseInventoryItems).values({
        site_id: siteId,
        requisition_no,
        description: description || `Item ${requisition_no}`,
        quantity: quantity || 1,
        unit_price: unit_price ? unit_price.toString() : null,
        nsn: nsn || null,
        fsc: fsc || null,
        niin: niin || null,
        raw_row: {
          dimensions: {
            l: length_in || null,
            w: width_in || null,
            h: height_in || null,
          },
        },
      }).returning();

      res.status(201).json(item);
    } catch (error) {
      console.error("[Warehouse] Failed to add inventory item:", error);
      res.status(500).json({ error: "Failed to add inventory item" });
    }
  });

  // DELETE /api/warehouse/sites/:siteId/inventory/all - Delete all inventory items for a site
router.delete("/warehouse/sites/:siteId/inventory/all", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Count items before deletion
      const [countResult] = await db.select({ count: count() })
        .from(warehouseInventoryItems)
        .where(eq(warehouseInventoryItems.site_id, siteId));

      const itemCount = countResult?.count || 0;

      // Delete all items for the site
      await db.delete(warehouseInventoryItems)
        .where(eq(warehouseInventoryItems.site_id, siteId));

      res.json({ 
        success: true, 
        message: `All inventory items deleted successfully`,
        deleted: itemCount
      });
    } catch (error) {
      console.error("[Warehouse] Failed to delete all inventory items:", error);
      res.status(500).json({ error: "Failed to delete all inventory items" });
    }
  });

  // DELETE /api/warehouse/sites/:siteId/inventory/:itemId - Delete an inventory item
router.delete("/warehouse/sites/:siteId/inventory/:itemId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      const itemId = parseInt(req.params.itemId);
      
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }
      if (isNaN(itemId)) {
        return res.status(400).json({ error: "Invalid item ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Verify item exists and belongs to the site
      const [item] = await db.select()
        .from(warehouseInventoryItems)
        .where(and(
          eq(warehouseInventoryItems.id, itemId),
          eq(warehouseInventoryItems.site_id, siteId)
        ));

      if (!item) {
        return res.status(404).json({ error: "Inventory item not found" });
      }

      // Delete the item - include both conditions for defense-in-depth
      await db.delete(warehouseInventoryItems)
        .where(and(
          eq(warehouseInventoryItems.id, itemId),
          eq(warehouseInventoryItems.site_id, siteId)
        ));

      res.json({ success: true, message: "Item deleted successfully" });
    } catch (error) {
      console.error("[Warehouse] Failed to delete inventory item:", error);
      res.status(500).json({ error: "Failed to delete inventory item" });
    }
  });

  // PUT /api/warehouse/sites/:siteId/inventory/:itemId/move - Move an inventory item to a new location
router.put("/warehouse/sites/:siteId/inventory/:itemId/move", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      const itemId = parseInt(req.params.itemId);
      
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }
      if (isNaN(itemId)) {
        return res.status(400).json({ error: "Invalid item ID" });
      }

      const { destination_site_id, destination_location_id, notes } = req.body;

      // Verify user owns the source site
      const [sourceSite] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!sourceSite) {
        return res.status(404).json({ error: "Source warehouse site not found" });
      }

      // If cross-site move, verify user owns the destination site
      if (destination_site_id && destination_site_id !== siteId) {
        const [destSite] = await db.select()
          .from(warehouseSites)
          .where(and(
            eq(warehouseSites.id, destination_site_id),
            eq(warehouseSites.user_id, req.user!.id)
          ));

        if (!destSite) {
          return res.status(404).json({ error: "Destination warehouse site not found" });
        }
      }

      // Verify item exists and belongs to the source site
      const [item] = await db.select()
        .from(warehouseInventoryItems)
        .where(and(
          eq(warehouseInventoryItems.id, itemId),
          eq(warehouseInventoryItems.site_id, siteId)
        ));

      if (!item) {
        return res.status(404).json({ error: "Inventory item not found" });
      }

      // Build update object
      const updateData: Record<string, any> = {
        updated_at: new Date(),
      };

      // Handle cross-site move
      if (destination_site_id && destination_site_id !== siteId) {
        updateData.site_id = destination_site_id;
        updateData.location_id = destination_location_id || null;
      } else if (destination_location_id !== undefined) {
        // Intra-site location change
        updateData.location_id = destination_location_id || null;
      }

      // Add notes to remarks if provided
      if (notes) {
        const existingRemarks = item.remarks || '';
        const timestamp = new Date().toISOString();
        const moveNote = `[Move ${timestamp}] ${notes}`;
        updateData.remarks = existingRemarks ? `${existingRemarks}\n${moveNote}` : moveNote;
      }

      // Update the item
      const [updatedItem] = await db.update(warehouseInventoryItems)
        .set(updateData)
        .where(eq(warehouseInventoryItems.id, itemId))
        .returning();

      res.json({ 
        success: true, 
        message: "Item moved successfully",
        item: updatedItem
      });
    } catch (error) {
      console.error("[Warehouse] Failed to move inventory item:", error);
      res.status(500).json({ error: "Failed to move inventory item" });
    }
  });

  // PUT /api/warehouse/sites/:siteId/inventory/bulk-move-zone - Move multiple items to a different zone
router.put("/warehouse/sites/:siteId/inventory/bulk-move-zone", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const { item_ids, target_zone_id, notes } = req.body;

      if (!Array.isArray(item_ids) || item_ids.length === 0) {
        return res.status(400).json({ error: "item_ids must be a non-empty array" });
      }

      if (target_zone_id === undefined) {
        return res.status(400).json({ error: "target_zone_id is required" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Verify target zone exists and belongs to this site (if not null)
      if (target_zone_id !== null) {
        const [zone] = await db.select()
          .from(warehouseZones)
          .where(and(
            eq(warehouseZones.id, target_zone_id),
            eq(warehouseZones.site_id, siteId)
          ));

        if (!zone) {
          return res.status(404).json({ error: "Target zone not found" });
        }
      }

      // Get items and their current zones for tracking
      const items = await db.select()
        .from(warehouseInventoryItems)
        .where(and(
          inArray(warehouseInventoryItems.id, item_ids),
          eq(warehouseInventoryItems.site_id, siteId)
        ));

      if (items.length === 0) {
        return res.status(404).json({ error: "No valid items found" });
      }

      const affectedZones = new Set<number | null>();
      items.forEach(item => {
        affectedZones.add(item.zone_id);
      });
      affectedZones.add(target_zone_id);

      // Build update data
      const updateData: Record<string, any> = {
        zone_id: target_zone_id,
        updated_at: new Date(),
      };

      // Add notes to remarks if provided
      if (notes) {
        const timestamp = new Date().toISOString();
        const moveNote = `[Zone Move ${timestamp}] ${notes}`;
        // Note: We can't easily append to remarks in a bulk update, so just update zone_id
      }

      // Update all items
      await db.update(warehouseInventoryItems)
        .set(updateData)
        .where(and(
          inArray(warehouseInventoryItems.id, item_ids),
          eq(warehouseInventoryItems.site_id, siteId)
        ));

      // Resync zone capacities for affected zones
      try {
        const { palletPositionService } = await import('../services');
        const config = {
          countBoxAsSeparate: false,
          whseRule: 'ignore' as const,
          bulkMode: 'estimate' as const,
          bulkIdColumnName: null
        };
        await palletPositionService.updateZoneMetrics(siteId, config);
        palletPositionService.invalidateMetricsCache(siteId);
      } catch (syncError) {
        console.error(`[Bulk Zone Move] Failed to resync zones:`, syncError);
      }

      res.json({
        success: true,
        message: `Successfully moved ${items.length} item(s) to target zone`,
        itemsMoved: items.length,
        totalRequested: item_ids.length
      });
    } catch (error) {
      console.error("[Warehouse] Failed to bulk move items to zone:", error);
      res.status(500).json({ error: "Failed to move items to zone" });
    }
  });

  // POST /api/warehouse/sites/:siteId/inventory/upload - Upload and parse CSV inventory data
router.post("/warehouse/sites/:siteId/inventory/upload", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const { csvContent } = req.body;
      if (!csvContent || typeof csvContent !== 'string') {
        return res.status(400).json({ error: "csvContent field is required and must be a string" });
      }

      // Parse CSV
      const lines = csvContent.trim().split('\n');
      if (lines.length < 2) {
        return res.status(400).json({ error: "CSV must have a header row and at least one data row" });
      }

      const headerLine = lines[0].trim();
      const headers = headerLine.split(',').map(h => h.trim().toLowerCase());

      // Map expected columns: o, l, h, w, p, q
      const colIndices = {
        o: headers.indexOf('o'),
        l: headers.indexOf('l'),
        h: headers.indexOf('h'),
        w: headers.indexOf('w'),
        p: headers.indexOf('p'),
        q: headers.indexOf('q'),
      };

      if (colIndices.o === -1) {
        return res.status(400).json({ error: "CSV must contain 'o' column (item_id/requisition_no)" });
      }

      const parsedItems: Array<{
        site_id: number;
        requisition_no: string;
        description: string;
        quantity: number;
        unit_price: string | null;
        raw_row: Record<string, any>;
      }> = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = line.split(',').map(v => v.trim());

        const o = colIndices.o !== -1 ? values[colIndices.o] : '';
        const l = colIndices.l !== -1 ? parseFloat(values[colIndices.l]) || 0 : 0;
        const h = colIndices.h !== -1 ? parseFloat(values[colIndices.h]) || 0 : 0;
        const w = colIndices.w !== -1 ? parseFloat(values[colIndices.w]) || 0 : 0;
        const p = colIndices.p !== -1 ? parseFloat(values[colIndices.p]) || 0 : 0;
        const q = colIndices.q !== -1 ? parseInt(values[colIndices.q]) || 0 : 0;

        if (!o) continue;

        parsedItems.push({
          site_id: siteId,
          requisition_no: o,
          description: `Item ${o}`,
          quantity: q,
          unit_price: p.toString(),
          raw_row: {
            original_id: o,
            length: l,
            height: h,
            width: w,
            price_weight: p,
            quantity: q,
            dimensions: { l, w, h }
          }
        });
      }

      if (parsedItems.length === 0) {
        return res.status(400).json({ error: "No valid items found in CSV" });
      }

      // Insert items
      const insertedItems = await db.insert(warehouseInventoryItems)
        .values(parsedItems)
        .returning();

      res.status(201).json({
        message: `Successfully imported ${insertedItems.length} items`,
        count: insertedItems.length,
        items: insertedItems
      });
    } catch (error) {
      console.error("[Warehouse] Failed to upload inventory:", error);
      res.status(500).json({ error: "Failed to upload inventory data" });
    }
  });


  // POST /api/warehouse/sites/:siteId/inventory/import - Upload and parse CSV/PDF file
router.post("/warehouse/sites/:siteId/inventory/import", authMiddleware, upload.single('file'), async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      if (!req.file) {
        return res.status(400).json({ 
          error: "No file uploaded",
          errors: [{
            level: 'error',
            scope: 'file',
            target: 'upload',
            message: 'No file was uploaded. Please select a CSV or PDF file.'
          }]
        });
      }

      console.log(`[Warehouse Import] Processing file: ${req.file.originalname}, size: ${req.file.size}, mimetype: ${req.file.mimetype}`);

      const result = await parseFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        siteId,
        req.user!.id
      );

      console.log(`[Warehouse Import] Parse result: uploadId=${result.uploadId}, rows=${result.totalRows}, errors=${result.errors.length}, warnings=${result.warnings.length}, canCommit=${result.canCommit}`);

      res.json(result);
    } catch (error) {
      console.error("[Warehouse] Import failed:", error);
      
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ 
            error: "File too large. Maximum size is 10MB.",
            errors: [{
              level: 'error',
              scope: 'file',
              target: 'size',
              message: 'File exceeds the 10MB size limit.'
            }]
          });
        }
        return res.status(400).json({ 
          error: error.message,
          errors: [{
            level: 'error',
            scope: 'file',
            target: 'upload',
            message: error.message
          }]
        });
      }
      
      res.status(500).json({ 
        error: "Failed to import inventory file",
        errors: [{
          level: 'error',
          scope: 'file',
          target: 'processing',
          message: error instanceof Error ? error.message : 'Unknown error occurred'
        }]
      });
    }
  });

  // POST /api/warehouse/sites/:siteId/inventory/import/commit - Commit validated data to database
router.post("/warehouse/sites/:siteId/inventory/import/commit", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const { uploadId } = req.body;
      if (!uploadId || typeof uploadId !== 'string') {
        return res.status(400).json({ error: "uploadId is required" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Get the upload session
      const session = getUploadSession(uploadId);
      if (!session) {
        return res.status(404).json({ 
          error: "Upload session not found or expired",
          message: "Please upload the file again."
        });
      }

      // Verify session belongs to this user and site
      if (session.userId !== req.user!.id || session.siteId !== siteId) {
        return res.status(403).json({ error: "Session does not belong to this user or site" });
      }

      // Check if data can be committed
      if (!session.canCommit) {
        return res.status(400).json({ 
          error: "Cannot commit data with errors",
          errors: session.errors.filter(e => e.scope === 'file' || e.scope === 'column'),
          message: "Please fix the file-level and column-level errors before committing."
        });
      }

      // Filter out rows with errors
      const rowsWithErrors = new Set(
        session.errors.filter(e => e.scope === 'row' && e.level === 'error').map(e => e.rowIndex)
      );
      
      const validRows = session.parsedRows.filter((_, index) => !rowsWithErrors.has(index));

      if (validRows.length === 0) {
        return res.status(400).json({ 
          error: "No valid rows to commit",
          message: "All rows have errors. Please fix the data and try again."
        });
      }

      console.log(`[Warehouse Import] Committing ${validRows.length} rows from session ${uploadId}`);

      // Fetch zones for this site to enable zone matching
      const siteZones = await db.select()
        .from(warehouseZones)
        .where(eq(warehouseZones.site_id, siteId));
      
      console.log(`[Warehouse Import] Found ${siteZones.length} zones for zone matching`);

      // Prepare items for insertion with all BATS fields
      const itemsToInsert = validRows.map((row, idx) => {
        // Determine zone_id: use pre-matched or calculate from location
        let zoneId = row.matched_zone_id || null;
        if (zoneId === null && row.location && siteZones.length > 0) {
          const matchResult = matchLocationToZone(row.location, siteZones);
          if (matchResult.zoneId !== null) {
            zoneId = matchResult.zoneId;
          }
        }
        
        return {
        site_id: siteId,
        storage_facility: row.storage_facility || null,
        ship: row.ship || null,
        ship_class: row.ship_class || null,
        program_code: row.program_code || null,
        requisition_no: row.requisition_no || `ITEM-${Date.now()}-${idx}`,
        authority: row.authority || null,
        work_item: row.work_item || null,
        li: row.li || null,
        matl_ctrl: row.matl_ctrl || null,
        hmic: row.hmic || null,
        smcc: row.smcc || null,
        item_audit: row.item_audit || null,
        audit_no: row.audit_no || null,
        ship_ind: row.ship_ind || null,
        ship_avail: row.ship_avail || null,
        description: row.description || `Item ${row.requisition_no || 'Unknown'}`,
        cage: row.cage || null,
        manufacturer: row.manufacturer || null,
        mfg_date: row.mfg_date || null,
        contract_no: row.contract_no || null,
        quantity: row.quantity || 1,
        iuid: row.iuid || null,
        unit: row.ui || null,
        unit_price: row.unit_price?.toString() || null,
        receipt_price: row.receipt_price || null,
        receipt_date: row.receipt_date || null,
        location: row.location || null,
        zone_id: zoneId,
        lot_no: row.lot || null,
        serial_no: row.serial_no || null,
        barcode: row.barcode || null,
        inventory_type: row.inventory_type || null,
        material_disposition: row.mat_disposition || null,
        condition_code: row.condition || null,
        condition: row.condition || null,
        asset_type: row.asset_type || null,
        exp_date: row.exp_date || null,
        ext_date: row.ext_date || null,
        insp_date: row.insp_date || null,
        last_audit_date: row.last_audit_date || null,
        data_user_id: row.user_id || null,
        remarks: row.remarks || null,
        in_service_date: row.in_service_date || null,
        warranty_item: row.warranty_item || null,
        nsn: row.nsn || null,
        fsc: row.fsc || null,
        niin: row.niin || null,
        mission_id: row.mission_id || null,
        lin_esd: row.lin_esd || null,
        last_moved: row.last_moved ? new Date(row.last_moved) : null,
        weight_lbs: row.weight_lb?.toString() || null,
        raw_row: {
          ...row._rawRow,
          imported_at: new Date().toISOString(),
          source_file: session.filename,
        },
      };
      });

      // Insert items in batches
      const BATCH_SIZE = 100;
      const insertedItems = [];
      
      for (let i = 0; i < itemsToInsert.length; i += BATCH_SIZE) {
        const batch = itemsToInsert.slice(i, i + BATCH_SIZE);
        const inserted = await db.insert(warehouseInventoryItems)
          .values(batch)
          .returning();
        insertedItems.push(...inserted);
      }

      // Clean up session after successful commit
      deleteUploadSession(uploadId);

      console.log(`[Warehouse Import] Successfully committed ${insertedItems.length} items from session ${uploadId}`);

      res.status(201).json({
        message: `Successfully imported ${insertedItems.length} items`,
        count: insertedItems.length,
        skippedRows: session.parsedRows.length - validRows.length,
        totalRows: session.parsedRows.length,
        items: insertedItems.slice(0, 10), // Return first 10 for preview
      });
    } catch (error) {
      console.error("[Warehouse] Commit failed:", error);
      res.status(500).json({ error: "Failed to commit inventory data" });
    }
  });

  // GET /api/warehouse/import/status - Get import session stats (for debugging)
router.get("/warehouse/import/status", authMiddleware, async (req: AuthRequest, res) => {
    const stats = getSessionStats();
    res.json(stats);
  });

  // GET /api/warehouse/sites/:siteId/optimization - Run optimization analysis
router.get("/warehouse/sites/:siteId/optimization", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Fetch inventory items for analysis
      const items = await db.select()
        .from(warehouseInventoryItems)
        .where(eq(warehouseInventoryItems.site_id, siteId));

      // Compute optimization metrics using algorithms from notebooks
      let totalQuantity = 0;
      let totalValue = 0;
      let itemCount = items.length;
      let totalVolume = 0;
      let itemsWithDimensions: Array<{ 
        requisition_no: string; 
        l: number; w: number; h: number;
        volume: number; 
        quantity: number;
        value: number;
      }> = [];

      for (const item of items) {
        const qty = item.quantity || 0;
        const price = parseFloat(item.unit_price?.toString() || "0");
        totalQuantity += qty;
        totalValue += qty * price;

        const rawRow = item.raw_row as Record<string, any>;
        const dims = rawRow?.dimensions || { l: 0, w: 0, h: 0 };
        const l = dims.l || rawRow?.length || 0;
        const w = dims.w || rawRow?.width || 0;
        const h = dims.h || rawRow?.height || 0;
        const volume = l * w * h;
        totalVolume += volume * qty;

        itemsWithDimensions.push({
          requisition_no: item.requisition_no || '',
          l, w, h,
          volume,
          quantity: qty,
          value: qty * price
        });
      }

      // CardStack algorithm: items that can be stacked (similar base dimensions)
      const stackableGroups: Map<string, typeof itemsWithDimensions> = new Map();
      for (const item of itemsWithDimensions) {
        const baseKey = `${Math.round(item.l)}_${Math.round(item.w)}`;
        if (!stackableGroups.has(baseKey)) {
          stackableGroups.set(baseKey, []);
        }
        stackableGroups.get(baseKey)!.push(item);
      }

      const stackingOpportunities = Array.from(stackableGroups.entries())
        .filter(([_, items]) => items.length > 1)
        .map(([key, groupItems]) => ({
          base_dimensions: key.replace('_', ' x '),
          item_count: groupItems.length,
          total_height: groupItems.reduce((sum, i) => sum + i.h * i.quantity, 0),
          items: groupItems.map(i => i.requisition_no).slice(0, 5)
        }))
        .sort((a, b) => b.item_count - a.item_count)
        .slice(0, 5);

      // Sort by volume (descending) for bin-packing recommendation
      itemsWithDimensions.sort((a, b) => b.volume - a.volume);

      // Size grouping: identify items of same dimensions for batch handling
      const sizeGroups: Map<string, number> = new Map();
      for (const item of itemsWithDimensions) {
        const sizeKey = `${item.l}x${item.w}x${item.h}`;
        sizeGroups.set(sizeKey, (sizeGroups.get(sizeKey) || 0) + item.quantity);
      }
      
      const topSizes = Array.from(sizeGroups.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([size, count]) => ({ size, count }));

      // Value-per-volume analysis for prioritization
      const valuePerVolume = itemsWithDimensions
        .filter(i => i.volume > 0)
        .map(i => ({
          requisition_no: i.requisition_no,
          value_density: i.value / (i.volume * i.quantity),
          value: i.value,
          volume: i.volume
        }))
        .sort((a, b) => b.value_density - a.value_density)
        .slice(0, 10);

      const recommendations = [
        {
          type: "cartonization",
          priority: "high",
          title: "Box Consolidation Opportunities",
          description: `Found ${stackingOpportunities.length} groups of items with similar base dimensions that can be stacked together`,
          details: stackingOpportunities
        },
        {
          type: "size_standardization",
          priority: "medium",
          title: "Size Standardization",
          description: `${topSizes.length} distinct item sizes identified. Consider standardizing packaging for top sizes.`,
          details: topSizes
        },
        {
          type: "high_volume_items",
          priority: "high",
          title: "Large Item Placement",
          description: "Items with largest volume should be placed at ground level for easier access and forklift handling",
          details: itemsWithDimensions.slice(0, 10).map(i => ({
            requisition_no: i.requisition_no,
            volume: i.volume.toFixed(2),
            quantity: i.quantity
          }))
        },
        {
          type: "value_density",
          priority: "medium",
          title: "High-Value Item Security",
          description: "Items with highest value per volume should be in secure/priority zones",
          details: valuePerVolume
        }
      ];

      // Add aging recommendations if items have receipt dates
      const agingAlerts = items.filter(item => {
        const rawRow = item.raw_row as Record<string, any>;
        if (rawRow?.receipt_date) {
          const receiptDate = new Date(rawRow.receipt_date);
          const yearsOld = (Date.now() - receiptDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
          return yearsOld >= 3;
        }
        return false;
      }).length;

      if (agingAlerts > 0) {
        recommendations.push({
          type: "aging",
          priority: "high",
          title: "Aging Inventory Alert",
          description: `${agingAlerts} items are 3+ years old. Review for disposal or rotation.`,
          details: []
        });
      }

      const optimization = {
        site_id: siteId,
        site_code: site.code,
        site_name: site.name,
        summary: {
          total_items: itemCount,
          total_quantity: totalQuantity,
          total_value: parseFloat(totalValue.toFixed(2)),
          total_volume: parseFloat(totalVolume.toFixed(2)),
          average_value_per_item: itemCount > 0 ? parseFloat((totalValue / itemCount).toFixed(2)) : 0,
          unique_sizes: sizeGroups.size,
          stacking_groups: stackingOpportunities.length
        },
        recommendations,
        bin_packing_order: itemsWithDimensions.slice(0, 20).map(v => v.requisition_no)
      };

      res.json(optimization);
    } catch (error) {
      console.error("[Warehouse] Optimization analysis failed:", error);
      res.status(500).json({ error: "Failed to run optimization analysis" });
    }
  });

  // POST /api/warehouse/sites/:siteId/optimize - Run optimization wizard with selected algorithm
router.post("/warehouse/sites/:siteId/optimize", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const { algorithm, params } = req.body;
      
      const validAlgorithms = ['cardstack', 'size_standardization', 'value_density', 'bin_packing', 'name_consolidation'];
      if (!algorithm || !validAlgorithms.includes(algorithm)) {
        return res.status(400).json({ error: "Invalid algorithm. Must be one of: " + validAlgorithms.join(", ") });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Fetch warehouse zones for zone-based organization (optional - graceful fallback if none exist)
      const zones = await db.select()
        .from(warehouseZones)
        .where(eq(warehouseZones.site_id, siteId));

      // Zone-based optimization is optional - if no zones exist, use legacy location-based approach
      const hasZones = zones.length > 0;

      // Fetch inventory items for analysis
      const items = await db.select()
        .from(warehouseInventoryItems)
        .where(eq(warehouseInventoryItems.site_id, siteId));

      // Parse item data from raw_row and database fields with optional zone matching
      const itemsWithData = items.map(item => {
        const rawRow = item.raw_row as Record<string, any> || {};
        const qty = item.quantity || parseInt(rawRow?.qty) || 1;
        const price = parseFloat(item.unit_price?.toString() || rawRow?.unit_price || "0");
        const value = qty * price;
        const weight = parseFloat(item.weight_lbs?.toString() || rawRow?.weight || "0");
        
        // Extract location info - location field in raw_row contains rack location like "2069-B"
        const location = rawRow?.location || item.location || 'Unassigned';
        // Extract zone prefix for legacy mode (e.g., "2069" from "2069-B")
        const locationZone = location.split('-')[0] || location.substring(0, 4) || 'UNK';
        
        // Use zone matching if zones exist, otherwise use legacy location parsing
        let matched_zone_id: number | null = null;
        let matched_zone_name: string | null = null;
        let matchedZone: typeof zones[0] | undefined = undefined;
        let zone_match_confidence = 0;
        
        if (hasZones) {
          const zoneMatch = matchLocationToZone(location, zones);
          matched_zone_id = zoneMatch.zoneId;
          matched_zone_name = zoneMatch.zoneName;
          matchedZone = zones.find(z => z.id === zoneMatch.zoneId);
          zone_match_confidence = zoneMatch.confidence;
        }
        
        return {
          id: item.id,
          requisition_no: item.requisition_no || `ITEM-${item.id}`,
          description: item.description || rawRow?.description || '',
          quantity: qty,
          value,
          weight,
          rack_location: location,
          location_zone: locationZone,
          matched_zone_id,
          matched_zone_name,
          matched_zone: matchedZone,
          zone_match_confidence,
          ship_class: item.ship_class || rawRow?.ship_class || '',
          inventory_type: item.inventory_type || rawRow?.inventory_type || '',
          condition_code: item.condition_code || item.condition || rawRow?.condition_code || 'A',
          storage_facility: item.storage_facility || rawRow?.storage_facility || '',
          mat_disposition: item.material_disposition || rawRow?.mat_disposition || rawRow?.material_disposition || '',
          program_code: item.program_code || rawRow?.program_code || '',
        };
      });

      // Extract zone constraints from params
      const zoneConstraints = params?.zoneConstraints || { sourceZoneIds: [], targetZoneIds: [], enableZoneFiltering: false };
      const { sourceZoneIds = [], targetZoneIds = [], enableZoneFiltering = false } = zoneConstraints;
      
      // Filter items by source zones if zone filtering is enabled
      let filteredItems = itemsWithData;
      if (enableZoneFiltering && sourceZoneIds.length > 0) {
        filteredItems = itemsWithData.filter(item => 
          item.matched_zone_id !== null && sourceZoneIds.includes(item.matched_zone_id)
        );
        console.log(`[Optimize] Zone filtering enabled: ${filteredItems.length} items from ${sourceZoneIds.length} source zones (was ${itemsWithData.length})`);
      }

      // Get target zones for placement (if specified, else use all zones)
      const allowedTargetZones = enableZoneFiltering && targetZoneIds.length > 0
        ? zones.filter(z => targetZoneIds.includes(z.id))
        : zones;
      console.log(`[Optimize] Target zones: ${allowedTargetZones.length} zones available`);

      let actions: Array<{
        id: string;
        action: string;
        item: string;
        itemDescription: string;
        from: string;
        to: string;
        targetZoneId: number | null;
        targetZoneName: string | null;
        priority: 'high' | 'medium' | 'low';
        estimatedBenefit: string;
        quantity: number;
        value: number;
        reason: string;
      }> = [];
      
      let summary = {
        slotsFreed: 0,
        consolidationWins: '',
        zonesOptimized: 0,
        pickEfficiencyGain: '',
        itemsAffected: 0,
        actionsGenerated: 0,
      };

      // Run algorithm-specific optimization
      if (algorithm === 'cardstack') {
        // CardStack: Find items for the same ship scattered across different zones
        // Consolidate them to reduce picking time and travel distance using actual zone data
        const { minItemsToConsolidate = 2, maxActionsToGenerate = 50 } = params || {};
        
        // Group items by ship_class (items for the same ship should be together)
        // Use filteredItems instead of itemsWithData for zone constraint support
        const shipGroups: Map<string, typeof filteredItems> = new Map();
        for (const item of filteredItems) {
          if (!item.ship_class) continue;
          if (!shipGroups.has(item.ship_class)) {
            shipGroups.set(item.ship_class, []);
          }
          shipGroups.get(item.ship_class)!.push(item);
        }

        let actionId = 1;
        let consolidatedItems = 0;
        let consolidatedValue = 0;
        const affectedZoneIds = new Set<number>();
        
        for (const [shipClass, shipItems] of Array.from(shipGroups.entries())) {
          // Skip if fewer items than threshold
          if (shipItems.length < minItemsToConsolidate) continue;
          
          // Find the most common zone for this ship's items using matched_zone_id
          // If target zones are specified, only consider those zones
          const zoneCounts: Map<number, number> = new Map();
          for (const item of shipItems) {
            if (item.matched_zone_id !== null) {
              // If target zones specified, only count items in those zones
              if (enableZoneFiltering && targetZoneIds.length > 0) {
                if (targetZoneIds.includes(item.matched_zone_id)) {
                  zoneCounts.set(item.matched_zone_id, (zoneCounts.get(item.matched_zone_id) || 0) + 1);
                }
              } else {
                zoneCounts.set(item.matched_zone_id, (zoneCounts.get(item.matched_zone_id) || 0) + 1);
              }
            }
          }
          
          // Find zone with most items (from allowed targets)
          let targetZoneId: number | null = null;
          let maxCount = 0;
          for (const [zoneId, count] of Array.from(zoneCounts.entries())) {
            if (count > maxCount) {
              maxCount = count;
              targetZoneId = zoneId;
            }
          }
          
          // If no target found from item counts but we have target zones, use first target zone
          if (targetZoneId === null && enableZoneFiltering && allowedTargetZones.length > 0) {
            targetZoneId = allowedTargetZones[0].id;
          }
          
          // Get the target zone object for naming (from allowed zones)
          const targetZone = allowedTargetZones.find(z => z.id === targetZoneId) || zones.find(z => z.id === targetZoneId);
          if (!targetZone) continue;
          
          // Create target location using actual zone code
          const targetRack = `${targetZone.code}-${shipClass.replace(/\s+/g, '')}`;
          
          // Move items from other zones to the target zone
          for (const item of shipItems) {
            if (item.matched_zone_id === targetZoneId) continue; // Already in target zone
            
            if (item.matched_zone_id !== null) {
              affectedZoneIds.add(item.matched_zone_id);
            }
            
            actions.push({
              id: `CS-${actionId++}`,
              action: `Consolidate ${shipClass} inventory`,
              item: item.requisition_no,
              itemDescription: item.description.substring(0, 50),
              from: item.rack_location,
              to: targetRack,
              targetZoneId: targetZone.id,
              targetZoneName: targetZone.name,
              priority: item.value > 5000 ? 'high' : 'medium',
              estimatedBenefit: `Reduces pick time for ${shipClass} by ~${Math.round(5 + Math.random() * 10)}min`,
              quantity: item.quantity,
              value: item.value,
              reason: `Item for ${shipClass} scattered from main storage - consolidate to ${targetZone.name}`,
            });
            consolidatedItems++;
            consolidatedValue += item.value;
            
            if (actions.length >= maxActionsToGenerate) break;
          }
          if (actions.length >= maxActionsToGenerate) break;
        }
        
        // Calculate unique target zones
        const targetZoneNames = new Set(actions.filter(a => a.targetZoneName).map(a => a.targetZoneName));
        
        summary = {
          slotsFreed: consolidatedItems,
          consolidationWins: `${consolidatedItems} items → ${targetZoneNames.size} zones`,
          zonesOptimized: affectedZoneIds.size,
          pickEfficiencyGain: `+${Math.min(consolidatedItems * 2, 25)}% pick time reduction`,
          itemsAffected: consolidatedItems,
          actionsGenerated: actions.length,
        };
      } 
      else if (algorithm === 'size_standardization') {
        // Size Standardization: Move items to appropriate zones based on usage_type
        // Small items go to small_material zones, large items go to large_material zones
        const { maxActionsToGenerate = 50 } = params || {};
        
        // Find zones by usage type - filter by allowed target zones if zone constraints enabled
        const zonesForFiltering = enableZoneFiltering && allowedTargetZones.length > 0 ? allowedTargetZones : zones;
        const smallMaterialZones = zonesForFiltering.filter(z => z.usage_type === 'small_material');
        const largeMaterialZones = zonesForFiltering.filter(z => z.usage_type === 'large_material');
        const mixedMaterialZones = zonesForFiltering.filter(z => z.usage_type === 'mixed_material');
        
        // Determine ideal zone for each item based on weight/dimensions
        const smallWeightThreshold = 50; // lbs
        const largeWeightThreshold = 500; // lbs
        
        let actionId = 1;
        let standardizedCount = 0;
        let standardizedValue = 0;
        const affectedZoneIds = new Set<number>();
        
        // Use filteredItems instead of itemsWithData
        for (const item of filteredItems) {
          if (item.matched_zone_id === null) continue;
          
          const currentZone = item.matched_zone;
          if (!currentZone) continue;
          
          let idealZone: typeof zones[0] | null = null;
          let reason = '';
          
          // Determine item size category
          if (item.weight < smallWeightThreshold && smallMaterialZones.length > 0) {
            // Small item - should be in small_material zone
            if (currentZone.usage_type !== 'small_material') {
              idealZone = smallMaterialZones[0];
              reason = `Small item (${item.weight} lbs) should be in small material zone`;
            }
          } else if (item.weight > largeWeightThreshold && largeMaterialZones.length > 0) {
            // Large item - should be in large_material zone
            if (currentZone.usage_type !== 'large_material') {
              idealZone = largeMaterialZones[0];
              reason = `Large item (${item.weight} lbs) should be in large material zone`;
            }
          } else if (mixedMaterialZones.length > 0) {
            // Medium item - mixed zone is fine, but could standardize
            // Only move if in wrong zone type (outdoor bulk for indoor items)
            if (currentZone.is_outdoor && !currentZone.usage_type?.includes('bulk')) {
              idealZone = mixedMaterialZones[0];
              reason = `Medium item better suited for indoor mixed material zone`;
            }
          }
          
          if (idealZone && idealZone.id !== item.matched_zone_id) {
            affectedZoneIds.add(item.matched_zone_id);
            
            actions.push({
              id: `SS-${actionId++}`,
              action: `Move to appropriate size zone`,
              item: item.requisition_no,
              itemDescription: item.description.substring(0, 50),
              from: item.rack_location,
              to: `${idealZone.code}-${item.program_code || 'GEN'}`,
              targetZoneId: idealZone.id,
              targetZoneName: idealZone.name,
              priority: item.condition_code === 'A' ? 'medium' : 'low',
              estimatedBenefit: `Optimizes storage efficiency for ${item.weight} lb item`,
              quantity: item.quantity,
              value: item.value,
              reason: reason,
            });
            standardizedCount++;
            standardizedValue += item.value;
            
            if (actions.length >= maxActionsToGenerate) break;
          }
        }
        
        const targetZoneNames = new Set(actions.filter(a => a.targetZoneName).map(a => a.targetZoneName));
        
        summary = {
          slotsFreed: standardizedCount,
          consolidationWins: `${standardizedCount} items → ${targetZoneNames.size} size-appropriate zones`,
          zonesOptimized: affectedZoneIds.size,
          pickEfficiencyGain: `+${Math.min(standardizedCount * 2, 20)}% size-based organization efficiency`,
          itemsAffected: standardizedCount,
          actionsGenerated: actions.length,
        };
      }
      else if (algorithm === 'value_density') {
        // Value Density: Move high-value items to more accessible, secure locations
        // Indoor zones are more accessible/secure than outdoor; lower zone codes = more accessible
        const { highValueThreshold = 1000, maxActionsToGenerate = 50 } = params || {};
        
        // Rank zones by accessibility: indoor first, then by code (2000 < 3000 < 4000 < 7000)
        // Use allowed target zones if zone constraints enabled
        const zonesForRanking = enableZoneFiltering && allowedTargetZones.length > 0 ? allowedTargetZones : zones;
        const rankedZones = [...zonesForRanking]
          .filter(z => !z.is_outdoor && z.usage_type !== 'hazmat')
          .sort((a, b) => {
            const codeA = parseInt(a.code.replace(/\D/g, '')) || 9999;
            const codeB = parseInt(b.code.replace(/\D/g, '')) || 9999;
            return codeA - codeB;
          });
        
        const priorityZone = rankedZones[0];
        if (!priorityZone) {
          // No suitable indoor zone, skip this algorithm
          summary = {
            slotsFreed: 0,
            consolidationWins: 'No suitable priority zone available',
            zonesOptimized: 0,
            pickEfficiencyGain: 'N/A',
            itemsAffected: 0,
            actionsGenerated: 0,
          };
        } else {
          // Sort items by value descending - use filteredItems
          const sortedByValue = [...filteredItems]
            .filter(i => i.value > 0)
            .sort((a, b) => b.value - a.value);
          
          let actionId = 1;
          let movedValue = 0;
          let movedCount = 0;
          const affectedZoneIds = new Set<number>();
          
          for (const item of sortedByValue) {
            if (item.value < highValueThreshold) continue;
            if (item.matched_zone_id === priorityZone.id) continue; // Already in best zone
            
            // Check if current zone is less accessible (outdoor or higher numbered)
            const currentZone = item.matched_zone;
            const shouldMove = !currentZone || 
              currentZone.is_outdoor || 
              (parseInt(currentZone.code.replace(/\D/g, '')) || 0) > (parseInt(priorityZone.code.replace(/\D/g, '')) || 0) * 1.5;
            
            if (shouldMove) {
              if (item.matched_zone_id !== null) {
                affectedZoneIds.add(item.matched_zone_id);
              }
              
              const targetRack = `${priorityZone.code}-HV-${String(actionId).padStart(2, '0')}`;
              
              actions.push({
                id: `VD-${actionId++}`,
                action: `Relocate high-value item to priority area`,
                item: item.requisition_no,
                itemDescription: item.description.substring(0, 50),
                from: item.rack_location,
                to: targetRack,
                targetZoneId: priorityZone.id,
                targetZoneName: priorityZone.name,
                priority: 'high',
                estimatedBenefit: `$${item.value.toLocaleString()} value - faster picking & better security`,
                quantity: item.quantity,
                value: item.value,
                reason: `High-value item ($${item.value.toLocaleString()}) in ${currentZone?.name || 'unassigned zone'} - move to secure ${priorityZone.name}`,
              });
              movedValue += item.value;
              movedCount++;
              
              if (actions.length >= maxActionsToGenerate) break;
            }
          }
          
          summary = {
            slotsFreed: movedCount,
            consolidationWins: `${movedCount} high-value items → ${priorityZone.name}`,
            zonesOptimized: affectedZoneIds.size,
            pickEfficiencyGain: `+${Math.min(movedCount * 3, 30)}% accessibility for top items`,
            itemsAffected: movedCount,
            actionsGenerated: actions.length,
          };
        }
      }
      else if (algorithm === 'bin_packing') {
        // Bin Packing: Stage items by disposition for upcoming shipments using actual zones
        // SHORESIDE items go to outdoor BULK zones, RESIDUAL to holding areas
        const { maxItemsPerPallet = 15, prioritizeByValue = true, maxActionsToGenerate = 50 } = params || {};
        
        // Find staging zones by type - use allowed target zones if zone constraints enabled
        const zonesForStaging = enableZoneFiltering && allowedTargetZones.length > 0 ? allowedTargetZones : zones;
        const bulkZones = zonesForStaging.filter(z => 
          z.is_outdoor && 
          (z.usage_type?.includes('bulk') || z.usage_type === 'uncrated' || z.usage_type === 'crated') &&
          (z.bulk_available || 0) > 0
        );
        const indoorZones = zonesForStaging.filter(z => !z.is_outdoor);
        const hazmatZone = zonesForStaging.find(z => z.usage_type === 'hazmat');
        
        // Map dispositions to appropriate zone types
        const getZoneForDisposition = (disposition: string): typeof zonesForStaging[0] | null => {
          switch (disposition.toUpperCase()) {
            case 'SHORESIDE':
              // SHORESIDE goes to outdoor bulk zones for easy dock access
              return bulkZones.find(z => z.usage_type === 'uncrated') || bulkZones[0] || null;
            case 'RESIDUAL':
              // RESIDUAL stays in indoor zones
              return indoorZones.find(z => z.usage_type === 'mixed_material') || indoorZones[0] || null;
            case 'HAZMAT':
              return hazmatZone || null;
            default:
              // Default to first available bulk zone or indoor zone
              return bulkZones[0] || indoorZones[0] || zonesForStaging[0] || null;
          }
        };
        
        // Group items by mat_disposition - use filteredItems
        const dispositionGroups: Map<string, typeof filteredItems> = new Map();
        for (const item of filteredItems) {
          const disposition = item.mat_disposition || 'UNASSIGNED';
          if (!dispositionGroups.has(disposition)) {
            dispositionGroups.set(disposition, []);
          }
          dispositionGroups.get(disposition)!.push(item);
        }
        
        let actionId = 1;
        let totalStaged = 0;
        let totalValue = 0;
        const affectedZoneIds = new Set<number>();
        const targetZonesUsed = new Set<string>();
        
        for (const [disposition, dispItems] of Array.from(dispositionGroups.entries())) {
          if (dispItems.length < 2) continue;
          
          const stagingZone = getZoneForDisposition(disposition);
          if (!stagingZone) continue;
          
          targetZonesUsed.add(stagingZone.name);
          
          // Sort by value if prioritizeByValue, otherwise by ship_class
          const sortedItems = [...dispItems].sort((a, b) => {
            if (prioritizeByValue) {
              return b.value - a.value; // High value first
            }
            return (a.ship_class || '').localeCompare(b.ship_class || '');
          });
          
          // Check zone capacity
          const availableCapacity = (stagingZone.bulk_available || 0) + (stagingZone.rack_available || 0);
          
          let palletNum = 1;
          let itemsOnPallet = 0;
          
          for (const item of sortedItems) {
            if (itemsOnPallet >= maxItemsPerPallet) {
              palletNum++;
              itemsOnPallet = 0;
            }
            
            // Track affected source zones
            if (item.matched_zone_id !== null && item.matched_zone_id !== stagingZone.id) {
              affectedZoneIds.add(item.matched_zone_id);
            }
            
            const targetLocation = `${stagingZone.code}-P${String(palletNum).padStart(2, '0')}`;
            
            actions.push({
              id: `BP-${actionId++}`,
              action: `Stage for ${disposition} shipment`,
              item: item.requisition_no,
              itemDescription: item.description.substring(0, 50),
              from: item.rack_location,
              to: targetLocation,
              targetZoneId: stagingZone.id,
              targetZoneName: stagingZone.name,
              priority: itemsOnPallet === 0 ? 'high' : 'medium',
              estimatedBenefit: `Ready for ${item.ship_class || 'pending'} shipment at ${stagingZone.name}`,
              quantity: item.quantity,
              value: item.value,
              reason: `${disposition} item for ${item.ship_class || 'TBD'} - stage in ${stagingZone.name} (${availableCapacity > 0 ? 'capacity available' : 'near capacity'})`,
            });
            
            itemsOnPallet++;
            totalStaged++;
            totalValue += item.value;
            
            if (actions.length >= maxActionsToGenerate) break;
          }
          if (actions.length >= maxActionsToGenerate) break;
        }
        
        // Count pallets created
        const palletLocations = new Set(actions.map(a => a.to));
        
        summary = {
          slotsFreed: totalStaged,
          consolidationWins: `${totalStaged} items → ${palletLocations.size} pallets in ${targetZonesUsed.size} staging zones`,
          zonesOptimized: affectedZoneIds.size,
          pickEfficiencyGain: `${palletLocations.size} pallets ready for shipment`,
          itemsAffected: totalStaged,
          actionsGenerated: actions.length,
        };
      } else if (algorithm === 'name_consolidation') {
        // Name Consolidation: Group items with identical or similar names together
        // Reduces scattered storage and improves picking efficiency for same-name items
        const { minItemsToConsolidate = 2, maxActionsToGenerate = 50, useFuzzyMatching = false } = params || {};
        
        // Normalize item names for grouping
        const normalizeName = (name: string): string => {
          return name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9\s]/g, '') // Remove special chars
            .replace(/\s+/g, ' '); // Normalize whitespace
        };
        
        // Group items by normalized name
        const nameGroups: Map<string, typeof filteredItems> = new Map();
        for (const item of filteredItems) {
          if (!item.description) continue;
          const normalizedName = normalizeName(item.description);
          if (normalizedName.length < 3) continue; // Skip very short names
          
          if (!nameGroups.has(normalizedName)) {
            nameGroups.set(normalizedName, []);
          }
          nameGroups.get(normalizedName)!.push(item);
        }
        
        let actionId = 1;
        let consolidatedItems = 0;
        let consolidatedValue = 0;
        const affectedZoneIds = new Set<number>();
        const consolidatedNames = new Set<string>();
        
        // Sort by group size (largest groups first) for maximum impact
        const sortedGroups = Array.from(nameGroups.entries())
          .filter(([, items]) => items.length >= minItemsToConsolidate)
          .sort((a, b) => b[1].length - a[1].length);
        
        for (const [normalizedName, nameItems] of sortedGroups) {
          if (actions.length >= maxActionsToGenerate) break;
          
          // Find the most common zone for this name's items
          const zoneCounts: Map<number, number> = new Map();
          for (const item of nameItems) {
            if (item.matched_zone_id !== null) {
              if (enableZoneFiltering && targetZoneIds.length > 0) {
                if (targetZoneIds.includes(item.matched_zone_id)) {
                  zoneCounts.set(item.matched_zone_id, (zoneCounts.get(item.matched_zone_id) || 0) + 1);
                }
              } else {
                zoneCounts.set(item.matched_zone_id, (zoneCounts.get(item.matched_zone_id) || 0) + 1);
              }
            }
          }
          
          // Determine primary zone (most common)
          let primaryZoneId: number | null = null;
          let maxCount = 0;
          for (const [zoneId, count] of Array.from(zoneCounts.entries())) {
            if (count > maxCount) {
              maxCount = count;
              primaryZoneId = zoneId;
            }
          }
          
          // If no primary zone found, use first available target zone
          if (primaryZoneId === null && allowedTargetZones.length > 0) {
            primaryZoneId = allowedTargetZones[0].id;
          }
          
          if (primaryZoneId === null) continue;
          
          const primaryZone = zones.find(z => z.id === primaryZoneId);
          if (!primaryZone) continue;
          
          // Find items NOT in the primary zone - these need to move
          const itemsToMove = nameItems.filter(item => 
            item.matched_zone_id !== null && item.matched_zone_id !== primaryZoneId
          );
          
          if (itemsToMove.length === 0) continue;
          
          // Calculate new location in primary zone
          const baseLocation = primaryZone.code || `Z${primaryZoneId}`;
          let slotNum = 1;
          
          for (const item of itemsToMove) {
            if (actions.length >= maxActionsToGenerate) break;
            
            // Track source zone
            if (item.matched_zone_id !== null) {
              affectedZoneIds.add(item.matched_zone_id);
            }
            
            const targetLocation = `${baseLocation}-CONS-${String(slotNum++).padStart(2, '0')}`;
            const displayName = nameItems[0].description.substring(0, 40);
            
            actions.push({
              id: `NC-${actionId++}`,
              action: `Consolidate by name`,
              item: item.requisition_no,
              itemDescription: item.description.substring(0, 50),
              from: item.rack_location,
              to: targetLocation,
              targetZoneId: primaryZoneId,
              targetZoneName: primaryZone.name,
              priority: itemsToMove.length >= 5 ? 'high' : itemsToMove.length >= 3 ? 'medium' : 'low',
              estimatedBenefit: `Group "${displayName}" items together (${nameItems.length} total)`,
              quantity: item.quantity,
              value: item.value,
              reason: `Item "${item.description.substring(0, 30)}..." scattered in ${zoneCounts.size} zones - consolidate to ${primaryZone.name}`,
            });
            
            consolidatedItems++;
            consolidatedValue += item.value;
          }
          
          if (itemsToMove.length > 0) {
            consolidatedNames.add(normalizedName);
          }
        }
        
        summary = {
          slotsFreed: consolidatedItems,
          consolidationWins: `${consolidatedNames.size} item groups consolidated`,
          zonesOptimized: affectedZoneIds.size,
          pickEfficiencyGain: `${consolidatedItems} items moved to shared locations`,
          itemsAffected: consolidatedItems,
          actionsGenerated: actions.length,
        };
      }

      // Store optimization run in database
      const [optimizationRun] = await db.insert(warehouseOptimizationRuns).values({
        user_id: req.user!.id,
        site_id: siteId,
        algorithm,
        input_params: params || {},
        results: { summary, itemsAnalyzed: items.length },
        action_plan: { actions },
        status: 'completed',
        completed_at: new Date(),
      }).returning();

      res.status(201).json({
        runId: optimizationRun.id,
        algorithm,
        site: { id: siteId, name: site.name },
        summary,
        actions: actions.slice(0, 50), // Limit response size
        totalActions: actions.length,
      });
    } catch (error) {
      console.error("[Warehouse] Optimization failed:", error);
      res.status(500).json({ error: "Failed to run optimization" });
    }
  });

  // POST /api/warehouse/sites/:siteId/optimize/run-all - Run all optimization algorithms in sequence
router.post("/warehouse/sites/:siteId/optimize/run-all", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const { params: userParams } = req.body;

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Fetch inventory items for analysis
      const items = await db.select()
        .from(warehouseInventoryItems)
        .where(eq(warehouseInventoryItems.site_id, siteId));

      // Parse item data
      const itemsWithData = items.map(item => {
        const rawRow = item.raw_row as Record<string, any> || {};
        const qty = item.quantity || parseInt(rawRow?.qty) || 1;
        const price = parseFloat(item.unit_price?.toString() || rawRow?.unit_price || "0");
        const value = qty * price;
        const weight = parseFloat(item.weight_lbs?.toString() || rawRow?.weight || "0");
        const location = rawRow?.location || item.location || 'Unassigned';
        const locationZone = location.split('-')[0] || location.substring(0, 4) || 'UNK';
        
        return {
          id: item.id,
          requisition_no: item.requisition_no || `ITEM-${item.id}`,
          description: item.description || rawRow?.description || '',
          quantity: qty,
          value,
          weight,
          rack_location: location,
          location_zone: locationZone,
          ship_class: item.ship_class || rawRow?.ship_class || '',
          inventory_type: item.inventory_type || rawRow?.inventory_type || '',
          condition_code: item.condition_code || item.condition || rawRow?.condition_code || 'A',
          storage_facility: item.storage_facility || rawRow?.storage_facility || '',
          mat_disposition: item.material_disposition || rawRow?.mat_disposition || rawRow?.material_disposition || '',
          program_code: item.program_code || rawRow?.program_code || '',
        };
      });

      // Default parameters for all algorithms
      const defaultParams = {
        cardstack: userParams?.cardstack || { minItemsToConsolidate: 2, maxActionsToGenerate: 50 },
        size_standardization: userParams?.size_standardization || { minProgramItems: 3, maxActionsToGenerate: 50 },
        value_density: userParams?.value_density || { highValueThreshold: 1000, zoneDistanceMultiplier: 1.5 },
        bin_packing: userParams?.bin_packing || { maxItemsPerPallet: 15, prioritizeByValue: true },
      };

      // Extract zone constraints for run-all mode
      const zoneConstraints = userParams?.zoneConstraints || { sourceZoneIds: [], targetZoneIds: [], enableZoneFiltering: false };
      const { sourceZoneIds = [], targetZoneIds = [], enableZoneFiltering = false } = zoneConstraints;

      // Fetch zones for this site
      const zones = await db.select()
        .from(warehouseZones)
        .where(eq(warehouseZones.site_id, siteId));

      // Filter items by source zones if zone filtering is enabled
      let filteredItems = itemsWithData;
      if (enableZoneFiltering && sourceZoneIds.length > 0) {
        filteredItems = itemsWithData.filter(item => {
          // Match item location to zones
          for (const zone of zones) {
            if (zone.location_pattern && sourceZoneIds.includes(zone.id)) {
              try {
                const regex = new RegExp(zone.location_pattern);
                if (regex.test(item.rack_location)) return true;
              } catch { /* skip invalid regex */ }
            }
          }
          return false;
        });
        console.log(`[OptimizeAll] Zone filtering enabled: ${filteredItems.length} items from ${sourceZoneIds.length} source zones (was ${itemsWithData.length})`);
      }

      // Get target zones for placement
      const allowedTargetZones = enableZoneFiltering && targetZoneIds.length > 0
        ? zones.filter(z => targetZoneIds.includes(z.id))
        : zones;
      console.log(`[OptimizeAll] Target zones: ${allowedTargetZones.length} zones available`);

      // Collect all actions from all algorithms
      const allActions: Array<{
        id: string;
        action: string;
        item: string;
        itemDescription: string;
        from: string;
        to: string;
        priority: 'high' | 'medium' | 'low';
        estimatedBenefit: string;
        quantity: number;
        value: number;
        reason: string;
        algorithm: string;
      }> = [];

      const seenItems = new Set<string>();
      const freedPositions = new Set<string>();
      const impactedZones = new Set<string>();
      const phaseResults: Record<string, { 
        actions: number; 
        slotsFreed: number; 
        consolidationWins: string;
        zonesOptimized: number;
      }> = {};

      // Phase 1: CardStack - Consolidate items by ship class
      {
        const { minItemsToConsolidate = 2 } = defaultParams.cardstack;
        // Use filteredItems for zone constraint support
        const shipGroups: Map<string, typeof filteredItems> = new Map();
        for (const item of filteredItems) {
          if (!item.ship_class) continue;
          if (!shipGroups.has(item.ship_class)) {
            shipGroups.set(item.ship_class, []);
          }
          shipGroups.get(item.ship_class)!.push(item);
        }

        let actionId = 1;
        let phaseActions = 0;
        const sourceZonesSet = new Set<string>();
        const targetZonesSet = new Set<string>();
        const phasePositions = new Set<string>();

        for (const [shipClass, shipItems] of Array.from(shipGroups.entries())) {
          if (shipItems.length < minItemsToConsolidate) continue;
          
          const zoneCounts: Map<string, number> = new Map();
          for (const item of shipItems) {
            zoneCounts.set(item.location_zone, (zoneCounts.get(item.location_zone) || 0) + 1);
          }
          
          let targetZone = '';
          let maxCount = 0;
          for (const [zone, count] of Array.from(zoneCounts.entries())) {
            if (count > maxCount) {
              maxCount = count;
              targetZone = zone;
            }
          }

          for (const item of shipItems) {
            if (item.location_zone !== targetZone && allActions.length < 100 && item.rack_location) {
              phaseActions++;
              sourceZonesSet.add(item.location_zone);
              targetZonesSet.add(targetZone);
              seenItems.add(item.requisition_no);
              const normalizedLocation = item.rack_location.toUpperCase().trim();
              freedPositions.add(normalizedLocation);
              phasePositions.add(normalizedLocation);
              impactedZones.add(item.location_zone);
              impactedZones.add(targetZone);
              allActions.push({
                id: `CS-${actionId++}`,
                action: 'consolidate',
                item: item.requisition_no,
                itemDescription: item.description.substring(0, 50),
                from: item.rack_location,
                to: `${targetZone}-CONSOLIDATED`,
                priority: item.value > 5000 ? 'high' : item.value > 1000 ? 'medium' : 'low',
                estimatedBenefit: `Reduces pick time for ${shipClass}`,
                quantity: item.quantity,
                value: item.value,
                reason: `Consolidate ${shipClass} items to zone ${targetZone}`,
                algorithm: 'cardstack',
              });
            }
          }
        }
        phaseResults.cardstack = { 
          actions: phaseActions, 
          slotsFreed: phasePositions.size,
          consolidationWins: `${phaseActions} items → ${targetZonesSet.size} locations`,
          zonesOptimized: sourceZonesSet.size
        };
      }

      // Phase 2: Size Standardization - Group by program code
      {
        const { minProgramItems = 3 } = defaultParams.size_standardization;
        // Use filteredItems for zone constraint support
        const programGroups: Map<string, typeof filteredItems> = new Map();
        for (const item of filteredItems) {
          if (!item.program_code) continue;
          if (!programGroups.has(item.program_code)) {
            programGroups.set(item.program_code, []);
          }
          programGroups.get(item.program_code)!.push(item);
        }

        let actionId = 1;
        let phaseActions = 0;
        const programsStandardized = new Set<string>();
        const phasePositions = new Set<string>();

        for (const [programCode, programItems] of Array.from(programGroups.entries())) {
          if (programItems.length < minProgramItems) continue;
          
          const zones = new Set(programItems.map(i => i.location_zone));
          if (zones.size > 1) {
            const targetZone = programItems.sort((a, b) => b.value - a.value)[0].location_zone;
            programsStandardized.add(programCode);
            
            for (const item of programItems) {
              if (item.location_zone !== targetZone && allActions.length < 150 && item.rack_location) {
                phaseActions++;
                seenItems.add(item.requisition_no);
                const normalizedLocation = item.rack_location.toUpperCase().trim();
                freedPositions.add(normalizedLocation);
                phasePositions.add(normalizedLocation);
                impactedZones.add(item.location_zone);
                impactedZones.add(targetZone);
                allActions.push({
                  id: `SS-${actionId++}`,
                  action: 'standardize',
                  item: item.requisition_no,
                  itemDescription: item.description.substring(0, 50),
                  from: item.rack_location,
                  to: `${targetZone}-${programCode}`,
                  priority: 'medium',
                  estimatedBenefit: `Groups ${programCode} program items`,
                  quantity: item.quantity,
                  value: item.value,
                  reason: `Group ${programCode} program items together`,
                  algorithm: 'size_standardization',
                });
              }
            }
          }
        }
        phaseResults.size_standardization = { 
          actions: phaseActions, 
          slotsFreed: phasePositions.size,
          consolidationWins: `${phaseActions} items → ${programsStandardized.size} program zones`,
          zonesOptimized: programsStandardized.size
        };
      }

      // Phase 3: Value Density - Move high-value items to accessible zones
      {
        const { highValueThreshold = 1000 } = defaultParams.value_density;
        // Use filteredItems for zone constraint support
        const highValueItems = filteredItems.filter(i => i.value >= highValueThreshold && i.rack_location);
        
        let actionId = 1;
        let phaseActions = 0;
        const phasePositions = new Set<string>();

        const getAccessibilityScore = (location: string): number => {
          if (!location) return 500;
          const numbers = location.match(/\d+/g);
          if (numbers && numbers.length > 0) {
            return parseInt(numbers[0]);
          }
          if (location.startsWith('A') || location.startsWith('1')) return 100;
          if (location.startsWith('B') || location.startsWith('2')) return 200;
          return 500;
        };

        const sortedItems = highValueItems.sort((a, b) => b.value - a.value);
        
        for (const item of sortedItems.slice(0, 30)) {
          const accessScore = getAccessibilityScore(item.rack_location);
          
          if (accessScore > 1500 && allActions.length < 200) {
            phaseActions++;
            seenItems.add(item.requisition_no);
            const normalizedLocation = item.rack_location.toUpperCase().trim();
            freedPositions.add(normalizedLocation);
            phasePositions.add(normalizedLocation);
            impactedZones.add(item.location_zone);
            impactedZones.add('ZONE-A-PRIORITY');
            allActions.push({
              id: `VD-${actionId++}`,
              action: 'relocate_priority',
              item: item.requisition_no,
              itemDescription: item.description.substring(0, 50),
              from: item.rack_location,
              to: `ZONE-A-PRIORITY`,
              priority: 'high',
              estimatedBenefit: `High-value item to priority zone`,
              quantity: item.quantity,
              value: item.value,
              reason: `High-value item ($${item.value.toFixed(0)}) in zone ${item.location_zone} needs accessible placement`,
              algorithm: 'value_density',
            });
          }
        }
        
        if (phaseActions < 10 && highValueItems.length > 0) {
          for (const item of sortedItems.slice(0, 10)) {
            const alreadyHasAction = allActions.some(a => a.item === item.requisition_no && a.algorithm === 'value_density');
            if (!alreadyHasAction && item.rack_location && !item.rack_location.includes('PRIORITY') && allActions.length < 200) {
              phaseActions++;
              seenItems.add(item.requisition_no);
              const normalizedLocation = item.rack_location.toUpperCase().trim();
              freedPositions.add(normalizedLocation);
              phasePositions.add(normalizedLocation);
              impactedZones.add(item.location_zone);
              impactedZones.add('ZONE-A-PRIORITY');
              allActions.push({
                id: `VD-${actionId++}`,
                action: 'relocate_priority',
                item: item.requisition_no,
                itemDescription: item.description.substring(0, 50),
                from: item.rack_location,
                to: `ZONE-A-PRIORITY`,
                priority: 'high',
                estimatedBenefit: `Top-value item to priority zone`,
                quantity: item.quantity,
                value: item.value,
                reason: `Top-value item ($${item.value.toFixed(0)}) should be in priority zone`,
                algorithm: 'value_density',
              });
            }
          }
        }
        
        phaseResults.value_density = { 
          actions: phaseActions, 
          slotsFreed: phasePositions.size,
          consolidationWins: `${phasePositions.size} high-value items → priority zone`,
          zonesOptimized: phaseActions > 0 ? 1 : 0
        };
      }

      // Phase 4: Bin Packing - Stage items by disposition
      {
        const { maxItemsPerPallet = 15, prioritizeByValue = true } = defaultParams.bin_packing;
        // Use filteredItems for zone constraint support
        const dispositionGroups: Map<string, typeof filteredItems> = new Map();
        
        for (const item of filteredItems) {
          if (!item.mat_disposition) continue;
          if (!dispositionGroups.has(item.mat_disposition)) {
            dispositionGroups.set(item.mat_disposition, []);
          }
          dispositionGroups.get(item.mat_disposition)!.push(item);
        }

        let actionId = 1;
        let phaseActions = 0;
        const palletLocationsSet = new Set<string>();
        const phasePositions = new Set<string>();

        for (const [disposition, dispositionItems] of Array.from(dispositionGroups.entries())) {
          if (dispositionItems.length < 3) continue;
          
          const sorted = prioritizeByValue 
            ? dispositionItems.sort((a, b) => b.value - a.value)
            : dispositionItems;

          for (let i = 0; i < Math.min(sorted.length, 50); i++) {
            const item = sorted[i];
            if (!item.rack_location) continue;
            const palletNumber = Math.floor(i / maxItemsPerPallet) + 1;
            const palletLocation = `STAGING-${disposition}-P${palletNumber}`;
            
            if (allActions.length < 250) {
              phaseActions++;
              palletLocationsSet.add(palletLocation);
              seenItems.add(item.requisition_no);
              const normalizedLocation = item.rack_location.toUpperCase().trim();
              freedPositions.add(normalizedLocation);
              phasePositions.add(normalizedLocation);
              impactedZones.add(item.location_zone);
              allActions.push({
                id: `BP-${actionId++}`,
                action: 'stage_pallet',
                item: item.requisition_no,
                itemDescription: item.description.substring(0, 50),
                from: item.rack_location,
                to: palletLocation,
                priority: i < maxItemsPerPallet ? 'high' : 'medium',
                estimatedBenefit: `Ready for ${disposition} shipment`,
                quantity: item.quantity,
                value: item.value,
                reason: `Stage ${disposition} item on pallet ${palletNumber}`,
                algorithm: 'bin_packing',
              });
            }
          }
        }
        phaseResults.bin_packing = { 
          actions: phaseActions, 
          slotsFreed: phasePositions.size,
          consolidationWins: `${phasePositions.size} positions → ${palletLocationsSet.size} pallets`,
          zonesOptimized: dispositionGroups.size
        };
      }

      // De-duplicate: Keep highest priority/value action for each item
      // Priority order: high > medium > low, then by value, then by algorithm phase order
      const algorithmPriority: Record<string, number> = {
        'cardstack': 1,
        'size_standardization': 2, 
        'value_density': 3,
        'bin_packing': 4,
      };
      
      const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      
      const scoreAction = (action: typeof allActions[0]): number => {
        // Higher score = better action to keep
        const priorityScore = (2 - priorityOrder[action.priority]) * 10000; // 0-20000
        const valueScore = Math.min(action.value, 10000); // 0-10000
        const phaseScore = (5 - algorithmPriority[action.algorithm]) * 100; // 100-400
        return priorityScore + valueScore + phaseScore;
      };
      
      const itemBestAction = new Map<string, typeof allActions[0]>();
      for (const action of allActions) {
        const existing = itemBestAction.get(action.item);
        if (!existing || scoreAction(action) > scoreAction(existing)) {
          itemBestAction.set(action.item, action);
        }
      }
      
      const deduplicatedActions = Array.from(itemBestAction.values());

      // Sort by priority and value
      deduplicatedActions.sort((a, b) => {
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return b.value - a.value;
      });

      // Calculate overall pick efficiency gain based on consolidation and accessibility moves
      const overallPickEfficiency = Math.min(
        Math.round((freedPositions.size * 1.5) + (impactedZones.size * 3)),
        40
      );
      
      const summary = {
        slotsFreed: freedPositions.size,
        consolidationWins: `${seenItems.size} items reorganized`,
        zonesOptimized: impactedZones.size,
        pickEfficiencyGain: `+${overallPickEfficiency}% overall efficiency`,
        itemsAffected: seenItems.size,
        actionsGenerated: deduplicatedActions.length,
        phases: phaseResults,
      };

      // Store optimization run
      const [optimizationRun] = await db.insert(warehouseOptimizationRuns).values({
        user_id: req.user!.id,
        site_id: siteId,
        algorithm: 'run_all',
        input_params: defaultParams,
        results: { summary, itemsAnalyzed: items.length, phases: phaseResults },
        action_plan: { actions: deduplicatedActions },
        status: 'completed',
        completed_at: new Date(),
      }).returning();

      console.log(`[Warehouse] Run-all optimization completed: ${deduplicatedActions.length} actions from 4 algorithms`);

      res.status(201).json({
        runId: optimizationRun.id,
        algorithm: 'run_all',
        site: { id: siteId, name: site.name },
        summary,
        actions: deduplicatedActions.slice(0, 50),
        totalActions: deduplicatedActions.length,
      });
    } catch (error) {
      console.error("[Warehouse] Run-all optimization failed:", error);
      res.status(500).json({ error: "Failed to run all optimizations" });
    }
  });

  // POST /api/warehouse/sites/:siteId/optimize/:runId/apply - Apply optimization plan
router.post("/warehouse/sites/:siteId/optimize/:runId/apply", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      const runId = parseInt(req.params.runId);
      
      if (isNaN(siteId) || isNaN(runId)) {
        return res.status(400).json({ error: "Invalid site ID or run ID" });
      }

      // Verify ownership and get the optimization run
      const [run] = await db.select()
        .from(warehouseOptimizationRuns)
        .where(and(
          eq(warehouseOptimizationRuns.id, runId),
          eq(warehouseOptimizationRuns.site_id, siteId),
          eq(warehouseOptimizationRuns.user_id, req.user!.id)
        ));

      if (!run) {
        return res.status(404).json({ error: "Optimization run not found" });
      }

      // Get the action plan
      const actionPlan = run.action_plan as { actions: Array<{
        id: string;
        item: string;
        from: string;
        to: string;
        targetZoneId?: number | null;
      }> } | null;

      if (!actionPlan?.actions || actionPlan.actions.length === 0) {
        return res.json({
          success: true,
          message: "No actions to apply",
          runId,
          actionsApplied: 0
        });
      }

      console.log(`[Optimize Apply] Processing ${actionPlan.actions.length} actions for run ${runId}`);

      // Collect item states BEFORE updating for versioning
      const itemSnapshots: Array<{
        itemId: number;
        requisitionNo: string;
        fromLocation: string | null;
        toLocation: string;
        fromZoneId: number | null;
        toZoneId: number | null;
        rawRowSnapshot: any;
      }> = [];

      // Apply each action by updating item locations
      let actionsApplied = 0;
      let errors: string[] = [];

      for (const action of actionPlan.actions) {
        try {
          // Find the item by requisition number
          const [item] = await db.select()
            .from(warehouseInventoryItems)
            .where(and(
              eq(warehouseInventoryItems.site_id, siteId),
              eq(warehouseInventoryItems.requisition_no, action.item)
            ))
            .limit(1);

          if (!item) {
            errors.push(`Item ${action.item} not found`);
            continue;
          }

          // Capture snapshot before update for versioning
          itemSnapshots.push({
            itemId: item.id,
            requisitionNo: action.item,
            fromLocation: item.location,
            toLocation: action.to,
            fromZoneId: item.zone_id,
            toZoneId: action.targetZoneId || null,
            rawRowSnapshot: item.raw_row,
          });

          // Update the item's location in raw_row
          const rawRow = (item.raw_row as Record<string, any>) || {};
          const updatedRawRow = {
            ...rawRow,
            location: action.to,
            previous_location: action.from,
            optimization_applied: new Date().toISOString(),
          };

          // Update the item
          await db.update(warehouseInventoryItems)
            .set({
              location: action.to,
              zone_id: action.targetZoneId || null,
              raw_row: updatedRawRow,
              updated_at: new Date(),
            })
            .where(eq(warehouseInventoryItems.id, item.id));

          actionsApplied++;
        } catch (err) {
          console.error(`[Optimize Apply] Failed to apply action for ${action.item}:`, err);
          errors.push(`Failed to move ${action.item}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      console.log(`[Optimize Apply] Applied ${actionsApplied}/${actionPlan.actions.length} actions`);

      // Mark the optimization run as applied
      await db.update(warehouseOptimizationRuns)
        .set({
          status: 'applied',
          completed_at: new Date(),
        })
        .where(eq(warehouseOptimizationRuns.id, runId));

      // Create a plan record and event for history tracking
      if (actionsApplied > 0) {
        try {
          const runResults = run.results as any || {};
          const [plan] = await db.insert(warehouseOptimizationPlans).values({
            site_id: siteId,
            user_id: req.user!.id,
            name: `Applied ${run.algorithm} optimization`,
            algorithm: run.algorithm,
            status: 'executed',
            version: 1,
            diff_patch: actionPlan,
            summary: runResults.summary || {},
            total_actions: actionPlan.actions.length,
            completed_actions: actionsApplied,
            created_at: new Date(),
            updated_at: new Date(),
          }).returning();

          // Record the execution event
          await db.insert(warehouseOptimizationEvents).values({
            plan_id: plan.id,
            user_id: req.user!.id,
            event_type: 'executed',
            payload: {
              actionsApplied,
              totalActions: actionPlan.actions.length,
              algorithm: run.algorithm,
              errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
            },
          });
          console.log(`[Optimize Apply] Created plan ${plan.id} and recorded execution event`);

          // Create version snapshot for rollback support
          if (itemSnapshots.length > 0) {
            const [version] = await db.insert(warehouseStateVersions).values({
              site_id: siteId,
              user_id: req.user!.id,
              name: `${run.algorithm} optimization`,
              description: `Applied ${actionsApplied} item moves`,
              source_type: 'optimization',
              source_id: plan.id,
              items_affected: itemSnapshots.length,
              status: 'active',
              metadata: {
                algorithm: run.algorithm,
                runId,
                planId: plan.id,
                actionsApplied,
                totalActions: actionPlan.actions.length,
              },
            }).returning();

            // Insert item version records
            await db.insert(warehouseItemVersions).values(
              itemSnapshots.map(snap => ({
                version_id: version.id,
                item_id: snap.itemId,
                requisition_no: snap.requisitionNo,
                from_location: snap.fromLocation,
                to_location: snap.toLocation,
                from_zone_id: snap.fromZoneId,
                to_zone_id: snap.toZoneId,
                raw_row_snapshot: snap.rawRowSnapshot,
              }))
            );
            console.log(`[Optimize Apply] Created version ${version.id} with ${itemSnapshots.length} item snapshots`);
          }
        } catch (historyError) {
          console.error(`[Optimize Apply] Failed to record history:`, historyError);
          // Don't fail the request, just log the error
        }
      }

      // Resync zone capacities to reflect the moved items
      if (actionsApplied > 0) {
        try {
          const { palletPositionService } = await import('../services');
          const config = {
            countBoxAsSeparate: false,
            whseRule: 'ignore' as const,
            bulkMode: 'estimate' as const,
            bulkIdColumnName: null
          };
          await palletPositionService.updateZoneMetrics(siteId, config);
          palletPositionService.invalidateMetricsCache(siteId);
          console.log(`[Optimize Apply] Resynced zone capacities for site ${siteId}`);
        } catch (syncError) {
          console.error(`[Optimize Apply] Failed to resync zones:`, syncError);
          // Don't fail the request, just log the error
        }
      }

      res.json({ 
        success: true, 
        message: actionsApplied === actionPlan.actions.length 
          ? `Successfully moved ${actionsApplied} items to new locations`
          : `Applied ${actionsApplied}/${actionPlan.actions.length} actions${errors.length > 0 ? `. Errors: ${errors.slice(0, 3).join('; ')}` : ''}`,
        runId,
        actionsApplied,
        totalActions: actionPlan.actions.length,
        errors: errors.length > 0 ? errors.slice(0, 5) : undefined
      });
    } catch (error) {
      console.error("[Warehouse] Failed to apply optimization:", error);
      res.status(500).json({ error: "Failed to apply optimization plan" });
    }
  });

  // GET /api/warehouse/sites/:siteId/versions - Get version history for a site
router.get("/warehouse/sites/:siteId/versions", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify ownership
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Site not found" });
      }

      // Get versions with item counts
      const versions = await db.select()
        .from(warehouseStateVersions)
        .where(eq(warehouseStateVersions.site_id, siteId))
        .orderBy(desc(warehouseStateVersions.created_at))
        .limit(50);

      res.json({ versions });
    } catch (error) {
      console.error("[Warehouse] Failed to get versions:", error);
      res.status(500).json({ error: "Failed to get version history" });
    }
  });

  // GET /api/warehouse/sites/:siteId/versions/:versionId - Get version details with item changes
router.get("/warehouse/sites/:siteId/versions/:versionId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      const versionId = parseInt(req.params.versionId);
      
      if (isNaN(siteId) || isNaN(versionId)) {
        return res.status(400).json({ error: "Invalid site ID or version ID" });
      }

      // Verify ownership
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Site not found" });
      }

      // Get the version
      const [version] = await db.select()
        .from(warehouseStateVersions)
        .where(and(
          eq(warehouseStateVersions.id, versionId),
          eq(warehouseStateVersions.site_id, siteId)
        ));

      if (!version) {
        return res.status(404).json({ error: "Version not found" });
      }

      // Get item changes for this version
      const itemChanges = await db.select()
        .from(warehouseItemVersions)
        .where(eq(warehouseItemVersions.version_id, versionId));

      res.json({ version, itemChanges });
    } catch (error) {
      console.error("[Warehouse] Failed to get version details:", error);
      res.status(500).json({ error: "Failed to get version details" });
    }
  });

  // POST /api/warehouse/sites/:siteId/versions/:versionId/revert - Revert to a previous version
router.post("/warehouse/sites/:siteId/versions/:versionId/revert", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      const versionId = parseInt(req.params.versionId);
      
      if (isNaN(siteId) || isNaN(versionId)) {
        return res.status(400).json({ error: "Invalid site ID or version ID" });
      }

      // Verify ownership
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Site not found" });
      }

      // Get the version to revert
      const [version] = await db.select()
        .from(warehouseStateVersions)
        .where(and(
          eq(warehouseStateVersions.id, versionId),
          eq(warehouseStateVersions.site_id, siteId),
          eq(warehouseStateVersions.status, 'active')
        ));

      if (!version) {
        return res.status(404).json({ error: "Version not found or already reverted" });
      }

      // Get item changes for this version
      const itemChanges = await db.select()
        .from(warehouseItemVersions)
        .where(eq(warehouseItemVersions.version_id, versionId));

      if (itemChanges.length === 0) {
        return res.status(400).json({ error: "No item changes to revert" });
      }

      console.log(`[Version Revert] Reverting version ${versionId} with ${itemChanges.length} item changes`);

      // Create snapshots of current state before reverting (for redo capability)
      const revertSnapshots: Array<{
        itemId: number;
        requisitionNo: string | null;
        fromLocation: string | null;
        toLocation: string | null;
        fromZoneId: number | null;
        toZoneId: number | null;
        rawRowSnapshot: any;
      }> = [];

      let itemsReverted = 0;
      let errors: string[] = [];

      for (const change of itemChanges) {
        try {
          // Get current item state
          const [item] = await db.select()
            .from(warehouseInventoryItems)
            .where(eq(warehouseInventoryItems.id, change.item_id));

          if (!item) {
            errors.push(`Item ${change.requisition_no || change.item_id} no longer exists`);
            continue;
          }

          // Capture current state for the revert version record
          revertSnapshots.push({
            itemId: item.id,
            requisitionNo: change.requisition_no,
            fromLocation: item.location,
            toLocation: change.from_location,
            fromZoneId: item.zone_id,
            toZoneId: change.from_zone_id,
            rawRowSnapshot: item.raw_row,
          });

          // Restore item to previous location
          const rawRow = (item.raw_row as Record<string, any>) || {};
          const updatedRawRow = {
            ...rawRow,
            location: change.from_location,
            reverted_from: change.to_location,
            revert_applied: new Date().toISOString(),
          };

          await db.update(warehouseInventoryItems)
            .set({
              location: change.from_location,
              zone_id: change.from_zone_id,
              raw_row: updatedRawRow,
              updated_at: new Date(),
            })
            .where(eq(warehouseInventoryItems.id, change.item_id));

          itemsReverted++;
        } catch (err) {
          console.error(`[Version Revert] Failed to revert item ${change.item_id}:`, err);
          errors.push(`Failed to revert item ${change.requisition_no || change.item_id}`);
        }
      }

      console.log(`[Version Revert] Reverted ${itemsReverted}/${itemChanges.length} items`);

      // Mark the original version as reverted
      await db.update(warehouseStateVersions)
        .set({
          status: 'reverted',
          reverted_at: new Date(),
          reverted_by: req.user!.id,
        })
        .where(eq(warehouseStateVersions.id, versionId));

      // Create a new version record for this revert action
      if (revertSnapshots.length > 0) {
        const [revertVersion] = await db.insert(warehouseStateVersions).values({
          site_id: siteId,
          user_id: req.user!.id,
          name: `Reverted: ${version.name}`,
          description: `Restored ${itemsReverted} items to their previous locations`,
          source_type: 'revert',
          source_id: versionId,
          parent_version_id: versionId,
          items_affected: revertSnapshots.length,
          status: 'active',
          metadata: {
            originalVersionId: versionId,
            originalVersionName: version.name,
            itemsReverted,
          },
        }).returning();

        // Insert item version records for the revert
        await db.insert(warehouseItemVersions).values(
          revertSnapshots.map(snap => ({
            version_id: revertVersion.id,
            item_id: snap.itemId,
            requisition_no: snap.requisitionNo,
            from_location: snap.fromLocation,
            to_location: snap.toLocation,
            from_zone_id: snap.fromZoneId,
            to_zone_id: snap.toZoneId,
            raw_row_snapshot: snap.rawRowSnapshot,
          }))
        );

        console.log(`[Version Revert] Created revert version ${revertVersion.id}`);
      }

      // Resync zone capacities
      if (itemsReverted > 0) {
        try {
          const { palletPositionService } = await import('../services');
          const config = {
            countBoxAsSeparate: false,
            whseRule: 'ignore' as const,
            bulkMode: 'estimate' as const,
            bulkIdColumnName: null
          };
          await palletPositionService.updateZoneMetrics(siteId, config);
          palletPositionService.invalidateMetricsCache(siteId);
          console.log(`[Version Revert] Resynced zone capacities for site ${siteId}`);
        } catch (syncError) {
          console.error(`[Version Revert] Failed to resync zones:`, syncError);
        }
      }

      res.json({
        success: true,
        message: `Reverted ${itemsReverted} items to their previous locations`,
        itemsReverted,
        totalItems: itemChanges.length,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      console.error("[Warehouse] Failed to revert version:", error);
      res.status(500).json({ error: "Failed to revert version" });
    }
  });

  // POST /api/warehouse/transfers - Create inter-warehouse transfer with item selection
router.post("/warehouse/transfers", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { source_site_id, destination_site_id, transport_mode, item_ids, notes, scheduled_date, air_metadata } = req.body;

      if (!source_site_id || !destination_site_id) {
        return res.status(400).json({ error: "source_site_id and destination_site_id are required" });
      }

      const validModes = ["air", "ground", "sea"];
      const mode = validModes.includes(transport_mode) ? transport_mode : "ground";

      if (source_site_id === destination_site_id) {
        return res.status(400).json({ error: "Source and destination sites must be different" });
      }

      if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) {
        return res.status(400).json({ error: "item_ids array is required with at least one item" });
      }

      // Verify user owns both sites
      const [sourceSite] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, source_site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      const [destSite] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, destination_site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!sourceSite) {
        return res.status(404).json({ error: "Source warehouse site not found" });
      }

      if (!destSite) {
        return res.status(404).json({ error: "Destination warehouse site not found" });
      }

      // Fetch selected inventory items
      const selectedItems = await db.select()
        .from(warehouseInventoryItems)
        .where(and(
          eq(warehouseInventoryItems.site_id, source_site_id),
          inArray(warehouseInventoryItems.id, item_ids)
        ));

      if (selectedItems.length === 0) {
        return res.status(400).json({ error: "No valid inventory items found for the selected IDs" });
      }

      // Build transfer items with details
      const transferItems = selectedItems.map(item => ({
        id: item.id,
        requisition_no: item.requisition_no,
        description: item.description,
        quantity: item.quantity,
        weight_lbs: item.weight_lbs,
        unit_price: item.unit_price,
      }));

      // Calculate totals
      const totals = {
        item_count: transferItems.length,
        total_weight_lb: transferItems.reduce((sum, item) => {
          const weight = parseFloat(String(item.weight_lbs || 0)) || 0;
          return sum + (weight * (item.quantity || 1));
        }, 0),
        total_value: transferItems.reduce((sum, item) => {
          const price = parseFloat(String(item.unit_price || 0)) || 0;
          return sum + (price * (item.quantity || 1));
        }, 0),
      };

      // Build ground transport metadata for ground transfers
      let groundTransportMetadata = null;
      if (mode === "ground") {
        try {
          const { vehicleAllocationService } = await import('../services');
          const allocations = await vehicleAllocationService.calculateVehicleAllocation(totals.total_weight_lb);
          
          if (allocations.length === 0 && totals.total_weight_lb > 0) {
            // No vehicle priorities configured - provide a warning but allow transfer creation
            // Use camelCase to match shared schema
            groundTransportMetadata = {
              totalWeightLbs: totals.total_weight_lb,
              allocations: [],
              totalVehicles: 0,
              totalCapacity: 0,
              utilizationPercent: 0,
              warning: "No vehicle priorities configured - manual allocation required",
              calculatedAt: new Date().toISOString(),
            };
            console.warn(`[Warehouse] Ground transfer created without vehicle allocation - no priorities configured`);
          } else {
            // Use camelCase to match shared schema
            groundTransportMetadata = {
              totalWeightLbs: totals.total_weight_lb,
              allocations: allocations,
              totalVehicles: allocations.reduce((sum, a) => sum + a.vehicleCount, 0),
              totalCapacity: allocations.reduce((sum, a) => sum + a.totalCapacity, 0),
              utilizationPercent: allocations.length > 0 
                ? Math.round((totals.total_weight_lb / allocations.reduce((sum, a) => sum + a.totalCapacity, 0)) * 100)
                : 0,
              calculatedAt: new Date().toISOString(),
            };
            console.log(`[Warehouse] Ground transfer vehicle allocation: ${groundTransportMetadata.totalVehicles} vehicles for ${totals.total_weight_lb} lbs`);
          }
        } catch (allocErr) {
          console.error("[Warehouse] Failed to calculate vehicle allocation:", allocErr);
          // Still allow transfer creation but note the failure - use camelCase
          groundTransportMetadata = {
            totalWeightLbs: totals.total_weight_lb,
            allocations: [],
            totalVehicles: 0,
            error: "Failed to calculate vehicle allocation",
            calculatedAt: new Date().toISOString(),
          };
        }
      }

      // Build air metadata and PACAF manifest for air transfers
      let airMetadata = null;
      let pacafManifest = null;

      if (mode === "air" && air_metadata) {
        const validAircraftTypes = ["C-17", "C-130H", "C-130J"];
        const validPriorities = ["routine", "priority", "urgent"];

        airMetadata = {
          aircraft_type: validAircraftTypes.includes(air_metadata.aircraft_type) 
            ? air_metadata.aircraft_type 
            : "C-17",
          mission_id: air_metadata.mission_id || null,
          priority: validPriorities.includes(air_metadata.priority) 
            ? air_metadata.priority 
            : "routine",
        };

        // Generate PACAF-compatible manifest
        pacafManifest = {
          manifest_id: `MNF-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          transfer_id: 0, // Will be updated after insert
          aircraft_type: airMetadata.aircraft_type,
          mission_id: airMetadata.mission_id,
          priority: airMetadata.priority,
          origin_site: {
            id: sourceSite.id,
            code: sourceSite.code,
            name: sourceSite.name,
          },
          destination_site: {
            id: destSite.id,
            code: destSite.code,
            name: destSite.name,
          },
          cargo_items: transferItems.map(item => ({
            id: item.id,
            requisition_no: item.requisition_no,
            description: item.description,
            quantity: item.quantity,
            weight_lbs: parseFloat(String(item.weight_lbs || 0)) || 0,
          })),
          totals,
          created_at: new Date().toISOString(),
        };
      }

      const [transfer] = await db.insert(warehouseTransfers).values({
        user_id: req.user!.id,
        source_site_id,
        destination_site_id,
        status: "pending",
        transport_mode: mode,
        transfer_items: transferItems,
        air_metadata: airMetadata,
        ground_transport_metadata: groundTransportMetadata,
        pacaf_manifest: pacafManifest,
        notes: notes || null,
        scheduled_date: scheduled_date ? new Date(scheduled_date) : null,
        total_weight_lbs: String(totals.total_weight_lb),
      }).returning();

      // Update manifest with transfer ID
      if (pacafManifest && transfer) {
        pacafManifest.transfer_id = transfer.id;
        await db.update(warehouseTransfers)
          .set({ pacaf_manifest: pacafManifest })
          .where(eq(warehouseTransfers.id, transfer.id));
      }

      console.log(`[Warehouse] Transfer created: ${transfer.id}, mode: ${mode}, items: ${transferItems.length}`);
      if (mode === "air") {
        console.log(`[Warehouse] Air transfer manifest generated: ${pacafManifest?.manifest_id}`);
      }

      res.status(201).json({
        ...transfer,
        pacaf_manifest: pacafManifest,
        ground_transport_metadata: groundTransportMetadata,
        totals,
      });
    } catch (error) {
      console.error("[Warehouse] Failed to create transfer:", error);
      res.status(500).json({ error: "Failed to create warehouse transfer" });
    }
  });

  // GET /api/warehouse/transfers - Get all transfers for user
router.get("/warehouse/transfers", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const transfers = await db.select()
        .from(warehouseTransfers)
        .where(eq(warehouseTransfers.user_id, req.user!.id));

      res.json(transfers);
    } catch (error) {
      console.error("[Warehouse] Failed to fetch transfers:", error);
      res.status(500).json({ error: "Failed to fetch warehouse transfers" });
    }
  });

  // PUT /api/warehouse/transfers/:id - Update transfer details (scheduled arrival date, notes)
router.put("/warehouse/transfers/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const transferId = parseInt(req.params.id);
      if (isNaN(transferId)) {
        return res.status(400).json({ error: "Invalid transfer ID" });
      }
      const { scheduled_arrival_date, notes } = req.body;
      
      const [transfer] = await db.select()
        .from(warehouseTransfers)
        .where(and(
          eq(warehouseTransfers.id, transferId),
          eq(warehouseTransfers.user_id, req.user!.id)
        ));
      
      if (!transfer) {
        return res.status(404).json({ error: "Transfer not found" });
      }
      
      const updateData: any = { updated_at: new Date() };
      
      if (scheduled_arrival_date !== undefined) {
        updateData.scheduled_date = scheduled_arrival_date ? new Date(scheduled_arrival_date) : null;
      }
      
      if (notes !== undefined) {
        updateData.notes = notes || null;
      }
      
      const [updated] = await db.update(warehouseTransfers)
        .set(updateData)
        .where(eq(warehouseTransfers.id, transferId))
        .returning();
      
      console.log(`[Warehouse] Transfer ${transferId} updated`);
      
      res.json(updated);
    } catch (error) {
      console.error("[Warehouse] Failed to update transfer:", error);
      res.status(500).json({ error: "Failed to update transfer" });
    }
  });

  // POST /api/warehouse/transfers/:id/create-manifest - Create cross-modal manifest from transfer
router.post("/warehouse/transfers/:id/create-manifest", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const transferId = parseInt(req.params.id);
      if (isNaN(transferId)) {
        return res.status(400).json({ error: "Invalid transfer ID" });
      }
      
      // Fetch the transfer
      const [transfer] = await db.select()
        .from(warehouseTransfers)
        .where(and(
          eq(warehouseTransfers.id, transferId),
          eq(warehouseTransfers.user_id, req.user!.id)
        ));
      
      if (!transfer) {
        return res.status(404).json({ error: "Transfer not found" });
      }
      
      if (transfer.manifest_id) {
        return res.status(400).json({ error: "Manifest already exists for this transfer" });
      }
      
      // Generate manifest number
      const manifestNumber = `MNF-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      
      // Get source and destination site info
      const [sourceSite] = await db.select().from(warehouseSites).where(eq(warehouseSites.id, transfer.source_site_id));
      const [destSite] = await db.select().from(warehouseSites).where(eq(warehouseSites.id, transfer.destination_site_id));
      
      // Calculate totals from transfer items
      const items = (transfer.transfer_items as any[]) || [];
      const totalWeight = items.reduce((sum, item) => {
        const weight = parseFloat(String(item.weight_lbs || 0)) || 0;
        return sum + (weight * (item.quantity || 1));
      }, 0);
      
      // Create the cross-modal manifest
      const [manifest] = await db.insert(crossModalManifests).values({
        user_id: req.user!.id,
        warehouse_transfer_id: transferId,
        source_site_id: transfer.source_site_id,
        destination_site_id: transfer.destination_site_id,
        manifest_number: manifestNumber,
        name: `Transfer ${transferId}: ${sourceSite?.name || 'Unknown'} → ${destSite?.name || 'Unknown'}`,
        priority: "routine",
        classification: "unclassified",
        transport_mode: transfer.transport_mode,
        total_weight_lbs: Math.round(totalWeight),
        total_items: items.length,
        status: "pending_transport",
      }).returning();
      
      // Create manifest items from transfer items
      for (const item of items) {
        await db.insert(manifestItems).values({
          manifest_id: manifest.id,
          inventory_item_id: item.id,
          nomenclature: item.description || 'Unknown Item',
          quantity: item.quantity || 1,
          weight_lbs: Math.round(parseFloat(String(item.weight_lbs || 0)) || 0),
        });
      }
      
      // Update transfer with manifest_id and status
      await db.update(warehouseTransfers)
        .set({ 
          manifest_id: manifest.id,
          status: "manifest_created",
          updated_at: new Date()
        })
        .where(eq(warehouseTransfers.id, transferId));
      
      console.log(`[Warehouse] Manifest ${manifestNumber} created for transfer ${transferId}`);
      
      res.status(201).json({
        message: "Manifest created successfully",
        manifest,
        transfer_status: "manifest_created"
      });
    } catch (error) {
      console.error("[Warehouse] Failed to create manifest:", error);
      res.status(500).json({ error: "Failed to create manifest from transfer" });
    }
  });

  // POST /api/warehouse/transfers/:id/assign-convoy - Assign a convoy to a ground transfer
router.post("/warehouse/transfers/:id/assign-convoy", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const transferId = parseInt(req.params.id);
      if (isNaN(transferId)) {
        return res.status(400).json({ error: "Invalid transfer ID" });
      }
      const { convoy_id } = req.body;
      
      if (!convoy_id) {
        return res.status(400).json({ error: "convoy_id is required" });
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
      
      if (transfer.transport_mode !== "ground") {
        return res.status(400).json({ error: "Transfer is not a ground transport" });
      }
      
      // Verify convoy exists and belongs to user
      const [convoy] = await db.select()
        .from(landConvoys)
        .where(and(
          eq(landConvoys.id, convoy_id),
          eq(landConvoys.user_id, req.user!.id)
        ));
      
      if (!convoy) {
        return res.status(404).json({ error: "Convoy not found" });
      }
      
      // Update transfer with convoy assignment
      await db.update(warehouseTransfers)
        .set({ 
          assigned_convoy_id: convoy_id,
          status: "transport_assigned",
          updated_at: new Date()
        })
        .where(eq(warehouseTransfers.id, transferId));
      
      // Update manifest if exists
      if (transfer.manifest_id) {
        await db.update(crossModalManifests)
          .set({ 
            convoy_id: convoy_id,
            status: "assigned",
            updated_at: new Date()
          })
          .where(eq(crossModalManifests.id, transfer.manifest_id));
      }
      
      // Update convoy with transfer cargo
      const items = (transfer.transfer_items as any[]) || [];
      const totalWeight = items.reduce((sum, item) => {
        const weight = parseFloat(String(item.weight_lbs || 0)) || 0;
        return sum + (weight * (item.quantity || 1));
      }, 0);
      
      await db.update(landConvoys)
        .set({ 
          cargo_manifest: items,
          total_cargo_weight_lbs: Math.round(totalWeight),
          updated_at: new Date()
        })
        .where(eq(landConvoys.id, convoy_id));
      
      console.log(`[Warehouse] Transfer ${transferId} assigned to convoy ${convoy_id}`);
      
      res.json({
        message: "Transfer assigned to convoy successfully",
        transfer_id: transferId,
        convoy_id: convoy_id,
        status: "transport_assigned"
      });
    } catch (error) {
      console.error("[Warehouse] Failed to assign convoy:", error);
      res.status(500).json({ error: "Failed to assign convoy to transfer" });
    }
  });

  // POST /api/warehouse/transfers/:id/propose-convoy - Auto-calculate and create a proposed convoy
router.post("/warehouse/transfers/:id/propose-convoy", authMiddleware, async (req: AuthRequest, res) => {
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
      
      if (transfer.transport_mode !== "ground") {
        return res.status(400).json({ error: "Transfer is not a ground transport" });
      }
      
      // Get destination site
      const [destSite] = await db.select()
        .from(warehouseSites)
        .where(eq(warehouseSites.id, transfer.destination_site_id));
      
      // Check if ground route is feasible using multi-modal routing service
      const routeCheck = await multiModalRoutingService.planMultiModalRoute(
        transfer.source_site_id,
        transfer.destination_site_id,
        0
      );
      
      if (routeCheck.requiresMultiModal) {
        return res.status(400).json({ 
          error: "Ground transport not possible for this route",
          reason: routeCheck.reason || "Route requires ocean crossing - please use Air or Sea transport",
          suggestedMode: routeCheck.suggestedMode,
          multiModalRoute: routeCheck.legs.map(leg => ({
            legNumber: leg.legNumber,
            mode: leg.mode,
            from: leg.origin.name,
            to: leg.destination.name,
            distanceMiles: leg.distanceMiles
          }))
        });
      }
      
      // Calculate total weight from transfer items with estimation for missing weights
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
      
      // Use vehicle allocation service to calculate required vehicles
      const { calculateVehicleAllocation, getVehiclePriorityList } = await import("../services/vehicleAllocationService");
      const allocations = await calculateVehicleAllocation(totalWeight);
      const priorityList = await getVehiclePriorityList();
      
      // Build convoy proposal
      const convoyName = `Transfer-${transferId}-Convoy`;
      const origin = sourceSite?.name || `Site ${transfer.source_site_id}`;
      const destination = destSite?.name || `Site ${transfer.destination_site_id}`;
      
      // Calculate totals
      const totalVehicles = allocations.reduce((sum, a) => sum + a.vehicleCount, 0);
      const totalCapacity = allocations.reduce((sum, a) => sum + a.totalCapacity, 0);
      const utilizationPercent = totalCapacity > 0 ? Math.round((totalWeight / totalCapacity) * 100) : 0;
      
      res.json({
        proposal: {
          transferId,
          convoyName,
          origin,
          destination,
          totalWeightLbs: Math.round(totalWeight),
          itemCount: items.length,
          vehicleAllocations: allocations,
          totalVehicles,
          totalCapacity,
          utilizationPercent,
          scheduledDate: transfer.scheduled_date?.toISOString() || null,
          hasEstimatedWeights,
        },
        hasPrioritySettings: priorityList.length > 0,
        warning: priorityList.length === 0 
          ? "No vehicle priority settings configured. Please configure vehicle priorities in WMS Admin."
          : null,
        info: hasEstimatedWeights
          ? `Weights estimated for ${items.filter(i => !i.weight_lbs || parseFloat(String(i.weight_lbs)) <= 0).length} items using 500 lbs default per unit.`
          : null,
      });
    } catch (error) {
      console.error("[Warehouse] Failed to propose convoy:", error);
      res.status(500).json({ error: "Failed to calculate convoy proposal" });
    }
  });

  // POST /api/warehouse/transfers/:id/auto-create-convoy - Create convoy and assign to transfer in one action
router.post("/warehouse/transfers/:id/auto-create-convoy", authMiddleware, async (req: AuthRequest, res) => {
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
      
      if (transfer.transport_mode !== "ground") {
        return res.status(400).json({ error: "Transfer is not a ground transport" });
      }
      
      if (transfer.assigned_convoy_id) {
        return res.status(400).json({ error: "Transfer already has convoy assigned" });
      }
      
      // Get destination site and check route feasibility
      const [destSite] = await db.select()
        .from(warehouseSites)
        .where(eq(warehouseSites.id, transfer.destination_site_id));
      
      // Check if ground route is feasible using multi-modal routing service
      const routeCheck = await multiModalRoutingService.planMultiModalRoute(
        transfer.source_site_id,
        transfer.destination_site_id,
        0
      );
      
      if (routeCheck.requiresMultiModal) {
        return res.status(400).json({ 
          error: "Ground transport not possible for this route",
          reason: routeCheck.reason || "Route requires ocean crossing - please use Air or Sea transport",
          suggestedMode: routeCheck.suggestedMode,
          multiModalRoute: routeCheck.legs.map(leg => ({
            legNumber: leg.legNumber,
            mode: leg.mode,
            from: leg.origin.name,
            to: leg.destination.name,
            distanceMiles: leg.distanceMiles
          }))
        });
      }
      
      // Calculate total weight from transfer items with estimation for missing weights
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
      const totalWeight = items.reduce((sum, item) => {
        return sum + (estimateWeight(item) * (item.quantity || 1));
      }, 0);
      
      // Use vehicle allocation service to calculate required vehicles
      const { calculateVehicleAllocation } = await import("../services/vehicleAllocationService");
      const allocations = await calculateVehicleAllocation(totalWeight);
      
      // Build convoy data
      const convoyName = `Transfer-${transferId}-Convoy`;
      const origin = sourceSite?.name || `Site ${transfer.source_site_id}`;
      const destination = destSite?.name || `Site ${transfer.destination_site_id}`;
      
      // Create convoy
      const [newConvoy] = await db.insert(landConvoys)
        .values({
          user_id: userId,
          name: convoyName,
          origin,
          destination,
          status: "planned",
          vehicle_count: allocations.reduce((sum, a) => sum + a.vehicleCount, 0),
          total_cargo_weight_lbs: Math.round(totalWeight),
          cargo_manifest: items,
          scheduled_departure: transfer.scheduled_date || new Date(),
        })
        .returning();
      
      // Add vehicles to convoy
      let vehiclePosition = 1;
      let vehiclesInserted = 0;
      console.log(`[Warehouse] Adding vehicles for ${allocations.length} allocation(s)`);
      
      for (const allocation of allocations) {
        console.log(`[Warehouse] Processing allocation: ${allocation.vehicleCode} x ${allocation.vehicleCount}`);
        
        // Use vehicleTypeId directly from allocation (more reliable than code lookup)
        const vehicleTypeId = allocation.vehicleTypeId;
        
        for (let i = 0; i < allocation.vehicleCount; i++) {
          try {
            await db.insert(landConvoyVehicles)
              .values({
                convoy_id: newConvoy.id,
                vehicle_type_id: vehicleTypeId,
                position_in_convoy: vehiclePosition++,
                callsign: `${allocation.vehicleCode}-${i + 1}`,
                status: "ready",
              });
            vehiclesInserted++;
          } catch (insertError) {
            console.error(`[Warehouse] Failed to insert vehicle ${i+1} of ${allocation.vehicleCode}:`, insertError);
          }
        }
      }
      
      console.log(`[Warehouse] Inserted ${vehiclesInserted} vehicles into convoy ${newConvoy.id}`);
      
      // Update transfer with convoy assignment
      await db.update(warehouseTransfers)
        .set({ 
          assigned_convoy_id: newConvoy.id,
          status: "transport_assigned",
          updated_at: new Date()
        })
        .where(eq(warehouseTransfers.id, transferId));
      
      // Update manifest if exists
      if (transfer.manifest_id) {
        await db.update(crossModalManifests)
          .set({ 
            convoy_id: newConvoy.id,
            status: "assigned",
            updated_at: new Date()
          })
          .where(eq(crossModalManifests.id, transfer.manifest_id));
      }
      
      console.log(`[Warehouse] Auto-created convoy ${newConvoy.id} for transfer ${transferId}`);
      
      res.status(201).json({
        message: "Convoy created and assigned successfully",
        convoy: {
          id: newConvoy.id,
          name: newConvoy.name,
          origin: newConvoy.origin,
          destination: newConvoy.destination,
          status: newConvoy.status,
          vehicleCount: allocations.reduce((sum, a) => sum + a.vehicleCount, 0),
          totalWeightLbs: Math.round(totalWeight),
        },
        vehicleAllocations: allocations,
        transfer_id: transferId,
        transfer_status: "transport_assigned"
      });
    } catch (error) {
      console.error("[Warehouse] Failed to auto-create convoy:", error);
      res.status(500).json({ error: "Failed to create convoy for transfer" });
    }
  });

  // POST /api/warehouse/transfers/:id/assign-flight-plan - Assign a flight plan to an air transfer
router.post("/warehouse/transfers/:id/assign-flight-plan", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const transferId = parseInt(req.params.id);
      if (isNaN(transferId)) {
        return res.status(400).json({ error: "Invalid transfer ID" });
      }
      const { flight_plan_id } = req.body;
      
      if (!flight_plan_id) {
        return res.status(400).json({ error: "flight_plan_id is required" });
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
      
      if (transfer.transport_mode !== "air") {
        return res.status(400).json({ error: "Transfer is not an air transport" });
      }
      
      // Verify flight plan exists and belongs to user
      const [flightPlan] = await db.select()
        .from(flightPlans)
        .where(and(
          eq(flightPlans.id, flight_plan_id),
          eq(flightPlans.user_id, req.user!.id)
        ));
      
      if (!flightPlan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }
      
      // Update transfer with flight plan assignment
      await db.update(warehouseTransfers)
        .set({ 
          assigned_flight_plan_id: flight_plan_id,
          status: "transport_assigned",
          updated_at: new Date()
        })
        .where(eq(warehouseTransfers.id, transferId));
      
      // Update manifest if exists
      if (transfer.manifest_id) {
        await db.update(crossModalManifests)
          .set({ 
            flight_plan_id: flight_plan_id,
            status: "assigned",
            updated_at: new Date()
          })
          .where(eq(crossModalManifests.id, transfer.manifest_id));
      }
      
      console.log(`[Warehouse] Transfer ${transferId} assigned to flight plan ${flight_plan_id}`);
      
      res.json({
        message: "Transfer assigned to flight plan successfully",
        transfer_id: transferId,
        flight_plan_id: flight_plan_id,
        status: "transport_assigned"
      });
    } catch (error) {
      console.error("[Warehouse] Failed to assign flight plan:", error);
      res.status(500).json({ error: "Failed to assign flight plan to transfer" });
    }
  });

  // PATCH /api/warehouse/transfers/:id/status - Update transfer status
router.patch("/warehouse/transfers/:id/status", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const transferId = parseInt(req.params.id);
      if (isNaN(transferId)) {
        return res.status(400).json({ error: "Invalid transfer ID" });
      }
      const { status } = req.body;
      
      const validStatuses = ['pending', 'manifest_created', 'transport_assigned', 'in_transit', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      }
      
      const [transfer] = await db.select()
        .from(warehouseTransfers)
        .where(and(
          eq(warehouseTransfers.id, transferId),
          eq(warehouseTransfers.user_id, req.user!.id)
        ));
      
      if (!transfer) {
        return res.status(404).json({ error: "Transfer not found" });
      }
      
      const updateData: any = { 
        status,
        updated_at: new Date()
      };
      
      if (status === 'completed') {
        updateData.completed_date = new Date();
      }
      
      await db.update(warehouseTransfers)
        .set(updateData)
        .where(eq(warehouseTransfers.id, transferId));
      
      // Update manifest status if exists
      if (transfer.manifest_id) {
        const manifestStatus = status === 'in_transit' ? 'in_transit' 
          : status === 'completed' ? 'delivered' 
          : status === 'cancelled' ? 'cancelled' 
          : 'assigned';
        
        await db.update(crossModalManifests)
          .set({ 
            status: manifestStatus,
            updated_at: new Date(),
            ...(status === 'completed' ? { actual_arrival: new Date() } : {}),
            ...(status === 'in_transit' ? { actual_departure: new Date() } : {})
          })
          .where(eq(crossModalManifests.id, transfer.manifest_id));
      }
      
      console.log(`[Warehouse] Transfer ${transferId} status updated to ${status}`);
      
      res.json({ message: "Transfer status updated", transfer_id: transferId, status });
    } catch (error) {
      console.error("[Warehouse] Failed to update transfer status:", error);
      res.status(500).json({ error: "Failed to update transfer status" });
    }
  });

  // DELETE /api/warehouse/transfers/:id - Delete a transfer
router.delete("/warehouse/transfers/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const transferId = parseInt(req.params.id);
      if (isNaN(transferId)) {
        return res.status(400).json({ error: "Invalid transfer ID" });
      }
      
      // Verify transfer belongs to user
      const [transfer] = await db.select()
        .from(warehouseTransfers)
        .where(and(
          eq(warehouseTransfers.id, transferId),
          eq(warehouseTransfers.user_id, req.user!.id)
        ));
      
      if (!transfer) {
        return res.status(404).json({ error: "Transfer not found" });
      }
      
      // Don't allow deleting completed transfers
      if (transfer.status === "completed") {
        return res.status(400).json({ error: "Cannot delete completed transfers" });
      }
      
      // Delete related manifest if exists
      if (transfer.manifest_id) {
        await db.delete(crossModalManifests).where(eq(crossModalManifests.id, transfer.manifest_id));
      }
      
      // Delete the transfer
      await db.delete(warehouseTransfers).where(eq(warehouseTransfers.id, transferId));
      
      console.log(`[Warehouse] Transfer ${transferId} deleted`);
      res.json({ success: true, message: "Transfer deleted successfully" });
    } catch (error) {
      console.error("[Warehouse] Failed to delete transfer:", error);
      res.status(500).json({ error: "Failed to delete transfer" });
    }
  });

  // GET /api/warehouse/optimization-events - Get optimization events for user's sites
router.get("/warehouse/optimization-events", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { site_id, plan_id, event_type, start_date, end_date, limit = '100', offset = '0' } = req.query;
      
      const limitNum = Math.min(parseInt(limit as string) || 100, 1000);
      const offsetNum = parseInt(offset as string) || 0;

      // Get user's site IDs for security filtering
      const userSites = await db.select({ id: warehouseSites.id })
        .from(warehouseSites)
        .where(eq(warehouseSites.user_id, req.user!.id));
      const userSiteIds = userSites.map(s => s.id);

      if (userSiteIds.length === 0) {
        return res.json({ events: [], total: 0, limit: limitNum, offset: offsetNum });
      }

      // Build conditions array
      const conditions = [
        inArray(warehouseOptimizationPlans.site_id, userSiteIds)
      ];

      if (site_id) {
        const siteIdNum = parseInt(site_id as string);
        if (!isNaN(siteIdNum) && userSiteIds.includes(siteIdNum)) {
          conditions.push(eq(warehouseOptimizationPlans.site_id, siteIdNum));
        }
      }

      if (plan_id) {
        const planIdNum = parseInt(plan_id as string);
        if (!isNaN(planIdNum)) {
          conditions.push(eq(warehouseOptimizationEvents.plan_id, planIdNum));
        }
      }

      if (event_type && typeof event_type === 'string') {
        // Validate event_type against allowed values to prevent abuse
        const ALLOWED_EVENT_TYPES = ['plan_created', 'plan_started', 'action_completed', 'action_skipped', 'plan_completed', 'plan_cancelled', 'error'];
        if (ALLOWED_EVENT_TYPES.includes(event_type)) {
          conditions.push(eq(warehouseOptimizationEvents.event_type, event_type));
        }
      }

      if (start_date && typeof start_date === 'string') {
        conditions.push(gte(warehouseOptimizationEvents.created_at, new Date(start_date)));
      }

      if (end_date && typeof end_date === 'string') {
        const endDateObj = new Date(end_date);
        endDateObj.setHours(23, 59, 59, 999);
        conditions.push(lte(warehouseOptimizationEvents.created_at, endDateObj));
      }

      // Get total count
      const [countResult] = await db.select({ count: count() })
        .from(warehouseOptimizationEvents)
        .innerJoin(warehouseOptimizationPlans, eq(warehouseOptimizationEvents.plan_id, warehouseOptimizationPlans.id))
        .where(and(...conditions));

      // Get events with joins
      const events = await db.select({
        id: warehouseOptimizationEvents.id,
        plan_id: warehouseOptimizationEvents.plan_id,
        user_id: warehouseOptimizationEvents.user_id,
        event_type: warehouseOptimizationEvents.event_type,
        payload: warehouseOptimizationEvents.payload,
        created_at: warehouseOptimizationEvents.created_at,
        plan_name: warehouseOptimizationPlans.name,
        plan_status: warehouseOptimizationPlans.status,
        site_id: warehouseOptimizationPlans.site_id,
        site_name: warehouseSites.name,
        site_code: warehouseSites.code,
        user_email: users.email,
      })
        .from(warehouseOptimizationEvents)
        .innerJoin(warehouseOptimizationPlans, eq(warehouseOptimizationEvents.plan_id, warehouseOptimizationPlans.id))
        .innerJoin(warehouseSites, eq(warehouseOptimizationPlans.site_id, warehouseSites.id))
        .leftJoin(users, eq(warehouseOptimizationEvents.user_id, users.id))
        .where(and(...conditions))
        .orderBy(desc(warehouseOptimizationEvents.created_at))
        .limit(limitNum)
        .offset(offsetNum);

      res.json({
        events,
        total: countResult?.count || 0,
        limit: limitNum,
        offset: offsetNum,
      });
    } catch (error) {
      console.error("[Warehouse] Failed to fetch optimization events:", error);
      res.status(500).json({ error: "Failed to fetch optimization events" });
    }
  });

  // ============================================================================
  // WAREHOUSE CONFIGURATION API (PROTECTED)
  // ============================================================================

  // GET /api/warehouse/settings - Get user's warehouse settings
router.get("/warehouse/settings", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const [settings] = await db.select()
        .from(warehouseSettings)
        .where(eq(warehouseSettings.user_id, req.user!.id));

      if (!settings) {
        return res.json({
          timezone: "UTC",
          date_format: "MM/DD/YYYY",
          weight_unit: "lbs",
          default_page_size: 25
        });
      }

      res.json(settings);
    } catch (error) {
      console.error("[Warehouse] Failed to fetch settings:", error);
      res.status(500).json({ error: "Failed to fetch warehouse settings" });
    }
  });

  // POST /api/warehouse/settings - Create or update user's warehouse settings
router.post("/warehouse/settings", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { timezone, date_format, weight_unit, default_page_size } = req.body;

      const validDateFormats = ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"];
      const validWeightUnits = ["lbs", "kg"];

      if (date_format && !validDateFormats.includes(date_format)) {
        return res.status(400).json({ error: "Invalid date format" });
      }

      if (weight_unit && !validWeightUnits.includes(weight_unit)) {
        return res.status(400).json({ error: "Invalid weight unit" });
      }

      const pageSize = default_page_size ? Math.min(100, Math.max(10, parseInt(default_page_size))) : 25;

      const [existing] = await db.select()
        .from(warehouseSettings)
        .where(eq(warehouseSettings.user_id, req.user!.id));

      if (existing) {
        const [updated] = await db.update(warehouseSettings)
          .set({
            timezone: timezone || existing.timezone,
            date_format: date_format || existing.date_format,
            weight_unit: weight_unit || existing.weight_unit,
            default_page_size: pageSize,
            updated_at: new Date()
          })
          .where(eq(warehouseSettings.user_id, req.user!.id))
          .returning();
        return res.json(updated);
      }

      const [created] = await db.insert(warehouseSettings).values({
        user_id: req.user!.id,
        timezone: timezone || "UTC",
        date_format: date_format || "MM/DD/YYYY",
        weight_unit: weight_unit || "lbs",
        default_page_size: pageSize
      }).returning();

      res.status(201).json(created);
    } catch (error) {
      console.error("[Warehouse] Failed to save settings:", error);
      res.status(500).json({ error: "Failed to save warehouse settings" });
    }
  });

  // GET /api/warehouse/aging-thresholds - Get user's aging thresholds
router.get("/warehouse/aging-thresholds", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const thresholds = await db.select()
        .from(warehouseAgingThresholds)
        .where(eq(warehouseAgingThresholds.user_id, req.user!.id))
        .orderBy(asc(warehouseAgingThresholds.days));

      if (thresholds.length === 0) {
        return res.json([
          { id: 0, name: "Warning", days: 180, color: "#fbbf24" },
          { id: 0, name: "Critical", days: 365, color: "#ef4444" }
        ]);
      }

      res.json(thresholds);
    } catch (error) {
      console.error("[Warehouse] Failed to fetch aging thresholds:", error);
      res.status(500).json({ error: "Failed to fetch aging thresholds" });
    }
  });

  // POST /api/warehouse/aging-thresholds - Create a new aging threshold
router.post("/warehouse/aging-thresholds", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { name, days, color } = req.body;

      if (!name || !days) {
        return res.status(400).json({ error: "Name and days are required" });
      }

      const daysNum = parseInt(days);
      if (isNaN(daysNum) || daysNum < 1) {
        return res.status(400).json({ error: "Days must be a positive number" });
      }

      const [threshold] = await db.insert(warehouseAgingThresholds).values({
        user_id: req.user!.id,
        name,
        days: daysNum,
        color: color || "#fbbf24"
      }).returning();

      res.status(201).json(threshold);
    } catch (error) {
      console.error("[Warehouse] Failed to create aging threshold:", error);
      res.status(500).json({ error: "Failed to create aging threshold" });
    }
  });

  // PUT /api/warehouse/aging-thresholds/:id - Update an aging threshold
router.put("/warehouse/aging-thresholds/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const thresholdId = parseInt(req.params.id);
      if (isNaN(thresholdId)) {
        return res.status(400).json({ error: "Invalid threshold ID" });
      }

      const { name, days, color } = req.body;

      const [existing] = await db.select()
        .from(warehouseAgingThresholds)
        .where(and(
          eq(warehouseAgingThresholds.id, thresholdId),
          eq(warehouseAgingThresholds.user_id, req.user!.id)
        ));

      if (!existing) {
        return res.status(404).json({ error: "Aging threshold not found" });
      }

      const daysNum = days ? parseInt(days) : existing.days;
      if (isNaN(daysNum) || daysNum < 1) {
        return res.status(400).json({ error: "Days must be a positive number" });
      }

      const [updated] = await db.update(warehouseAgingThresholds)
        .set({
          name: name || existing.name,
          days: daysNum,
          color: color || existing.color,
          updated_at: new Date()
        })
        .where(eq(warehouseAgingThresholds.id, thresholdId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("[Warehouse] Failed to update aging threshold:", error);
      res.status(500).json({ error: "Failed to update aging threshold" });
    }
  });

  // DELETE /api/warehouse/aging-thresholds/:id - Delete an aging threshold
router.delete("/warehouse/aging-thresholds/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const thresholdId = parseInt(req.params.id);
      if (isNaN(thresholdId)) {
        return res.status(400).json({ error: "Invalid threshold ID" });
      }

      const [existing] = await db.select()
        .from(warehouseAgingThresholds)
        .where(and(
          eq(warehouseAgingThresholds.id, thresholdId),
          eq(warehouseAgingThresholds.user_id, req.user!.id)
        ));

      if (!existing) {
        return res.status(404).json({ error: "Aging threshold not found" });
      }

      await db.delete(warehouseAgingThresholds)
        .where(eq(warehouseAgingThresholds.id, thresholdId));

      res.json({ success: true, message: "Aging threshold deleted successfully" });
    } catch (error) {
      console.error("[Warehouse] Failed to delete aging threshold:", error);
      res.status(500).json({ error: "Failed to delete aging threshold" });
    }
  });

  // ============================================================================
  // WAREHOUSE ANALYTICS API (PROTECTED)
  // ============================================================================

  // Helper function to calculate analytics for inventory items
  const calculateAnalytics = (items: any[], site?: any) => {
    const now = new Date();
    let totalItems = items.length;
    let totalQuantity = 0;
    let totalValue = 0;

    const agingBreakdown = {
      lessThan1Year: 0,
      oneToThreeYears: 0,
      threeToFiveYears: 0,
      moreThanFiveYears: 0
    };

    for (const item of items) {
      const qty = item.quantity || 0;
      const price = parseFloat(item.unit_price?.toString() || "0");
      totalQuantity += qty;
      totalValue += qty * price;

      const createdAt = item.created_at ? new Date(item.created_at) : null;
      const lastMoved = item.last_moved ? new Date(item.last_moved) : null;
      const referenceDate = lastMoved || createdAt || now;
      const yearsOld = (now.getTime() - referenceDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

      if (yearsOld < 1) {
        agingBreakdown.lessThan1Year += qty;
      } else if (yearsOld < 3) {
        agingBreakdown.oneToThreeYears += qty;
      } else if (yearsOld < 5) {
        agingBreakdown.threeToFiveYears += qty;
      } else {
        agingBreakdown.moreThanFiveYears += qty;
      }
    }

    const agingTotal = agingBreakdown.lessThan1Year + agingBreakdown.oneToThreeYears + 
                       agingBreakdown.threeToFiveYears + agingBreakdown.moreThanFiveYears;

    const agingScore = agingTotal > 0 ? 
      (agingBreakdown.lessThan1Year * 100 + 
       agingBreakdown.oneToThreeYears * 80 + 
       agingBreakdown.threeToFiveYears * 50 + 
       agingBreakdown.moreThanFiveYears * 20) / agingTotal : 100;

    const defaultCapacity = 500;
    const capacityUtilization = Math.min(Math.round((totalItems / defaultCapacity) * 100), 100);

    const completenessScore = totalItems > 0 ? 90 : 50;
    const readinessScore = Math.round((agingScore * 0.6 + completenessScore * 0.4));

    return {
      totalItems,
      totalQuantity,
      totalValue: parseFloat(totalValue.toFixed(2)),
      capacityUtilization,
      agingBreakdown,
      readinessScore: Math.min(100, Math.max(0, readinessScore))
    };
  };

  // GET /api/warehouse/analytics - Get current analytics for all sites
router.get("/warehouse/analytics", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const sites = await db.select()
        .from(warehouseSites)
        .where(eq(warehouseSites.user_id, req.user!.id));

      const siteAnalytics = [];
      let overallTotalItems = 0;
      let overallTotalValue = 0;
      let overallAgingBreakdown = {
        lessThan1Year: 0,
        oneToThreeYears: 0,
        threeToFiveYears: 0,
        moreThanFiveYears: 0
      };

      for (const site of sites) {
        const items = await db.select()
          .from(warehouseInventoryItems)
          .where(eq(warehouseInventoryItems.site_id, site.id));

        const analytics = calculateAnalytics(items, site);
        
        overallTotalItems += analytics.totalItems;
        overallTotalValue += analytics.totalValue;
        overallAgingBreakdown.lessThan1Year += analytics.agingBreakdown.lessThan1Year;
        overallAgingBreakdown.oneToThreeYears += analytics.agingBreakdown.oneToThreeYears;
        overallAgingBreakdown.threeToFiveYears += analytics.agingBreakdown.threeToFiveYears;
        overallAgingBreakdown.moreThanFiveYears += analytics.agingBreakdown.moreThanFiveYears;

        siteAnalytics.push({
          siteId: site.id,
          siteCode: site.code,
          siteName: site.name,
          ...analytics
        });
      }

      const overallTotal = overallAgingBreakdown.lessThan1Year + overallAgingBreakdown.oneToThreeYears +
                           overallAgingBreakdown.threeToFiveYears + overallAgingBreakdown.moreThanFiveYears;
      const overallAgingScore = overallTotal > 0 ?
        (overallAgingBreakdown.lessThan1Year * 100 +
         overallAgingBreakdown.oneToThreeYears * 80 +
         overallAgingBreakdown.threeToFiveYears * 50 +
         overallAgingBreakdown.moreThanFiveYears * 20) / overallTotal : 100;
      const overallCompleteness = overallTotalItems > 0 ? 90 : 50;
      const overallReadinessScore = Math.round((overallAgingScore * 0.6 + overallCompleteness * 0.4));

      res.json({
        overall: {
          totalItems: overallTotalItems,
          totalValue: parseFloat(overallTotalValue.toFixed(2)),
          agingBreakdown: overallAgingBreakdown,
          readinessScore: Math.min(100, Math.max(0, overallReadinessScore))
        },
        sites: siteAnalytics
      });
    } catch (error) {
      console.error("[Warehouse Analytics] Failed to get analytics:", error);
      res.status(500).json({ error: "Failed to get warehouse analytics" });
    }
  });

  // GET /api/warehouse/analytics/:siteId - Get analytics for a specific site
router.get("/warehouse/analytics/:siteId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const items = await db.select()
        .from(warehouseInventoryItems)
        .where(eq(warehouseInventoryItems.site_id, siteId));

      const analytics = calculateAnalytics(items, site);

      res.json({
        siteId: site.id,
        siteCode: site.code,
        siteName: site.name,
        ...analytics
      });
    } catch (error) {
      console.error("[Warehouse Analytics] Failed to get site analytics:", error);
      res.status(500).json({ error: "Failed to get site analytics" });
    }
  });

  // POST /api/warehouse/analytics/snapshot - Take a snapshot and store in database
router.post("/warehouse/analytics/snapshot", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { siteId } = req.body;
      const today = new Date().toISOString().split('T')[0];

      if (siteId) {
        const parsedSiteId = parseInt(siteId);
        if (isNaN(parsedSiteId)) {
          return res.status(400).json({ error: "Invalid site ID" });
        }

        const [site] = await db.select()
          .from(warehouseSites)
          .where(and(
            eq(warehouseSites.id, parsedSiteId),
            eq(warehouseSites.user_id, req.user!.id)
          ));

        if (!site) {
          return res.status(404).json({ error: "Warehouse site not found" });
        }

        const items = await db.select()
          .from(warehouseInventoryItems)
          .where(eq(warehouseInventoryItems.site_id, parsedSiteId));

        const analytics = calculateAnalytics(items, site);

        const [snapshot] = await db.insert(warehouseAnalyticsSnapshots).values({
          user_id: req.user!.id,
          site_id: parsedSiteId,
          snapshot_date: today,
          metrics: analytics
        }).returning();

        return res.status(201).json(snapshot);
      }

      const sites = await db.select()
        .from(warehouseSites)
        .where(eq(warehouseSites.user_id, req.user!.id));

      const snapshots = [];
      for (const site of sites) {
        const items = await db.select()
          .from(warehouseInventoryItems)
          .where(eq(warehouseInventoryItems.site_id, site.id));

        const analytics = calculateAnalytics(items, site);

        const [snapshot] = await db.insert(warehouseAnalyticsSnapshots).values({
          user_id: req.user!.id,
          site_id: site.id,
          snapshot_date: today,
          metrics: analytics
        }).returning();

        snapshots.push(snapshot);
      }

      const overallItems: any[] = [];
      for (const site of sites) {
        const items = await db.select()
          .from(warehouseInventoryItems)
          .where(eq(warehouseInventoryItems.site_id, site.id));
        overallItems.push(...items);
      }

      const overallAnalytics = calculateAnalytics(overallItems);
      const [overallSnapshot] = await db.insert(warehouseAnalyticsSnapshots).values({
        user_id: req.user!.id,
        site_id: null,
        snapshot_date: today,
        metrics: overallAnalytics
      }).returning();

      snapshots.push(overallSnapshot);

      res.status(201).json({ snapshots, count: snapshots.length });
    } catch (error) {
      console.error("[Warehouse Analytics] Failed to create snapshot:", error);
      res.status(500).json({ error: "Failed to create analytics snapshot" });
    }
  });

  // GET /api/warehouse/analytics/history - Get historical snapshots for trendline
router.get("/warehouse/analytics/history", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteIdParam = req.query.siteId as string;
      const limitParam = validatePaginationParam(req.query.limit, 1, 365, 30);

      let whereCondition;
      if (siteIdParam) {
        const siteId = parseInt(siteIdParam);
        if (isNaN(siteId)) {
          return res.status(400).json({ error: "Invalid site ID" });
        }
        whereCondition = and(
          eq(warehouseAnalyticsSnapshots.user_id, req.user!.id),
          eq(warehouseAnalyticsSnapshots.site_id, siteId)
        );
      } else {
        whereCondition = and(
          eq(warehouseAnalyticsSnapshots.user_id, req.user!.id),
          isNull(warehouseAnalyticsSnapshots.site_id)
        );
      }

      const snapshots = await db.select()
        .from(warehouseAnalyticsSnapshots)
        .where(whereCondition)
        .orderBy(desc(warehouseAnalyticsSnapshots.snapshot_date))
        .limit(limitParam);

      res.json(snapshots.reverse());
    } catch (error) {
      console.error("[Warehouse Analytics] Failed to get history:", error);
      res.status(500).json({ error: "Failed to get analytics history" });
    }
  });

  // ============================================================================
  // WORKFLOW STATE MACHINE API
  // ============================================================================

  // Valid workflow transitions
  const WORKFLOW_TRANSITIONS: Record<string, string[]> = {
    'received': ['store'],
    'store': ['package', 'ship'], // Can go to package or directly to ship
    'package': ['ship'],
    'ship': ['delivered', 'return'],
    'delivered': [], // Terminal state
    'return': ['store'], // Returns go back to store
  };

  // Get valid next states for an item
router.get("/warehouse/workflow/transitions/:currentState", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { currentState } = req.params;
      const validStates = WORKFLOW_TRANSITIONS[currentState] || [];
      
      res.json({
        current_state: currentState,
        valid_transitions: validStates,
        is_terminal: validStates.length === 0,
      });
    } catch (error) {
      console.error("[Workflow] Error getting transitions:", error);
      res.status(500).json({ error: "Failed to get workflow transitions" });
    }
  });

  // Update item workflow state
router.put("/warehouse/inventory/:id/workflow", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { new_state, notes } = req.body;
      
      // Get user's site IDs first
      const userSites = await db.query.warehouseSites.findMany({
        where: eq(warehouseSites.user_id, req.user!.id),
      });
      const userSiteIds = userSites.map(s => s.id);
      
      // Get current item
      const item = userSiteIds.length > 0 
        ? await db.query.warehouseInventoryItems.findFirst({
            where: and(
              eq(warehouseInventoryItems.id, parseInt(id)),
              inArray(warehouseInventoryItems.site_id, userSiteIds)
            ),
          })
        : null;
      
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const currentState = item.workflow_status || 'received';
      const validTransitions = WORKFLOW_TRANSITIONS[currentState] || [];
      
      if (!validTransitions.includes(new_state)) {
        return res.status(400).json({
          error: `Invalid workflow transition`,
          message: `Cannot transition from '${currentState}' to '${new_state}'. Valid transitions: ${validTransitions.join(', ') || 'none (terminal state)'}`,
        });
      }
      
      // Update item workflow state
      const [updated] = await db.update(warehouseInventoryItems)
        .set({
          workflow_status: new_state,
          workflow_updated_at: new Date(),
        })
        .where(eq(warehouseInventoryItems.id, parseInt(id)))
        .returning();
      
      res.json({
        success: true,
        previous_state: currentState,
        new_state: new_state,
        item: updated,
      });
    } catch (error) {
      console.error("[Workflow] Error updating workflow state:", error);
      res.status(500).json({ error: "Failed to update workflow state" });
    }
  });

  // Batch update workflow state for multiple items
router.put("/warehouse/inventory/workflow/batch", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { item_ids, new_state } = req.body;
      
      if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) {
        return res.status(400).json({ error: "item_ids array is required" });
      }
      
      const results = {
        success: [] as number[],
        failed: [] as { id: number; reason: string }[],
      };
      
      // Get user's site IDs first
      const userSites = await db.query.warehouseSites.findMany({
        where: eq(warehouseSites.user_id, req.user!.id),
      });
      const userSiteIds = userSites.map(s => s.id);
      
      for (const itemId of item_ids) {
        const item = userSiteIds.length > 0 
          ? await db.query.warehouseInventoryItems.findFirst({
              where: and(
                eq(warehouseInventoryItems.id, itemId),
                inArray(warehouseInventoryItems.site_id, userSiteIds)
              ),
            })
          : null;
        
        if (!item) {
          results.failed.push({ id: itemId, reason: 'Item not found' });
          continue;
        }
        
        const currentState = item.workflow_status || 'received';
        const validTransitions = WORKFLOW_TRANSITIONS[currentState] || [];
        
        if (!validTransitions.includes(new_state)) {
          results.failed.push({ id: itemId, reason: `Cannot transition from '${currentState}' to '${new_state}'` });
          continue;
        }
        
        await db.update(warehouseInventoryItems)
          .set({
            workflow_status: new_state,
            workflow_updated_at: new Date(),
          })
          .where(eq(warehouseInventoryItems.id, itemId));
        
        results.success.push(itemId);
      }
      
      res.json({
        total: item_ids.length,
        successful: results.success.length,
        failed: results.failed.length,
        results,
      });
    } catch (error) {
      console.error("[Workflow] Error batch updating workflow:", error);
      res.status(500).json({ error: "Failed to batch update workflow" });
    }
  });

  // Get workflow statistics
router.get("/warehouse/workflow/statistics", authMiddleware, async (req: AuthRequest, res) => {
    try {
      // Get user's site IDs first
      const userSites = await db.query.warehouseSites.findMany({
        where: eq(warehouseSites.user_id, req.user!.id),
      });
      const userSiteIds = userSites.map(s => s.id);
      
      const items = userSiteIds.length > 0 
        ? await db.query.warehouseInventoryItems.findMany({
            where: inArray(warehouseInventoryItems.site_id, userSiteIds),
          })
        : [];
      
      const stateCounts: Record<string, number> = {
        received: 0,
        store: 0,
        package: 0,
        ship: 0,
        delivered: 0,
        return: 0,
      };
      
      for (const item of items) {
        const state = item.workflow_status || 'received';
        if (stateCounts[state] !== undefined) {
          stateCounts[state]++;
        }
      }
      
      res.json({
        total_items: items.length,
        by_state: stateCounts,
        workflow_states: Object.keys(WORKFLOW_TRANSITIONS),
        transitions: WORKFLOW_TRANSITIONS,
      });
    } catch (error) {
      console.error("[Workflow] Error getting statistics:", error);
      res.status(500).json({ error: "Failed to get workflow statistics" });
    }
  });

  // ============================================================================
  // WAREHOUSE OPTIMIZATION PLANS API
  // ============================================================================

  // GET /api/warehouse/sites/:siteId/optimization-plans - List all optimization plans for a site
router.get("/warehouse/sites/:siteId/optimization-plans", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Build query conditions
      const conditions = [eq(warehouseOptimizationPlans.site_id, siteId)];

      // Filter by status if provided
      const statusParam = req.query.status as string;
      if (statusParam) {
        const statuses = statusParam.split(',').map(s => s.trim()).filter(Boolean);
        if (statuses.length > 0) {
          conditions.push(inArray(warehouseOptimizationPlans.status, statuses));
        }
      }

      // Fetch plans with action counts
      const plans = await db.select({
        id: warehouseOptimizationPlans.id,
        site_id: warehouseOptimizationPlans.site_id,
        user_id: warehouseOptimizationPlans.user_id,
        parent_plan_id: warehouseOptimizationPlans.parent_plan_id,
        name: warehouseOptimizationPlans.name,
        algorithm: warehouseOptimizationPlans.algorithm,
        status: warehouseOptimizationPlans.status,
        version: warehouseOptimizationPlans.version,
        diff_patch: warehouseOptimizationPlans.diff_patch,
        summary: warehouseOptimizationPlans.summary,
        total_actions: warehouseOptimizationPlans.total_actions,
        completed_actions: warehouseOptimizationPlans.completed_actions,
        comparison_context: warehouseOptimizationPlans.comparison_context,
        executed_at: warehouseOptimizationPlans.executed_at,
        executed_by: warehouseOptimizationPlans.executed_by,
        cancelled_at: warehouseOptimizationPlans.cancelled_at,
        cancelled_by: warehouseOptimizationPlans.cancelled_by,
        created_at: warehouseOptimizationPlans.created_at,
        updated_at: warehouseOptimizationPlans.updated_at,
      })
        .from(warehouseOptimizationPlans)
        .where(and(...conditions))
        .orderBy(desc(warehouseOptimizationPlans.created_at));

      res.json(plans);
    } catch (error) {
      console.error("[Warehouse Optimization Plans] Failed to list plans:", error);
      res.status(500).json({ error: "Failed to list optimization plans" });
    }
  });

  // POST /api/warehouse/sites/:siteId/optimization-plans - Create a new optimization plan
router.post("/warehouse/sites/:siteId/optimization-plans", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const { name, algorithm, diff_patch, summary, actions } = req.body;

      if (!name || !algorithm) {
        return res.status(400).json({ error: "Name and algorithm are required" });
      }

      // Use a transaction to create plan and actions together
      const result = await db.transaction(async (tx) => {
        // Create the plan
        const [plan] = await tx.insert(warehouseOptimizationPlans).values({
          site_id: siteId,
          user_id: req.user!.id,
          name,
          algorithm,
          status: "pending",
          diff_patch: diff_patch || [],
          summary: summary || {},
          total_actions: Array.isArray(actions) ? actions.length : 0,
          completed_actions: 0,
        }).returning();

        // Create the actions if provided
        if (Array.isArray(actions) && actions.length > 0) {
          const actionRecords = actions.map((action: any, index: number) => ({
            plan_id: plan.id,
            item_id: action.item_id || action.itemId || 0,
            action_type: action.action_type || action.action || "move",
            from_location: action.from_location || action.from || null,
            to_location: action.to_location || action.to || null,
            quantity: action.quantity || 1,
            status: "pending",
            sequence: index,
          }));

          await tx.insert(warehouseOptimizationActions).values(actionRecords);
        }

        // Create a "created" event
        await tx.insert(warehouseOptimizationEvents).values({
          plan_id: plan.id,
          user_id: req.user!.id,
          event_type: "created",
          payload: { algorithm, total_actions: actions?.length || 0 },
        });

        return plan;
      });

      res.status(201).json(result);
    } catch (error) {
      console.error("[Warehouse Optimization Plans] Failed to create plan:", error);
      res.status(500).json({ error: "Failed to create optimization plan" });
    }
  });

  // GET /api/warehouse/optimization-plans/:planId - Get a single plan with all its actions
router.get("/warehouse/optimization-plans/:planId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }

      // Fetch the plan
      const [plan] = await db.select()
        .from(warehouseOptimizationPlans)
        .where(eq(warehouseOptimizationPlans.id, planId));

      if (!plan) {
        return res.status(404).json({ error: "Optimization plan not found" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, plan.site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Fetch actions ordered by sequence
      const actions = await db.select()
        .from(warehouseOptimizationActions)
        .where(eq(warehouseOptimizationActions.plan_id, planId))
        .orderBy(asc(warehouseOptimizationActions.sequence));

      res.json({ ...plan, actions });
    } catch (error) {
      console.error("[Warehouse Optimization Plans] Failed to get plan:", error);
      res.status(500).json({ error: "Failed to get optimization plan" });
    }
  });

  // POST /api/warehouse/optimization-plans/:planId/execute - Mark plan as in_progress
router.post("/warehouse/optimization-plans/:planId/execute", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }

      // Fetch the plan
      const [plan] = await db.select()
        .from(warehouseOptimizationPlans)
        .where(eq(warehouseOptimizationPlans.id, planId));

      if (!plan) {
        return res.status(404).json({ error: "Optimization plan not found" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, plan.site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (plan.status !== "pending") {
        return res.status(400).json({ error: "Plan can only be executed when status is pending" });
      }

      // Use transaction to update plan and create event
      const result = await db.transaction(async (tx) => {
        const [updatedPlan] = await tx.update(warehouseOptimizationPlans)
          .set({
            status: "in_progress",
            executed_at: new Date(),
            executed_by: req.user!.id,
            updated_at: new Date(),
          })
          .where(eq(warehouseOptimizationPlans.id, planId))
          .returning();

        await tx.insert(warehouseOptimizationEvents).values({
          plan_id: planId,
          user_id: req.user!.id,
          event_type: "executed",
          payload: { executed_at: new Date().toISOString() },
        });

        return updatedPlan;
      });

      res.json(result);
    } catch (error) {
      console.error("[Warehouse Optimization Plans] Failed to execute plan:", error);
      res.status(500).json({ error: "Failed to execute optimization plan" });
    }
  });

  // POST /api/warehouse/optimization-plans/:planId/cancel - Cancel a plan
router.post("/warehouse/optimization-plans/:planId/cancel", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }

      // Fetch the plan
      const [plan] = await db.select()
        .from(warehouseOptimizationPlans)
        .where(eq(warehouseOptimizationPlans.id, planId));

      if (!plan) {
        return res.status(404).json({ error: "Optimization plan not found" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, plan.site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (plan.status !== "pending" && plan.status !== "in_progress") {
        return res.status(400).json({ error: "Plan can only be cancelled when status is pending or in_progress" });
      }

      // Use transaction to update plan, mark actions as skipped, and create event
      const result = await db.transaction(async (tx) => {
        // Update plan status
        const [updatedPlan] = await tx.update(warehouseOptimizationPlans)
          .set({
            status: "cancelled",
            cancelled_at: new Date(),
            cancelled_by: req.user!.id,
            updated_at: new Date(),
          })
          .where(eq(warehouseOptimizationPlans.id, planId))
          .returning();

        // Mark all pending actions as skipped
        await tx.update(warehouseOptimizationActions)
          .set({ status: "skipped" })
          .where(and(
            eq(warehouseOptimizationActions.plan_id, planId),
            eq(warehouseOptimizationActions.status, "pending")
          ));

        // Create cancelled event
        await tx.insert(warehouseOptimizationEvents).values({
          plan_id: planId,
          user_id: req.user!.id,
          event_type: "cancelled",
          payload: { cancelled_at: new Date().toISOString() },
        });

        return updatedPlan;
      });

      res.json(result);
    } catch (error) {
      console.error("[Warehouse Optimization Plans] Failed to cancel plan:", error);
      res.status(500).json({ error: "Failed to cancel optimization plan" });
    }
  });

  // DELETE /api/warehouse/optimization-plans/:planId - Delete a plan
router.delete("/warehouse/optimization-plans/:planId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }

      // Fetch the plan
      const [plan] = await db.select()
        .from(warehouseOptimizationPlans)
        .where(eq(warehouseOptimizationPlans.id, planId));

      if (!plan) {
        return res.status(404).json({ error: "Optimization plan not found" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, plan.site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Delete the plan (cascade handles actions and events)
      await db.delete(warehouseOptimizationPlans)
        .where(eq(warehouseOptimizationPlans.id, planId));

      res.status(204).send();
    } catch (error) {
      console.error("[Warehouse Optimization Plans] Failed to delete plan:", error);
      res.status(500).json({ error: "Failed to delete optimization plan" });
    }
  });

  // PATCH /api/warehouse/optimization-plans/:planId/actions/:actionId - Update action status
router.patch("/warehouse/optimization-plans/:planId/actions/:actionId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const actionId = parseInt(req.params.actionId);
      
      if (isNaN(planId) || isNaN(actionId)) {
        return res.status(400).json({ error: "Invalid plan ID or action ID" });
      }

      // Fetch the plan
      const [plan] = await db.select()
        .from(warehouseOptimizationPlans)
        .where(eq(warehouseOptimizationPlans.id, planId));

      if (!plan) {
        return res.status(404).json({ error: "Optimization plan not found" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, plan.site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (plan.status === "completed" || plan.status === "cancelled") {
        return res.status(400).json({ error: "Cannot update actions for completed or cancelled plans" });
      }

      // Fetch the action
      const [action] = await db.select()
        .from(warehouseOptimizationActions)
        .where(and(
          eq(warehouseOptimizationActions.id, actionId),
          eq(warehouseOptimizationActions.plan_id, planId)
        ));

      if (!action) {
        return res.status(404).json({ error: "Action not found" });
      }

      const { status, notes, completed_by } = req.body;

      if (!status || !["in_progress", "completed", "skipped"].includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be in_progress, completed, or skipped" });
      }

      // Use transaction to update action and potentially plan
      const result = await db.transaction(async (tx) => {
        const updateData: any = { status };
        
        if (status === "completed") {
          updateData.completed_at = new Date();
          updateData.completed_by = completed_by || req.user!.id;
        }
        
        if (notes !== undefined) {
          updateData.movement_notes = notes;
        }

        // Track impact metrics when completing an action
        let positionFreed = false;
        let wasConsolidation = false;

        // If action was completed, calculate impact metrics BEFORE applying the move
        if (status === "completed" && action.status !== "completed" && action.from_location && action.to_location) {
          // Check if to_location already has items (consolidation)
          const [existingAtDestination] = await tx.select({ count: count() })
            .from(warehouseInventoryItems)
            .where(and(
              eq(warehouseInventoryItems.site_id, plan.site_id),
              eq(warehouseInventoryItems.location, action.to_location),
              sql`${warehouseInventoryItems.id} != ${action.item_id}`
            ));
          wasConsolidation = (existingAtDestination?.count ?? 0) > 0;

          // Check how many items are at from_location (to know if we're freeing a position)
          const [itemsAtSource] = await tx.select({ count: count() })
            .from(warehouseInventoryItems)
            .where(and(
              eq(warehouseInventoryItems.site_id, plan.site_id),
              eq(warehouseInventoryItems.location, action.from_location)
            ));
          // Position is freed if this is the only item at that location
          positionFreed = (itemsAtSource?.count ?? 0) === 1;
        }

        // Update the action
        const [updatedAction] = await tx.update(warehouseOptimizationActions)
          .set(updateData)
          .where(eq(warehouseOptimizationActions.id, actionId))
          .returning();

        // If action was completed, update plan's completed_actions count and apply to inventory
        if (status === "completed" && action.status !== "completed") {
          // Apply the action to inventory - update item location
          if (action.item_id && action.to_location) {
            await tx.update(warehouseInventoryItems)
              .set({
                location: action.to_location,
                last_moved: new Date()
              })
              .where(eq(warehouseInventoryItems.id, action.item_id));
          }

          // Get current summary to update metrics
          const [currentPlan] = await tx.select()
            .from(warehouseOptimizationPlans)
            .where(eq(warehouseOptimizationPlans.id, planId));
          
          const currentSummary = (currentPlan?.summary as any) || {};
          const newSummary = {
            ...currentSummary,
            total_items_moved: (currentSummary.total_items_moved || 0) + 1,
            positions_freed: (currentSummary.positions_freed || 0) + (positionFreed ? 1 : 0),
            items_consolidated: (currentSummary.items_consolidated || 0) + (wasConsolidation ? 1 : 0),
          };

          await tx.update(warehouseOptimizationPlans)
            .set({
              completed_actions: sql`${warehouseOptimizationPlans.completed_actions} + 1`,
              summary: newSummary,
              updated_at: new Date(),
            })
            .where(eq(warehouseOptimizationPlans.id, planId));

          // Check if all actions are completed to update plan status
          const [{ count: remainingCount }] = await tx.select({ count: count() })
            .from(warehouseOptimizationActions)
            .where(and(
              eq(warehouseOptimizationActions.plan_id, planId),
              eq(warehouseOptimizationActions.status, "pending")
            ));

          const [{ count: inProgressCount }] = await tx.select({ count: count() })
            .from(warehouseOptimizationActions)
            .where(and(
              eq(warehouseOptimizationActions.plan_id, planId),
              eq(warehouseOptimizationActions.status, "in_progress")
            ));

          if (remainingCount === 0 && inProgressCount === 0) {
            await tx.update(warehouseOptimizationPlans)
              .set({ status: "completed", updated_at: new Date() })
              .where(eq(warehouseOptimizationPlans.id, planId));
          }
        }

        // Create an event for the status change with impact metrics
        await tx.insert(warehouseOptimizationEvents).values({
          plan_id: planId,
          user_id: req.user!.id,
          event_type: `action_${status}`,
          payload: { 
            action_id: actionId, 
            status, 
            notes,
            impact: status === "completed" ? { position_freed: positionFreed, was_consolidation: wasConsolidation } : undefined
          },
        });

        return updatedAction;
      });

      // Invalidate zone metrics cache when action is completed (outside transaction)
      if (status === "completed") {
        try {
          const { palletPositionService } = await import('../services');
          palletPositionService.invalidateMetricsCache(plan.site_id);
          console.log(`[Optimization] Invalidated zone cache for site ${plan.site_id} after action completion`);
        } catch (cacheError) {
          console.warn("[Optimization] Failed to invalidate zone cache:", cacheError);
        }
      }

      res.json(result);
    } catch (error) {
      console.error("[Warehouse Optimization Plans] Failed to update action:", error);
      res.status(500).json({ error: "Failed to update action" });
    }
  });

  // PATCH /api/warehouse/optimization-plans/:planId/target-date - Set target completion date
router.patch("/warehouse/optimization-plans/:planId/target-date", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }

      const { target_completion_date } = req.body;
      
      // Validate date if provided
      let parsedDate: Date | null = null;
      if (target_completion_date) {
        parsedDate = new Date(target_completion_date);
        if (isNaN(parsedDate.getTime())) {
          return res.status(400).json({ error: "Invalid date format. Use ISO 8601 format." });
        }
      }

      // Fetch the plan
      const [plan] = await db.select()
        .from(warehouseOptimizationPlans)
        .where(eq(warehouseOptimizationPlans.id, planId));

      if (!plan) {
        return res.status(404).json({ error: "Optimization plan not found" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, plan.site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Update the plan with updated_at timestamp (target_completion_date stored in comparison_context)
      const [updatedPlan] = await db.update(warehouseOptimizationPlans)
        .set({
          comparison_context: { target_completion_date: parsedDate?.toISOString() || null },
          updated_at: new Date(),
        })
        .where(eq(warehouseOptimizationPlans.id, planId))
        .returning();

      // Create event for tracking
      await db.insert(warehouseOptimizationEvents).values({
        plan_id: planId,
        user_id: req.user!.id,
        event_type: "target_date_set",
        payload: { target_completion_date: parsedDate?.toISOString() || null },
      });

      res.json(updatedPlan);
    } catch (error) {
      console.error("[Warehouse Optimization Plans] Failed to set target date:", error);
      res.status(500).json({ error: "Failed to set target completion date" });
    }
  });

  // POST /api/warehouse/optimization-plans/:planId/start-all - Start all pending actions
router.post("/warehouse/optimization-plans/:planId/start-all", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }

      // Fetch the plan
      const [plan] = await db.select()
        .from(warehouseOptimizationPlans)
        .where(eq(warehouseOptimizationPlans.id, planId));

      if (!plan) {
        return res.status(404).json({ error: "Optimization plan not found" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, plan.site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (plan.status === "completed" || plan.status === "cancelled") {
        return res.status(400).json({ error: "Cannot start actions for completed or cancelled plans" });
      }

      // Use transaction to update all pending actions and plan status
      const result = await db.transaction(async (tx) => {
        // Update all pending actions to in_progress
        const updatedActions = await tx.update(warehouseOptimizationActions)
          .set({ status: "in_progress" })
          .where(and(
            eq(warehouseOptimizationActions.plan_id, planId),
            eq(warehouseOptimizationActions.status, "pending")
          ))
          .returning();

        const startedCount = updatedActions.length;

        // Update plan status to in_progress if not already
        let updatedPlan = plan;
        if (plan.status !== "in_progress" && startedCount > 0) {
          const [planUpdate] = await tx.update(warehouseOptimizationPlans)
            .set({
              status: "in_progress",
              executed_at: plan.executed_at || new Date(),
              executed_by: plan.executed_by || req.user!.id,
              updated_at: new Date(),
            })
            .where(eq(warehouseOptimizationPlans.id, planId))
            .returning();
          updatedPlan = planUpdate;
        }

        // Create event for tracking
        await tx.insert(warehouseOptimizationEvents).values({
          plan_id: planId,
          user_id: req.user!.id,
          event_type: "start_all",
          payload: { started_count: startedCount },
        });

        // Fetch all actions for the plan
        const allActions = await tx.select()
          .from(warehouseOptimizationActions)
          .where(eq(warehouseOptimizationActions.plan_id, planId))
          .orderBy(asc(warehouseOptimizationActions.sequence));

        return {
          plan: updatedPlan,
          actions: allActions,
          started_count: startedCount,
        };
      });

      res.json(result);
    } catch (error) {
      console.error("[Warehouse Optimization Plans] Failed to start all actions:", error);
      res.status(500).json({ error: "Failed to start all actions" });
    }
  });

  // ============================================================================
  // WAREHOUSE ALERTS & ANALYTICS API (PROTECTED)
  // ============================================================================

  // GET /api/warehouse/sites/:siteId/alerts - Get active alerts for a site
router.get("/warehouse/sites/:siteId/alerts", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied" });
      }

      const severity = req.query.severity as string | undefined;
      const limit = validatePaginationParam(req.query.limit, 1, 500, 50);

      let query = db.select()
        .from(warehouseAlerts)
        .where(and(
          eq(warehouseAlerts.site_id, siteId),
          eq(warehouseAlerts.is_resolved, false),
          ...(severity ? [eq(warehouseAlerts.severity, severity as 'info' | 'warning' | 'critical')] : [])
        ))
        .orderBy(desc(warehouseAlerts.created_at))
        .limit(limit);

      const alerts = await query;
      res.json(alerts);
    } catch (error) {
      console.error("[Warehouse Alerts] Failed to fetch alerts:", error);
      res.status(500).json({ error: "Failed to fetch alerts" });
    }
  });

  // POST /api/warehouse/sites/:siteId/alerts/:alertId/resolve - Resolve an alert
router.post("/warehouse/sites/:siteId/alerts/:alertId/resolve", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      const alertId = parseInt(req.params.alertId);
      if (isNaN(siteId) || isNaN(alertId)) {
        return res.status(400).json({ error: "Invalid site ID or alert ID" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied" });
      }

      const [alert] = await db.select()
        .from(warehouseAlerts)
        .where(and(
          eq(warehouseAlerts.id, alertId),
          eq(warehouseAlerts.site_id, siteId)
        ));

      if (!alert) {
        return res.status(404).json({ error: "Alert not found" });
      }

      await db.update(warehouseAlerts)
        .set({
          is_resolved: true,
          resolved_at: new Date(),
        })
        .where(eq(warehouseAlerts.id, alertId));

      res.json({ success: true });
    } catch (error) {
      console.error("[Warehouse Alerts] Failed to resolve alert:", error);
      res.status(500).json({ error: "Failed to resolve alert" });
    }
  });

  // POST /api/warehouse/sites/:siteId/analytics/run - Trigger analytics run for a site
router.post("/warehouse/sites/:siteId/analytics/run", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied" });
      }

      await warehouseAnalyticsService.runAnalytics(siteId, req.user!.id);

      res.json({ success: true, message: "Analytics completed" });
    } catch (error) {
      console.error("[Warehouse Analytics] Failed to run analytics:", error);
      res.status(500).json({ error: "Failed to run analytics" });
    }
  });

  // GET /api/warehouse/sites/:siteId/metrics/trends - Get trend metrics for a site
router.get("/warehouse/sites/:siteId/metrics/trends", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied" });
      }

      const trends = await warehouseAnalyticsService.getTrendMetrics(siteId);
      res.json(trends);
    } catch (error) {
      console.error("[Warehouse Analytics] Failed to fetch trend metrics:", error);
      res.status(500).json({ error: "Failed to fetch trend metrics" });
    }
  });

  // GET /api/warehouse/sites/:siteId/analytics/movements - Get movement analytics
router.get("/warehouse/sites/:siteId/analytics/movements", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }
      const days = validatePaginationParam(req.query.days, 1, 365, 30);

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied" });
      }

      const analytics = await warehouseAnalyticsService.getMovementAnalytics(siteId, days);
      res.json(analytics);
    } catch (error) {
      console.error("[Warehouse Analytics] Failed to fetch movement analytics:", error);
      res.status(500).json({ error: "Failed to fetch movement analytics" });
    }
  });

  // GET /api/warehouse/sites/:siteId/analytics/growth - Get growth insights
router.get("/warehouse/sites/:siteId/analytics/growth", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }
      const days = validatePaginationParam(req.query.days, 1, 365, 90);

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied" });
      }

      const insights = await warehouseAnalyticsService.getGrowthInsights(siteId, days);
      res.json(insights);
    } catch (error) {
      console.error("[Warehouse Analytics] Failed to fetch growth insights:", error);
      res.status(500).json({ error: "Failed to fetch growth insights" });
    }
  });

  // GET /api/warehouse/sites/:siteId/analytics/velocity - Get velocity analytics
router.get("/warehouse/sites/:siteId/analytics/velocity", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied" });
      }

      const analytics = await warehouseAnalyticsService.getVelocityAnalytics(siteId);
      res.json(analytics);
    } catch (error) {
      console.error("[Warehouse Analytics] Failed to fetch velocity analytics:", error);
      res.status(500).json({ error: "Failed to fetch velocity analytics" });
    }
  });

  // GET /api/warehouse/sites/:siteId/analytics/heatmap - Get zone heatmap
router.get("/warehouse/sites/:siteId/analytics/heatmap", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied" });
      }

      const heatmap = await warehouseAnalyticsService.getZoneHeatmap(siteId);
      res.json(heatmap);
    } catch (error) {
      console.error("[Warehouse Analytics] Failed to fetch zone heatmap:", error);
      res.status(500).json({ error: "Failed to fetch zone heatmap" });
    }
  });

  // POST /api/warehouse/sites/:siteId/analytics/generate-demo-data - Generate demo movement data
router.post("/warehouse/sites/:siteId/analytics/generate-demo-data", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied" });
      }

      const result = await warehouseAnalyticsService.generateDemoMovementData(siteId);
      res.json(result);
    } catch (error) {
      console.error("[Warehouse Analytics] Failed to generate demo data:", error);
      res.status(500).json({ error: "Failed to generate demo data" });
    }
  });

  // POST /api/warehouse/:siteId/ai-insights - Generate AI insights for warehouse
router.post("/warehouse/:siteId/ai-insights", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { insightType, forceRefresh = false } = req.body;

      if (!insightType) {
        return res.status(400).json({ error: "insightType is required" });
      }

      const validTypes = [
        'warehouse_demand_forecast',
        'warehouse_anomaly_detection', 
        'warehouse_smart_placement',
        'warehouse_inventory_velocity',
        'warehouse_capacity_forecast'
      ];

      if (!validTypes.includes(insightType)) {
        return res.status(400).json({ error: `Invalid insight type. Must be one of: ${validTypes.join(', ')}` });
      }

      const { generateInsight, generateInputHash, checkBedrockHealth } = await import("../services/bedrockService");

      const isHealthy = await checkBedrockHealth();
      if (!isHealthy) {
        return res.status(503).json({ error: "AI service is currently unavailable" });
      }

      const items = await db.select()
        .from(warehouseInventoryItems)
        .where(eq(warehouseInventoryItems.site_id, siteId));

      const zones = await db.select()
        .from(warehouseZones)
        .where(eq(warehouseZones.site_id, siteId));

      const movements = await warehouseAnalyticsService.getMovements(siteId, { limit: 100 });
      const growthInsights = await warehouseAnalyticsService.getGrowthInsights(siteId, 30);
      const velocityAnalytics = await warehouseAnalyticsService.getVelocityAnalytics(siteId);

      const inputData = {
        site: {
          id: site.id,
          name: site.name,
          max_weight_lbs: site.max_weight_lbs,
          current_weight_lbs: site.current_weight_lbs,
          utilization_percent: site.max_weight_lbs ? Math.round(((site.current_weight_lbs || 0) / site.max_weight_lbs) * 100) : 0
        },
        zones: zones.map(z => ({
          id: z.id,
          name: z.name,
          total_capacity: z.total_capacity,
          current_item_count: z.current_item_count,
          weight_limit_lbs: z.weight_limit_lbs,
          current_weight_lbs: z.current_weight_lbs,
          utilization_percent: z.total_capacity ? Math.round(((z.current_item_count || 0) / z.total_capacity) * 100) : 0
        })),
        items_summary: {
          total_count: items.length,
          total_weight_lbs: items.reduce((sum, i) => sum + (parseFloat(String(i.weight_lbs)) || 0) * (i.quantity || 1), 0),
          categories: Array.from(new Set(items.map(i => i.condition_code || i.description).filter(Boolean)))
        },
        recent_movements: movements.movements?.slice(0, 20) || [],
        growth_trends: growthInsights,
        velocity_data: velocityAnalytics
      };

      const inputHash = await generateInputHash(inputData);

      if (!forceRefresh) {
        const [cached] = await db.select()
          .from(aiInsights)
          .where(and(
            eq(aiInsights.user_id, req.user!.id),
            eq(aiInsights.insight_type, insightType),
            eq(aiInsights.input_hash, inputHash)
          ))
          .orderBy(desc(aiInsights.created_at))
          .limit(1);

        if (cached) {
          return res.json({
            insight: cached.insight_data,
            cached: true,
            generatedAt: cached.created_at
          });
        }
      }

      const result = await generateInsight({
        type: insightType as any,
        inputData,
        userId: String(req.user!.id)
      });

      await db.insert(aiInsights).values({
        user_id: req.user!.id,
        insight_type: insightType,
        input_hash: inputHash,
        insight_data: result.insight
      });

      res.json({
        insight: result.insight,
        cached: false,
        generatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("[Warehouse AI Insights] Failed to generate insight:", error);
      res.status(500).json({ error: "Failed to generate AI insight" });
    }
  });

  // ============================================================================
  // INVENTORY AGING ALERTS API
  // ============================================================================

  // Get aging items (>7 years = 2555 days)
router.get("/warehouse/aging-items", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { minDays = 2555, siteId } = req.query; // Default to 7 years
      
      // Get user's site IDs first
      const userSites = await db.query.warehouseSites.findMany({
        where: eq(warehouseSites.user_id, req.user!.id),
      });
      const userSiteIds = userSites.map(s => s.id);
      
      let items = userSiteIds.length > 0 
        ? await db.query.warehouseInventoryItems.findMany({
            where: inArray(warehouseInventoryItems.site_id, userSiteIds),
          })
        : [];
      
      // Calculate aging and filter
      const now = new Date();
      const agingItems = items
        .map(item => {
          const receivedDate = item.last_received_date || item.created_at;
          const agingDays = Math.floor((now.getTime() - new Date(receivedDate).getTime()) / (1000 * 60 * 60 * 24));
          return { ...item, aging_days: agingDays };
        })
        .filter(item => item.aging_days >= parseInt(String(minDays)));
      
      // Sort by aging (oldest first)
      agingItems.sort((a, b) => b.aging_days - a.aging_days);
      
      res.json({
        total: agingItems.length,
        threshold_days: parseInt(String(minDays)),
        items: agingItems.map(item => ({
          id: item.id,
          nsn: item.nsn,
          description: item.description,
          quantity: item.quantity,
          location_id: item.location_id,
          aging_days: item.aging_days,
          aging_years: Math.round(item.aging_days / 365 * 10) / 10,
          last_received_date: item.last_received_date,
          condition: item.condition,
          unit_price: item.unit_price,
        })),
      });
    } catch (error) {
      console.error("[Aging] Error fetching aging items:", error);
      res.status(500).json({ error: "Failed to fetch aging items" });
    }
  });

  // Get aging summary by threshold brackets
router.get("/warehouse/aging-summary", authMiddleware, async (req: AuthRequest, res) => {
    try {
      // Get user's site IDs first
      const userSites = await db.query.warehouseSites.findMany({
        where: eq(warehouseSites.user_id, req.user!.id),
      });
      const userSiteIds = userSites.map(s => s.id);
      
      const items = userSiteIds.length > 0 
        ? await db.query.warehouseInventoryItems.findMany({
            where: inArray(warehouseInventoryItems.site_id, userSiteIds),
          })
        : [];
      
      const now = new Date();
      
      // Define aging brackets
      const brackets = [
        { label: '>10 years', minDays: 3650, count: 0, value: 0 },
        { label: '7-10 years', minDays: 2555, maxDays: 3650, count: 0, value: 0 },
        { label: '5-7 years', minDays: 1825, maxDays: 2555, count: 0, value: 0 },
        { label: '3-5 years', minDays: 1095, maxDays: 1825, count: 0, value: 0 },
        { label: '1-3 years', minDays: 365, maxDays: 1095, count: 0, value: 0 },
        { label: '<1 year', minDays: 0, maxDays: 365, count: 0, value: 0 },
      ];
      
      for (const item of items) {
        const receivedDate = item.last_received_date || item.created_at;
        const agingDays = Math.floor((now.getTime() - new Date(receivedDate).getTime()) / (1000 * 60 * 60 * 24));
        const itemValue = (parseFloat(String(item.unit_price)) || 0) * (item.quantity || 1);
        
        for (const bracket of brackets) {
          if (agingDays >= bracket.minDays && (!bracket.maxDays || agingDays < bracket.maxDays)) {
            bracket.count++;
            bracket.value += itemValue;
            break;
          }
        }
      }
      
      const criticalCount = brackets[0].count + brackets[1].count; // >7 years
      
      res.json({
        total_items: items.length,
        critical_count: criticalCount,
        critical_threshold_days: 2555,
        brackets,
      });
    } catch (error) {
      console.error("[Aging] Error fetching aging summary:", error);
      res.status(500).json({ error: "Failed to fetch aging summary" });
    }
  });

  // Export aging report (CSV format)
router.get("/warehouse/aging-export", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { minDays = 2555 } = req.query;
      
      // Get user's site IDs first
      const userSites = await db.query.warehouseSites.findMany({
        where: eq(warehouseSites.user_id, req.user!.id),
      });
      const userSiteIds = userSites.map(s => s.id);
      
      const items = userSiteIds.length > 0 
        ? await db.query.warehouseInventoryItems.findMany({
            where: inArray(warehouseInventoryItems.site_id, userSiteIds),
          })
        : [];
      
      const now = new Date();
      const agingItems = items
        .map(item => {
          const receivedDate = item.last_received_date || item.created_at;
          const agingDays = Math.floor((now.getTime() - new Date(receivedDate).getTime()) / (1000 * 60 * 60 * 24));
          return { ...item, aging_days: agingDays };
        })
        .filter(item => item.aging_days >= parseInt(String(minDays)))
        .sort((a, b) => b.aging_days - a.aging_days);
      
      // Generate CSV
      const headers = ['NSN', 'Nomenclature', 'Quantity', 'Aging Days', 'Aging Years', 'Last Received', 'Condition', 'Unit Price'];
      const rows = agingItems.map(item => [
        item.nsn || '',
        item.description || '',
        item.quantity || 0,
        item.aging_days,
        Math.round(item.aging_days / 365 * 10) / 10,
        item.last_received_date ? new Date(item.last_received_date).toISOString().split('T')[0] : '',
        item.condition || '',
        item.unit_price || 0,
      ]);
      
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=aging_report_${new Date().toISOString().split('T')[0]}.csv`);
      res.send(csv);
    } catch (error) {
      console.error("[Aging] Error exporting aging report:", error);
      res.status(500).json({ error: "Failed to export aging report" });
    }
  });

  // ============================================================================
  // SITE ASSIGNMENT & CAPACITY API
  // ============================================================================

  // Get capacity for all sites
router.get("/warehouse/capacity", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.id;
      const capacities = await getAllSiteCapacities(userId);
      res.json(capacities);
    } catch (error) {
      console.error("[Capacity] Error fetching capacities:", error);
      res.status(500).json({ error: "Failed to fetch site capacities" });
    }
  });

  // Get capacity for specific site
router.get("/warehouse/capacity/:siteId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { siteId } = req.params;
      const capacity = await getSiteCapacity(parseInt(siteId));
      if (!capacity) {
        return res.status(404).json({ error: "Site not found" });
      }
      res.json(capacity);
    } catch (error) {
      console.error("[Capacity] Error fetching site capacity:", error);
      res.status(500).json({ error: "Failed to fetch site capacity" });
    }
  });

  // Get location capacities for a site
router.get("/warehouse/capacity/:siteId/locations", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { siteId } = req.params;
      const locations = await getLocationCapacities(parseInt(siteId));
      res.json(locations);
    } catch (error) {
      console.error("[Capacity] Error fetching location capacities:", error);
      res.status(500).json({ error: "Failed to fetch location capacities" });
    }
  });

  // Check if site can accept items
router.post("/warehouse/capacity/:siteId/check", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { siteId } = req.params;
      const { item_count, total_weight_lbs } = req.body;
      
      const result = await canAcceptItems(parseInt(siteId), item_count || 1, total_weight_lbs || 0);
      res.json(result);
    } catch (error) {
      console.error("[Capacity] Error checking capacity:", error);
      res.status(500).json({ error: "Failed to check capacity" });
    }
  });

  // ============================================================================
  // PRIORITY TRANSFER QUEUE ENDPOINTS
  // ============================================================================

  // GET /api/warehouse/queue - Get prioritized transfer queue
  router.get("/warehouse/queue", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { status, site_id, limit: limitParam } = req.query;
      const limitValue = limitParam ? parseInt(limitParam as string) : 50;
      const finalLimit = isNaN(limitValue) || limitValue < 1 ? 50 : Math.min(limitValue, 500);

      const sourceSite = db.select({
        id: warehouseSites.id,
        name: warehouseSites.name,
      }).from(warehouseSites).as('sourceSite');

      const destSite = db.select({
        id: warehouseSites.id,
        name: warehouseSites.name,
      }).from(warehouseSites).as('destSite');

      let conditions = [eq(warehouseTransfers.user_id, req.user!.id)];

      if (status && typeof status === 'string') {
        conditions.push(eq(warehouseTransfers.status, status));
      }

      if (site_id && typeof site_id === 'string') {
        const siteIdNum = parseInt(site_id);
        if (!isNaN(siteIdNum)) {
          conditions.push(
            or(
              eq(warehouseTransfers.source_site_id, siteIdNum),
              eq(warehouseTransfers.destination_site_id, siteIdNum)
            )!
          );
        }
      }

      const transfers = await db
        .select({
          id: warehouseTransfers.id,
          user_id: warehouseTransfers.user_id,
          source_site_id: warehouseTransfers.source_site_id,
          destination_site_id: warehouseTransfers.destination_site_id,
          status: warehouseTransfers.status,
          transport_mode: warehouseTransfers.transport_mode,
          transfer_items: warehouseTransfers.transfer_items,
          notes: warehouseTransfers.notes,
          scheduled_date: warehouseTransfers.scheduled_date,
          completed_date: warehouseTransfers.completed_date,
          priority_level: warehouseTransfers.priority_level,
          priority_score: warehouseTransfers.priority_score,
          escalated_at: warehouseTransfers.escalated_at,
          escalated_by: warehouseTransfers.escalated_by,
          queue_position: warehouseTransfers.queue_position,
          created_at: warehouseTransfers.created_at,
          updated_at: warehouseTransfers.updated_at,
          source_site_name: sourceSite.name,
          destination_site_name: destSite.name,
        })
        .from(warehouseTransfers)
        .leftJoin(sourceSite, eq(warehouseTransfers.source_site_id, sourceSite.id))
        .leftJoin(destSite, eq(warehouseTransfers.destination_site_id, destSite.id))
        .where(and(...conditions))
        .orderBy(desc(warehouseTransfers.priority_score), asc(warehouseTransfers.created_at))
        .limit(finalLimit);

      res.json(transfers);
    } catch (error) {
      console.error("[Warehouse Queue] Failed to fetch queue:", error);
      res.status(500).json({ error: "Failed to fetch transfer queue" });
    }
  });

  // GET /api/warehouse/queue/stats - Queue statistics
  router.get("/warehouse/queue/stats", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const pendingTransfers = await db
        .select({
          id: warehouseTransfers.id,
          priority_level: warehouseTransfers.priority_level,
          created_at: warehouseTransfers.created_at,
        })
        .from(warehouseTransfers)
        .where(and(
          eq(warehouseTransfers.user_id, req.user!.id),
          eq(warehouseTransfers.status, 'pending')
        ));

      const totalPending = pendingTransfers.length;

      const byPriority: Record<string, number> = {
        routine: 0,
        priority: 0,
        immediate: 0,
        flash: 0,
      };

      let totalWaitHours = 0;
      let oldestPending: Date | null = null;
      const now = new Date();

      for (const transfer of pendingTransfers) {
        const level = transfer.priority_level || 'routine';
        if (level in byPriority) {
          byPriority[level]++;
        } else {
          byPriority[level] = 1;
        }

        if (transfer.created_at) {
          const waitMs = now.getTime() - new Date(transfer.created_at).getTime();
          totalWaitHours += waitMs / (1000 * 60 * 60);

          if (!oldestPending || new Date(transfer.created_at) < oldestPending) {
            oldestPending = new Date(transfer.created_at);
          }
        }
      }

      const avgWaitHours = totalPending > 0 ? Math.round(totalWaitHours / totalPending * 10) / 10 : 0;

      res.json({
        total_pending: totalPending,
        by_priority: byPriority,
        avg_wait_hours: avgWaitHours,
        oldest_pending: oldestPending?.toISOString() || null,
      });
    } catch (error) {
      console.error("[Warehouse Queue] Failed to fetch stats:", error);
      res.status(500).json({ error: "Failed to fetch queue statistics" });
    }
  });

  // PATCH /api/warehouse/transfers/:id/priority - Update transfer priority
  router.patch("/warehouse/transfers/:id/priority", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const transferId = parseInt(req.params.id);
      if (isNaN(transferId)) {
        return res.status(400).json({ error: "Invalid transfer ID" });
      }

      const { priority_level } = req.body;
      const validLevels = ['routine', 'priority', 'immediate', 'flash'];

      if (!priority_level || !validLevels.includes(priority_level)) {
        return res.status(400).json({ 
          error: "Invalid priority_level. Must be one of: routine, priority, immediate, flash" 
        });
      }

      const [existingTransfer] = await db
        .select()
        .from(warehouseTransfers)
        .where(and(
          eq(warehouseTransfers.id, transferId),
          eq(warehouseTransfers.user_id, req.user!.id)
        ));

      if (!existingTransfer) {
        return res.status(404).json({ error: "Transfer not found" });
      }

      const basePriorityScore: Record<string, number> = {
        routine: 25,
        priority: 50,
        immediate: 75,
        flash: 100,
      };

      let priorityScore = basePriorityScore[priority_level];

      if (existingTransfer.created_at) {
        const waitMs = new Date().getTime() - new Date(existingTransfer.created_at).getTime();
        const waitHours = waitMs / (1000 * 60 * 60);
        if (waitHours > 24) {
          priorityScore += 10;
        }
      }

      const items = existingTransfer.transfer_items as any[];
      if (Array.isArray(items)) {
        const hasHighValue = items.some((item: any) => {
          const unitPrice = parseFloat(item.unit_price) || 0;
          return unitPrice > 1000;
        });
        if (hasHighValue) {
          priorityScore += 5;
        }
      }

      const [updated] = await db
        .update(warehouseTransfers)
        .set({
          priority_level,
          priority_score: priorityScore,
          updated_at: new Date(),
        })
        .where(eq(warehouseTransfers.id, transferId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("[Warehouse Queue] Failed to update priority:", error);
      res.status(500).json({ error: "Failed to update transfer priority" });
    }
  });

  // POST /api/warehouse/transfers/:id/escalate - Escalate a transfer
  router.post("/warehouse/transfers/:id/escalate", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const transferId = parseInt(req.params.id);
      if (isNaN(transferId)) {
        return res.status(400).json({ error: "Invalid transfer ID" });
      }

      const [existingTransfer] = await db
        .select()
        .from(warehouseTransfers)
        .where(and(
          eq(warehouseTransfers.id, transferId),
          eq(warehouseTransfers.user_id, req.user!.id)
        ));

      if (!existingTransfer) {
        return res.status(404).json({ error: "Transfer not found" });
      }

      const newPriorityScore = (existingTransfer.priority_score || 0) + 20;

      const [updated] = await db
        .update(warehouseTransfers)
        .set({
          escalated_at: new Date(),
          escalated_by: req.user!.id,
          priority_score: newPriorityScore,
          updated_at: new Date(),
        })
        .where(eq(warehouseTransfers.id, transferId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("[Warehouse Queue] Failed to escalate transfer:", error);
      res.status(500).json({ error: "Failed to escalate transfer" });
    }
  });

  // POST /api/warehouse/queue/recalculate - Recalculate all queue positions
  router.post("/warehouse/queue/recalculate", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const pendingTransfers = await db
        .select({
          id: warehouseTransfers.id,
          priority_score: warehouseTransfers.priority_score,
          created_at: warehouseTransfers.created_at,
        })
        .from(warehouseTransfers)
        .where(and(
          eq(warehouseTransfers.user_id, req.user!.id),
          eq(warehouseTransfers.status, 'pending')
        ))
        .orderBy(desc(warehouseTransfers.priority_score), asc(warehouseTransfers.created_at));

      let updatedCount = 0;
      for (let i = 0; i < pendingTransfers.length; i++) {
        const queuePosition = i + 1;
        await db
          .update(warehouseTransfers)
          .set({ 
            queue_position: queuePosition,
            updated_at: new Date(),
          })
          .where(eq(warehouseTransfers.id, pendingTransfers[i].id));
        updatedCount++;
      }

      res.json({
        success: true,
        message: `Recalculated queue positions for ${updatedCount} pending transfers`,
        updated_count: updatedCount,
      });
    } catch (error) {
      console.error("[Warehouse Queue] Failed to recalculate queue:", error);
      res.status(500).json({ error: "Failed to recalculate queue positions" });
    }
  });

  // ============================================================================
  // SITE ASSIGNMENT LOGIC
  // ============================================================================

  interface SiteScore {
    siteId: number;
    siteName: string;
    score: number;
    reasons: string[];
    capacity: {
      utilizationPercent: number;
      openPalletPositions: number;
      status: 'green' | 'yellow' | 'red';
    };
  }

  // Recommend best site for incoming material
router.post("/warehouse/assign-site", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { 
        item_count = 1,
        total_weight_lbs = 0,
        preferred_aor,
        avoid_shipyard = false,
        priority = 'routine' // routine, priority, immediate
      } = req.body;
      
      // Get all sites with capacity data
      const sites = await db.query.warehouseSites.findMany({
        where: eq(warehouseSites.user_id, req.user!.id),
      });
      
      if (sites.length === 0) {
        return res.json({
          recommendation: null,
          message: "No warehouse sites available",
          scored_sites: [],
        });
      }
      
      const scoredSites: SiteScore[] = [];
      
      for (const site of sites) {
        const capacity = await getSiteCapacity(site.id);
        if (!capacity) continue;
        
        let score = 100;
        const reasons: string[] = [];
        
        // Check if site can physically accept the items
        const canAccept = await canAcceptItems(site.id, item_count, total_weight_lbs);
        if (!canAccept.canAccept) {
          score = 0;
          reasons.push(`Cannot accept: ${canAccept.reason}`);
        } else {
          // Score based on capacity utilization (prefer lower utilization)
          const utilizationPenalty = capacity.utilizationPercent * 0.5;
          score -= utilizationPenalty;
          
          if (capacity.status === 'red') {
            score -= 30;
            reasons.push('Site at critical capacity (>90%)');
          } else if (capacity.status === 'yellow') {
            score -= 15;
            reasons.push('Site at high capacity (70-90%)');
          } else {
            reasons.push('Site has good capacity (<70%)');
          }
          
          // AOR matching bonus
          if (preferred_aor && site.aor === preferred_aor) {
            score += 25;
            reasons.push(`Matches preferred AOR: ${preferred_aor}`);
          }
          
          // Shipyard avoidance
          if (avoid_shipyard && site.shipyard_code) {
            score -= 20;
            reasons.push('Site is a shipyard location');
          }
          
          // Weight capacity consideration
          const weightUtilization = capacity.weightUtilizationPercent;
          if (weightUtilization > 80) {
            score -= 10;
            reasons.push('Weight capacity limited');
          }
          
          // Open positions bonus
          if (capacity.openPalletPositions > item_count * 2) {
            score += 10;
            reasons.push('Has extra capacity for future items');
          }
        }
        
        scoredSites.push({
          siteId: site.id,
          siteName: site.name,
          score: Math.max(0, Math.round(score)),
          reasons,
          capacity: {
            utilizationPercent: capacity.utilizationPercent,
            openPalletPositions: capacity.openPalletPositions,
            status: capacity.status,
          },
        });
      }
      
      // Sort by score descending
      scoredSites.sort((a, b) => b.score - a.score);
      
      const recommendation = scoredSites.length > 0 && scoredSites[0].score > 0 
        ? scoredSites[0] 
        : null;
      
      res.json({
        recommendation,
        scored_sites: scoredSites,
        criteria_used: {
          item_count,
          total_weight_lbs,
          preferred_aor,
          avoid_shipyard,
          priority,
        },
      });
    } catch (error) {
      console.error("[Assignment] Error assigning site:", error);
      res.status(500).json({ error: "Failed to assign site" });
    }
  });

  // ============================================================================
  // CROSS-SITE INVENTORY VISIBILITY API
  // ============================================================================

  // GET /api/warehouse/thresholds - Get all site thresholds with site names
  router.get("/warehouse/thresholds", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { site_id, nsn } = req.query;
      
      // Build query with joins
      let query = db.select({
        id: siteThresholds.id,
        site_id: siteThresholds.site_id,
        site_name: warehouseSites.name,
        site_code: warehouseSites.code,
        nsn: siteThresholds.nsn,
        min_quantity: siteThresholds.min_quantity,
        max_quantity: siteThresholds.max_quantity,
        reorder_point: siteThresholds.reorder_point,
        last_reviewed_at: siteThresholds.last_reviewed_at,
        reviewed_by: siteThresholds.reviewed_by,
        created_at: siteThresholds.created_at,
        updated_at: siteThresholds.updated_at,
      })
        .from(siteThresholds)
        .leftJoin(warehouseSites, eq(siteThresholds.site_id, warehouseSites.id));
      
      // Apply filters
      const conditions = [];
      if (site_id) {
        conditions.push(eq(siteThresholds.site_id, parseInt(site_id as string)));
      }
      if (nsn) {
        conditions.push(eq(siteThresholds.nsn, nsn as string));
      }
      
      const thresholds = conditions.length > 0
        ? await query.where(and(...conditions))
        : await query;
      
      res.json(thresholds);
    } catch (error) {
      console.error("[Warehouse] Failed to fetch thresholds:", error);
      res.status(500).json({ error: "Failed to fetch site thresholds" });
    }
  });

  // POST /api/warehouse/thresholds - Create/update threshold (upsert)
  router.post("/warehouse/thresholds", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { site_id, nsn, min_quantity, max_quantity, reorder_point } = req.body;
      
      if (!site_id || !nsn) {
        return res.status(400).json({ error: "site_id and nsn are required" });
      }
      
      // Check if threshold already exists for this site_id + nsn combination
      const [existing] = await db.select()
        .from(siteThresholds)
        .where(and(
          eq(siteThresholds.site_id, site_id),
          eq(siteThresholds.nsn, nsn)
        ));
      
      if (existing) {
        // Update existing threshold
        const [updated] = await db.update(siteThresholds)
          .set({
            min_quantity: min_quantity ?? existing.min_quantity,
            max_quantity: max_quantity ?? existing.max_quantity,
            reorder_point: reorder_point ?? existing.reorder_point,
            last_reviewed_at: new Date(),
            reviewed_by: req.user!.id,
            updated_at: new Date(),
          })
          .where(eq(siteThresholds.id, existing.id))
          .returning();
        
        return res.json(updated);
      }
      
      // Create new threshold
      const [created] = await db.insert(siteThresholds)
        .values({
          site_id,
          nsn,
          min_quantity: min_quantity ?? 0,
          max_quantity: max_quantity ?? 1000,
          reorder_point: reorder_point ?? 10,
          last_reviewed_at: new Date(),
          reviewed_by: req.user!.id,
        })
        .returning();
      
      res.status(201).json(created);
    } catch (error) {
      console.error("[Warehouse] Failed to upsert threshold:", error);
      res.status(500).json({ error: "Failed to create/update threshold" });
    }
  });

  // DELETE /api/warehouse/thresholds/:id - Delete threshold
  router.delete("/warehouse/thresholds/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const thresholdId = parseInt(req.params.id);
      if (isNaN(thresholdId)) {
        return res.status(400).json({ error: "Invalid threshold ID" });
      }
      
      const [deleted] = await db.delete(siteThresholds)
        .where(eq(siteThresholds.id, thresholdId))
        .returning();
      
      if (!deleted) {
        return res.status(404).json({ error: "Threshold not found" });
      }
      
      res.json({ success: true, deleted });
    } catch (error) {
      console.error("[Warehouse] Failed to delete threshold:", error);
      res.status(500).json({ error: "Failed to delete threshold" });
    }
  });

  // GET /api/warehouse/network/inventory - Network-wide inventory matrix
  router.get("/warehouse/network/inventory", authMiddleware, async (req: AuthRequest, res) => {
    try {
      // Get all user's sites
      const userSites = await db.select()
        .from(warehouseSites)
        .where(eq(warehouseSites.user_id, req.user!.id));
      
      const siteIds = userSites.map(s => s.id);
      if (siteIds.length === 0) {
        return res.json([]);
      }
      
      // Aggregate inventory by NSN across all sites
      const inventoryByNsn = await db.select({
        nsn: warehouseInventoryItems.nsn,
        description: warehouseInventoryItems.description,
        site_id: warehouseInventoryItems.site_id,
        total_quantity: sql<number>`CAST(COALESCE(SUM(${warehouseInventoryItems.quantity}), 0) AS INTEGER)`,
      })
        .from(warehouseInventoryItems)
        .where(and(
          inArray(warehouseInventoryItems.site_id, siteIds),
          isNotNull(warehouseInventoryItems.nsn)
        ))
        .groupBy(warehouseInventoryItems.nsn, warehouseInventoryItems.description, warehouseInventoryItems.site_id);
      
      // Get thresholds for all sites
      const thresholds = await db.select()
        .from(siteThresholds)
        .where(inArray(siteThresholds.site_id, siteIds));
      
      // Create threshold lookup map
      const thresholdMap = new Map<string, typeof thresholds[number]>();
      for (const t of thresholds) {
        thresholdMap.set(`${t.site_id}_${t.nsn}`, t);
      }
      
      // Create site lookup map
      const siteMap = new Map(userSites.map(s => [s.id, s]));
      
      // Group by NSN and build matrix
      const nsnMap = new Map<string, {
        nsn: string;
        description: string | null;
        sites: Array<{
          site_id: number;
          name: string;
          code: string | null;
          quantity: number;
          status: 'ok' | 'low' | 'critical' | 'surplus';
          threshold: {
            min_quantity: number;
            max_quantity: number;
            reorder_point: number;
          } | null;
        }>;
        total_quantity: number;
      }>();
      
      for (const item of inventoryByNsn) {
        if (!item.nsn) continue;
        
        const site = siteMap.get(item.site_id);
        if (!site) continue;
        
        const threshold = thresholdMap.get(`${item.site_id}_${item.nsn}`);
        const quantity = item.total_quantity;
        
        // Determine status
        let status: 'ok' | 'low' | 'critical' | 'surplus' = 'ok';
        if (threshold) {
          if (quantity > threshold.max_quantity) {
            status = 'surplus';
          } else if (quantity < (threshold.min_quantity ?? 0)) {
            status = 'critical';
          } else if (quantity < threshold.reorder_point) {
            status = 'low';
          }
        }
        
        if (!nsnMap.has(item.nsn)) {
          nsnMap.set(item.nsn, {
            nsn: item.nsn,
            description: item.description,
            sites: [],
            total_quantity: 0,
          });
        }
        
        const entry = nsnMap.get(item.nsn)!;
        entry.sites.push({
          site_id: site.id,
          name: site.name,
          code: site.code,
          quantity,
          status,
          threshold: threshold ? {
            min_quantity: threshold.min_quantity,
            max_quantity: threshold.max_quantity,
            reorder_point: threshold.reorder_point,
          } : null,
        });
        entry.total_quantity += quantity;
      }
      
      res.json(Array.from(nsnMap.values()));
    } catch (error) {
      console.error("[Warehouse] Failed to fetch network inventory:", error);
      res.status(500).json({ error: "Failed to fetch network inventory" });
    }
  });

  // GET /api/warehouse/network/shortages - Find items below reorder point
  router.get("/warehouse/network/shortages", authMiddleware, async (req: AuthRequest, res) => {
    try {
      // Get all user's sites
      const userSites = await db.select()
        .from(warehouseSites)
        .where(eq(warehouseSites.user_id, req.user!.id));
      
      const siteIds = userSites.map(s => s.id);
      if (siteIds.length === 0) {
        return res.json([]);
      }
      
      // Get all thresholds for user's sites
      const thresholds = await db.select({
        id: siteThresholds.id,
        site_id: siteThresholds.site_id,
        site_name: warehouseSites.name,
        site_code: warehouseSites.code,
        nsn: siteThresholds.nsn,
        min_quantity: siteThresholds.min_quantity,
        max_quantity: siteThresholds.max_quantity,
        reorder_point: siteThresholds.reorder_point,
      })
        .from(siteThresholds)
        .leftJoin(warehouseSites, eq(siteThresholds.site_id, warehouseSites.id))
        .where(inArray(siteThresholds.site_id, siteIds));
      
      // Get inventory quantities by site and NSN
      const inventory = await db.select({
        nsn: warehouseInventoryItems.nsn,
        description: warehouseInventoryItems.description,
        site_id: warehouseInventoryItems.site_id,
        total_quantity: sql<number>`CAST(COALESCE(SUM(${warehouseInventoryItems.quantity}), 0) AS INTEGER)`,
      })
        .from(warehouseInventoryItems)
        .where(and(
          inArray(warehouseInventoryItems.site_id, siteIds),
          isNotNull(warehouseInventoryItems.nsn)
        ))
        .groupBy(warehouseInventoryItems.nsn, warehouseInventoryItems.description, warehouseInventoryItems.site_id);
      
      // Create inventory lookup
      const inventoryMap = new Map<string, { quantity: number; description: string | null }>();
      for (const inv of inventory) {
        if (inv.nsn) {
          inventoryMap.set(`${inv.site_id}_${inv.nsn}`, { quantity: inv.total_quantity, description: inv.description });
        }
      }
      
      // Find shortages (quantity < reorder_point)
      const shortages: Array<{
        site_id: number;
        site_name: string | null;
        site_code: string | null;
        nsn: string;
        description: string | null;
        current_quantity: number;
        reorder_point: number;
        shortage_amount: number;
        recommended_sources: Array<{
          site_id: number;
          site_name: string;
          available_surplus: number;
        }>;
      }> = [];
      
      for (const t of thresholds) {
        const invKey = `${t.site_id}_${t.nsn}`;
        const invData = inventoryMap.get(invKey);
        const quantity = invData?.quantity ?? 0;
        
        if (quantity < t.reorder_point) {
          // Find potential source sites with surplus for this NSN
          const recommendedSources: Array<{
            site_id: number;
            site_name: string;
            available_surplus: number;
          }> = [];
          
          for (const other of thresholds) {
            if (other.site_id !== t.site_id && other.nsn === t.nsn) {
              const otherInv = inventoryMap.get(`${other.site_id}_${other.nsn}`);
              const otherQuantity = otherInv?.quantity ?? 0;
              if (otherQuantity > other.max_quantity) {
                recommendedSources.push({
                  site_id: other.site_id,
                  site_name: other.site_name || 'Unknown',
                  available_surplus: otherQuantity - other.max_quantity,
                });
              }
            }
          }
          
          shortages.push({
            site_id: t.site_id,
            site_name: t.site_name,
            site_code: t.site_code,
            nsn: t.nsn,
            description: invData?.description ?? null,
            current_quantity: quantity,
            reorder_point: t.reorder_point,
            shortage_amount: t.reorder_point - quantity,
            recommended_sources: recommendedSources.sort((a, b) => b.available_surplus - a.available_surplus),
          });
        }
      }
      
      // Sort by shortage amount descending (most critical first)
      shortages.sort((a, b) => b.shortage_amount - a.shortage_amount);
      
      res.json(shortages);
    } catch (error) {
      console.error("[Warehouse] Failed to fetch shortages:", error);
      res.status(500).json({ error: "Failed to fetch shortages" });
    }
  });

  // GET /api/warehouse/network/surpluses - Find items above max quantity
  router.get("/warehouse/network/surpluses", authMiddleware, async (req: AuthRequest, res) => {
    try {
      // Get all user's sites
      const userSites = await db.select()
        .from(warehouseSites)
        .where(eq(warehouseSites.user_id, req.user!.id));
      
      const siteIds = userSites.map(s => s.id);
      if (siteIds.length === 0) {
        return res.json([]);
      }
      
      // Get all thresholds for user's sites
      const thresholds = await db.select({
        id: siteThresholds.id,
        site_id: siteThresholds.site_id,
        site_name: warehouseSites.name,
        site_code: warehouseSites.code,
        nsn: siteThresholds.nsn,
        min_quantity: siteThresholds.min_quantity,
        max_quantity: siteThresholds.max_quantity,
        reorder_point: siteThresholds.reorder_point,
      })
        .from(siteThresholds)
        .leftJoin(warehouseSites, eq(siteThresholds.site_id, warehouseSites.id))
        .where(inArray(siteThresholds.site_id, siteIds));
      
      // Get inventory quantities by site and NSN
      const inventory = await db.select({
        nsn: warehouseInventoryItems.nsn,
        description: warehouseInventoryItems.description,
        site_id: warehouseInventoryItems.site_id,
        total_quantity: sql<number>`CAST(COALESCE(SUM(${warehouseInventoryItems.quantity}), 0) AS INTEGER)`,
      })
        .from(warehouseInventoryItems)
        .where(and(
          inArray(warehouseInventoryItems.site_id, siteIds),
          isNotNull(warehouseInventoryItems.nsn)
        ))
        .groupBy(warehouseInventoryItems.nsn, warehouseInventoryItems.description, warehouseInventoryItems.site_id);
      
      // Create inventory lookup
      const inventoryMap = new Map<string, { quantity: number; description: string | null }>();
      for (const inv of inventory) {
        if (inv.nsn) {
          inventoryMap.set(`${inv.site_id}_${inv.nsn}`, { quantity: inv.total_quantity, description: inv.description });
        }
      }
      
      // Find surpluses (quantity > max_quantity)
      const surpluses: Array<{
        site_id: number;
        site_name: string | null;
        site_code: string | null;
        nsn: string;
        description: string | null;
        current_quantity: number;
        max_quantity: number;
        surplus_amount: number;
        recommended_destinations: Array<{
          site_id: number;
          site_name: string;
          shortage_amount: number;
        }>;
      }> = [];
      
      for (const t of thresholds) {
        const invKey = `${t.site_id}_${t.nsn}`;
        const invData = inventoryMap.get(invKey);
        const quantity = invData?.quantity ?? 0;
        
        if (quantity > t.max_quantity) {
          // Find potential destination sites with shortages for this NSN
          const recommendedDestinations: Array<{
            site_id: number;
            site_name: string;
            shortage_amount: number;
          }> = [];
          
          for (const other of thresholds) {
            if (other.site_id !== t.site_id && other.nsn === t.nsn) {
              const otherInv = inventoryMap.get(`${other.site_id}_${other.nsn}`);
              const otherQuantity = otherInv?.quantity ?? 0;
              if (otherQuantity < other.reorder_point) {
                recommendedDestinations.push({
                  site_id: other.site_id,
                  site_name: other.site_name || 'Unknown',
                  shortage_amount: other.reorder_point - otherQuantity,
                });
              }
            }
          }
          
          surpluses.push({
            site_id: t.site_id,
            site_name: t.site_name,
            site_code: t.site_code,
            nsn: t.nsn,
            description: invData?.description ?? null,
            current_quantity: quantity,
            max_quantity: t.max_quantity,
            surplus_amount: quantity - t.max_quantity,
            recommended_destinations: recommendedDestinations.sort((a, b) => b.shortage_amount - a.shortage_amount),
          });
        }
      }
      
      // Sort by surplus amount descending (most surplus first)
      surpluses.sort((a, b) => b.surplus_amount - a.surplus_amount);
      
      res.json(surpluses);
    } catch (error) {
      console.error("[Warehouse] Failed to fetch surpluses:", error);
      res.status(500).json({ error: "Failed to fetch surpluses" });
    }
  });

  // ============================================================================
  // INBOUND CARGO VISIBILITY
  // ============================================================================

  // GET /api/warehouse/inbound/:siteId - Get all inbound cargo for a site
  router.get("/warehouse/inbound/:siteId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Query manifests destined for this site
      const inboundManifests = await db.select({
        id: crossModalManifests.id,
        manifest_number: crossModalManifests.manifest_number,
        name: crossModalManifests.name,
        transport_mode: crossModalManifests.transport_mode,
        status: crossModalManifests.status,
        total_weight_lbs: crossModalManifests.total_weight_lbs,
        total_items: crossModalManifests.total_items,
        estimated_arrival: crossModalManifests.estimated_arrival,
        scheduled_departure: crossModalManifests.estimated_departure,
        source_site_id: crossModalManifests.source_site_id,
        priority: crossModalManifests.priority,
      })
        .from(crossModalManifests)
        .where(and(
          eq(crossModalManifests.destination_site_id, siteId),
          inArray(crossModalManifests.status, ['pending_transport', 'assigned', 'in_transit'])
        ))
        .orderBy(asc(crossModalManifests.estimated_arrival));

      // Get source site names
      const sourceSiteIds = Array.from(new Set(inboundManifests.map(m => m.source_site_id).filter(Boolean))) as number[];
      const sourceSites = sourceSiteIds.length > 0
        ? await db.select({ id: warehouseSites.id, name: warehouseSites.name })
            .from(warehouseSites)
            .where(inArray(warehouseSites.id, sourceSiteIds))
        : [];
      const siteNameMap = new Map(sourceSites.map(s => [s.id, s.name]));

      // Get items for each manifest
      const manifestIds = inboundManifests.map(m => m.id);
      const items = manifestIds.length > 0
        ? await db.select()
            .from(manifestItems)
            .where(inArray(manifestItems.manifest_id, manifestIds))
        : [];
      const itemsByManifest = new Map<number, typeof items>();
      for (const item of items) {
        const list = itemsByManifest.get(item.manifest_id) || [];
        list.push(item);
        itemsByManifest.set(item.manifest_id, list);
      }

      // Also query inbound transfers
      const inboundTransfers = await db.select({
        id: warehouseTransfers.id,
        status: warehouseTransfers.status,
        transport_mode: warehouseTransfers.transport_mode,
        scheduled_date: warehouseTransfers.scheduled_date,
        total_weight_lbs: warehouseTransfers.total_weight_lbs,
        transfer_items: warehouseTransfers.transfer_items,
        source_site_id: warehouseTransfers.source_site_id,
        priority_level: warehouseTransfers.priority_level,
      })
        .from(warehouseTransfers)
        .where(and(
          eq(warehouseTransfers.destination_site_id, siteId),
          inArray(warehouseTransfers.status, ['pending', 'manifest_created', 'transport_assigned', 'in_transit'])
        ))
        .orderBy(asc(warehouseTransfers.scheduled_date));

      // Get source site names for transfers
      const transferSourceIds = Array.from(new Set(inboundTransfers.map(t => t.source_site_id).filter(Boolean))) as number[];
      const transferSourceSites = transferSourceIds.length > 0
        ? await db.select({ id: warehouseSites.id, name: warehouseSites.name })
            .from(warehouseSites)
            .where(inArray(warehouseSites.id, transferSourceIds))
        : [];
      for (const s of transferSourceSites) {
        siteNameMap.set(s.id, s.name);
      }

      // Combine results
      const result = {
        manifests: inboundManifests.map(m => ({
          id: m.id,
          manifest_number: m.manifest_number,
          name: m.name,
          transport_mode: m.transport_mode || 'unknown',
          status: m.status,
          eta: m.estimated_arrival,
          origin_site_name: siteNameMap.get(m.source_site_id!) || 'Unknown',
          items: itemsByManifest.get(m.id) || [],
          weight_lbs: m.total_weight_lbs,
          item_count: m.total_items,
          priority: m.priority,
        })),
        transfers: inboundTransfers.map(t => ({
          id: t.id,
          type: 'transfer' as const,
          transport_mode: t.transport_mode || 'ground',
          status: t.status,
          eta: t.scheduled_date,
          origin_site_name: siteNameMap.get(t.source_site_id) || 'Unknown',
          items: t.transfer_items as any[],
          weight_lbs: t.total_weight_lbs ? parseFloat(t.total_weight_lbs as string) : 0,
          item_count: Array.isArray(t.transfer_items) ? (t.transfer_items as any[]).length : 0,
          priority: t.priority_level,
        })),
      };

      res.json(result);
    } catch (error) {
      console.error("[Warehouse] Failed to fetch inbound cargo:", error);
      res.status(500).json({ error: "Failed to fetch inbound cargo" });
    }
  });

  // GET /api/warehouse/inbound/:siteId/timeline - Arrival timeline for next 14 days
  router.get("/warehouse/inbound/:siteId/timeline", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const now = new Date();
      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + 14);

      // Query manifests for next 14 days
      const inboundManifests = await db.select({
        id: crossModalManifests.id,
        transport_mode: crossModalManifests.transport_mode,
        total_weight_lbs: crossModalManifests.total_weight_lbs,
        total_items: crossModalManifests.total_items,
        estimated_arrival: crossModalManifests.estimated_arrival,
      })
        .from(crossModalManifests)
        .where(and(
          eq(crossModalManifests.destination_site_id, siteId),
          inArray(crossModalManifests.status, ['pending_transport', 'assigned', 'in_transit']),
          gte(crossModalManifests.estimated_arrival, now),
          lte(crossModalManifests.estimated_arrival, endDate)
        ));

      // Query transfers for next 14 days
      const inboundTransfers = await db.select({
        id: warehouseTransfers.id,
        transport_mode: warehouseTransfers.transport_mode,
        total_weight_lbs: warehouseTransfers.total_weight_lbs,
        transfer_items: warehouseTransfers.transfer_items,
        scheduled_date: warehouseTransfers.scheduled_date,
      })
        .from(warehouseTransfers)
        .where(and(
          eq(warehouseTransfers.destination_site_id, siteId),
          inArray(warehouseTransfers.status, ['pending', 'manifest_created', 'transport_assigned', 'in_transit']),
          gte(warehouseTransfers.scheduled_date, now),
          lte(warehouseTransfers.scheduled_date, endDate)
        ));

      // Group by date
      const timeline: Map<string, {
        date: string;
        arrivals: Array<{
          manifest_id?: number;
          transfer_id?: number;
          transport_mode: string;
          weight_lbs: number;
          item_count: number;
        }>;
        total_weight_lbs: number;
      }> = new Map();

      // Initialize all 14 days
      for (let i = 0; i < 14; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        timeline.set(dateStr, {
          date: dateStr,
          arrivals: [],
          total_weight_lbs: 0,
        });
      }

      // Add manifests to timeline
      for (const m of inboundManifests) {
        if (m.estimated_arrival) {
          const dateStr = new Date(m.estimated_arrival).toISOString().split('T')[0];
          const dayData = timeline.get(dateStr);
          if (dayData) {
            const weight = m.total_weight_lbs || 0;
            dayData.arrivals.push({
              manifest_id: m.id,
              transport_mode: m.transport_mode || 'unknown',
              weight_lbs: weight,
              item_count: m.total_items || 0,
            });
            dayData.total_weight_lbs += weight;
          }
        }
      }

      // Add transfers to timeline
      for (const t of inboundTransfers) {
        if (t.scheduled_date) {
          const dateStr = new Date(t.scheduled_date).toISOString().split('T')[0];
          const dayData = timeline.get(dateStr);
          if (dayData) {
            const weight = t.total_weight_lbs ? parseFloat(t.total_weight_lbs as string) : 0;
            const itemCount = Array.isArray(t.transfer_items) ? (t.transfer_items as any[]).length : 0;
            dayData.arrivals.push({
              transfer_id: t.id,
              transport_mode: t.transport_mode || 'ground',
              weight_lbs: weight,
              item_count: itemCount,
            });
            dayData.total_weight_lbs += weight;
          }
        }
      }

      res.json(Array.from(timeline.values()));
    } catch (error) {
      console.error("[Warehouse] Failed to fetch inbound timeline:", error);
      res.status(500).json({ error: "Failed to fetch inbound timeline" });
    }
  });

  // ============================================================================
  // CAPACITY FORECASTING
  // ============================================================================

  // GET /api/warehouse/forecasts/:siteId - Get capacity forecasts for a site
  router.get("/warehouse/forecasts/:siteId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const days = parseInt(req.query.days as string) || 30;

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const now = new Date();
      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + days);

      // Query forecasts for the site
      const forecasts = await db.select()
        .from(capacityForecasts)
        .where(and(
          eq(capacityForecasts.site_id, siteId),
          gte(capacityForecasts.forecast_date, now.toISOString().split('T')[0]),
          lte(capacityForecasts.forecast_date, endDate.toISOString().split('T')[0])
        ))
        .orderBy(asc(capacityForecasts.forecast_date));

      res.json({
        site_id: siteId,
        site_name: site.name,
        forecasts: forecasts.map(f => ({
          date: f.forecast_date,
          projected_utilization: parseFloat(f.projected_utilization as string),
          projected_inbound_lbs: f.projected_inbound_lbs,
          projected_outbound_lbs: f.projected_outbound_lbs,
          confidence_score: f.confidence_score ? parseFloat(f.confidence_score as string) : 0.8,
        })),
      });
    } catch (error) {
      console.error("[Warehouse] Failed to fetch capacity forecasts:", error);
      res.status(500).json({ error: "Failed to fetch capacity forecasts" });
    }
  });

  // POST /api/warehouse/forecasts/generate - Generate forecasts for all user's sites
  router.post("/warehouse/forecasts/generate", authMiddleware, async (req: AuthRequest, res) => {
    try {
      // Get all sites for the user
      const sites = await db.select()
        .from(warehouseSites)
        .where(eq(warehouseSites.user_id, req.user!.id));

      if (sites.length === 0) {
        return res.status(404).json({ error: "No warehouse sites found" });
      }

      const now = new Date();
      const forecastDays = 30;
      const generatedForecasts: any[] = [];

      for (const site of sites) {
        // Get current utilization (approximate using zone capacity)
        const zones = await db.select()
          .from(warehouseZones)
          .innerJoin(warehouseBuildings, eq(warehouseZones.building_id, warehouseBuildings.id))
          .where(eq(warehouseBuildings.site_id, site.id));

        const totalCapacity = zones.reduce((sum, z) => sum + (z.warehouse_zones.capacity_pallets || 0), 0);
        
        // Get current inventory count
        const [inventoryCount] = await db.select({ count: count() })
          .from(warehouseInventoryItems)
          .where(eq(warehouseInventoryItems.site_id, site.id));
        
        const currentUtilization = totalCapacity > 0 
          ? (Number(inventoryCount?.count || 0) / totalCapacity) * 100
          : 50;

        // Get scheduled inbound for next 30 days
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + forecastDays);

        const inboundManifests = await db.select({
          estimated_arrival: crossModalManifests.estimated_arrival,
          total_weight_lbs: crossModalManifests.total_weight_lbs,
        })
          .from(crossModalManifests)
          .where(and(
            eq(crossModalManifests.destination_site_id, site.id),
            inArray(crossModalManifests.status, ['pending_transport', 'assigned', 'in_transit']),
            gte(crossModalManifests.estimated_arrival, now),
            lte(crossModalManifests.estimated_arrival, endDate)
          ));

        // Get scheduled outbound
        const outboundManifests = await db.select({
          estimated_departure: crossModalManifests.estimated_departure,
          total_weight_lbs: crossModalManifests.total_weight_lbs,
        })
          .from(crossModalManifests)
          .where(and(
            eq(crossModalManifests.source_site_id, site.id),
            inArray(crossModalManifests.status, ['pending_transport', 'assigned', 'in_transit']),
            gte(crossModalManifests.estimated_departure, now),
            lte(crossModalManifests.estimated_departure, endDate)
          ));

        // Group by date
        const inboundByDate = new Map<string, number>();
        for (const m of inboundManifests) {
          if (m.estimated_arrival) {
            const dateStr = new Date(m.estimated_arrival).toISOString().split('T')[0];
            inboundByDate.set(dateStr, (inboundByDate.get(dateStr) || 0) + (m.total_weight_lbs || 0));
          }
        }

        const outboundByDate = new Map<string, number>();
        for (const m of outboundManifests) {
          if (m.estimated_departure) {
            const dateStr = new Date(m.estimated_departure).toISOString().split('T')[0];
            outboundByDate.set(dateStr, (outboundByDate.get(dateStr) || 0) + (m.total_weight_lbs || 0));
          }
        }

        // Delete existing forecasts for this site
        await db.delete(capacityForecasts)
          .where(eq(capacityForecasts.site_id, site.id));

        // Generate forecasts for each day
        let projectedUtilization = currentUtilization;
        const dailyDecay = 0.5; // Natural throughput reduces utilization slightly

        for (let i = 0; i < forecastDays; i++) {
          const forecastDate = new Date(now);
          forecastDate.setDate(forecastDate.getDate() + i);
          const dateStr = forecastDate.toISOString().split('T')[0];

          const inboundLbs = inboundByDate.get(dateStr) || 0;
          const outboundLbs = outboundByDate.get(dateStr) || 0;

          // Simple projection: increase with inbound, decrease with outbound
          const utilizationChange = totalCapacity > 0
            ? ((inboundLbs - outboundLbs) / (totalCapacity * 2000)) * 100 // Assume avg pallet = 2000 lbs
            : 0;

          projectedUtilization = Math.max(0, Math.min(100, projectedUtilization + utilizationChange - dailyDecay));

          const [forecast] = await db.insert(capacityForecasts).values({
            site_id: site.id,
            forecast_date: dateStr,
            projected_utilization: projectedUtilization.toFixed(2),
            projected_inbound_lbs: inboundLbs,
            projected_outbound_lbs: outboundLbs,
            confidence_score: Math.max(0.5, 0.95 - (i * 0.015)).toFixed(2), // Confidence decreases over time
          }).returning();

          generatedForecasts.push(forecast);
        }
      }

      res.json({
        success: true,
        message: `Generated ${generatedForecasts.length} forecasts for ${sites.length} sites`,
        forecast_count: generatedForecasts.length,
        sites_processed: sites.length,
      });
    } catch (error) {
      console.error("[Warehouse] Failed to generate forecasts:", error);
      res.status(500).json({ error: "Failed to generate forecasts" });
    }
  });

  // ============================================================================
  // REBALANCING SUGGESTIONS
  // ============================================================================

  // GET /api/warehouse/rebalancing - Get all pending rebalancing suggestions
  router.get("/warehouse/rebalancing", authMiddleware, async (req: AuthRequest, res) => {
    try {
      // Get all user's site IDs first
      const userSites = await db.select({ id: warehouseSites.id })
        .from(warehouseSites)
        .where(eq(warehouseSites.user_id, req.user!.id));
      
      const userSiteIds = userSites.map(s => s.id);

      if (userSiteIds.length === 0) {
        return res.json([]);
      }

      // Get pending suggestions where source or destination is user's site
      const suggestions = await db.select()
        .from(rebalancingSuggestions)
        .where(and(
          eq(rebalancingSuggestions.status, 'pending'),
          or(
            inArray(rebalancingSuggestions.source_site_id, userSiteIds),
            inArray(rebalancingSuggestions.destination_site_id, userSiteIds)
          )
        ))
        .orderBy(desc(sql`CASE 
          WHEN ${rebalancingSuggestions.priority} = 'critical' THEN 4
          WHEN ${rebalancingSuggestions.priority} = 'high' THEN 3
          WHEN ${rebalancingSuggestions.priority} = 'medium' THEN 2
          ELSE 1
        END`));

      // Get site names
      const siteIds = Array.from(new Set([
        ...suggestions.map(s => s.source_site_id),
        ...suggestions.map(s => s.destination_site_id)
      ]));

      const sites = siteIds.length > 0
        ? await db.select({ id: warehouseSites.id, name: warehouseSites.name, code: warehouseSites.code })
            .from(warehouseSites)
            .where(inArray(warehouseSites.id, siteIds))
        : [];
      const siteMap = new Map(sites.map(s => [s.id, s]));

      const result = suggestions.map(s => ({
        id: s.id,
        source_site_id: s.source_site_id,
        source_site_name: siteMap.get(s.source_site_id)?.name || 'Unknown',
        source_site_code: siteMap.get(s.source_site_id)?.code || '',
        destination_site_id: s.destination_site_id,
        destination_site_name: siteMap.get(s.destination_site_id)?.name || 'Unknown',
        destination_site_code: siteMap.get(s.destination_site_id)?.code || '',
        suggested_items: s.suggested_items,
        total_weight_lbs: s.total_weight_lbs,
        reason: s.reason,
        priority: s.priority,
        status: s.status,
        created_at: s.created_at,
        expires_at: s.expires_at,
      }));

      res.json(result);
    } catch (error) {
      console.error("[Warehouse] Failed to fetch rebalancing suggestions:", error);
      res.status(500).json({ error: "Failed to fetch rebalancing suggestions" });
    }
  });

  // POST /api/warehouse/rebalancing/generate - Generate new rebalancing suggestions
  router.post("/warehouse/rebalancing/generate", authMiddleware, async (req: AuthRequest, res) => {
    try {
      // Get user's sites with their thresholds
      const sites = await db.select()
        .from(warehouseSites)
        .where(eq(warehouseSites.user_id, req.user!.id));

      if (sites.length < 2) {
        return res.json({
          success: true,
          message: "Need at least 2 sites for rebalancing analysis",
          suggestions_created: 0,
        });
      }

      const siteIds = sites.map(s => s.id);

      // Get thresholds for all user's sites
      const thresholds = await db.select()
        .from(siteThresholds)
        .where(inArray(siteThresholds.site_id, siteIds));

      // Group inventory by NSN and site
      const inventory = await db.select({
        site_id: warehouseInventoryItems.site_id,
        nsn: warehouseInventoryItems.nsn,
        quantity: sql<number>`CAST(SUM(${warehouseInventoryItems.quantity}) AS INTEGER)`,
        description: sql<string>`MAX(${warehouseInventoryItems.description})`,
        weight_lbs: sql<number>`CAST(AVG(${warehouseInventoryItems.weight_lbs}) AS INTEGER)`,
      })
        .from(warehouseInventoryItems)
        .where(and(
          inArray(warehouseInventoryItems.site_id, siteIds),
          isNotNull(warehouseInventoryItems.nsn)
        ))
        .groupBy(warehouseInventoryItems.site_id, warehouseInventoryItems.nsn);

      // Build maps for quick lookup
      const thresholdMap = new Map<string, typeof thresholds[0]>();
      for (const t of thresholds) {
        thresholdMap.set(`${t.site_id}_${t.nsn}`, t);
      }

      const inventoryMap = new Map<string, typeof inventory[0]>();
      for (const inv of inventory) {
        if (inv.nsn) {
          inventoryMap.set(`${inv.site_id}_${inv.nsn}`, inv);
        }
      }

      // Find shortages and surpluses
      const shortages: Array<{
        site_id: number;
        nsn: string;
        shortage_amount: number;
        description: string | null;
      }> = [];

      const surpluses: Array<{
        site_id: number;
        nsn: string;
        surplus_amount: number;
        description: string | null;
        weight_per_unit: number;
      }> = [];

      for (const t of thresholds) {
        const invKey = `${t.site_id}_${t.nsn}`;
        const inv = inventoryMap.get(invKey);
        const quantity = inv?.quantity ?? 0;

        if (quantity < t.reorder_point) {
          shortages.push({
            site_id: t.site_id,
            nsn: t.nsn,
            shortage_amount: t.reorder_point - quantity,
            description: inv?.description || null,
          });
        } else if (quantity > t.max_quantity) {
          surpluses.push({
            site_id: t.site_id,
            nsn: t.nsn,
            surplus_amount: quantity - t.max_quantity,
            description: inv?.description || null,
            weight_per_unit: inv?.weight_lbs || 10,
          });
        }
      }

      // Delete old pending suggestions
      await db.delete(rebalancingSuggestions)
        .where(and(
          eq(rebalancingSuggestions.status, 'pending'),
          or(
            inArray(rebalancingSuggestions.source_site_id, siteIds),
            inArray(rebalancingSuggestions.destination_site_id, siteIds)
          )
        ));

      // Generate suggestions matching surpluses to shortages
      const newSuggestions: any[] = [];
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // Suggestions expire in 7 days

      for (const surplus of surpluses) {
        // Find matching shortages for same NSN at different sites
        const matchingShortages = shortages.filter(s => 
          s.nsn === surplus.nsn && s.site_id !== surplus.site_id
        );

        for (const shortage of matchingShortages) {
          const transferQuantity = Math.min(surplus.surplus_amount, shortage.shortage_amount);
          if (transferQuantity <= 0) continue;

          const totalWeight = transferQuantity * surplus.weight_per_unit;
          const priority = shortage.shortage_amount > 100 ? 'high' : 
                          shortage.shortage_amount > 50 ? 'medium' : 'low';

          const [suggestion] = await db.insert(rebalancingSuggestions).values({
            source_site_id: surplus.site_id,
            destination_site_id: shortage.site_id,
            suggested_items: [{
              nsn: surplus.nsn,
              quantity: transferQuantity,
              description: surplus.description,
              weight_lbs: surplus.weight_per_unit,
            }],
            total_weight_lbs: totalWeight,
            reason: `Transfer ${transferQuantity} units of ${surplus.nsn} to address shortage (${shortage.shortage_amount} units below reorder point)`,
            priority,
            status: 'pending',
            expires_at: expiresAt,
          }).returning();

          newSuggestions.push(suggestion);

          // Reduce remaining amounts
          surplus.surplus_amount -= transferQuantity;
          shortage.shortage_amount -= transferQuantity;
        }
      }

      res.json({
        success: true,
        message: `Generated ${newSuggestions.length} rebalancing suggestions`,
        suggestions_created: newSuggestions.length,
        shortages_found: shortages.length,
        surpluses_found: surpluses.length,
      });
    } catch (error) {
      console.error("[Warehouse] Failed to generate rebalancing suggestions:", error);
      res.status(500).json({ error: "Failed to generate rebalancing suggestions" });
    }
  });

  // PATCH /api/warehouse/rebalancing/:id - Approve or reject a suggestion
  router.patch("/warehouse/rebalancing/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const suggestionId = parseInt(req.params.id);
      if (isNaN(suggestionId)) {
        return res.status(400).json({ error: "Invalid suggestion ID" });
      }

      const { status } = req.body;
      if (!status || !['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: "Status must be 'approved' or 'rejected'" });
      }

      // Verify suggestion exists and user has access
      const [suggestion] = await db.select()
        .from(rebalancingSuggestions)
        .where(eq(rebalancingSuggestions.id, suggestionId));

      if (!suggestion) {
        return res.status(404).json({ error: "Rebalancing suggestion not found" });
      }

      // Verify user owns one of the sites
      const [sourceSite] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, suggestion.source_site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      const [destSite] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, suggestion.destination_site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!sourceSite && !destSite) {
        return res.status(403).json({ error: "Access denied to this suggestion" });
      }

      const updateData: any = { status };
      if (status === 'approved') {
        updateData.approved_by = req.user!.id;
      }

      const [updated] = await db.update(rebalancingSuggestions)
        .set(updateData)
        .where(eq(rebalancingSuggestions.id, suggestionId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("[Warehouse] Failed to update rebalancing suggestion:", error);
      res.status(500).json({ error: "Failed to update rebalancing suggestion" });
    }
  });

  // POST /api/warehouse/rebalancing/:id/execute - Execute an approved suggestion
  router.post("/warehouse/rebalancing/:id/execute", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const suggestionId = parseInt(req.params.id);
      if (isNaN(suggestionId)) {
        return res.status(400).json({ error: "Invalid suggestion ID" });
      }

      // Get the suggestion
      const [suggestion] = await db.select()
        .from(rebalancingSuggestions)
        .where(eq(rebalancingSuggestions.id, suggestionId));

      if (!suggestion) {
        return res.status(404).json({ error: "Rebalancing suggestion not found" });
      }

      if (suggestion.status !== 'approved') {
        return res.status(400).json({ error: "Suggestion must be approved before execution" });
      }

      // Verify user owns one of the sites
      const [sourceSite] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, suggestion.source_site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      const [destSite] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, suggestion.destination_site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!sourceSite && !destSite) {
        return res.status(403).json({ error: "Access denied to this suggestion" });
      }

      // Create the warehouse transfer
      const [transfer] = await db.insert(warehouseTransfers).values({
        user_id: req.user!.id,
        source_site_id: suggestion.source_site_id,
        destination_site_id: suggestion.destination_site_id,
        status: 'pending',
        transport_mode: 'ground',
        transfer_items: suggestion.suggested_items,
        total_weight_lbs: suggestion.total_weight_lbs.toString(),
        priority_level: suggestion.priority === 'critical' ? 'immediate' : 
                       suggestion.priority === 'high' ? 'priority' : 'routine',
        notes: `Executed from rebalancing suggestion #${suggestion.id}: ${suggestion.reason}`,
        scheduled_date: new Date(),
      }).returning();

      // Update suggestion status and link to transfer
      const [updatedSuggestion] = await db.update(rebalancingSuggestions)
        .set({
          status: 'executed',
          executed_transfer_id: transfer.id,
        })
        .where(eq(rebalancingSuggestions.id, suggestionId))
        .returning();

      res.json({
        success: true,
        message: "Rebalancing suggestion executed successfully",
        suggestion: updatedSuggestion,
        transfer: transfer,
      });
    } catch (error) {
      console.error("[Warehouse] Failed to execute rebalancing suggestion:", error);
      res.status(500).json({ error: "Failed to execute rebalancing suggestion" });
    }
  });

// ============================================================================
// TRANSPORT RESERVATIONS API
// ============================================================================

// GET /api/warehouse/reservations - Get all reservations with filters
router.get("/warehouse/reservations", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { site_id, date_from, date_to, status } = req.query;

    const conditions: any[] = [];

    if (site_id) {
      conditions.push(eq(transportReservations.site_id, parseInt(site_id as string)));
    }
    if (date_from) {
      conditions.push(gte(transportReservations.reservation_date, date_from as string));
    }
    if (date_to) {
      conditions.push(lte(transportReservations.reservation_date, date_to as string));
    }
    if (status) {
      conditions.push(eq(transportReservations.status, status as string));
    }

    const reservations = await db
      .select({
        id: transportReservations.id,
        site_id: transportReservations.site_id,
        site_name: warehouseSites.name,
        site_code: warehouseSites.code,
        transport_mode: transportReservations.transport_mode,
        asset_type: transportReservations.asset_type,
        reserved_capacity_lbs: transportReservations.reserved_capacity_lbs,
        reservation_date: transportReservations.reservation_date,
        time_slot: transportReservations.time_slot,
        purpose: transportReservations.purpose,
        transfer_id: transportReservations.transfer_id,
        reserved_by: transportReservations.reserved_by,
        status: transportReservations.status,
        created_at: transportReservations.created_at,
      })
      .from(transportReservations)
      .leftJoin(warehouseSites, eq(transportReservations.site_id, warehouseSites.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(transportReservations.reservation_date), desc(transportReservations.created_at));

    res.json(reservations);
  } catch (error) {
    console.error("[Warehouse] Failed to fetch reservations:", error);
    res.status(500).json({ error: "Failed to fetch reservations" });
  }
});

// POST /api/warehouse/reservations - Create a new reservation
router.post("/warehouse/reservations", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const {
      site_id,
      transport_mode,
      asset_type,
      reserved_capacity_lbs,
      reservation_date,
      time_slot,
      purpose,
      transfer_id,
    } = req.body;

    if (!site_id || !transport_mode || !reserved_capacity_lbs || !reservation_date || !purpose) {
      return res.status(400).json({
        error: "Missing required fields: site_id, transport_mode, reserved_capacity_lbs, reservation_date, purpose",
      });
    }

    // Check for double-booking (same site, mode, date, time_slot with status=confirmed)
    const existingReservations = await db
      .select()
      .from(transportReservations)
      .where(
        and(
          eq(transportReservations.site_id, site_id),
          eq(transportReservations.transport_mode, transport_mode),
          eq(transportReservations.reservation_date, reservation_date),
          time_slot ? eq(transportReservations.time_slot, time_slot) : isNull(transportReservations.time_slot),
          eq(transportReservations.status, "confirmed")
        )
      );

    if (existingReservations.length > 0) {
      return res.status(409).json({
        error: "Double-booking detected: A confirmed reservation already exists for this site, mode, date, and time slot",
        conflicting_reservation: existingReservations[0],
      });
    }

    const [reservation] = await db
      .insert(transportReservations)
      .values({
        site_id,
        transport_mode,
        asset_type: asset_type || null,
        reserved_capacity_lbs,
        reservation_date,
        time_slot: time_slot || null,
        purpose,
        transfer_id: transfer_id || null,
        reserved_by: req.user!.id,
        status: "tentative",
      })
      .returning();

    res.status(201).json(reservation);
  } catch (error) {
    console.error("[Warehouse] Failed to create reservation:", error);
    res.status(500).json({ error: "Failed to create reservation" });
  }
});

// PATCH /api/warehouse/reservations/:id - Update reservation status
router.patch("/warehouse/reservations/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const reservationId = parseInt(req.params.id);
    if (isNaN(reservationId)) {
      return res.status(400).json({ error: "Invalid reservation ID" });
    }

    const { status } = req.body;

    if (!status || !["tentative", "confirmed", "cancelled"].includes(status)) {
      return res.status(400).json({
        error: "Invalid status. Must be one of: tentative, confirmed, cancelled",
      });
    }

    // If confirming, check for conflicts
    if (status === "confirmed") {
      const [existing] = await db
        .select()
        .from(transportReservations)
        .where(eq(transportReservations.id, reservationId));

      if (existing) {
        const conflicts = await db
          .select()
          .from(transportReservations)
          .where(
            and(
              eq(transportReservations.site_id, existing.site_id),
              eq(transportReservations.transport_mode, existing.transport_mode),
              eq(transportReservations.reservation_date, existing.reservation_date),
              existing.time_slot
                ? eq(transportReservations.time_slot, existing.time_slot)
                : isNull(transportReservations.time_slot),
              eq(transportReservations.status, "confirmed"),
              sql`${transportReservations.id} != ${reservationId}`
            )
          );

        if (conflicts.length > 0) {
          return res.status(409).json({
            error: "Cannot confirm: A confirmed reservation already exists for this slot",
            conflicting_reservation: conflicts[0],
          });
        }
      }
    }

    const [updated] = await db
      .update(transportReservations)
      .set({ status })
      .where(eq(transportReservations.id, reservationId))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error("[Warehouse] Failed to update reservation:", error);
    res.status(500).json({ error: "Failed to update reservation" });
  }
});

// DELETE /api/warehouse/reservations/:id - Cancel/delete a reservation
router.delete("/warehouse/reservations/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const reservationId = parseInt(req.params.id);
    if (isNaN(reservationId)) {
      return res.status(400).json({ error: "Invalid reservation ID" });
    }

    const [deleted] = await db
      .delete(transportReservations)
      .where(eq(transportReservations.id, reservationId))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    res.json({ success: true, message: "Reservation deleted successfully", reservation: deleted });
  } catch (error) {
    console.error("[Warehouse] Failed to delete reservation:", error);
    res.status(500).json({ error: "Failed to delete reservation" });
  }
});

// GET /api/warehouse/reservations/calendar - Calendar view of reservations
router.get("/warehouse/reservations/calendar", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { site_id, month } = req.query;

    if (!month || !/^\d{4}-\d{2}$/.test(month as string)) {
      return res.status(400).json({ error: "month parameter required in YYYY-MM format" });
    }

    const monthStart = `${month}-01`;
    const [year, monthNum] = (month as string).split("-").map(Number);
    const lastDay = new Date(year, monthNum, 0).getDate();
    const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;

    const conditions: any[] = [
      gte(transportReservations.reservation_date, monthStart),
      lte(transportReservations.reservation_date, monthEnd),
    ];

    if (site_id) {
      conditions.push(eq(transportReservations.site_id, parseInt(site_id as string)));
    }

    const reservations = await db
      .select({
        id: transportReservations.id,
        site_id: transportReservations.site_id,
        site_name: warehouseSites.name,
        transport_mode: transportReservations.transport_mode,
        asset_type: transportReservations.asset_type,
        reserved_capacity_lbs: transportReservations.reserved_capacity_lbs,
        reservation_date: transportReservations.reservation_date,
        time_slot: transportReservations.time_slot,
        purpose: transportReservations.purpose,
        status: transportReservations.status,
      })
      .from(transportReservations)
      .leftJoin(warehouseSites, eq(transportReservations.site_id, warehouseSites.id))
      .where(and(...conditions))
      .orderBy(asc(transportReservations.reservation_date), asc(transportReservations.time_slot));

    // Group by date and detect conflicts
    const calendarMap = new Map<string, { reservations: any[]; conflicts: boolean }>();

    for (const reservation of reservations) {
      const dateStr = reservation.reservation_date;
      if (!calendarMap.has(dateStr)) {
        calendarMap.set(dateStr, { reservations: [], conflicts: false });
      }
      calendarMap.get(dateStr)!.reservations.push(reservation);
    }

    // Detect conflicts (multiple confirmed reservations on same site/mode/time_slot)
    for (const [dateStr, data] of Array.from(calendarMap.entries())) {
      const confirmedBySlot = new Map<string, number>();
      for (const r of data.reservations) {
        if (r.status === "confirmed") {
          const key = `${r.site_id}-${r.transport_mode}-${r.time_slot || "all_day"}`;
          confirmedBySlot.set(key, (confirmedBySlot.get(key) || 0) + 1);
        }
      }
      for (const count of Array.from(confirmedBySlot.values())) {
        if (count > 1) {
          data.conflicts = true;
          break;
        }
      }
    }

    const calendar = Array.from(calendarMap.entries()).map(([date, data]) => ({
      date,
      reservations: data.reservations,
      conflicts: data.conflicts,
    }));

    res.json(calendar);
  } catch (error) {
    console.error("[Warehouse] Failed to fetch reservation calendar:", error);
    res.status(500).json({ error: "Failed to fetch reservation calendar" });
  }
});

// GET /api/warehouse/reservations/conflicts - Find conflicting reservations
router.get("/warehouse/reservations/conflicts", authMiddleware, async (req: AuthRequest, res) => {
  try {
    // Find all confirmed reservations that overlap (same site, mode, date, time_slot)
    const reservations = await db
      .select({
        id: transportReservations.id,
        site_id: transportReservations.site_id,
        site_name: warehouseSites.name,
        transport_mode: transportReservations.transport_mode,
        reservation_date: transportReservations.reservation_date,
        time_slot: transportReservations.time_slot,
        status: transportReservations.status,
        purpose: transportReservations.purpose,
        reserved_capacity_lbs: transportReservations.reserved_capacity_lbs,
      })
      .from(transportReservations)
      .leftJoin(warehouseSites, eq(transportReservations.site_id, warehouseSites.id))
      .where(eq(transportReservations.status, "confirmed"))
      .orderBy(
        asc(transportReservations.site_id),
        asc(transportReservations.reservation_date),
        asc(transportReservations.time_slot)
      );

    // Group and find duplicates
    const slotMap = new Map<string, any[]>();
    for (const r of reservations) {
      const key = `${r.site_id}-${r.transport_mode}-${r.reservation_date}-${r.time_slot || "all_day"}`;
      if (!slotMap.has(key)) {
        slotMap.set(key, []);
      }
      slotMap.get(key)!.push(r);
    }

    const conflicts: { slot: string; reservations: any[] }[] = [];
    for (const [slot, rList] of Array.from(slotMap.entries())) {
      if (rList.length > 1) {
        conflicts.push({ slot, reservations: rList });
      }
    }

    res.json({
      total_conflicts: conflicts.length,
      conflicts,
    });
  } catch (error) {
    console.error("[Warehouse] Failed to find conflicts:", error);
    res.status(500).json({ error: "Failed to find conflicts" });
  }
});

// ============================================================================
// SITE BENCHMARKING API
// ============================================================================

// GET /api/warehouse/benchmarks - Get aggregated metrics for all sites
router.get("/warehouse/benchmarks", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { date_from, date_to } = req.query;

    // Default to last 30 days
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fromDate = date_from ? (date_from as string) : defaultFrom.toISOString().split("T")[0];
    const toDate = date_to ? (date_to as string) : now.toISOString().split("T")[0];

    const metrics = await db
      .select({
        site_id: siteMetricsDaily.site_id,
        site_name: warehouseSites.name,
        site_code: warehouseSites.code,
        total_throughput_lbs: sql<number>`CAST(SUM(${siteMetricsDaily.throughput_lbs}) AS INTEGER)`,
        total_inbound: sql<number>`CAST(SUM(${siteMetricsDaily.inbound_shipments}) AS INTEGER)`,
        total_outbound: sql<number>`CAST(SUM(${siteMetricsDaily.outbound_shipments}) AS INTEGER)`,
        avg_processing_hours: sql<number>`AVG(${siteMetricsDaily.avg_processing_hours})`,
        avg_utilization: sql<number>`AVG(${siteMetricsDaily.utilization_percent})`,
        total_items_processed: sql<number>`CAST(SUM(${siteMetricsDaily.items_processed}) AS INTEGER)`,
        total_errors: sql<number>`CAST(SUM(${siteMetricsDaily.error_count}) AS INTEGER)`,
        days_recorded: sql<number>`COUNT(*)`,
      })
      .from(siteMetricsDaily)
      .leftJoin(warehouseSites, eq(siteMetricsDaily.site_id, warehouseSites.id))
      .where(
        and(
          gte(siteMetricsDaily.metric_date, fromDate),
          lte(siteMetricsDaily.metric_date, toDate)
        )
      )
      .groupBy(siteMetricsDaily.site_id, warehouseSites.name, warehouseSites.code);

    // Calculate rankings
    const withRankings = metrics.map((m) => ({
      ...m,
      error_rate: m.total_items_processed > 0 ? (m.total_errors / m.total_items_processed) * 100 : 0,
    }));

    // Sort by throughput for ranking
    withRankings.sort((a, b) => (b.total_throughput_lbs || 0) - (a.total_throughput_lbs || 0));
    withRankings.forEach((m, i) => ((m as any).throughput_rank = i + 1));

    // Sort by avg processing time (lower is better)
    const byProcessing = [...withRankings].sort(
      (a, b) => (a.avg_processing_hours || 999) - (b.avg_processing_hours || 999)
    );
    byProcessing.forEach((m, i) => ((m as any).processing_rank = i + 1));

    // Sort by error rate (lower is better)
    const byErrors = [...withRankings].sort((a, b) => (a.error_rate || 0) - (b.error_rate || 0));
    byErrors.forEach((m, i) => ((m as any).error_rank = i + 1));

    res.json({
      date_range: { from: fromDate, to: toDate },
      sites: withRankings,
    });
  } catch (error) {
    console.error("[Warehouse] Failed to fetch benchmarks:", error);
    res.status(500).json({ error: "Failed to fetch benchmarks" });
  }
});

// GET /api/warehouse/benchmarks/leaderboard - Site rankings by category
router.get("/warehouse/benchmarks/leaderboard", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fromDate = thirtyDaysAgo.toISOString().split("T")[0];
    const toDate = now.toISOString().split("T")[0];

    const metrics = await db
      .select({
        site_id: siteMetricsDaily.site_id,
        site_name: warehouseSites.name,
        site_code: warehouseSites.code,
        total_throughput_lbs: sql<number>`CAST(SUM(${siteMetricsDaily.throughput_lbs}) AS INTEGER)`,
        avg_processing_hours: sql<number>`AVG(${siteMetricsDaily.avg_processing_hours})`,
        total_items_processed: sql<number>`CAST(SUM(${siteMetricsDaily.items_processed}) AS INTEGER)`,
        total_errors: sql<number>`CAST(SUM(${siteMetricsDaily.error_count}) AS INTEGER)`,
      })
      .from(siteMetricsDaily)
      .leftJoin(warehouseSites, eq(siteMetricsDaily.site_id, warehouseSites.id))
      .where(
        and(
          gte(siteMetricsDaily.metric_date, fromDate),
          lte(siteMetricsDaily.metric_date, toDate)
        )
      )
      .groupBy(siteMetricsDaily.site_id, warehouseSites.name, warehouseSites.code);

    const withRates = metrics.map((m) => ({
      ...m,
      error_rate: m.total_items_processed > 0 ? (m.total_errors / m.total_items_processed) * 100 : 0,
    }));

    // Top 5 by throughput
    const topThroughput = [...withRates]
      .sort((a, b) => (b.total_throughput_lbs || 0) - (a.total_throughput_lbs || 0))
      .slice(0, 5)
      .map((m, i) => ({ rank: i + 1, site_id: m.site_id, site_name: m.site_name, value: m.total_throughput_lbs }));

    // Top 5 by processing time (lowest)
    const topProcessing = [...withRates]
      .filter((m) => m.avg_processing_hours !== null)
      .sort((a, b) => (a.avg_processing_hours || 999) - (b.avg_processing_hours || 999))
      .slice(0, 5)
      .map((m, i) => ({
        rank: i + 1,
        site_id: m.site_id,
        site_name: m.site_name,
        value: Number(m.avg_processing_hours?.toFixed(2)),
      }));

    // Top 5 by lowest error rate
    const topErrorRate = [...withRates]
      .sort((a, b) => (a.error_rate || 0) - (b.error_rate || 0))
      .slice(0, 5)
      .map((m, i) => ({
        rank: i + 1,
        site_id: m.site_id,
        site_name: m.site_name,
        value: Number(m.error_rate.toFixed(2)),
      }));

    res.json({
      date_range: { from: fromDate, to: toDate },
      leaderboards: {
        throughput: { metric: "total_throughput_lbs", unit: "lbs", top: topThroughput },
        processing_time: { metric: "avg_processing_hours", unit: "hours", top: topProcessing },
        error_rate: { metric: "error_rate", unit: "%", top: topErrorRate },
      },
    });
  } catch (error) {
    console.error("[Warehouse] Failed to fetch leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// GET /api/warehouse/benchmarks/:siteId - Site-specific metrics with trends
router.get("/warehouse/benchmarks/:siteId", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const siteId = parseInt(req.params.siteId);
    if (isNaN(siteId)) {
      return res.status(400).json({ error: "Invalid site ID" });
    }

    const { date_from, date_to } = req.query;

    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fromDate = date_from ? (date_from as string) : defaultFrom.toISOString().split("T")[0];
    const toDate = date_to ? (date_to as string) : now.toISOString().split("T")[0];

    // Get daily metrics
    const dailyMetrics = await db
      .select()
      .from(siteMetricsDaily)
      .where(
        and(
          eq(siteMetricsDaily.site_id, siteId),
          gte(siteMetricsDaily.metric_date, fromDate),
          lte(siteMetricsDaily.metric_date, toDate)
        )
      )
      .orderBy(asc(siteMetricsDaily.metric_date));

    // Calculate trends (compare first half to second half)
    const midpoint = Math.floor(dailyMetrics.length / 2);
    const firstHalf = dailyMetrics.slice(0, midpoint);
    const secondHalf = dailyMetrics.slice(midpoint);

    const calcAvg = (arr: typeof dailyMetrics, field: keyof typeof dailyMetrics[0]) => {
      if (arr.length === 0) return 0;
      const sum = arr.reduce((acc, m) => acc + (Number(m[field]) || 0), 0);
      return sum / arr.length;
    };

    const firstThroughput = calcAvg(firstHalf, "throughput_lbs");
    const secondThroughput = calcAvg(secondHalf, "throughput_lbs");
    const throughputTrend = secondThroughput > firstThroughput ? "improving" : secondThroughput < firstThroughput ? "declining" : "stable";

    const firstProcessing = calcAvg(firstHalf, "avg_processing_hours");
    const secondProcessing = calcAvg(secondHalf, "avg_processing_hours");
    const processingTrend = secondProcessing < firstProcessing ? "improving" : secondProcessing > firstProcessing ? "declining" : "stable";

    const firstErrors = calcAvg(firstHalf, "error_count");
    const secondErrors = calcAvg(secondHalf, "error_count");
    const errorTrend = secondErrors < firstErrors ? "improving" : secondErrors > firstErrors ? "declining" : "stable";

    // Get site info
    const [site] = await db.select().from(warehouseSites).where(eq(warehouseSites.id, siteId));

    res.json({
      site: site || { id: siteId },
      date_range: { from: fromDate, to: toDate },
      daily_metrics: dailyMetrics,
      trends: {
        throughput: { trend: throughputTrend, first_period_avg: firstThroughput, second_period_avg: secondThroughput },
        processing_time: { trend: processingTrend, first_period_avg: firstProcessing, second_period_avg: secondProcessing },
        error_count: { trend: errorTrend, first_period_avg: firstErrors, second_period_avg: secondErrors },
      },
    });
  } catch (error) {
    console.error("[Warehouse] Failed to fetch site benchmarks:", error);
    res.status(500).json({ error: "Failed to fetch site benchmarks" });
  }
});

// POST /api/warehouse/benchmarks/capture - Capture today's metrics for all sites
router.post("/warehouse/benchmarks/capture", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    // Get all sites for current user
    const sites = await db
      .select()
      .from(warehouseSites)
      .where(eq(warehouseSites.user_id, req.user!.id));

    const capturedMetrics = [];

    for (const site of sites) {
      // Check if metrics already captured for today
      const [existing] = await db
        .select()
        .from(siteMetricsDaily)
        .where(and(eq(siteMetricsDaily.site_id, site.id), eq(siteMetricsDaily.metric_date, today)));

      // Count inbound transfers (destination = this site, completed today)
      const [inboundResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(warehouseTransfers)
        .where(
          and(
            eq(warehouseTransfers.destination_site_id, site.id),
            eq(warehouseTransfers.status, "completed"),
            sql`DATE(${warehouseTransfers.updated_at}) = ${today}`
          )
        );

      // Count outbound transfers (source = this site, completed today)
      const [outboundResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(warehouseTransfers)
        .where(
          and(
            eq(warehouseTransfers.source_site_id, site.id),
            eq(warehouseTransfers.status, "completed"),
            sql`DATE(${warehouseTransfers.updated_at}) = ${today}`
          )
        );

      // Sum total weight transferred today (both directions)
      const [weightResult] = await db
        .select({ total: sql<number>`COALESCE(SUM(CAST(${warehouseTransfers.total_weight_lbs} AS INTEGER)), 0)` })
        .from(warehouseTransfers)
        .where(
          and(
            or(
              eq(warehouseTransfers.source_site_id, site.id),
              eq(warehouseTransfers.destination_site_id, site.id)
            ),
            eq(warehouseTransfers.status, "completed"),
            sql`DATE(${warehouseTransfers.updated_at}) = ${today}`
          )
        );

      // Count items in inventory at this site
      const [itemsResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(warehouseInventoryItems)
        .where(eq(warehouseInventoryItems.site_id, site.id));

      // Calculate utilization (items / capacity estimate)
      const capacity = await getSiteCapacity(site.id);
      const utilizationPercent = capacity && capacity.totalPalletPositions > 0 
        ? ((capacity.totalPalletPositions - capacity.openPalletPositions) / capacity.totalPalletPositions) * 100 
        : 0;

      const metricsData = {
        site_id: site.id,
        metric_date: today,
        throughput_lbs: Number(weightResult?.total) || 0,
        inbound_shipments: Number(inboundResult?.count) || 0,
        outbound_shipments: Number(outboundResult?.count) || 0,
        avg_processing_hours: null, // Would need more data to calculate
        utilization_percent: utilizationPercent.toFixed(2),
        items_processed: (Number(inboundResult?.count) || 0) + (Number(outboundResult?.count) || 0),
        error_count: 0, // Would need error tracking to calculate
      };

      if (existing) {
        // Update existing
        const [updated] = await db
          .update(siteMetricsDaily)
          .set(metricsData)
          .where(eq(siteMetricsDaily.id, existing.id))
          .returning();
        capturedMetrics.push({ ...updated, action: "updated" });
      } else {
        // Insert new
        const [inserted] = await db.insert(siteMetricsDaily).values(metricsData).returning();
        capturedMetrics.push({ ...inserted, action: "created" });
      }
    }

    res.json({
      success: true,
      message: `Captured metrics for ${capturedMetrics.length} sites`,
      date: today,
      metrics: capturedMetrics,
    });
  } catch (error) {
    console.error("[Warehouse] Failed to capture benchmarks:", error);
    res.status(500).json({ error: "Failed to capture benchmarks" });
  }
});

// ============================================================================
// INBOUND CARGO FEED API
// ============================================================================

// GET /api/warehouse/inbound/:siteId - Get all inbound shipments for a site
router.get("/warehouse/inbound/:siteId", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const siteId = parseInt(req.params.siteId, 10);
    if (isNaN(siteId)) {
      return res.status(400).json({ error: "Invalid site ID" });
    }

    // Get transfers where this site is the destination and not yet completed
    const transfers = await db
      .select({
        id: warehouseTransfers.id,
        source_site_id: warehouseTransfers.source_site_id,
        destination_site_id: warehouseTransfers.destination_site_id,
        transport_mode: warehouseTransfers.transport_mode,
        status: warehouseTransfers.status,
        scheduled_date: warehouseTransfers.scheduled_date,
        transfer_items: warehouseTransfers.transfer_items,
        total_weight_lbs: warehouseTransfers.total_weight_lbs,
        created_at: warehouseTransfers.created_at,
      })
      .from(warehouseTransfers)
      .where(
        and(
          eq(warehouseTransfers.destination_site_id, siteId),
          inArray(warehouseTransfers.status, ["pending", "scheduled", "in_transit", "delayed"])
        )
      )
      .orderBy(asc(warehouseTransfers.scheduled_date));

    // Get source site names
    const sourceSiteIds = Array.from(new Set(transfers.map(t => t.source_site_id)));
    const sourceSites = sourceSiteIds.length > 0 
      ? await db
          .select({ id: warehouseSites.id, name: warehouseSites.name })
          .from(warehouseSites)
          .where(inArray(warehouseSites.id, sourceSiteIds))
      : [];
    const siteNameMap = Object.fromEntries(sourceSites.map(s => [s.id, s.name]));

    const shipments = transfers.map(t => {
      const items = Array.isArray(t.transfer_items) ? t.transfer_items : [];
      const itemCount = items.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0);
      const etaValue = t.scheduled_date 
        ? (t.scheduled_date instanceof Date ? t.scheduled_date.toISOString() : String(t.scheduled_date))
        : (t.created_at instanceof Date ? t.created_at.toISOString() : String(t.created_at));
      
      return {
        id: t.id,
        transferId: t.id,
        originSiteId: t.source_site_id,
        originSiteName: siteNameMap[t.source_site_id] || `Site #${t.source_site_id}`,
        transportMode: t.transport_mode || "ground",
        status: t.status,
        eta: etaValue,
        itemCount,
        totalWeight: parseFloat(t.total_weight_lbs || "0") || 0,
        items: items.map((item: any) => ({
          requisitionNo: item.requisition_no || item.requisitionNo || "",
          description: item.description || "",
          nsn: item.nsn || "",
          quantity: item.quantity || 1,
          weight: parseFloat(item.weight_lb || item.weight || "0") || 0,
        })),
      };
    });

    res.json(shipments);
  } catch (error) {
    console.error("[Warehouse] Failed to fetch inbound shipments:", error);
    res.status(500).json({ error: "Failed to fetch inbound shipments" });
  }
});

// GET /api/warehouse/inbound/:siteId/timeline - Get 14-day timeline of inbound shipments
router.get("/warehouse/inbound/:siteId/timeline", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const siteId = parseInt(req.params.siteId, 10);
    if (isNaN(siteId)) {
      return res.status(400).json({ error: "Invalid site ID" });
    }

    // Generate 14-day window
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 14);

    const todayStr = today.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    // Get transfers in this date range
    const transfers = await db
      .select({
        id: warehouseTransfers.id,
        source_site_id: warehouseTransfers.source_site_id,
        transport_mode: warehouseTransfers.transport_mode,
        status: warehouseTransfers.status,
        scheduled_date: warehouseTransfers.scheduled_date,
        transfer_items: warehouseTransfers.transfer_items,
        total_weight_lbs: warehouseTransfers.total_weight_lbs,
      })
      .from(warehouseTransfers)
      .where(
        and(
          eq(warehouseTransfers.destination_site_id, siteId),
          sql`DATE(${warehouseTransfers.scheduled_date}) >= ${todayStr}`,
          sql`DATE(${warehouseTransfers.scheduled_date}) <= ${endDateStr}`
        )
      );

    // Get source site names
    const sourceSiteIds = Array.from(new Set(transfers.map(t => t.source_site_id)));
    const sourceSites = sourceSiteIds.length > 0
      ? await db
          .select({ id: warehouseSites.id, name: warehouseSites.name })
          .from(warehouseSites)
          .where(inArray(warehouseSites.id, sourceSiteIds))
      : [];
    const siteNameMap = Object.fromEntries(sourceSites.map(s => [s.id, s.name]));

    // Build timeline by day
    const timeline: Array<{
      date: string;
      arrivalCount: number;
      totalWeight: number;
      shipments: Array<{
        transferId: number;
        originSiteName: string;
        transportMode: string;
        status: string;
        itemCount: number;
        totalWeight: number;
      }>;
    }> = [];

    for (let i = 0; i < 14; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split("T")[0];

      const dayTransfers = transfers.filter(t => {
        if (!t.scheduled_date) return false;
        const scheduledDate = t.scheduled_date instanceof Date 
          ? t.scheduled_date.toISOString().split("T")[0]
          : String(t.scheduled_date).split("T")[0];
        return scheduledDate === dateStr;
      });

      const shipments = dayTransfers.map(t => {
        const items = Array.isArray(t.transfer_items) ? t.transfer_items : [];
        const itemCount = items.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0);
        
        return {
          transferId: t.id,
          originSiteName: siteNameMap[t.source_site_id] || `Site #${t.source_site_id}`,
          transportMode: t.transport_mode || "ground",
          status: t.status,
          itemCount,
          totalWeight: parseFloat(t.total_weight_lbs || "0") || 0,
        };
      });

      timeline.push({
        date: dateStr,
        arrivalCount: shipments.length,
        totalWeight: shipments.reduce((sum, s) => sum + s.totalWeight, 0),
        shipments,
      });
    }

    res.json(timeline);
  } catch (error) {
    console.error("[Warehouse] Failed to fetch inbound timeline:", error);
    res.status(500).json({ error: "Failed to fetch inbound timeline" });
  }
});

export default router;
