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
  users
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

export default router;
