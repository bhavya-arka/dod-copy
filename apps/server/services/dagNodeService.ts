import { db } from "../db";
import { dagNodes, dagEdges, DagNode, InsertDagNode } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getAncestorIds, getDescendantIds } from "./dagValidator";

export async function createNode(node: InsertDagNode): Promise<DagNode> {
  const [created] = await db.insert(dagNodes).values(node).returning();
  return created;
}

export async function getNode(nodeId: string): Promise<DagNode | undefined> {
  const [node] = await db.select().from(dagNodes).where(eq(dagNodes.id, nodeId));
  return node;
}

export async function getNodes(userId: number): Promise<DagNode[]> {
  return db.select().from(dagNodes).where(eq(dagNodes.user_id, userId));
}

export async function getNodesByIds(nodeIds: string[]): Promise<DagNode[]> {
  if (nodeIds.length === 0) return [];
  return db.select().from(dagNodes).where(inArray(dagNodes.id, nodeIds));
}

export async function updateNode(
  nodeId: string,
  userId: number,
  data: Partial<InsertDagNode>
): Promise<DagNode | undefined> {
  const [updated] = await db
    .update(dagNodes)
    .set({ ...data, updated_at: new Date() })
    .where(and(eq(dagNodes.id, nodeId), eq(dagNodes.user_id, userId)))
    .returning();
  return updated;
}

export async function deleteNode(nodeId: string, userId: number): Promise<void> {
  await db.delete(dagEdges).where(
    and(
      eq(dagEdges.user_id, userId),
      eq(dagEdges.parent_id, nodeId)
    )
  );
  await db.delete(dagEdges).where(
    and(
      eq(dagEdges.user_id, userId),
      eq(dagEdges.child_id, nodeId)
    )
  );
  
  await db.delete(dagNodes).where(
    and(eq(dagNodes.id, nodeId), eq(dagNodes.user_id, userId))
  );
}

export async function getChildren(nodeId: string, userId: number): Promise<DagNode[]> {
  const edges = await db
    .select()
    .from(dagEdges)
    .where(and(eq(dagEdges.parent_id, nodeId), eq(dagEdges.user_id, userId)));
  
  const childIds = edges.map(e => e.child_id);
  if (childIds.length === 0) return [];
  
  return getNodesByIds(childIds);
}

export async function getParents(nodeId: string, userId: number): Promise<DagNode[]> {
  const edges = await db
    .select()
    .from(dagEdges)
    .where(and(eq(dagEdges.child_id, nodeId), eq(dagEdges.user_id, userId)));
  
  const parentIds = edges.map(e => e.parent_id);
  if (parentIds.length === 0) return [];
  
  return getNodesByIds(parentIds);
}

export async function getAncestors(nodeId: string, userId: number): Promise<DagNode[]> {
  const edges = await db
    .select()
    .from(dagEdges)
    .where(eq(dagEdges.user_id, userId));
  
  const ancestorIds = getAncestorIds(edges, nodeId);
  if (ancestorIds.length === 0) return [];
  
  return getNodesByIds(ancestorIds);
}

export async function getDescendants(nodeId: string, userId: number): Promise<DagNode[]> {
  const edges = await db
    .select()
    .from(dagEdges)
    .where(eq(dagEdges.user_id, userId));
  
  const descendantIds = getDescendantIds(edges, nodeId);
  if (descendantIds.length === 0) return [];
  
  return getNodesByIds(descendantIds);
}
