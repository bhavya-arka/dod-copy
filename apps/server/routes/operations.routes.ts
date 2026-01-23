import { Router } from "express";
import { AuthRequest, authMiddleware, validatePaginationParam } from "../middleware";
import { db } from "../db";
import { 
  warehouseSites,
  warehouseInventoryItems,
  warehouseTransfers,
  warehouseOptimizationPlans,
  landConvoys,
  crossModalManifests,
  flightPlans,
  seaVoyages
} from "@shared/schema";
import { eq, and, or, gte, sql, inArray } from "drizzle-orm";
import { getAllSiteCapacities } from "../services/capacityService";

const router = Router();

// GET /api/operations/summary
router.get("/operations/summary", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const startTime = Date.now();
    const timings: Record<string, number> = {};
    
    const userId = req.user!.id;
    const now = new Date();
    
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    
    const t1 = Date.now();
    const [
      userSites,
      flightPlansData,
      landConvoysData,
      seaVoyagesData,
      manifestsData,
    ] = await Promise.all([
      db.query.warehouseSites.findMany({ where: eq(warehouseSites.user_id, userId) }),
      db.query.flightPlans.findMany({ where: eq(flightPlans.user_id, userId) }),
      db.query.landConvoys.findMany({ where: eq(landConvoys.user_id, userId) }),
      db.query.seaVoyages.findMany({ where: eq(seaVoyages.user_id, userId) }),
      db.query.crossModalManifests.findMany({ where: eq(crossModalManifests.user_id, userId) }),
    ]);
    timings['phase1_core_queries'] = Date.now() - t1;
    
    const userSiteIds = userSites.map(s => s.id);
    
    let inventoryItems: (typeof warehouseInventoryItems.$inferSelect)[] = [];
    let transfersData: (typeof warehouseTransfers.$inferSelect)[] = [];
    
    const t2 = Date.now();
    if (userSiteIds.length > 0) {
      const [invItems, transfers] = await Promise.all([
        db.query.warehouseInventoryItems.findMany({ 
          where: inArray(warehouseInventoryItems.site_id, userSiteIds) 
        }),
        db.query.warehouseTransfers.findMany({
          where: or(
            inArray(warehouseTransfers.source_site_id, userSiteIds),
            inArray(warehouseTransfers.destination_site_id, userSiteIds)
          )
        }),
      ]);
      inventoryItems = invItems;
      transfersData = transfers;
    }
    timings['phase2_warehouse_queries'] = Date.now() - t2;
    
    const warehouseSitesData = userSites;
    
    const isInRange = (dateStr: Date | string | null, start: Date, end: Date) => {
      if (!dateStr) return false;
      const date = new Date(dateStr);
      return date >= start && date <= end;
    };
    
    const isThisMonth = (dateStr: Date | string | null) => isInRange(dateStr, thisMonthStart, now);
    const isLastMonth = (dateStr: Date | string | null) => isInRange(dateStr, lastMonthStart, lastMonthEnd);
    
    const activeMissions = {
      air: flightPlansData.filter(p => ['complete', 'scheduled'].includes(p.status || '')).length,
      land: landConvoysData.filter(c => ['in_transit', 'loading', 'planned'].includes(c.status || '')).length,
      sea: seaVoyagesData.filter(v => ['in_transit', 'loading', 'planned'].includes(v.status || '')).length,
      total: 0,
    };
    activeMissions.total = activeMissions.air + activeMissions.land + activeMissions.sea;
    
    const cargoInTransport = {
      air_lbs: flightPlansData
        .filter(p => p.status === 'complete')
        .reduce((sum, p) => sum + (p.total_weight_lb || 0), 0),
      land_lbs: landConvoysData
        .filter(c => c.status === 'in_transit')
        .reduce((sum, c) => sum + (c.total_cargo_weight_lbs || 0), 0),
      sea_lbs: seaVoyagesData
        .filter(v => v.status === 'in_transit')
        .reduce((sum, v) => sum + ((v.metadata as any)?.container_count || 0) * 45000, 0),
      total_lbs: 0,
    };
    cargoInTransport.total_lbs = cargoInTransport.air_lbs + cargoInTransport.land_lbs + cargoInTransport.sea_lbs;
    
    const getEffectiveDate = (scheduled: Date | null, created: Date) => scheduled || created;
    const airThisMonth = flightPlansData.filter(p => isThisMonth(getEffectiveDate(p.scheduled_departure, p.created_at)));
    const airLastMonth = flightPlansData.filter(p => isLastMonth(getEffectiveDate(p.scheduled_departure, p.created_at)));
    const airCompleted = flightPlansData.filter(p => p.status === 'complete');
    const airSummary = {
      active_sorties: flightPlansData.filter(p => p.status === 'complete').length,
      total_missions: flightPlansData.length,
      cargo_in_flight_lbs: cargoInTransport.air_lbs,
      total_aircraft_deployed: flightPlansData.reduce((sum, p) => sum + (p.aircraft_count || 0), 0),
      avg_load_lbs: airCompleted.length > 0 
        ? Math.round(airCompleted.reduce((sum, p) => sum + (p.total_weight_lb || 0), 0) / airCompleted.length)
        : 0,
      this_month: airThisMonth.length,
      last_month: airLastMonth.length,
      month_change: airLastMonth.length > 0 
        ? Math.round(((airThisMonth.length - airLastMonth.length) / airLastMonth.length) * 100)
        : airThisMonth.length > 0 ? 100 : 0,
      total_weight_lbs: flightPlansData.reduce((sum, p) => sum + (p.total_weight_lb || 0), 0),
    };
    
    const landThisMonth = landConvoysData.filter(c => isThisMonth(getEffectiveDate(c.scheduled_departure, c.created_at)));
    const landLastMonth = landConvoysData.filter(c => isLastMonth(getEffectiveDate(c.scheduled_departure, c.created_at)));
    const landInTransit = landConvoysData.filter(c => c.status === 'in_transit');
    const landCompleted = landConvoysData.filter(c => c.status === 'completed');
    const landSummary = {
      active_convoys: landInTransit.length,
      total_convoys: landConvoysData.length,
      cargo_in_transit_lbs: cargoInTransport.land_lbs,
      pending_dispatch: landConvoysData.filter(c => c.status === 'planned' || c.status === 'loading').length,
      completed_missions: landCompleted.length,
      avg_convoy_weight_lbs: landCompleted.length > 0
        ? Math.round(landCompleted.reduce((sum, c) => sum + (c.total_cargo_weight_lbs || 0), 0) / landCompleted.length)
        : 0,
      this_month: landThisMonth.length,
      last_month: landLastMonth.length,
      month_change: landLastMonth.length > 0 
        ? Math.round(((landThisMonth.length - landLastMonth.length) / landLastMonth.length) * 100)
        : landThisMonth.length > 0 ? 100 : 0,
      total_weight_lbs: landConvoysData.reduce((sum, c) => sum + (c.total_cargo_weight_lbs || 0), 0),
    };
    
    const seaThisMonth = seaVoyagesData.filter(v => isThisMonth(getEffectiveDate(v.scheduled_departure, v.created_at)));
    const seaLastMonth = seaVoyagesData.filter(v => isLastMonth(getEffectiveDate(v.scheduled_departure, v.created_at)));
    const seaInTransit = seaVoyagesData.filter(v => v.status === 'in_transit');
    const seaCompleted = seaVoyagesData.filter(v => v.status === 'completed');
    const totalContainers = seaVoyagesData.reduce((sum, v) => sum + ((v.metadata as any)?.container_count || 0), 0);
    const seaSummary = {
      active_voyages: seaInTransit.length,
      total_voyages: seaVoyagesData.length,
      containers_at_sea: seaInTransit.reduce((sum, v) => sum + ((v.metadata as any)?.container_count || 0), 0),
      total_teu: totalContainers,
      planned_departures: seaVoyagesData.filter(v => v.status === 'planned').length,
      completed_voyages: seaCompleted.length,
      est_cargo_at_sea_lbs: cargoInTransport.sea_lbs,
      this_month: seaThisMonth.length,
      last_month: seaLastMonth.length,
      month_change: seaLastMonth.length > 0 
        ? Math.round(((seaThisMonth.length - seaLastMonth.length) / seaLastMonth.length) * 100)
        : seaThisMonth.length > 0 ? 100 : 0,
    };
    
    const t3 = Date.now();
    const capacities = await getAllSiteCapacities(userId);
    timings['phase3_site_capacities'] = Date.now() - t3;
    
    const totalWeight = inventoryItems.reduce((sum, i) => sum + (Number(i.weight_lbs || 0) * (i.quantity || 1)), 0);
    const itemsThisMonth = inventoryItems.filter(i => isThisMonth(i.created_at));
    const itemsLastMonth = inventoryItems.filter(i => isLastMonth(i.created_at));
    const pendingTransfers = transfersData.filter(t => t.status === 'pending');
    const warehouseSummary = {
      total_sites: warehouseSitesData.length,
      total_items: inventoryItems.length,
      total_units: inventoryItems.reduce((sum, i) => sum + (i.quantity || 0), 0),
      total_weight_lbs: totalWeight,
      sites_critical: capacities.filter(c => c.status === 'red').length,
      sites_warning: capacities.filter(c => c.status === 'yellow').length,
      sites_healthy: capacities.filter(c => c.status === 'green').length,
      avg_utilization: capacities.length > 0 
        ? Math.round(capacities.reduce((sum, c) => sum + c.utilizationPercent, 0) / capacities.length)
        : 0,
      pending_transfers: pendingTransfers.length,
      items_this_month: itemsThisMonth.length,
      items_last_month: itemsLastMonth.length,
      month_change: itemsLastMonth.length > 0 
        ? Math.round(((itemsThisMonth.length - itemsLastMonth.length) / itemsLastMonth.length) * 100)
        : itemsThisMonth.length > 0 ? 100 : 0,
    };
    
    const manifestsInTransit = manifestsData.filter(m => m.status === 'in_transit');
    const manifestSummary = {
      total_manifests: manifestsData.length,
      in_transit: manifestsInTransit.length,
      awaiting_pickup: manifestsData.filter(m => m.status === 'draft').length,
      delivered: manifestsData.filter(m => m.status === 'delivered').length,
      unassigned: manifestsData.filter(m => !m.transport_mode).length,
      by_mode: {
        air: manifestsData.filter(m => m.transport_mode === 'air').length,
        land: manifestsData.filter(m => m.transport_mode === 'land').length,
        sea: manifestsData.filter(m => m.transport_mode === 'sea').length,
      },
    };
    
    const agingThreshold = 2555;
    const agingItems = inventoryItems.filter(item => {
      const receivedDate = item.last_received_date || item.created_at;
      const agingDays = Math.floor((now.getTime() - new Date(receivedDate).getTime()) / (1000 * 60 * 60 * 24));
      return agingDays >= agingThreshold;
    });
    
    timings['total'] = Date.now() - startTime;
    console.log('[Operations Summary] Timings (ms):', JSON.stringify(timings));
    
    res.json({
      activeMissions,
      cargoInTransport,
      air: airSummary,
      land: landSummary,
      sea: seaSummary,
      warehouse: warehouseSummary,
      manifests: manifestSummary,
      alerts: {
        aging_items: agingItems.length,
        critical_sites: capacities.filter(c => c.status === 'red').length,
        pending_assignments: manifestsData.filter(m => !m.transport_mode).length,
        total: agingItems.length + capacities.filter(c => c.status === 'red').length + manifestsData.filter(m => !m.transport_mode).length,
      },
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("[Operations] Error fetching summary:", error);
    res.status(500).json({ error: "Failed to fetch operations summary" });
  }
});

