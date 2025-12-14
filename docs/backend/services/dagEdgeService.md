# DAG Edge Service Documentation

## Overview

The `dagEdgeService.ts` module provides data access functions for managing edges in the Directed Acyclic Graph (DAG) system. Edges represent connections between nodes (airbases and flights) with validation to ensure DAG constraints are maintained.

**File**: `apps/server/services/dagEdgeService.ts`

## Database Table

**Table**: `dag_edges`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key (auto-generated) |
| `user_id` | integer | Owner user ID |
| `parent_id` | UUID | Reference to dag_nodes.id (source) |
| `child_id` | UUID | Reference to dag_nodes.id (target) |
| `cargo_shared` | boolean | Whether cargo is shared (for flight→flight) |
| `edge_data` | jsonb | Additional data (distance, fuel, time, etc.) |
| `created_at` | timestamp | Creation timestamp |

---

## Exported Functions

### createEdge

```typescript
async function createEdge(edge: InsertDagEdge): Promise<{ edge?: DagEdge; error?: string }>
```

**Purpose**: Create a new edge with full validation.

**Parameters**:
- `edge` - Edge data including `user_id`, `parent_id`, `child_id`, `cargo_shared`

**Returns**: Object with either `edge` (success) or `error` (failure message)

**Database Operations**:
1. SELECT parent node from `dag_nodes`
2. SELECT child node from `dag_nodes`
3. Validate node type rules
4. SELECT all existing edges for cycle detection
5. Check for duplicate edge
6. INSERT into `dag_edges`

**Validation Checks**:
- Parent node exists and belongs to user
- Child node exists and belongs to user
- Node type combination is valid (see dagValidator)
- Adding edge would not create a cycle
- Edge does not already exist between nodes

**Error Messages**:
- `"Parent node {id} not found or access denied"`
- `"Child node {id} not found or access denied"`
- `"Airbase → Airbase connections are not allowed"`
- `"Flight → Flight connections require cargo_shared flag to be true"`
- `"Adding this edge would create a cycle in the DAG"`
- `"Edge already exists between these nodes"`

---

### getEdge

```typescript
async function getEdge(edgeId: string, userId: number): Promise<DagEdge | undefined>
```

**Purpose**: Retrieve a specific edge.

**Parameters**:
- `edgeId` - UUID of the edge
- `userId` - Owner's user ID

**Returns**: `DagEdge` or `undefined` if not found

**Database Operations**: SELECT from `dag_edges` WHERE id AND user_id

---

### getEdges

```typescript
async function getEdges(userId: number): Promise<DagEdge[]>
```

**Purpose**: List all edges for a user.

**Parameters**:
- `userId` - Owner's user ID

**Returns**: Array of `DagEdge` objects

**Database Operations**: SELECT from `dag_edges` WHERE user_id

---

### getEdgesByNodeId

```typescript
async function getEdgesByNodeId(nodeId: string, userId: number): Promise<DagEdge[]>
```

**Purpose**: Get all edges connected to a node (as parent or child).

**Parameters**:
- `nodeId` - UUID of the node
- `userId` - Owner's user ID

**Returns**: Array of `DagEdge` objects

**Database Operations**: SELECT from `dag_edges` WHERE (parent_id = nodeId OR child_id = nodeId) AND user_id

---

### updateEdge

```typescript
async function updateEdge(
  edgeId: string,
  userId: number,
  data: Partial<InsertDagEdge>
): Promise<DagEdge | undefined>
```

**Purpose**: Update an existing edge.

**Parameters**:
- `edgeId` - UUID of the edge
- `userId` - Owner's user ID
- `data` - Partial update data (typically `edge_data` or `cargo_shared`)

**Returns**: Updated `DagEdge` or `undefined` if not found

**Database Operations**: UPDATE `dag_edges` SET ... WHERE id AND user_id

**Notes**: Does not allow changing `parent_id` or `child_id` (delete and recreate instead)

---

### deleteEdge

```typescript
async function deleteEdge(edgeId: string, userId: number): Promise<void>
```

**Purpose**: Delete an edge.

**Parameters**:
- `edgeId` - UUID of the edge
- `userId` - Owner's user ID

**Database Operations**: DELETE from `dag_edges` WHERE id AND user_id

---

### validateEdge

```typescript
async function validateEdge(
  parentId: string,
  childId: string,
  userId: number,
  cargoShared: boolean = false
): Promise<ValidationResult>
```

**Purpose**: Validate a potential edge without creating it.

**Parameters**:
- `parentId` - UUID of the parent node
- `childId` - UUID of the child node
- `userId` - Owner's user ID
- `cargoShared` - Whether cargo would be shared

**Returns**: `{ valid: boolean; error?: string }`

**Database Operations**:
1. SELECT parent node from `dag_nodes`
2. SELECT child node from `dag_nodes`
3. SELECT all edges for cycle detection

**Use Case**: Pre-validation before showing UI confirmation

---

## Type Definitions

### DagEdge

```typescript
type DagEdge = {
  id: string;           // UUID
  user_id: number;
  parent_id: string;    // UUID reference to dag_nodes
  child_id: string;     // UUID reference to dag_nodes
  cargo_shared: boolean;
  edge_data: object;
  created_at: Date;
}
```

### InsertDagEdge

```typescript
type InsertDagEdge = {
  user_id: number;
  parent_id: string;
  child_id: string;
  cargo_shared?: boolean;
  edge_data?: object;
}
```

### ValidationResult

```typescript
type ValidationResult = {
  valid: boolean;
  error?: string;
}
```

---

## Edge Type Rules

| Parent Type | Child Type | Allowed | Requirements |
|-------------|------------|---------|--------------|
| `airbase` | `flight` | ✅ Yes | Flight departs from airbase |
| `flight` | `airbase` | ✅ Yes | Flight arrives at airbase |
| `airbase` | `airbase` | ❌ No | Cannot connect airbases directly |
| `flight` | `flight` | ⚠️ Conditional | Requires `cargo_shared = true` |

---

## Usage Examples

### Create an edge with validation
```typescript
import { createEdge } from './services/dagEdgeService';

const result = await createEdge({
  user_id: userId,
  parent_id: airbaseNodeId,
  child_id: flightNodeId,
  edge_data: { distance_nm: 1200, fuel_lb: 50000 }
});

if (result.error) {
  console.error('Failed to create edge:', result.error);
} else {
  console.log('Edge created:', result.edge.id);
}
```

### Pre-validate before creating
```typescript
import { validateEdge, createEdge } from './services/dagEdgeService';

const validation = await validateEdge(parentId, childId, userId, false);

if (validation.valid) {
  await createEdge({ user_id: userId, parent_id: parentId, child_id: childId });
} else {
  showError(validation.error);
}
```

### Get all connections for a node
```typescript
import { getEdgesByNodeId } from './services/dagEdgeService';

const edges = await getEdgesByNodeId(nodeId, userId);
const incomingEdges = edges.filter(e => e.child_id === nodeId);
const outgoingEdges = edges.filter(e => e.parent_id === nodeId);
```

---

## Cycle Detection

The service prevents cycles using DFS (Depth-First Search):

1. Build adjacency list from existing edges
2. Add proposed edge to the list
3. Run DFS from each node
4. If any node is visited twice in the same path, a cycle exists

Example of prevented cycle:
```
A → B → C → A  ❌ (would create cycle)
```

---

## Dependencies

- `dagValidator.validateNodeTypeRules()` - Node type combination validation
- `dagValidator.detectCycle()` - Cycle detection algorithm
