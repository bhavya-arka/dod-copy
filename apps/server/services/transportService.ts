import { db } from "../db";
import { 
  flightPlans, 
  landConvoys, 
  landRoutes,
  seaVoyages, 
  crossModalManifests,
  manifestItems
} from "../../../shared/schema";
import { eq, and } from "drizzle-orm";
import type { 
  TransportMode, 
  TransportStatus, 
  TransportPlan, 
  TransportStatistics 
} from "../../../packages/shared/transportTypes";
import { TRANSPORT_TRANSITIONS } from "../../../packages/shared/transportTypes";

const STATUS_MAP: Record<string, TransportStatus> = {
  draft: 'draft',
  complete: 'completed',
  archived: 'completed',
  planning: 'draft',
  planned: 'planned',
  loading: 'loading',
  in_transit: 'underway',
  en_route: 'underway',
  underway: 'underway',
  at_sea: 'underway',
  in_port: 'loading',
  arrived: 'completed',
  completed: 'completed',
  cancelled: 'cancelled',
};

function normalizeStatus(rawStatus: string): TransportStatus {
  return STATUS_MAP[rawStatus] || 'draft';
}

function denormalizeStatus(status: TransportStatus, mode: TransportMode): string {
  if (mode === 'air') {
    if (status === 'completed') return 'complete';
    return status;
  }
  if (mode === 'land') {
    if (status === 'draft') return 'draft';
    if (status === 'underway') return 'in_transit';
    if (status === 'completed') return 'completed';
    return status;
  }
  if (mode === 'sea') {
    if (status === 'underway') return 'underway';
    return status;
  }
  return status;
}

function mapFlightPlanToTransportPlan(fp: typeof flightPlans.$inferSelect): TransportPlan {
  const movementData = fp.movement_data as { origin?: string; destination?: string } | null;
  return {
    id: fp.id,
    mode: 'air',
    name: fp.name,
    origin: movementData?.origin || 'Unknown',
    destination: movementData?.destination || 'Unknown',
    status: normalizeStatus(fp.status),
    departure_time: undefined,
    arrival_time: undefined,
    total_weight_lbs: fp.total_weight_lb || 0,
    cargo_count: fp.movement_items_count || 0,
    created_at: fp.created_at.toISOString(),
    updated_at: fp.updated_at?.toISOString(),
  };
}

type LandConvoyWithRoute = typeof landConvoys.$inferSelect & {
  route?: typeof landRoutes.$inferSelect | null;
};

function mapLandConvoyToTransportPlan(lc: LandConvoyWithRoute): TransportPlan {
  return {
    id: lc.id,
    mode: 'land',
    name: lc.name,
    origin: lc.route?.origin_name || 'Unknown Origin',
    destination: lc.route?.destination_name || 'Unknown Destination',
    status: normalizeStatus(lc.status),
    departure_time: lc.departure_time?.toISOString(),
    arrival_time: lc.arrival_time?.toISOString(),
    total_weight_lbs: lc.total_cargo_weight_lbs || 0,
    cargo_count: lc.vehicle_count || 0,
    created_at: lc.created_at.toISOString(),
    updated_at: lc.updated_at?.toISOString(),
  };
}

function mapSeaVoyageToTransportPlan(sv: typeof seaVoyages.$inferSelect): TransportPlan {
  return {
    id: sv.id,
    mode: 'sea',
    name: sv.name,
    origin: sv.origin_port,
    destination: sv.destination_port,
    status: normalizeStatus(sv.status),
    departure_time: sv.departure_time?.toISOString(),
    arrival_time: sv.arrival_time?.toISOString(),
    total_weight_lbs: 0,
    cargo_count: 0,
    created_at: sv.created_at.toISOString(),
    updated_at: sv.updated_at?.toISOString(),
  };
}

export async function getPlans(mode: TransportMode, userId: number): Promise<TransportPlan[]> {
  switch (mode) {
    case 'air': {
      const plans = await db.select().from(flightPlans).where(eq(flightPlans.user_id, userId));
      return plans.map(mapFlightPlanToTransportPlan);
    }
    case 'land': {
      const results = await db
        .select({
          convoy: landConvoys,
          route: landRoutes,
        })
        .from(landConvoys)
        .leftJoin(landRoutes, eq(landConvoys.route_id, landRoutes.id))
        .where(eq(landConvoys.user_id, userId));
      
      return results.map(({ convoy, route }) => 
        mapLandConvoyToTransportPlan({ ...convoy, route })
      );
    }
    case 'sea': {
      const voyages = await db.select().from(seaVoyages).where(eq(seaVoyages.user_id, userId));
      return voyages.map(mapSeaVoyageToTransportPlan);
    }
    default:
      return [];
  }
}

