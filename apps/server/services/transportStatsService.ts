import { db } from "../db";
import { transportOperationalStats, flightPlans, landConvoys, seaVoyages } from "@shared/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import type { TransportMode } from "@shared/transportTypes";

export function getDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

export async function recalculateStatsForDate(
  userId: number,
  mode: TransportMode,
  scheduleDate: string
): Promise<void> {
  const dateStart = new Date(scheduleDate);
  dateStart.setHours(0, 0, 0, 0);
  const dateEnd = new Date(scheduleDate);
  dateEnd.setHours(23, 59, 59, 999);

  let planCount = 0;
  let totalCargoLbs = 0;
  let totalItems = 0;

  if (mode === 'air') {
    const plans = await db.query.flightPlans.findMany({
      where: and(
        eq(flightPlans.user_id, userId),
        gte(flightPlans.scheduled_departure, dateStart),
        sql`${flightPlans.scheduled_departure} <= ${dateEnd}`
      )
    });
    planCount = plans.length;
    totalCargoLbs = plans.reduce((sum, p) => sum + (p.total_weight_lb || 0), 0);
    totalItems = plans.reduce((sum, p) => sum + (p.movement_items_count || 0), 0);
  } else if (mode === 'land') {
    const convoys = await db.query.landConvoys.findMany({
      where: and(
        eq(landConvoys.user_id, userId),
        gte(landConvoys.scheduled_departure, dateStart),
        sql`${landConvoys.scheduled_departure} <= ${dateEnd}`
      )
    });
    planCount = convoys.length;
    totalCargoLbs = convoys.reduce((sum, c) => sum + (c.total_cargo_weight_lbs || 0), 0);
  } else if (mode === 'sea') {
    const voyages = await db.query.seaVoyages.findMany({
      where: and(
        eq(seaVoyages.user_id, userId),
        gte(seaVoyages.scheduled_departure, dateStart),
        sql`${seaVoyages.scheduled_departure} <= ${dateEnd}`
      )
    });
    planCount = voyages.length;
  }

  const existing = await db.query.transportOperationalStats.findFirst({
    where: and(
      eq(transportOperationalStats.user_id, userId),
      eq(transportOperationalStats.transport_mode, mode),
      eq(transportOperationalStats.schedule_date, scheduleDate)
    )
  });

  if (planCount === 0 && (!existing || existing.plan_count === 0)) {
    if (existing) {
      await db.delete(transportOperationalStats).where(eq(transportOperationalStats.id, existing.id));
    }
    return;
  }

  if (existing) {
    await db.update(transportOperationalStats)
      .set({
        plan_count: planCount,
        total_cargo_lbs: totalCargoLbs,
        total_items: totalItems,
        last_updated_at: new Date()
      })
      .where(eq(transportOperationalStats.id, existing.id));
  } else if (planCount > 0) {
    await db.insert(transportOperationalStats).values({
      user_id: userId,
      transport_mode: mode,
      schedule_date: scheduleDate,
      plan_count: planCount,
      total_cargo_lbs: totalCargoLbs,
      total_items: totalItems
    });
  }
}

export async function updateStatsOnPlanChange(
  userId: number,
  mode: TransportMode,
  scheduledDeparture: Date | null | undefined,
  oldScheduledDeparture?: Date | null
): Promise<void> {
  const datesToRecalc: string[] = [];
  
  if (scheduledDeparture) {
    datesToRecalc.push(getDateString(new Date(scheduledDeparture)));
  }
  if (oldScheduledDeparture) {
    const oldDateStr = getDateString(new Date(oldScheduledDeparture));
    if (!datesToRecalc.includes(oldDateStr)) {
      datesToRecalc.push(oldDateStr);
    }
  }

  for (const dateStr of datesToRecalc) {
    await recalculateStatsForDate(userId, mode, dateStr);
  }
}

export async function getFutureStats(
  userId: number,
  daysAhead: number = 90
): Promise<{
  air: { count: number; cargoLbs: number; items: number };
  land: { count: number; cargoLbs: number };
  sea: { count: number };
}> {
  const now = new Date();
  const todayStr = getDateString(now);
  
  const stats = await db.query.transportOperationalStats.findMany({
    where: and(
      eq(transportOperationalStats.user_id, userId),
      gte(transportOperationalStats.schedule_date, todayStr)
    )
  });

  const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  const futureDateStr = getDateString(futureDate);

  const filteredStats = stats.filter((s: { schedule_date: string }) => s.schedule_date <= futureDateStr);

  const result = {
    air: { count: 0, cargoLbs: 0, items: 0 },
    land: { count: 0, cargoLbs: 0 },
    sea: { count: 0 }
  };

  for (const stat of filteredStats) {
    if (stat.transport_mode === 'air') {
      result.air.count += stat.plan_count;
      result.air.cargoLbs += stat.total_cargo_lbs;
      result.air.items += stat.total_items;
    } else if (stat.transport_mode === 'land') {
      result.land.count += stat.plan_count;
      result.land.cargoLbs += stat.total_cargo_lbs;
    } else if (stat.transport_mode === 'sea') {
      result.sea.count += stat.plan_count;
    }
  }

  return result;
}

export async function backfillStats(userId: number): Promise<void> {
  const [airPlans, landPlans, seaPlans] = await Promise.all([
    db.query.flightPlans.findMany({ where: eq(flightPlans.user_id, userId) }),
    db.query.landConvoys.findMany({ where: eq(landConvoys.user_id, userId) }),
    db.query.seaVoyages.findMany({ where: eq(seaVoyages.user_id, userId) })
  ]);

  const datesToProcess: { dateStr: string; mode: TransportMode }[] = [];

  for (const plan of airPlans) {
    if (plan.scheduled_departure) {
      const dateStr = getDateString(new Date(plan.scheduled_departure));
      if (!datesToProcess.some(d => d.dateStr === dateStr && d.mode === 'air')) {
        datesToProcess.push({ dateStr, mode: 'air' });
      }
    }
  }

  for (const convoy of landPlans) {
    if (convoy.scheduled_departure) {
      const dateStr = getDateString(new Date(convoy.scheduled_departure));
      if (!datesToProcess.some(d => d.dateStr === dateStr && d.mode === 'land')) {
        datesToProcess.push({ dateStr, mode: 'land' });
      }
    }
  }

  for (const voyage of seaPlans) {
    if (voyage.scheduled_departure) {
      const dateStr = getDateString(new Date(voyage.scheduled_departure));
      if (!datesToProcess.some(d => d.dateStr === dateStr && d.mode === 'sea')) {
        datesToProcess.push({ dateStr, mode: 'sea' });
      }
    }
  }

  for (const { dateStr, mode } of datesToProcess) {
    await recalculateStatsForDate(userId, mode, dateStr);
  }
}
