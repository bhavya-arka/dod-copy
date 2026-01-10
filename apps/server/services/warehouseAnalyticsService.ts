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
  entityKey: string
): Promise<boolean> {
  const cutoffTime = new Date(Date.now() - DEDUP_HOURS * 60 * 60 * 1000);
  
  const existingAlerts = await db.select()
    .from(warehouseAlerts)
    .where(and(
      eq(warehouseAlerts.site_id, siteId),
      eq(warehouseAlerts.entity_key, entityKey),
      eq(warehouseAlerts.is_resolved, false),
      gte(warehouseAlerts.created_at, cutoffTime)
    ))
    .limit(1);
  
  return existingAlerts.length > 0;
}

async function createAlert(params: {
  siteId: number;
  zoneId?: number;
  userId: number;
  alertType: 'capacity' | 'trend' | 'aging' | 'throughput';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  entityKey: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const isDuplicate = await checkDuplicateAlert(params.siteId, params.entityKey);
  
  if (isDuplicate) {
    console.log(`[Analytics] Skipping duplicate alert: ${params.entityKey}`);
    return;
  }

  await db.insert(warehouseAlerts).values({
    site_id: params.siteId,
    zone_id: params.zoneId,
    user_id: params.userId,
    alert_type: params.alertType,
    severity: params.severity,
    message: params.message,
    entity_key: params.entityKey,
    metadata: params.metadata || {},
  });
  
  console.log(`[Analytics] Created alert: ${params.message}`);
}

async function analyzeCapacityThresholds(siteId: number, userId: number): Promise<void> {
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
        zoneId: zone.id,
        userId,
        alertType: 'capacity',
        severity: 'critical',
        message: `Zone ${zone.name} at ${Math.round(utilization)}% capacity — consider redistributing inventory`,
        entityKey: `zone_${zone.id}_capacity_critical`,
        metadata: { utilization, rackAvailable, rackOpen, rackUsed },
      });
    } else if (utilization >= CAPACITY_WARNING_THRESHOLD) {
      await createAlert({
        siteId,
        zoneId: zone.id,
        userId,
        alertType: 'capacity',
        severity: 'warning',
        message: `Zone ${zone.name} at ${Math.round(utilization)}% capacity — consider redistributing inventory`,
        entityKey: `zone_${zone.id}_capacity_warning`,
        metadata: { utilization, rackAvailable, rackOpen, rackUsed },
      });
    }
  }
}

async function analyzeTrends(siteId: number, userId: number): Promise<void> {
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
        gte(warehouseZoneCapacityHistory.snapshot_date, sevenDaysAgo)
      ));

    const previousWeekHistory = await db.select()
      .from(warehouseZoneCapacityHistory)
      .where(and(
        eq(warehouseZoneCapacityHistory.zone_id, zone.id),
        gte(warehouseZoneCapacityHistory.snapshot_date, fourteenDaysAgo),
        lte(warehouseZoneCapacityHistory.snapshot_date, sevenDaysAgo)
      ));

    if (currentWeekHistory.length === 0 || previousWeekHistory.length === 0) {
      continue;
    }

    const avgCurrentUtil = currentWeekHistory.reduce((sum, h) => 
      sum + parseFloat(String(h.utilization_percent || 0)), 0) / currentWeekHistory.length;
    
    const avgPreviousUtil = previousWeekHistory.reduce((sum, h) => 
      sum + parseFloat(String(h.utilization_percent || 0)), 0) / previousWeekHistory.length;

    if (avgPreviousUtil === 0) continue;

    const changePercent = ((avgCurrentUtil - avgPreviousUtil) / avgPreviousUtil) * 100;

    if (changePercent > TREND_ALERT_THRESHOLD) {
      await createAlert({
        siteId,
        zoneId: zone.id,
        userId,
        alertType: 'trend',
        severity: 'warning',
        message: `Zone ${zone.name} capacity increased ${Math.round(changePercent)}% vs. last week`,
        entityKey: `zone_${zone.id}_trend_increase`,
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

async function analyzeAgingItems(siteId: number, userId: number): Promise<void> {
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
        zoneId: zone.id,
        userId,
        alertType: 'aging',
        severity: 'critical',
        message: `${itemCount} items in ${zone.name} exceed 7-year aging threshold`,
        entityKey: `zone_${zone.id}_aging`,
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
      zoneId: undefined,
      userId,
      alertType: 'aging',
      severity: 'critical',
      message: `${unassignedCount} items in unassigned locations exceed 7-year aging threshold`,
      entityKey: `site_${siteId}_unassigned_aging`,
      metadata: { itemCount: unassignedCount, thresholdDays: AGING_DAYS_THRESHOLD },
    });
  }
}

