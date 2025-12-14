# DAG Validator Documentation

## Overview

The `dagValidator.ts` module provides pure utility functions for validating DAG (Directed Acyclic Graph) constraints. It contains no database access and operates on in-memory data structures.

**File**: `apps/server/services/dagValidator.ts`

## Purpose

This module ensures:
- Node type combinations follow business rules
- The graph remains acyclic (no cycles)
- Graph traversal algorithms (ancestors, descendants, siblings)

---

## Type Definitions

### ValidationResult

```typescript
type ValidationResult = {
  valid: boolean;
  error?: string;
}
```

### DagNodeType

```typescript
type DagNodeType = 'airbase' | 'flight';
```

---

## Exported Functions

### validateNodeTypeRules

```typescript
function validateNodeTypeRules(
  parentType: DagNodeType,
  childType: DagNodeType,
  cargoShared: boolean = false
): ValidationResult
```

**Purpose**: Validate if a connection between two node types is allowed.

**Parameters**:
- `parentType` - Type of the source node
- `childType` - Type of the target node
- `cargoShared` - Whether cargo is shared (required for flight→flight)

**Returns**: `ValidationResult` with `valid` boolean and optional `error` message

**Rules**:

| Parent | Child | cargoShared | Result |
|--------|-------|-------------|--------|
| `airbase` | `flight` | any | ✅ Valid |
| `flight` | `airbase` | any | ✅ Valid |
| `airbase` | `airbase` | any | ❌ "Airbase → Airbase connections are not allowed" |
| `flight` | `flight` | `true` | ✅ Valid |
| `flight` | `flight` | `false` | ❌ "Flight → Flight connections require cargo_shared flag to be true" |

**Example**:
```typescript
const result = validateNodeTypeRules('airbase', 'flight', false);
// { valid: true }

const result = validateNodeTypeRules('flight', 'flight', false);
// { valid: false, error: 'Flight → Flight connections require cargo_shared flag to be true' }
```

---

### detectCycle

```typescript
function detectCycle(
  edges: DagEdge[],
  parentId: string,
  childId: string
): boolean
```

**Purpose**: Detect if adding a new edge would create a cycle in the graph.

**Parameters**:
- `edges` - Array of existing edges
- `parentId` - UUID of proposed parent node
- `childId` - UUID of proposed child node

**Returns**: `true` if adding the edge would create a cycle, `false` otherwise

**Algorithm**: Depth-First Search (DFS) with recursion stack tracking

**Implementation Details**:
1. Build adjacency list from existing edges
2. Add proposed edge to adjacency list
3. Perform DFS from all nodes
4. Track visited nodes and recursion stack
5. If a node is visited while still in recursion stack, cycle detected

**Time Complexity**: O(V + E) where V = nodes, E = edges

**Example**:
```typescript
const edges = [
  { parent_id: 'A', child_id: 'B' },
  { parent_id: 'B', child_id: 'C' }
];

detectCycle(edges, 'C', 'A');  // true - would create A→B→C→A cycle
detectCycle(edges, 'A', 'D');  // false - no cycle created
```

---

### getSiblings

```typescript
function getSiblings(
  nodes: DagNode[],
  edges: DagEdge[],
  nodeId: string
): DagNode[]
```

**Purpose**: Find sibling nodes (nodes that share a parent).

**Parameters**:
- `nodes` - Array of all nodes
- `edges` - Array of all edges
- `nodeId` - UUID of the node to find siblings for

**Returns**: Array of sibling `DagNode` objects (excluding the input node)

**Algorithm**:
1. Find all edges where child_id = nodeId (incoming edges)
2. Get parent IDs from those edges
3. Find all edges where parent_id is in parent IDs
4. Return nodes that are children of those parents (excluding input node)

**Example**:
```
     Parent
     /    \
  Node   Sibling
```

```typescript
const siblings = getSiblings(allNodes, allEdges, nodeId);
```

---

### getAncestorIds

```typescript
function getAncestorIds(edges: DagEdge[], nodeId: string): string[]
```

**Purpose**: Get all ancestor node IDs (recursive traversal upward).

**Parameters**:
- `edges` - Array of all edges
- `nodeId` - UUID of the starting node

**Returns**: Array of ancestor node UUIDs

**Algorithm**: Breadth-First Search (BFS) following parent edges

**Implementation Details**:
1. Build parent map: child_id → [parent_ids]
2. Initialize queue with direct parents
3. Process queue, adding each node's parents
4. Track visited to avoid duplicates

**Example**:
```
  A
  │
  B
  │
  C ← starting node
```
```typescript
getAncestorIds(edges, 'C');  // ['B', 'A']
```

---

### getDescendantIds

```typescript
function getDescendantIds(edges: DagEdge[], nodeId: string): string[]
```

**Purpose**: Get all descendant node IDs (recursive traversal downward).

**Parameters**:
- `edges` - Array of all edges
- `nodeId` - UUID of the starting node

**Returns**: Array of descendant node UUIDs

**Algorithm**: Breadth-First Search (BFS) following child edges

**Implementation Details**:
1. Build child map: parent_id → [child_ids]
2. Initialize queue with direct children
3. Process queue, adding each node's children
4. Track visited to avoid duplicates

**Example**:
```
  A ← starting node
  │
  B
 / \
C   D
```
```typescript
getDescendantIds(edges, 'A');  // ['B', 'C', 'D']
```

---

## Usage in Services

### In dagEdgeService.ts

```typescript
import { validateNodeTypeRules, detectCycle } from './dagValidator';

// Validate before creating edge
const typeResult = validateNodeTypeRules(
  parentNode.node_type,
  childNode.node_type,
  edge.cargo_shared
);

if (!typeResult.valid) {
  return { error: typeResult.error };
}

if (detectCycle(existingEdges, edge.parent_id, edge.child_id)) {
  return { error: 'Adding this edge would create a cycle in the DAG' };
}
```

### In dagNodeService.ts

```typescript
import { getAncestorIds, getDescendantIds } from './dagValidator';

// Get all ancestors
const ancestorIds = getAncestorIds(edges, nodeId);
const ancestors = await getNodesByIds(ancestorIds);

// Get all descendants
const descendantIds = getDescendantIds(edges, nodeId);
const descendants = await getNodesByIds(descendantIds);
```

---

## Graph Terminology

| Term | Definition |
|------|------------|
| **Node** | A vertex in the graph (airbase or flight) |
| **Edge** | A directed connection from parent to child |
| **Parent** | The source node of an edge |
| **Child** | The target node of an edge |
| **Ancestor** | Any node reachable by following parent edges upward |
| **Descendant** | Any node reachable by following child edges downward |
| **Sibling** | Nodes that share at least one parent |
| **Cycle** | A path that returns to a previously visited node |
| **DAG** | Directed Acyclic Graph - no cycles allowed |

---

## Performance Considerations

All functions are designed for efficiency:

- **validateNodeTypeRules**: O(1) - constant time lookup
- **detectCycle**: O(V + E) - linear in graph size
- **getSiblings**: O(E) - scans all edges
- **getAncestorIds**: O(V + E) - BFS traversal
- **getDescendantIds**: O(V + E) - BFS traversal

For large graphs, consider caching results or limiting traversal depth.
