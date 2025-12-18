import { db } from "../db";
import {
  aircraftTypes,
  aircraftCapacityProfiles,
  planAircraftAvailability,
  planSolutions,
  AircraftType,
  AircraftCapacityProfile,
  PlanAircraftAvailability,
  PlanSolution,
  InsertPlanSolution,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export async function getAllActiveAircraftTypes(): Promise<AircraftType[]> {
  return db
    .select()
    .from(aircraftTypes)
    .where(eq(aircraftTypes.active, true));
}

export async function getAircraftCapacityProfile(
  typeId: string,
  version?: string
): Promise<AircraftCapacityProfile | null> {
  const query = version
    ? and(
        eq(aircraftCapacityProfiles.aircraft_type_id, typeId),
        eq(aircraftCapacityProfiles.version, version)
      )
    : eq(aircraftCapacityProfiles.aircraft_type_id, typeId);

  const [profile] = await db
    .select()
    .from(aircraftCapacityProfiles)
    .where(query)
    .orderBy(desc(aircraftCapacityProfiles.created_at))
    .limit(1);

  return profile ?? null;
}

export async function setFleetAvailability(
  planId: number,
  availability: { typeId: string; count: number; locked: boolean }[]
): Promise<void> {
  await db
    .delete(planAircraftAvailability)
    .where(eq(planAircraftAvailability.plan_id, planId));

  if (availability.length > 0) {
    await db.insert(planAircraftAvailability).values(
      availability.map((a) => ({
        plan_id: planId,
        aircraft_type_id: a.typeId,
        available_count: a.count,
        locked: a.locked,
      }))
    );
  }
}

export async function getFleetAvailability(
  planId: number
): Promise<PlanAircraftAvailability[]> {
  return db
    .select()
    .from(planAircraftAvailability)
    .where(eq(planAircraftAvailability.plan_id, planId));
}

export async function savePlanSolution(
  solution: InsertPlanSolution
): Promise<PlanSolution> {
  const [created] = await db
    .insert(planSolutions)
    .values(solution)
    .returning();
  return created;
}

export async function getLatestPlanSolution(
  planId: number
): Promise<PlanSolution | null> {
  const [solution] = await db
    .select()
    .from(planSolutions)
    .where(eq(planSolutions.plan_id, planId))
    .orderBy(desc(planSolutions.created_at))
    .limit(1);

  return solution ?? null;
}