async function calculateThroughputMetrics(siteId: number): Promise<void> {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
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
    const existingSnapshot = await db.select()
      .from(warehouseMetricSnapshots)
      .where(and(
        eq(warehouseMetricSnapshots.site_id, siteId),
        eq(warehouseMetricSnapshots.metric_key, 'daily_throughput'),
        eq(warehouseMetricSnapshots.snapshot_date, event.date)
      ))
      .limit(1);

    if (existingSnapshot.length === 0) {
      await db.insert(warehouseMetricSnapshots).values({
        site_id: siteId,
        metric_key: 'daily_throughput',
        metric_value: String(event.count),
        snapshot_date: event.date,
        metadata: { eventType: 'action_completed' },
      });
    } else {
      await db.update(warehouseMetricSnapshots)
        .set({ metric_value: String(event.count) })
        .where(eq(warehouseMetricSnapshots.id, existingSnapshot[0].id));
    }
  }

  const recentMetrics = await db.select()
    .from(warehouseMetricSnapshots)
    .where(and(
      eq(warehouseMetricSnapshots.site_id, siteId),
      eq(warehouseMetricSnapshots.metric_key, 'daily_throughput'),
      gte(warehouseMetricSnapshots.snapshot_date, sevenDaysAgo.toISOString().split('T')[0])
    ));

  if (recentMetrics.length > 0) {
    const movingAvg = recentMetrics.reduce((sum, m) => 
      sum + parseFloat(String(m.metric_value)), 0) / recentMetrics.length;

    const existingAvgSnapshot = await db.select()
      .from(warehouseMetricSnapshots)
      .where(and(
        eq(warehouseMetricSnapshots.site_id, siteId),
        eq(warehouseMetricSnapshots.metric_key, 'throughput_7day_avg'),
        eq(warehouseMetricSnapshots.snapshot_date, today)
      ))
      .limit(1);

    if (existingAvgSnapshot.length === 0) {
      await db.insert(warehouseMetricSnapshots).values({
        site_id: siteId,
        metric_key: 'throughput_7day_avg',
        metric_value: String(movingAvg.toFixed(4)),
        snapshot_date: today,
        metadata: { dataPoints: recentMetrics.length },
      });
    } else {
      await db.update(warehouseMetricSnapshots)
        .set({ 
          metric_value: String(movingAvg.toFixed(4)),
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
      await analyzeCapacityThresholds(siteId, userId);
      await analyzeTrends(siteId, userId);
      await analyzeAgingItems(siteId, userId);
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
        gte(warehouseMetricSnapshots.snapshot_date, thirtyDaysAgo.toISOString().split('T')[0])
      ))
      .orderBy(desc(warehouseMetricSnapshots.snapshot_date));

    const zones = await db.select()
      .from(warehouseZones)
      .where(eq(warehouseZones.site_id, siteId));
    
    const zoneMap = new Map(zones.map(z => [z.id, z.name]));

    return metrics.map(m => ({
      date: String(m.snapshot_date),
      metricKey: m.metric_key,
      value: parseFloat(String(m.metric_value)),
      zoneId: m.zone_id ?? undefined,
      zoneName: m.zone_id ? zoneMap.get(m.zone_id) : undefined,
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