export async function getPlan(mode: TransportMode, id: number, userId: number): Promise<TransportPlan | null> {
  switch (mode) {
    case 'air': {
      const [plan] = await db.select().from(flightPlans)
        .where(and(eq(flightPlans.id, id), eq(flightPlans.user_id, userId)));
      return plan ? mapFlightPlanToTransportPlan(plan) : null;
    }
    case 'land': {
      const [result] = await db
        .select({
          convoy: landConvoys,
          route: landRoutes,
        })
        .from(landConvoys)
        .leftJoin(landRoutes, eq(landConvoys.route_id, landRoutes.id))
        .where(and(eq(landConvoys.id, id), eq(landConvoys.user_id, userId)));
      
      return result ? mapLandConvoyToTransportPlan({ ...result.convoy, route: result.route }) : null;
    }
    case 'sea': {
      const [voyage] = await db.select().from(seaVoyages)
        .where(and(eq(seaVoyages.id, id), eq(seaVoyages.user_id, userId)));
      return voyage ? mapSeaVoyageToTransportPlan(voyage) : null;
    }
    default:
      return null;
  }
}

export async function createPlan(
  mode: TransportMode, 
  data: Partial<TransportPlan>, 
  userId: number
): Promise<TransportPlan | null> {
  const now = new Date();
  const status = data.status || 'draft';
  const dbStatus = denormalizeStatus(status, mode);

  switch (mode) {
    case 'air': {
      const [plan] = await db.insert(flightPlans).values({
        user_id: userId,
        name: data.name || 'New Flight Plan',
        status: dbStatus,
        allocation_data: {},
        movement_data: { origin: data.origin, destination: data.destination },
        movement_items_count: data.cargo_count || 0,
        total_weight_lb: data.total_weight_lbs || 0,
        aircraft_count: 0,
      }).returning();
      return plan ? mapFlightPlanToTransportPlan(plan) : null;
    }
    case 'land': {
      let routeId: number | undefined;
      let route: typeof landRoutes.$inferSelect | null = null;
      
      if (data.origin || data.destination) {
        const [newRoute] = await db.insert(landRoutes).values({
          user_id: userId,
          name: `Route for ${data.name || 'New Convoy'}`,
          origin_name: data.origin || 'Unknown Origin',
          destination_name: data.destination || 'Unknown Destination',
          status: 'planned',
        }).returning();
        if (newRoute) {
          routeId = newRoute.id;
          route = newRoute;
        }
      }
      
      const [convoy] = await db.insert(landConvoys).values({
        user_id: userId,
        name: data.name || 'New Convoy',
        route_id: routeId,
        status: dbStatus,
        vehicle_count: data.cargo_count || 0,
        total_cargo_weight_lbs: data.total_weight_lbs || 0,
        departure_time: data.departure_time ? new Date(data.departure_time) : undefined,
        arrival_time: data.arrival_time ? new Date(data.arrival_time) : undefined,
      }).returning();
      return convoy ? mapLandConvoyToTransportPlan({ ...convoy, route }) : null;
    }
    case 'sea': {
      const [voyage] = await db.insert(seaVoyages).values({
        user_id: userId,
        name: data.name || 'New Voyage',
        origin_port: data.origin || 'Unknown',
        destination_port: data.destination || 'Unknown',
        status: dbStatus,
        departure_time: data.departure_time ? new Date(data.departure_time) : undefined,
        arrival_time: data.arrival_time ? new Date(data.arrival_time) : undefined,
      }).returning();
      return voyage ? mapSeaVoyageToTransportPlan(voyage) : null;
    }
    default:
      return null;
  }
}

