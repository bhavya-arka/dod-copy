import { db } from "../db";
import { 
  cargoAssignments, 
  cargoItems,
  CargoAssignment, 
  InsertCargoAssignment,
  CargoItem 
} from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";

export async function createAssignment(
  assignment: InsertCargoAssignment
): Promise<CargoAssignment> {
  const [created] = await db.insert(cargoAssignments).values(assignment).returning();
  return created;
}

export async function getAssignment(assignmentId: string, userId: number): Promise<CargoAssignment | undefined> {
  const [assignment] = await db
    .select()
    .from(cargoAssignments)
    .where(and(eq(cargoAssignments.id, assignmentId), eq(cargoAssignments.user_id, userId)));
  return assignment;
}

export async function getAssignments(userId: number): Promise<CargoAssignment[]> {
  return db.select().from(cargoAssignments).where(eq(cargoAssignments.user_id, userId));
}

export async function getAssignmentsByNodeId(
  nodeId: string,
  userId: number
): Promise<CargoAssignment[]> {
  return db
    .select()
    .from(cargoAssignments)
    .where(
      and(eq(cargoAssignments.node_id, nodeId), eq(cargoAssignments.user_id, userId))
    );
}

export async function getAssignmentsByCargoId(
  cargoId: string,
  userId: number
): Promise<CargoAssignment[]> {
  return db
    .select()
    .from(cargoAssignments)
    .where(
      and(eq(cargoAssignments.cargo_id, cargoId), eq(cargoAssignments.user_id, userId))
    );
}

export async function updateAssignment(
  assignmentId: string,
  userId: number,
  data: Partial<InsertCargoAssignment>
): Promise<CargoAssignment | undefined> {
  const [updated] = await db
    .update(cargoAssignments)
    .set({ ...data, updated_at: new Date() })
    .where(
      and(eq(cargoAssignments.id, assignmentId), eq(cargoAssignments.user_id, userId))
    )
    .returning();
  return updated;
}

export async function deleteAssignment(assignmentId: string, userId: number): Promise<void> {
  await db.delete(cargoAssignments).where(
    and(eq(cargoAssignments.id, assignmentId), eq(cargoAssignments.user_id, userId))
  );
}

export async function getCargoAtNode(
  nodeId: string,
  userId: number
): Promise<CargoItem[]> {
  const assignments = await getAssignmentsByNodeId(nodeId, userId);
  const cargoIds = assignments.map(a => a.cargo_id);
  
  if (cargoIds.length === 0) return [];
  
  return db.select().from(cargoItems).where(inArray(cargoItems.id, cargoIds));
}

export async function assignCargoToNode(
  cargoId: string,
  nodeId: string,
  userId: number,
  options?: {
    status?: string;
    sequence?: number;
    palletPosition?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<CargoAssignment> {
  const assignment: InsertCargoAssignment = {
    user_id: userId,
    cargo_id: cargoId,
    node_id: nodeId,
    status: options?.status ?? 'assigned',
    sequence: options?.sequence ?? 0,
    pallet_position: options?.palletPosition,
    metadata: options?.metadata ?? {},
  };
  
  return createAssignment(assignment);
}

export async function updateAssignmentStatus(
  assignmentId: string,
  userId: number,
  status: string
): Promise<CargoAssignment | undefined> {
  return updateAssignment(assignmentId, userId, { status });
}

export async function getAssignmentsByStatus(
  status: string,
  userId: number
): Promise<CargoAssignment[]> {
  return db
    .select()
    .from(cargoAssignments)
    .where(
      and(eq(cargoAssignments.status, status), eq(cargoAssignments.user_id, userId))
    );
}

export async function deleteAssignmentsByNodeId(nodeId: string, userId: number): Promise<void> {
  await db.delete(cargoAssignments).where(
    and(eq(cargoAssignments.node_id, nodeId), eq(cargoAssignments.user_id, userId))
  );
}

export async function deleteAssignmentsByCargoId(cargoId: string, userId: number): Promise<void> {
  await db.delete(cargoAssignments).where(
    and(eq(cargoAssignments.cargo_id, cargoId), eq(cargoAssignments.user_id, userId))
  );
}
