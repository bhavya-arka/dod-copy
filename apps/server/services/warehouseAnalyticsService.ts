import { db } from '../db';
import { 
  warehouseZones, 
  warehouseZoneCapacityHistory,
  warehouseInventoryItems,
  warehouseOptimizationEvents,
  warehouseMetricSnapshots,
  warehouseAlerts,
  warehouseSites,
  warehouseItemMovements,
  warehouseCapacitySnapshots
} from '@shared/schema';
import type { WarehouseAlert, WarehouseMetricSnapshot } from '@shared/schema';
import { eq, and, gte, lte, sql, desc, isNull, count } from 'drizzle-orm';

const CAPACITY_WARNING_THRESHOLD = 85;
const CAPACITY_CRITICAL_THRESHOLD = 95;
const TREND_ALERT_THRESHOLD = 10;
const AGING_DAYS_THRESHOLD = 2555;
const DEDUP_HOURS = 24;

export interface TrendMetric {
  date: string;
  metricKey: string;
  value: number;
  zoneId?: number;
  zoneName?: string;
}

async function checkDuplicateAlert(
  siteId: number, 
  entityType: string,
  entityId: number | null | undefined,
  alertType: string
): Promise<boolean> {
  const cutoffTime = new Date(Date.now() - DEDUP_HOURS * 60 * 60 * 1000);
  
  const conditions = [
    eq(warehouseAlerts.site_id, siteId),
    eq(warehouseAlerts.entity_type, entityType),
    eq(warehouseAlerts.alert_type, alertType),
    eq(warehouseAlerts.is_resolved, false),
    gte(warehouseAlerts.created_at, cutoffTime)
  ];

  if (entityId !== null && entityId !== undefined) {
    conditions.push(eq(warehouseAlerts.entity_id, entityId));
  } else {
    conditions.push(isNull(warehouseAlerts.entity_id));
  }

  const existingAlerts = await db.select()
    .from(warehouseAlerts)
    .where(and(...conditions))
    .limit(1);
  
  return existingAlerts.length > 0;
}

