import { Router } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { storage } from "../storage";
import { aircraftService } from "../services";
import { runOptimization, OptimizationInput, AvailabilityConstraint, CargoRequirement, MixedFleetMode } from "../services/fleetOptimizer";

const router = Router();

// GET /api/aircraft-types
router.get("/aircraft-types", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const types = await aircraftService.getAllActiveAircraftTypes();
    
    const typesWithProfiles = await Promise.all(
      types.map(async (type) => {
        const profile = await aircraftService.getAircraftCapacityProfile(type.id);
        return {
          ...type,
          capacityProfile: profile,
        };
      })
    );
    
    res.json(typesWithProfiles);
  } catch (error) {
    console.error("[Aircraft] Failed to fetch aircraft types:", error);
    res.status(500).json({ error: "Failed to fetch aircraft types" });
  }
});

// GET /api/aircraft-types/:typeId/capacity
router.get("/aircraft-types/:typeId/capacity", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { typeId } = req.params;
    const { version } = req.query;
    
    const profile = await aircraftService.getAircraftCapacityProfile(
      typeId,
      version as string | undefined
    );
    
    if (!profile) {
      return res.status(404).json({ error: `No capacity profile found for aircraft type: ${typeId}` });
    }
    
    res.json(profile);
  } catch (error) {
    console.error("[Aircraft] Failed to fetch capacity profile:", error);
    res.status(500).json({ error: "Failed to fetch capacity profile" });
  }
});

// POST /api/plans/:planId/fleet-availability
router.post("/plans/:planId/fleet-availability", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const planId = parseInt(req.params.planId);
    if (isNaN(planId)) {
      return res.status(400).json({ error: "Invalid plan ID" });
    }

    const plan = await storage.getFlightPlan(planId, req.user!.id);
    if (!plan) {
      return res.status(404).json({ error: "Flight plan not found" });
    }

    const { availability, preferred_aircraft_type_id, mixed_fleet_mode, preference_strength } = req.body;
    if (!Array.isArray(availability)) {
      return res.status(400).json({ error: "availability must be an array" });
    }

    for (const item of availability) {
      if (!item.typeId || typeof item.count !== 'number') {
        return res.status(400).json({ 
          error: "Each availability item must have typeId (string) and count (number)" 
        });
      }
    }

    await aircraftService.setFleetAvailability(planId, availability);
    
    const planUpdates: Record<string, any> = {};
    if (preferred_aircraft_type_id !== undefined) {
      planUpdates.preferred_aircraft_type_id = preferred_aircraft_type_id;
    }
    if (mixed_fleet_mode !== undefined) {
      planUpdates.mixed_fleet_mode = mixed_fleet_mode;
    }
    if (preference_strength !== undefined) {
      planUpdates.preference_strength = preference_strength;
    }
    
    if (Object.keys(planUpdates).length > 0) {
      await storage.updateFlightPlan(planId, req.user!.id, planUpdates);
    }
    
    const updated = await aircraftService.getFleetAvailability(planId);
    res.json({ 
      success: true, 
      availability: updated.map(a => ({
        typeId: a.aircraft_type_id,
        count: a.available_count,
        locked: a.locked,
      }))
    });
  } catch (error) {
    console.error("[Aircraft] Failed to set fleet availability:", error);
    res.status(500).json({ error: "Failed to set fleet availability" });
  }
});

// GET /api/plans/:planId/fleet-availability
router.get("/plans/:planId/fleet-availability", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const planId = parseInt(req.params.planId);
    if (isNaN(planId)) {
      return res.status(400).json({ error: "Invalid plan ID" });
    }

    const plan = await storage.getFlightPlan(planId, req.user!.id);
    if (!plan) {
      return res.status(404).json({ error: "Flight plan not found" });
    }

    const availability = await aircraftService.getFleetAvailability(planId);
    res.json(
      availability.map(a => ({
        typeId: a.aircraft_type_id,
        count: a.available_count,
        locked: a.locked,
      }))
    );
  } catch (error) {
    console.error("[Aircraft] Failed to get fleet availability:", error);
    res.status(500).json({ error: "Failed to get fleet availability" });
  }
});

// POST /api/plans/:planId/optimize
router.post("/plans/:planId/optimize", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const planId = parseInt(req.params.planId);
    if (isNaN(planId)) {
      return res.status(400).json({ error: "Invalid plan ID" });
    }

    const plan = await storage.getFlightPlan(planId, req.user!.id);
    if (!plan) {
      return res.status(404).json({ error: "Flight plan not found" });
    }

    const availability = await aircraftService.getFleetAvailability(planId);
    
    const aircraftTypes = await aircraftService.getAllActiveAircraftTypes();
    const profileMap: Record<string, number> = {};
    
    for (const type of aircraftTypes) {
      const profile = await aircraftService.getAircraftCapacityProfile(type.id);
      if (profile) {
        profileMap[type.id] = profile.max_payload_lb;
      }
    }

    const availabilityConstraints: AvailabilityConstraint[] = availability.map(a => ({
      typeId: a.aircraft_type_id,
      count: a.available_count,
      locked: a.locked,
      maxPayloadLb: profileMap[a.aircraft_type_id] || 0,
    }));

    if (availabilityConstraints.length === 0) {
      for (const type of aircraftTypes) {
        const profile = await aircraftService.getAircraftCapacityProfile(type.id);
        availabilityConstraints.push({
          typeId: type.id,
          count: 10,
          locked: false,
          maxPayloadLb: profile?.max_payload_lb || 0,
        });
      }
    }

    const allocationData = plan.allocation_data as any;
    let cargoRequirements: CargoRequirement[] = [];
    
    if (allocationData?.items && Array.isArray(allocationData.items)) {
      cargoRequirements = allocationData.items.map((item: any, index: number) => ({
        id: item.id || item.tcn || `cargo-${index}`,
        weightLb: Number(item.weight_lb || item.weightLb || item.weight || 0),
      }));
    } else if (allocationData?.totalWeight) {
      cargoRequirements = [{
        id: 'bulk-cargo',
        weightLb: Number(allocationData.totalWeight),
      }];
    } else if (plan.total_weight_lb) {
      cargoRequirements = [{
        id: 'plan-total',
        weightLb: plan.total_weight_lb,
      }];
    }

    const mode: MixedFleetMode = (plan.mixed_fleet_mode as MixedFleetMode) || 'PREFERRED_FIRST';
    const preferenceStrength = plan.preference_strength ? Number(plan.preference_strength) : 0.5;

    const optimizationInput: OptimizationInput = {
      cargoRequirements,
      availability: availabilityConstraints,
      preferredTypeId: plan.preferred_aircraft_type_id || null,
      mode,
      preferenceStrength,
    };

    const result = runOptimization(optimizationInput);

    const savedSolution = await aircraftService.savePlanSolution({
      plan_id: planId,
      status: result.status,
      aircraft_used: result.aircraftUsed,
      unallocated_cargo_ids: result.unallocatedCargoIds,
      metrics: result.metrics,
      explanation: result.explanation,
      comparison_data: result.comparisonData || null,
    });

    res.json({
      ...result,
      solutionId: savedSolution.id,
      savedAt: savedSolution.created_at,
    });
  } catch (error) {
    console.error("[Aircraft] Optimization failed:", error);
    res.status(500).json({ 
      error: "Optimization failed", 
      details: error instanceof Error ? error.message : "Unknown error" 
    });
  }
});

export default router;
