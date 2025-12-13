import { DagNode, DagEdge, DagNodeType } from "@shared/schema";

export type ValidationResult = {
  valid: boolean;
  error?: string;
};

export function validateNodeTypeRules(
  parentType: DagNodeType,
  childType: DagNodeType,
  cargoShared: boolean = false
): ValidationResult {
  if (parentType === 'airbase' && childType === 'flight') {
    return { valid: true };
  }
  
  if (parentType === 'flight' && childType === 'airbase') {
    return { valid: true };
  }
  
  if (parentType === 'airbase' && childType === 'airbase') {
    return { valid: false, error: 'Airbase → Airbase connections are not allowed' };
  }
  
  if (parentType === 'flight' && childType === 'flight') {
    if (cargoShared) {
      return { valid: true };
    }
    return { valid: false, error: 'Flight → Flight connections require cargo_shared flag to be true' };
  }
  
  return { valid: false, error: `Invalid node type combination: ${parentType} → ${childType}` };
}

export function detectCycle(
  edges: DagEdge[],
  parentId: string,
  childId: string
): boolean {
  const adjacencyList = new Map<string, string[]>();
  
  for (const edge of edges) {
    if (!adjacencyList.has(edge.parent_id)) {
      adjacencyList.set(edge.parent_id, []);
    }
    adjacencyList.get(edge.parent_id)!.push(edge.child_id);
  }
  
  if (!adjacencyList.has(parentId)) {
    adjacencyList.set(parentId, []);
  }
  adjacencyList.get(parentId)!.push(childId);
  
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  
  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    
    const neighbors = adjacencyList.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) {
          return true;
        }
      } else if (recursionStack.has(neighbor)) {
        return true;
      }
    }
    
    recursionStack.delete(nodeId);
    return false;
  }
  
  const allNodes = new Set<string>();
  for (const edge of edges) {
    allNodes.add(edge.parent_id);
    allNodes.add(edge.child_id);
  }
  allNodes.add(parentId);
  allNodes.add(childId);
  
  for (const nodeId of allNodes) {
    if (!visited.has(nodeId)) {
      if (dfs(nodeId)) {
        return true;
      }
    }
  }
  
  return false;
}

export function getSiblings(
  nodes: DagNode[],
  edges: DagEdge[],
  nodeId: string
): DagNode[] {
  const parentEdges = edges.filter(e => e.child_id === nodeId);
  const parentIds = parentEdges.map(e => e.parent_id);
  
  if (parentIds.length === 0) {
    return [];
  }
  
  const siblingEdges = edges.filter(
    e => parentIds.includes(e.parent_id) && e.child_id !== nodeId
  );
  const siblingIds = new Set(siblingEdges.map(e => e.child_id));
  
  return nodes.filter(n => siblingIds.has(n.id));
}

export function getAncestorIds(edges: DagEdge[], nodeId: string): string[] {
  const parentMap = new Map<string, string[]>();
  for (const edge of edges) {
    if (!parentMap.has(edge.child_id)) {
      parentMap.set(edge.child_id, []);
    }
    parentMap.get(edge.child_id)!.push(edge.parent_id);
  }
  
  const ancestors = new Set<string>();
  const queue = parentMap.get(nodeId) || [];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (!ancestors.has(current)) {
      ancestors.add(current);
      const parents = parentMap.get(current) || [];
      queue.push(...parents);
    }
  }
  
  return Array.from(ancestors);
}

export function getDescendantIds(edges: DagEdge[], nodeId: string): string[] {
  const childMap = new Map<string, string[]>();
  for (const edge of edges) {
    if (!childMap.has(edge.parent_id)) {
      childMap.set(edge.parent_id, []);
    }
    childMap.get(edge.parent_id)!.push(edge.child_id);
  }
  
  const descendants = new Set<string>();
  const queue = childMap.get(nodeId) || [];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (!descendants.has(current)) {
      descendants.add(current);
      const children = childMap.get(current) || [];
      queue.push(...children);
    }
  }
  
  return Array.from(descendants);
}
