import { db } from "../db";
import { dagEdges, dagNodes, DagEdge, InsertDagEdge, DagNodeType } from "@shared/schema";
import { eq, and, or } from "drizzle-orm";
import { validateNodeTypeRules, detectCycle, ValidationResult } from "./dagValidator";

export async function createEdge(edge: InsertDagEdge): Promise<{ edge?: DagEdge; error?: string }> {
  const [parentNode] = await db
    .select()
    .from(dagNodes)
    .where(and(eq(dagNodes.id, edge.parent_id), eq(dagNodes.user_id, edge.user_id)));
  
  const [childNode] = await db
    .select()
    .from(dagNodes)
    .where(and(eq(dagNodes.id, edge.child_id), eq(dagNodes.user_id, edge.user_id)));
  
  if (!parentNode) {
    return { error: `Parent node ${edge.parent_id} not found or access denied` };
  }
  
  if (!childNode) {
    return { error: `Child node ${edge.child_id} not found or access denied` };
  }
  
  const typeValidation = validateNodeTypeRules(
    parentNode.node_type as DagNodeType,
    childNode.node_type as DagNodeType,
    edge.cargo_shared ?? false
  );
  
  if (!typeValidation.valid) {
    return { error: typeValidation.error };
  }
  
  const existingEdges = await db
    .select()
    .from(dagEdges)
    .where(eq(dagEdges.user_id, edge.user_id));
  
  if (detectCycle(existingEdges, edge.parent_id, edge.child_id)) {
    return { error: 'Adding this edge would create a cycle in the DAG' };
  }
  
  const [existingEdge] = await db
    .select()
    .from(dagEdges)
    .where(
      and(
        eq(dagEdges.parent_id, edge.parent_id),
        eq(dagEdges.child_id, edge.child_id),
        eq(dagEdges.user_id, edge.user_id)
      )
    );
  
  if (existingEdge) {
    return { error: 'Edge already exists between these nodes' };
  }
  
  const [created] = await db.insert(dagEdges).values(edge).returning();
  return { edge: created };
}

export async function getEdge(edgeId: string, userId: number): Promise<DagEdge | undefined> {
  const [edge] = await db.select().from(dagEdges).where(
    and(eq(dagEdges.id, edgeId), eq(dagEdges.user_id, userId))
  );
  return edge;
}

export async function getEdges(userId: number): Promise<DagEdge[]> {
  return db.select().from(dagEdges).where(eq(dagEdges.user_id, userId));
}

export async function getEdgesByNodeId(nodeId: string, userId: number): Promise<DagEdge[]> {
  return db
    .select()
    .from(dagEdges)
    .where(
      and(
        eq(dagEdges.user_id, userId),
        or(eq(dagEdges.parent_id, nodeId), eq(dagEdges.child_id, nodeId))
      )
    );
}

export async function updateEdge(
  edgeId: string,
  userId: number,
  data: Partial<InsertDagEdge>
): Promise<DagEdge | undefined> {
  const [updated] = await db
    .update(dagEdges)
    .set(data)
    .where(and(eq(dagEdges.id, edgeId), eq(dagEdges.user_id, userId)))
    .returning();
  return updated;
}

export async function deleteEdge(edgeId: string, userId: number): Promise<void> {
  await db.delete(dagEdges).where(
    and(eq(dagEdges.id, edgeId), eq(dagEdges.user_id, userId))
  );
}

export async function validateEdge(
  parentId: string,
  childId: string,
  userId: number,
  cargoShared: boolean = false
): Promise<ValidationResult> {
  const [parentNode] = await db
    .select()
    .from(dagNodes)
    .where(and(eq(dagNodes.id, parentId), eq(dagNodes.user_id, userId)));
  
  const [childNode] = await db
    .select()
    .from(dagNodes)
    .where(and(eq(dagNodes.id, childId), eq(dagNodes.user_id, userId)));
  
  if (!parentNode) {
    return { valid: false, error: `Parent node ${parentId} not found or access denied` };
  }
  
  if (!childNode) {
    return { valid: false, error: `Child node ${childId} not found or access denied` };
  }
  
  const typeValidation = validateNodeTypeRules(
    parentNode.node_type as DagNodeType,
    childNode.node_type as DagNodeType,
    cargoShared
  );
  
  if (!typeValidation.valid) {
    return typeValidation;
  }
  
  const existingEdges = await db
    .select()
    .from(dagEdges)
    .where(eq(dagEdges.user_id, userId));
  
  if (detectCycle(existingEdges, parentId, childId)) {
    return { valid: false, error: 'Adding this edge would create a cycle in the DAG' };
  }
  
  return { valid: true };
}