async function createAlert(params: {
  siteId: number;
  alertType: 'threshold_capacity' | 'threshold_aging' | 'trend_throughput' | 'trend_dwell_time';
  severity: 'info' | 'warning' | 'critical';
  entityType: 'zone' | 'site' | 'item';
  entityId: number;
  entityName: string;
  message: string;
  metricValue?: number;
  thresholdValue?: number;
  trendChangePercent?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const isDuplicate = await checkDuplicateAlert(
    params.siteId, 
    params.entityType, 
    params.entityId, 
    params.alertType
  );
  
  if (isDuplicate) {
    console.log(`[Analytics] Skipping duplicate alert: ${params.entityType}_${params.entityId}_${params.alertType}`);
    return;
  }

  await db.insert(warehouseAlerts).values({
    site_id: params.siteId,
    alert_type: params.alertType,
    severity: params.severity,
    entity_type: params.entityType,
    entity_id: params.entityId,
    entity_name: params.entityName,
    message: params.message,
    metric_value: params.metricValue !== undefined ? String(params.metricValue) : null,
    threshold_value: params.thresholdValue !== undefined ? String(params.thresholdValue) : null,
    trend_change_percent: params.trendChangePercent !== undefined ? String(params.trendChangePercent) : null,
    metadata: params.metadata || {},
  });
  
  console.log(`[Analytics] Created alert: ${params.message}`);
}

async function analyzeCapacityThresholds(siteId: number): Promise<void> {
  const zones = await db.select()
    .from(warehouseZones)
    .where(eq(warehouseZones.site_id, siteId));

  for (const zone of zones) {
    const rackAvailable = zone.rack_available || 0;
    if (rackAvailable === 0) continue;
    
    const rackOpen = zone.rack_open || 0;
    const rackUsed = rackAvailable - rackOpen;
    const utilization = (rackUsed / rackAvailable) * 100;

    if (utilization >= CAPACITY_CRITICAL_THRESHOLD) {
      await createAlert({
        siteId,
        alertType: 'threshold_capacity',
        severity: 'critical',
        entityType: 'zone',
        entityId: zone.id,
        entityName: zone.name,
        message: `Zone ${zone.name} at ${Math.round(utilization)}% capacity — consider redistributing inventory`,
        metricValue: utilization,
        thresholdValue: CAPACITY_CRITICAL_THRESHOLD,
        metadata: { utilization, rackAvailable, rackOpen, rackUsed },
      });
    } else if (utilization >= CAPACITY_WARNING_THRESHOLD) {
      await createAlert({
        siteId,
        alertType: 'threshold_capacity',
        severity: 'warning',
        entityType: 'zone',
        entityId: zone.id,
        entityName: zone.name,
        message: `Zone ${zone.name} at ${Math.round(utilization)}% capacity — consider redistributing inventory`,
        metricValue: utilization,
        thresholdValue: CAPACITY_WARNING_THRESHOLD,
        metadata: { utilization, rackAvailable, rackOpen, rackUsed },
      });
    }
  }
}

async function analyzeTrends(siteId: number): Promise<void> {
  const zones = await db.select()
    .from(warehouseZones)
    .where(eq(warehouseZones.site_id, siteId));

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  for (const zone of zones) {
    const currentWeekHistory = await db.select()
      .from(warehouseZoneCapacityHistory)
      .where(and(
        eq(warehouseZoneCapacityHistory.zone_id, zone.id),
        gte(warehouseZoneCapacityHistory.captured_at, sevenDaysAgo)
      ));

    const previousWeekHistory = await db.select()
      .from(warehouseZoneCapacityHistory)
      .where(and(
        eq(warehouseZoneCapacityHistory.zone_id, zone.id),
        gte(warehouseZoneCapacityHistory.captured_at, fourteenDaysAgo),
        lte(warehouseZoneCapacityHistory.captured_at, sevenDaysAgo)
      ));

    if (currentWeekHistory.length === 0 || previousWeekHistory.length === 0) {
      continue;
    }

    const avgCurrentUtil = currentWeekHistory.reduce((sum, h) => {
      const capacity = h.total_capacity || 1;
      const itemCount = h.current_item_count || 0;
      return sum + (itemCount / capacity) * 100;
    }, 0) / currentWeekHistory.length;
    
    const avgPreviousUtil = previousWeekHistory.reduce((sum, h) => {
      const capacity = h.total_capacity || 1;
      const itemCount = h.current_item_count || 0;
      return sum + (itemCount / capacity) * 100;
    }, 0) / previousWeekHistory.length;

    // Skip if no capacity data
    if (avgCurrentUtil === 0 || avgPreviousUtil === 0) continue;

    const changePercent = ((avgCurrentUtil - avgPreviousUtil) / avgPreviousUtil) * 100;
    
    // Guard against NaN
    if (isNaN(changePercent) || !isFinite(changePercent)) {
      continue;
    }

    if (changePercent > TREND_ALERT_THRESHOLD) {
      await createAlert({
        siteId,
        alertType: 'trend_throughput',
        severity: 'warning',
        entityType: 'zone',
        entityId: zone.id,
        entityName: zone.name,
        message: `Zone ${zone.name} capacity increased ${Math.round(changePercent)}% vs. last week`,
        metricValue: avgCurrentUtil,
        trendChangePercent: changePercent,
        metadata: { 
          avgCurrentUtil, 
          avgPreviousUtil, 
          changePercent,
          currentWeekDataPoints: currentWeekHistory.length,
          previousWeekDataPoints: previousWeekHistory.length 
        },
      });
    }
  }
}

async function analyzeAgingItems(siteId: number): Promise<void> {
  const zones = await db.select()
    .from(warehouseZones)
    .where(eq(warehouseZones.site_id, siteId));

  for (const zone of zones) {
    const agingItems = await db.select({
      count: sql<number>`count(*)::int`,
    })
    .from(warehouseInventoryItems)
    .where(and(
      eq(warehouseInventoryItems.site_id, siteId),
      eq(warehouseInventoryItems.zone_id, zone.id),
      gte(warehouseInventoryItems.aging_days, AGING_DAYS_THRESHOLD)
    ));

    const itemCount = agingItems[0]?.count || 0;

    if (itemCount > 0) {
      await createAlert({
        siteId,
        alertType: 'threshold_aging',
        severity: 'critical',
        entityType: 'zone',
        entityId: zone.id,
        entityName: zone.name,
        message: `${itemCount} items in ${zone.name} exceed 7-year aging threshold`,
        metricValue: itemCount,
        thresholdValue: AGING_DAYS_THRESHOLD,
        metadata: { itemCount, thresholdDays: AGING_DAYS_THRESHOLD },
      });
    }
  }

  const unassignedAgingItems = await db.select({
    count: sql<number>`count(*)::int`,
  })
  .from(warehouseInventoryItems)
  .where(and(
    eq(warehouseInventoryItems.site_id, siteId),
    isNull(warehouseInventoryItems.zone_id),
    gte(warehouseInventoryItems.aging_days, AGING_DAYS_THRESHOLD)
  ));

  const unassignedCount = unassignedAgingItems[0]?.count || 0;

  if (unassignedCount > 0) {
    await createAlert({
      siteId,
      alertType: 'threshold_aging',
      severity: 'critical',
      entityType: 'site',
      entityId: siteId,
      entityName: 'Unassigned',
      message: `${unassignedCount} items in unassigned locations exceed 7-year aging threshold`,
      metricValue: unassignedCount,
      thresholdValue: AGING_DAYS_THRESHOLD,
      metadata: { itemCount: unassignedCount, thresholdDays: AGING_DAYS_THRESHOLD },
    });
  }
}

async function calculateThroughputMetrics(siteId: number): Promise<void> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const site = await db.select().from(warehouseSites).where(eq(warehouseSites.id, siteId)).limit(1);
  if (site.length === 0) return;

  const completedEvents = await db.select({
    date: sql<string>`DATE(${warehouseOptimizationEvents.created_at})`,
    count: sql<number>`count(*)::int`,
  })
  .from(warehouseOptimizationEvents)
  .where(and(
    eq(warehouseOptimizationEvents.event_type, 'action_completed'),
    gte(warehouseOptimizationEvents.created_at, sevenDaysAgo)
  ))
  .groupBy(sql`DATE(${warehouseOptimizationEvents.created_at})`);

  for (const event of completedEvents) {
    const periodStart = new Date(event.date);
    periodStart.setHours(0, 0, 0, 0);
    const periodEnd = new Date(event.date);
    periodEnd.setHours(23, 59, 59, 999);

    const existingSnapshot = await db.select()
      .from(warehouseMetricSnapshots)
      .where(and(
        eq(warehouseMetricSnapshots.site_id, siteId),
        eq(warehouseMetricSnapshots.metric_key, 'throughput_inbound'),
        eq(warehouseMetricSnapshots.period_start, periodStart)
      ))
      .limit(1);

    if (existingSnapshot.length === 0) {
      await db.insert(warehouseMetricSnapshots).values({
        site_id: siteId,
        metric_key: 'throughput_inbound',
        period_start: periodStart,
        period_end: periodEnd,
        value: String(event.count),
        metadata: { eventType: 'action_completed' },
      });
    } else {
      await db.update(warehouseMetricSnapshots)
        .set({ value: String(event.count) })
        .where(eq(warehouseMetricSnapshots.id, existingSnapshot[0].id));
    }
  }

  const recentMetrics = await db.select()
    .from(warehouseMetricSnapshots)
    .where(and(
      eq(warehouseMetricSnapshots.site_id, siteId),
      eq(warehouseMetricSnapshots.metric_key, 'throughput_inbound'),
      gte(warehouseMetricSnapshots.period_start, sevenDaysAgo)
    ));

  if (recentMetrics.length > 0) {
    const movingAvg = recentMetrics.reduce((sum, m) => 
      sum + parseFloat(String(m.value)), 0) / recentMetrics.length;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const existingAvgSnapshot = await db.select()
      .from(warehouseMetricSnapshots)
      .where(and(
        eq(warehouseMetricSnapshots.site_id, siteId),
        eq(warehouseMetricSnapshots.metric_key, 'throughput_7day_avg'),
        eq(warehouseMetricSnapshots.period_start, todayStart)
      ))
      .limit(1);

    if (existingAvgSnapshot.length === 0) {
      await db.insert(warehouseMetricSnapshots).values({
        site_id: siteId,
        metric_key: 'throughput_7day_avg',
        period_start: todayStart,
        period_end: todayEnd,
        value: String(movingAvg.toFixed(4)),
        metadata: { dataPoints: recentMetrics.length },
      });
    } else {
      await db.update(warehouseMetricSnapshots)
        .set({ 
          value: String(movingAvg.toFixed(4)),
          metadata: { dataPoints: recentMetrics.length },
        })
        .where(eq(warehouseMetricSnapshots.id, existingAvgSnapshot[0].id));
    }
  }
}

