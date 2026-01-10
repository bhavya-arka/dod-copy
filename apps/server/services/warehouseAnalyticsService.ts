import { db } from '../db';
import { 
  warehouseZones, 
  warehouseZoneCapacityHistory,
  warehouseInventoryItems,
  warehouseOptimizationEvents,
  warehouseMetricSnapshots,
  warehouseAlerts,
  warehouseSites
} from '@shared/schema';
import type { WarehouseAlert, WarehouseMetricSnapshot } from '@shared/schema';
import { eq, and, gte, lte, sql, desc, isNull } from 'drizzle-orm';

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
};