export async function updatePlan(
  mode: TransportMode, 
  id: number, 
  data: Partial<TransportPlan>, 
  userId: number
): Promise<TransportPlan | null> {
  const now = new Date();

  switch (mode) {
    case 'air': {
      const updateData: Record<string, unknown> = { updated_at: now };
      if (data.name) updateData.name = data.name;
      if (data.status) updateData.status = denormalizeStatus(data.status, mode);
      if (data.total_weight_lbs !== undefined) updateData.total_weight_lb = data.total_weight_lbs;
      if (data.cargo_count !== undefined) updateData.movement_items_count = data.cargo_count;
      
      const [plan] = await db.update(flightPlans)
        .set(updateData)
        .where(and(eq(flightPlans.id, id), eq(flightPlans.user_id, userId)))
        .returning();
      return plan ? mapFlightPlanToTransportPlan(plan) : null;
    }
    case 'land': {
      const updateData: Record<string, unknown> = { updated_at: now };
      if (data.name) updateData.name = data.name;
      if (data.status) updateData.status = denormalizeStatus(data.status, mode);
      if (data.total_weight_lbs !== undefined) updateData.total_cargo_weight_lbs = data.total_weight_lbs;
      if (data.cargo_count !== undefined) updateData.vehicle_count = data.cargo_count;
      if (data.departure_time) updateData.departure_time = new Date(data.departure_time);
      if (data.arrival_time) updateData.arrival_time = new Date(data.arrival_time);
      
      const [convoy] = await db.update(landConvoys)
        .set(updateData)
        .where(and(eq(landConvoys.id, id), eq(landConvoys.user_id, userId)))
        .returning();
      
      if (!convoy) return null;
      
      const [result] = await db
        .select({
          convoy: landConvoys,
          route: landRoutes,
        })
        .from(landConvoys)
        .leftJoin(landRoutes, eq(landConvoys.route_id, landRoutes.id))
        .where(eq(landConvoys.id, convoy.id));
      
      return result ? mapLandConvoyToTransportPlan({ ...result.convoy, route: result.route }) : null;
    }
    case 'sea': {
      const updateData: Record<string, unknown> = { updated_at: now };
      if (data.name) updateData.name = data.name;
      if (data.status) updateData.status = denormalizeStatus(data.status, mode);
      if (data.origin) updateData.origin_port = data.origin;
      if (data.destination) updateData.destination_port = data.destination;
      if (data.departure_time) updateData.departure_time = new Date(data.departure_time);
      if (data.arrival_time) updateData.arrival_time = new Date(data.arrival_time);
      
      const [voyage] = await db.update(seaVoyages)
        .set(updateData)
        .where(and(eq(seaVoyages.id, id), eq(seaVoyages.user_id, userId)))
        .returning();
      return voyage ? mapSeaVoyageToTransportPlan(voyage) : null;
    }
    default:
      return null;
  }
}

export function validateTransition(currentStatus: TransportStatus, newStatus: TransportStatus): boolean {
  const allowedTransitions = TRANSPORT_TRANSITIONS[currentStatus];
  return allowedTransitions.includes(newStatus);
}

async function updateWmsOnCompletion(mode: TransportMode, planId: number): Promise<void> {
  const manifests = await db.select().from(crossModalManifests).where(
    and(
      eq(crossModalManifests.transport_mode, mode),
      mode === 'air' ? eq(crossModalManifests.flight_plan_id, planId) :
      mode === 'land' ? eq(crossModalManifests.convoy_id, planId) :
      eq(crossModalManifests.voyage_id, planId)
    )
  );

  for (const manifest of manifests) {
    await db.update(manifestItems)
      .set({ loaded: true })
      .where(eq(manifestItems.manifest_id, manifest.id));

    await db.update(crossModalManifests)
      .set({ status: 'delivered', updated_at: new Date() })
      .where(eq(crossModalManifests.id, manifest.id));
  }
}

export async function transitionStatus(
  mode: TransportMode, 
  id: number, 
  newStatus: TransportStatus, 
  userId: number
): Promise<{ success: boolean; plan?: TransportPlan; error?: string }> {
  const plan = await getPlan(mode, id, userId);
  if (!plan) {
    return { success: false, error: 'Plan not found' };
  }

  if (!validateTransition(plan.status, newStatus)) {
    return { 
      success: false, 
      error: `Invalid transition from ${plan.status} to ${newStatus}. Allowed: ${TRANSPORT_TRANSITIONS[plan.status].join(', ') || 'none'}` 
    };
  }

  const updatedPlan = await updatePlan(mode, id, { status: newStatus }, userId);
  if (!updatedPlan) {
    return { success: false, error: 'Failed to update plan status' };
  }

  if (newStatus === 'completed') {
    await updateWmsOnCompletion(mode, id);
  }

  return { success: true, plan: updatedPlan };
}

export async function getStatistics(mode: TransportMode, userId: number): Promise<TransportStatistics> {
  const plans = await getPlans(mode, userId);
  
  const stats: TransportStatistics = {
    mode,
    total: plans.length,
    active: plans.filter(p => ['planned', 'loading', 'underway'].includes(p.status)).length,
    draft: plans.filter(p => p.status === 'draft').length,
    completed: plans.filter(p => p.status === 'completed').length,
    total_weight_lbs: plans.reduce((sum, p) => sum + (p.total_weight_lbs || 0), 0),
  };

  return stats;
}

export async function getStatisticsAll(userId: number): Promise<TransportStatistics[]> {
  const modes: TransportMode[] = ['air', 'land', 'sea'];
  const allStats: TransportStatistics[] = [];

  for (const mode of modes) {
    const stats = await getStatistics(mode, userId);
    allStats.push(stats);
  }

  return allStats;
}