export const warehouseAnalyticsService = {
  async runAnalytics(siteId: number, userId: number): Promise<void> {
    console.log(`[Analytics] Running analytics for site ${siteId}`);
    
    try {
      await analyzeCapacityThresholds(siteId);
      await analyzeTrends(siteId);
      await analyzeAgingItems(siteId);
      await calculateThroughputMetrics(siteId);
      
      console.log(`[Analytics] Completed analytics for site ${siteId}`);
    } catch (error) {
      console.error(`[Analytics] Error running analytics for site ${siteId}:`, error);
      throw error;
    }
  },

  async getAlerts(siteId: number): Promise<WarehouseAlert[]> {
    const alerts = await db.select()
      .from(warehouseAlerts)
      .where(and(
        eq(warehouseAlerts.site_id, siteId),
        eq(warehouseAlerts.is_resolved, false)
      ))
      .orderBy(desc(warehouseAlerts.created_at));
    
    return alerts;
  },

  async getTrendMetrics(siteId: number): Promise<TrendMetric[]> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const metrics = await db.select()
      .from(warehouseMetricSnapshots)
      .where(and(
        eq(warehouseMetricSnapshots.site_id, siteId),
        gte(warehouseMetricSnapshots.period_start, thirtyDaysAgo)
      ))
      .orderBy(desc(warehouseMetricSnapshots.period_start));

    const zones = await db.select()
      .from(warehouseZones)
      .where(eq(warehouseZones.site_id, siteId));
    
    const zoneMap = new Map(zones.map(z => [z.id, z.name]));

    return metrics.map(m => ({
      date: m.period_start instanceof Date ? m.period_start.toISOString() : String(m.period_start),
      metricKey: m.metric_key,
      value: parseFloat(String(m.value)),
    }));
  },

  async resolveAlert(alertId: number): Promise<void> {
    await db.update(warehouseAlerts)
      .set({
        is_resolved: true,
        resolved_at: new Date(),
      })
      .where(eq(warehouseAlerts.id, alertId));
    
    console.log(`[Analytics] Resolved alert ${alertId}`);
  },

  async getMovementAnalytics(siteId: number, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const mostMovingQuery = await db
      .select({
        itemId: warehouseItemMovements.item_id,
        description: warehouseItemMovements.item_description,
        nsn: warehouseItemMovements.nsn,
        totalMoves: count(warehouseItemMovements.id),
        totalQuantityMoved: sql<number>`SUM(${warehouseItemMovements.quantity_moved})`,
        lastMoved: sql<Date>`MAX(${warehouseItemMovements.moved_at})`,
      })
      .from(warehouseItemMovements)
      .where(and(
        eq(warehouseItemMovements.site_id, siteId),
        gte(warehouseItemMovements.moved_at, startDate)
      ))
      .groupBy(
        warehouseItemMovements.item_id,
        warehouseItemMovements.item_description,
        warehouseItemMovements.nsn
      )
      .orderBy(desc(sql`COUNT(${warehouseItemMovements.id})`))
      .limit(10);

    const recentMovesQuery = await db
      .select()
      .from(warehouseItemMovements)
      .where(eq(warehouseItemMovements.site_id, siteId))
      .orderBy(desc(warehouseItemMovements.moved_at))
      .limit(20);

    const movementsByTypeQuery = await db
      .select({
        movementType: warehouseItemMovements.movement_type,
        count: count(warehouseItemMovements.id),
      })
      .from(warehouseItemMovements)
      .where(and(
        eq(warehouseItemMovements.site_id, siteId),
        gte(warehouseItemMovements.moved_at, startDate)
      ))
      .groupBy(warehouseItemMovements.movement_type);

    const zoneInboundQuery = await db
      .select({
        zoneName: warehouseItemMovements.to_zone_name,
        count: count(warehouseItemMovements.id),
      })
      .from(warehouseItemMovements)
      .where(and(
        eq(warehouseItemMovements.site_id, siteId),
        gte(warehouseItemMovements.moved_at, startDate)
      ))
      .groupBy(warehouseItemMovements.to_zone_name);

    const zoneOutboundQuery = await db
      .select({
        zoneName: warehouseItemMovements.from_zone_name,
        count: count(warehouseItemMovements.id),
      })
      .from(warehouseItemMovements)
      .where(and(
        eq(warehouseItemMovements.site_id, siteId),
        gte(warehouseItemMovements.moved_at, startDate)
      ))
      .groupBy(warehouseItemMovements.from_zone_name);

    const movementsByType: Record<string, number> = {};
    movementsByTypeQuery.forEach((row) => {
      movementsByType[row.movementType || 'unknown'] = Number(row.count);
    });

    const zoneMap = new Map<string, { inbound: number; outbound: number }>();
    zoneInboundQuery.forEach((row) => {
      if (row.zoneName) {
        const existing = zoneMap.get(row.zoneName) || { inbound: 0, outbound: 0 };
        existing.inbound = Number(row.count);
        zoneMap.set(row.zoneName, existing);
      }
    });
    zoneOutboundQuery.forEach((row) => {
      if (row.zoneName) {
        const existing = zoneMap.get(row.zoneName) || { inbound: 0, outbound: 0 };
        existing.outbound = Number(row.count);
        zoneMap.set(row.zoneName, existing);
      }
    });

    return {
      mostMovingItems: mostMovingQuery.map((row) => ({
        itemId: row.itemId,
        description: row.description || 'Unknown',
        nsn: row.nsn,
        totalMoves: Number(row.totalMoves),
        totalQuantityMoved: Number(row.totalQuantityMoved) || 0,
        lastMoved: row.lastMoved,
      })),
      recentlyMovedItems: recentMovesQuery.map((row) => ({
        id: row.id,
        itemId: row.item_id,
        description: row.item_description,
        fromZone: row.from_zone_name,
        toZone: row.to_zone_name,
        fromLocation: row.from_location,
        toLocation: row.to_location,
        quantityMoved: row.quantity_moved,
        movedAt: row.moved_at,
        movementType: row.movement_type,
        movementReason: row.movement_reason,
      })),
      movementsByType,
      movementsByZone: Array.from(zoneMap.entries()).map(([zoneName, data]) => ({
        zoneName,
        inboundCount: data.inbound,
        outboundCount: data.outbound,
        netChange: data.inbound - data.outbound,
      })),
    };
  },

  async getGrowthInsights(siteId: number, days: number = 90) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const capacitySnapshots = await db
      .select()
      .from(warehouseCapacitySnapshots)
      .where(and(
        eq(warehouseCapacitySnapshots.site_id, siteId),
        gte(warehouseCapacitySnapshots.snapshot_date, startDate.toISOString().split('T')[0])
      ))
      .orderBy(warehouseCapacitySnapshots.snapshot_date);

    const site = await db
      .select()
      .from(warehouseSites)
      .where(eq(warehouseSites.id, siteId))
      .limit(1);

    const currentSite = site[0];
    const totalPositions = currentSite?.total_pallet_positions || 100;
    const openPositions = currentSite?.open_pallet_positions || 0;
    const usedPositions = totalPositions - openPositions;
    const currentUtilization = currentSite
      ? (usedPositions / totalPositions) * 100
      : 0;

    let dailyGrowth = 0;
    let weeklyGrowth = 0;
    let monthlyGrowth = 0;

    if (capacitySnapshots.length >= 2) {
      const latest = capacitySnapshots[capacitySnapshots.length - 1];
      const yesterday = capacitySnapshots.find((s, i) => i === capacitySnapshots.length - 2);
      const lastWeek = capacitySnapshots.find((s) => {
        const diff = (new Date().getTime() - new Date(s.snapshot_date).getTime()) / (1000 * 60 * 60 * 24);
        return diff >= 6 && diff <= 8;
      });
      const lastMonth = capacitySnapshots.find((s) => {
        const diff = (new Date().getTime() - new Date(s.snapshot_date).getTime()) / (1000 * 60 * 60 * 24);
        return diff >= 28 && diff <= 32;
      });

      if (yesterday) {
        dailyGrowth = Number(latest.utilization_percent) - Number(yesterday.utilization_percent);
      }
      if (lastWeek) {
        weeklyGrowth = Number(latest.utilization_percent) - Number(lastWeek.utilization_percent);
      }
      if (lastMonth) {
        monthlyGrowth = Number(latest.utilization_percent) - Number(lastMonth.utilization_percent);
      }
    }

    let daysUntilFull: number | null = null;
    let projectedDate: string | null = null;

    if (dailyGrowth > 0 && currentUtilization < 100) {
      daysUntilFull = Math.ceil((100 - currentUtilization) / dailyGrowth);
      const projected = new Date();
      projected.setDate(projected.getDate() + daysUntilFull);
      projectedDate = projected.toISOString().split('T')[0];
    }

    return {
      capacityTrend: capacitySnapshots.map((s) => ({
        date: s.snapshot_date,
        utilizationPercent: Number(s.utilization_percent),
        totalItems: s.total_items,
        usedCapacity: s.used_capacity,
      })),
      growthRate: {
        daily: dailyGrowth,
        weekly: weeklyGrowth,
        monthly: monthlyGrowth,
      },
      projectedCapacity: {
        daysUntilFull,
        projectedDate,
        currentUtilization,
      },
      itemCountTrend: capacitySnapshots.map((s) => ({
        date: s.snapshot_date,
        count: s.total_items,
      })),
    };
  },

  async getVelocityAnalytics(siteId: number) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const fastMoversQuery = await db
      .select({
        itemId: warehouseItemMovements.item_id,
        description: warehouseItemMovements.item_description,
        nsn: warehouseItemMovements.nsn,
        moveCount: count(warehouseItemMovements.id),
      })
      .from(warehouseItemMovements)
      .where(and(
        eq(warehouseItemMovements.site_id, siteId),
        gte(warehouseItemMovements.moved_at, thirtyDaysAgo)
      ))
      .groupBy(
        warehouseItemMovements.item_id,
        warehouseItemMovements.item_description,
        warehouseItemMovements.nsn
      )
      .orderBy(desc(sql`COUNT(${warehouseItemMovements.id})`))
      .limit(10);

    const slowMoversQuery = await db
      .select({
        id: warehouseInventoryItems.id,
        description: warehouseInventoryItems.description,
        nsn: warehouseInventoryItems.nsn,
        lastMoved: warehouseInventoryItems.last_moved,
        quantity: warehouseInventoryItems.quantity,
      })
      .from(warehouseInventoryItems)
      .where(eq(warehouseInventoryItems.site_id, siteId))
      .orderBy(warehouseInventoryItems.last_moved)
      .limit(10);

    const dailyInboundQuery = await db
      .select({ count: count(warehouseItemMovements.id) })
      .from(warehouseItemMovements)
      .where(and(
        eq(warehouseItemMovements.site_id, siteId),
        eq(warehouseItemMovements.movement_type, 'inbound'),
        gte(warehouseItemMovements.moved_at, thirtyDaysAgo)
      ));

    const dailyOutboundQuery = await db
      .select({ count: count(warehouseItemMovements.id) })
      .from(warehouseItemMovements)
      .where(and(
        eq(warehouseItemMovements.site_id, siteId),
        eq(warehouseItemMovements.movement_type, 'outbound'),
        gte(warehouseItemMovements.moved_at, thirtyDaysAgo)
      ));

    const dailyInbound = Math.round(Number(dailyInboundQuery[0]?.count || 0) / 30);
    const dailyOutbound = Math.round(Number(dailyOutboundQuery[0]?.count || 0) / 30);

    return {
      fastMovers: fastMoversQuery.map((row) => ({
        itemId: row.itemId,
        description: row.description || 'Unknown',
        nsn: row.nsn,
        velocity: Number(row.moveCount),
        avgDwellDays: Math.round(30 / Math.max(1, Number(row.moveCount))),
        turnoverRate: Number(row.moveCount) / 30,
      })),
      slowMovers: slowMoversQuery.map((row) => ({
        itemId: row.id,
        description: row.description,
        nsn: row.nsn,
        daysSinceLastMove: row.lastMoved
          ? Math.floor((Date.now() - new Date(row.lastMoved).getTime()) / (1000 * 60 * 60 * 24))
          : 999,
        quantity: row.quantity,
      })),
      averageVelocity: (dailyInbound + dailyOutbound) / 2,
      throughputMetrics: {
        dailyInbound,
        dailyOutbound,
        avgTurnaround: dailyInbound + dailyOutbound > 0 ? 30 / ((dailyInbound + dailyOutbound) / 2) : 0,
      },
    };
  },

  async getZoneHeatmap(siteId: number) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const zones = await db
      .select()
      .from(warehouseZones)
      .where(eq(warehouseZones.site_id, siteId));

    const movementCounts = await db
      .select({
        zoneId: warehouseItemMovements.to_zone_id,
        count: count(warehouseItemMovements.id),
      })
      .from(warehouseItemMovements)
      .where(and(
        eq(warehouseItemMovements.site_id, siteId),
        gte(warehouseItemMovements.moved_at, thirtyDaysAgo)
      ))
      .groupBy(warehouseItemMovements.to_zone_id);

    const movementMap = new Map<number, number>();
    movementCounts.forEach((row) => {
      if (row.zoneId) {
        movementMap.set(row.zoneId, Number(row.count));
      }
    });

    const maxMovements = Math.max(...Array.from(movementMap.values()), 1);

    return {
      zones: zones.map((zone) => {
        const movementCount = movementMap.get(zone.id) || 0;
        const rackAvailable = zone.rack_available || zone.total_capacity || 100;
        const rackOpen = zone.rack_open || 0;
        const rackUsed = rackAvailable - rackOpen;
        const utilization = (rackUsed / rackAvailable) * 100;
        const itemCount = zone.current_item_count || 0;
        const intensityScore = (movementCount / maxMovements) * 0.5 + (utilization / 100) * 0.5;

        let intensity: 'low' | 'medium' | 'high' | 'critical' = 'low';
        if (intensityScore > 0.8) intensity = 'critical';
        else if (intensityScore > 0.6) intensity = 'high';
        else if (intensityScore > 0.3) intensity = 'medium';

        return {
          zoneId: zone.id,
          zoneName: zone.name,
          movementCount,
          utilizationPercent: utilization,
          itemCount,
          intensity,
        };
      }),
    };
  },

  async recordItemMovement(
    siteId: number,
    itemId: number,
    data: {
      description?: string;
      nsn?: string;
      fromZoneId?: number;
      fromZoneName?: string;
      fromLocation?: string;
      toZoneId?: number;
      toZoneName?: string;
      toLocation?: string;
      quantityMoved?: number;
      weightLbs?: number;
      movementType: string;
      movementReason?: string;
      sourceType?: string;
      sourceId?: number;
      userId?: number;
    }
  ): Promise<void> {
    await db.insert(warehouseItemMovements).values({
      site_id: siteId,
      item_id: itemId,
      item_description: data.description,
      nsn: data.nsn,
      from_zone_id: data.fromZoneId,
      from_zone_name: data.fromZoneName,
      from_location: data.fromLocation,
      to_zone_id: data.toZoneId,
      to_zone_name: data.toZoneName,
      to_location: data.toLocation,
      quantity_moved: data.quantityMoved || 1,
      weight_lbs: data.weightLbs?.toString(),
      movement_type: data.movementType,
      movement_reason: data.movementReason,
      source_type: data.sourceType,
      source_id: data.sourceId,
      user_id: data.userId,
      moved_at: new Date(),
    });
  },

  async captureCapacitySnapshot(siteId: number): Promise<void> {
    const site = await db
      .select()
      .from(warehouseSites)
      .where(eq(warehouseSites.id, siteId))
      .limit(1);

    if (!site[0]) return;

    const zones = await db
      .select()
      .from(warehouseZones)
      .where(eq(warehouseZones.site_id, siteId));

    const itemCount = await db
      .select({ count: count(warehouseInventoryItems.id) })
      .from(warehouseInventoryItems)
      .where(eq(warehouseInventoryItems.site_id, siteId));

    const totalWeight = await db
      .select({ total: sql<number>`SUM(CAST(${warehouseInventoryItems.weight_lbs} AS NUMERIC))` })
      .from(warehouseInventoryItems)
      .where(eq(warehouseInventoryItems.site_id, siteId));

    const zoneBreakdown: Record<string, { items: number; utilization: number }> = {};
    zones.forEach((zone) => {
      const rackAvailable = zone.rack_available || zone.total_capacity || 100;
      const rackOpen = zone.rack_open || 0;
      const rackUsed = rackAvailable - rackOpen;
      zoneBreakdown[zone.name] = {
        items: zone.current_item_count || 0,
        utilization: (rackUsed / rackAvailable) * 100,
      };
    });

    const today = new Date().toISOString().split('T')[0];

    const existing = await db
      .select()
      .from(warehouseCapacitySnapshots)
      .where(and(
        eq(warehouseCapacitySnapshots.site_id, siteId),
        eq(warehouseCapacitySnapshots.snapshot_date, today)
      ))
      .limit(1);

    const totalPositions = site[0].total_pallet_positions || 100;
    const openPositions = site[0].open_pallet_positions || 0;
    const usedPositions = totalPositions - openPositions;
    const utilizationPercent = (usedPositions / totalPositions) * 100;

    if (existing.length === 0) {
      await db.insert(warehouseCapacitySnapshots).values({
        site_id: siteId,
        snapshot_date: today,
        total_capacity: totalPositions,
        used_capacity: usedPositions,
        utilization_percent: utilizationPercent.toFixed(2),
        total_items: Number(itemCount[0]?.count || 0),
        total_weight_lbs: totalWeight[0]?.total?.toString() || '0',
        zone_breakdown: zoneBreakdown,
        inbound_count: 0,
        outbound_count: 0,
      });
    }
  },

  async generateDemoMovementData(siteId: number): Promise<{ message: string; recordsCreated: number }> {
    const items = await db
      .select()
      .from(warehouseInventoryItems)
      .where(eq(warehouseInventoryItems.site_id, siteId))
      .limit(50);

    const zones = await db
      .select()
      .from(warehouseZones)
      .where(eq(warehouseZones.site_id, siteId));

    if (items.length === 0 || zones.length === 0) {
      return { message: "No items or zones found for this site", recordsCreated: 0 };
    }

    const movementTypes = ['internal', 'inbound', 'outbound', 'optimization', 'transfer'];
    const movementReasons = ['optimization', 'receiving', 'shipping', 'reorganization', 'transfer'];
    let recordsCreated = 0;

    for (let day = 30; day >= 0; day--) {
      const movementsPerDay = Math.floor(Math.random() * 10) + 3;
      
      for (let i = 0; i < movementsPerDay; i++) {
        const item = items[Math.floor(Math.random() * items.length)];
        const fromZone = zones[Math.floor(Math.random() * zones.length)];
        const toZone = zones[Math.floor(Math.random() * zones.length)];
        const movementType = movementTypes[Math.floor(Math.random() * movementTypes.length)];
        const movementReason = movementReasons[Math.floor(Math.random() * movementReasons.length)];
        
        const movedAt = new Date();
        movedAt.setDate(movedAt.getDate() - day);
        movedAt.setHours(Math.floor(Math.random() * 10) + 7);
        movedAt.setMinutes(Math.floor(Math.random() * 60));

        await db.insert(warehouseItemMovements).values({
          site_id: siteId,
          item_id: item.id,
          item_description: item.description,
          nsn: item.nsn,
          from_zone_id: fromZone.id,
          from_zone_name: fromZone.name,
          from_location: item.location,
          to_zone_id: toZone.id,
          to_zone_name: toZone.name,
          to_location: `${toZone.name}-${String(Math.floor(Math.random() * 20) + 1).padStart(2, '0')}`,
          quantity_moved: Math.floor(Math.random() * 5) + 1,
          weight_lbs: item.weight_lbs?.toString() || '100',
          movement_type: movementType,
          movement_reason: movementReason,
          source_type: 'demo',
          moved_at: movedAt,
        });
        recordsCreated++;
      }

      await this.captureCapacitySnapshot(siteId);
    }

    return { message: "Demo movement data generated successfully", recordsCreated };
  },

  async getMovements(siteId: number, options: { limit?: number } = {}) {
    const limit = options.limit || 100;
    
    const movements = await db
      .select({
        id: warehouseItemMovements.id,
        itemId: warehouseItemMovements.item_id,
        itemDescription: warehouseItemMovements.item_description,
        fromZoneId: warehouseItemMovements.from_zone_id,
        fromZoneName: warehouseItemMovements.from_zone_name,
        toZoneId: warehouseItemMovements.to_zone_id,
        toZoneName: warehouseItemMovements.to_zone_name,
        fromLocation: warehouseItemMovements.from_location,
        toLocation: warehouseItemMovements.to_location,
        quantityMoved: warehouseItemMovements.quantity_moved,
        movedAt: warehouseItemMovements.moved_at,
        movementType: warehouseItemMovements.movement_type,
        movementReason: warehouseItemMovements.movement_reason,
      })
      .from(warehouseItemMovements)
      .where(eq(warehouseItemMovements.site_id, siteId))
      .orderBy(desc(warehouseItemMovements.moved_at))
      .limit(limit);

    return {
      movements,
      total: movements.length,
    };
  },
};