// GET /api/operations/predictive-forecast
router.get("/operations/predictive-forecast", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const startTime = Date.now();
    const timings: Record<string, number> = {};
    
    const userId = req.user!.id;
    const FORECAST_DAYS = validatePaginationParam(req.query.days, 1, 90, 30);
    
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const futureDate = new Date(now.getTime() + FORECAST_DAYS * msPerDay);
    
    const t1 = Date.now();
    const [
      userSites,
      flightPlansData,
      landConvoysData,
      seaVoyagesData,
      siteCapacities,
      optimizationPlansData,
      pendingTransfersData,
    ] = await Promise.all([
      db.query.warehouseSites.findMany({ where: eq(warehouseSites.user_id, userId) }),
      db.query.flightPlans.findMany({ 
        where: and(
          eq(flightPlans.user_id, userId),
          gte(flightPlans.scheduled_departure, now)
        )
      }),
      db.query.landConvoys.findMany({ 
        where: and(
          eq(landConvoys.user_id, userId),
          gte(landConvoys.scheduled_departure, now)
        )
      }),
      db.query.seaVoyages.findMany({ 
        where: and(
          eq(seaVoyages.user_id, userId),
          gte(seaVoyages.scheduled_departure, now)
        )
      }),
      getAllSiteCapacities(userId),
      db.select()
        .from(warehouseOptimizationPlans)
        .where(and(
          eq(warehouseOptimizationPlans.user_id, userId),
          sql`${warehouseOptimizationPlans.status} IN ('pending', 'in_progress')`
        )),
      db.query.warehouseTransfers.findMany({
        where: and(
          eq(warehouseTransfers.user_id, userId),
          sql`${warehouseTransfers.status} IN ('pending', 'manifest_created', 'transport_assigned', 'in_transit')`
        )
      }),
    ]);
    timings['main_queries'] = Date.now() - t1;
    
    const upcomingAir = flightPlansData.filter(p => 
      p.scheduled_departure && new Date(p.scheduled_departure) <= futureDate
    );
    const upcomingLand = landConvoysData.filter(c => 
      c.scheduled_departure && new Date(c.scheduled_departure) <= futureDate
    );
    const upcomingSea = seaVoyagesData.filter(v => 
      v.scheduled_departure && new Date(v.scheduled_departure) <= futureDate
    );
    
    const totalAirCargoLbs = upcomingAir.reduce((sum, p) => sum + (p.total_weight_lb || 0), 0);
    const totalLandCargoLbs = upcomingLand.reduce((sum, c) => sum + (c.total_cargo_weight_lbs || 0), 0);
    
    const UTILIZATION_THRESHOLD = 80;
    
    const siteMap = new Map(userSites.map(s => [s.id, s]));
    
    type InboundByMode = { air: number; land: number; sea: number; total: number };
    const inboundByDestination: Record<number, InboundByMode> = {};
    
    userSites.forEach(site => {
      inboundByDestination[site.id] = { air: 0, land: 0, sea: 0, total: 0 };
    });
    
    pendingTransfersData.forEach(transfer => {
      const destId = transfer.destination_site_id;
      const weightLbs = parseFloat(transfer.total_weight_lbs?.toString() || '0');
      const mode = transfer.transport_mode as 'air' | 'ground' | 'sea';
      
      if (inboundByDestination[destId]) {
        if (mode === 'air') {
          inboundByDestination[destId].air += weightLbs;
        } else if (mode === 'ground') {
          inboundByDestination[destId].land += weightLbs;
        } else if (mode === 'sea') {
          inboundByDestination[destId].sea += weightLbs;
        }
        inboundByDestination[destId].total += weightLbs;
      }
    });
    
    interface TransportForecast {
      siteId: number;
      siteName: string;
      inboundCargo: InboundByMode;
      currentUtilizationPercent: number;
      projectedUtilizationPercent: number;
      isAboveThreshold: boolean;
      thresholdPercent: number;
      pendingTransfers: number;
      alerts: string[];
    }
    
    const transportForecasts: TransportForecast[] = siteCapacities.map(site => {
      const inbound = inboundByDestination[site.siteId] || { air: 0, land: 0, sea: 0, total: 0 };
      const siteData = siteMap.get(site.siteId);
      
      const maxWeightLbs = Math.max(1, site.totalWeightCapacityLbs ?? 0);
      const currentWeightLbs = site.currentWeightLbs ?? 0;
      const projectedWeightLbs = currentWeightLbs + inbound.total;
      const projectedUtilization = Math.min(100, (projectedWeightLbs / maxWeightLbs) * 100);
      
      const isAboveThreshold = (site.utilizationPercent ?? 0) >= UTILIZATION_THRESHOLD;
      const willExceedThreshold = !isAboveThreshold && projectedUtilization >= UTILIZATION_THRESHOLD;
      
      const pendingCount = pendingTransfersData.filter(t => t.destination_site_id === site.siteId).length;
      
      const alerts: string[] = [];
      if (isAboveThreshold) {
        alerts.push(`Current utilization (${Math.round(site.utilizationPercent)}%) exceeds ${UTILIZATION_THRESHOLD}% threshold`);
      }
      if (!isAboveThreshold && willExceedThreshold) {
        alerts.push(`Projected utilization (${Math.round(projectedUtilization)}%) will exceed ${UTILIZATION_THRESHOLD}% after inbound cargo`);
      }
      if (inbound.total > 0) {
        alerts.push(`${Math.round(inbound.total).toLocaleString()} lbs inbound cargo pending`);
      }
      
      return {
        siteId: site.siteId,
        siteName: site.siteName,
        inboundCargo: {
          air: Math.round(inbound.air),
          land: Math.round(inbound.land),
          sea: Math.round(inbound.sea),
          total: Math.round(inbound.total),
        },
        currentUtilizationPercent: Math.round(site.utilizationPercent * 10) / 10,
        projectedUtilizationPercent: Math.round(projectedUtilization * 10) / 10,
        isAboveThreshold,
        thresholdPercent: UTILIZATION_THRESHOLD,
        pendingTransfers: pendingCount,
        alerts,
      };
    });
    
    const sitesAboveThreshold = transportForecasts.filter(f => f.isAboveThreshold).length;
    const willExceedMap = new Map(siteCapacities.map(site => {
      const inbound = inboundByDestination[site.siteId] || { air: 0, land: 0, sea: 0, total: 0 };
      const maxWeightLbs = Math.max(1, site.totalWeightCapacityLbs ?? 0);
      const currentWeightLbs = site.currentWeightLbs ?? 0;
      const projectedUtilization = Math.min(100, ((currentWeightLbs + inbound.total) / maxWeightLbs) * 100);
      const isAbove = (site.utilizationPercent ?? 0) >= UTILIZATION_THRESHOLD;
      const willExceed = !isAbove && projectedUtilization >= UTILIZATION_THRESHOLD;
      return [site.siteId, willExceed];
    }));
    const sitesWillExceedThreshold = Array.from(willExceedMap.values()).filter(Boolean).length;
    
    const currentUtilization = siteCapacities.length > 0
      ? siteCapacities.reduce((sum, c) => sum + c.utilizationPercent, 0) / siteCapacities.length
      : 0;
    
    const sitesWithWarnings = siteCapacities.filter(s => s.status === 'yellow' || s.status === 'red').length;
    
    const utilizationGrowthPerDay = 0.05;
    const siteForecasts = siteCapacities.map(site => {
      const projectedUtilization90 = Math.min(100, site.utilizationPercent + (90 * utilizationGrowthPerDay));
      const daysUntilWarning = site.utilizationPercent < 60 
        ? Math.round((60 - site.utilizationPercent) / utilizationGrowthPerDay)
        : 0;
      const daysUntilCritical = site.utilizationPercent < 85
        ? Math.round((85 - site.utilizationPercent) / utilizationGrowthPerDay)
        : 0;
      
      const trend = utilizationGrowthPerDay > 0.03 ? 'increasing' 
        : utilizationGrowthPerDay < -0.01 ? 'decreasing' 
        : 'stable';
      
      return {
        siteId: site.siteId,
        siteName: site.siteName,
        currentUtilization: site.utilizationPercent,
        projectedUtilization90: Math.round(projectedUtilization90 * 10) / 10,
        totalPalletPositions: site.totalPalletPositions,
        usedPalletPositions: site.usedPalletPositions,
        openPalletPositions: site.openPalletPositions,
        totalCubicFeet: site.totalCubicFeet,
        usedCubicFeet: site.usedCubicFeet,
        totalWeightCapacityLbs: site.totalWeightCapacityLbs,
        currentWeightLbs: site.currentWeightLbs,
        weightUtilizationPercent: site.weightUtilizationPercent,
        status: site.status,
        trend,
        daysUntilWarning: daysUntilWarning > 0 && daysUntilWarning <= 90 ? daysUntilWarning : null,
        daysUntilCritical: daysUntilCritical > 0 && daysUntilCritical <= 90 ? daysUntilCritical : null,
      };
    });
    
    timings['total'] = Date.now() - startTime;
    console.log('[Predictive Forecast] Timings (ms):', JSON.stringify(timings));
    
    res.json({
      generatedAt: now.toISOString(),
      forecastPeriodDays: FORECAST_DAYS,
      scheduledActivities: {
        upcomingFlights: upcomingAir.map(p => ({
          id: p.id,
          name: p.name,
          scheduledDeparture: p.scheduled_departure?.toISOString(),
          scheduledArrival: p.scheduled_arrival?.toISOString(),
          status: p.status,
          weightLbs: p.total_weight_lb || 0,
        })),
        upcomingConvoys: upcomingLand.map(c => ({
          id: c.id,
          name: c.name,
          scheduledDeparture: c.scheduled_departure?.toISOString(),
          scheduledArrival: c.scheduled_arrival?.toISOString(),
          status: c.status,
          weightLbs: c.total_cargo_weight_lbs || 0,
        })),
        upcomingVoyages: upcomingSea.map(v => ({
          id: v.id,
          name: v.name,
          scheduledDeparture: v.scheduled_departure?.toISOString(),
          scheduledArrival: v.scheduled_arrival?.toISOString(),
          status: v.status,
          origin: v.origin_port,
          destination: v.destination_port,
        })),
      },
      summaries: {
        air: {
          expectedFlights: upcomingAir.length,
          totalCargoLbs: totalAirCargoLbs,
          totalCargoTons: Math.round(totalAirCargoLbs / 2000 * 10) / 10,
        },
        land: {
          expectedConvoys: upcomingLand.length,
          totalCargoLbs: totalLandCargoLbs,
        },
        sea: {
          expectedVoyages: upcomingSea.length,
        },
        warehouse: {
          avgUtilization: Math.round(currentUtilization * 10) / 10,
          sitesWithWarnings,
          sitesAboveThreshold,
          sitesWillExceedThreshold,
          thresholdPercent: UTILIZATION_THRESHOLD,
        },
        transfers: {
          pending: pendingTransfersData.filter(t => t.status === 'pending').length,
          manifestCreated: pendingTransfersData.filter(t => t.status === 'manifest_created').length,
          transportAssigned: pendingTransfersData.filter(t => t.status === 'transport_assigned').length,
          inTransit: pendingTransfersData.filter(t => t.status === 'in_transit').length,
          totalInboundLbs: Math.round(pendingTransfersData.reduce((sum, t) => sum + parseFloat(t.total_weight_lbs?.toString() || '0'), 0)),
        },
        optimization: {
          activePlans: optimizationPlansData.length,
          plansWithTargetDate: optimizationPlansData.filter(p => {
            const ctx = p.comparison_context as Record<string, unknown> | null;
            return ctx?.target_completion_date;
          }).length,
          totalPendingMoves: optimizationPlansData.reduce((sum, p) => sum + (p.total_actions - p.completed_actions), 0),
        },
      },
      transportForecasts,
      siteForecasts,
      optimizationForecasts: optimizationPlansData
        .filter(p => {
          const ctx = p.comparison_context as Record<string, unknown> | null;
          return ctx?.target_completion_date;
        })
        .map(p => {
          const site = siteCapacities.find(s => s.siteId === p.site_id);
          const pendingMoves = p.total_actions - p.completed_actions;
          const summary = typeof p.summary === 'object' && p.summary !== null ? p.summary as Record<string, unknown> : {};
          const estimatedSlotsFreed = (summary.slotsFreed as number) || 0;
          const comparisonContext = p.comparison_context as Record<string, unknown> | null;
          const targetDate = comparisonContext?.target_completion_date as string | undefined;
          
          return {
            planId: p.id,
            planName: p.name,
            siteId: p.site_id,
            siteName: site?.siteName || 'Unknown',
            algorithm: p.algorithm,
            status: p.status,
            targetCompletionDate: targetDate,
            totalActions: p.total_actions,
            completedActions: p.completed_actions,
            pendingMoves,
            progressPercent: p.total_actions > 0 ? Math.round((p.completed_actions / p.total_actions) * 100) : 0,
            estimatedCapacityImpact: {
              slotsFreed: estimatedSlotsFreed,
              projectedUtilizationChange: site 
                ? Math.round((estimatedSlotsFreed / Math.max(1, site.totalPalletPositions)) * 100 * 10) / 10 
                : 0,
            },
          };
        }),
    });
  } catch (error) {
    console.error("[Operations] Error generating predictive forecast:", error);
    res.status(500).json({ error: "Failed to generate predictive forecast" });
  }
});

export default router;
