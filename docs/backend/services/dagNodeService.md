# DAG Node Service Documentation

## Overview

The `dagNodeService.ts` module provides data access functions for managing nodes in the Directed Acyclic Graph (DAG) system. Nodes represent either airbases or flights in the logistics network.

**File**: `apps/server/services/dagNodeService.ts`

## Database Table

**Table**: `dag_nodes`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key (auto-generated) |
| `user_id` | integer | Owner user ID |
| `node_type` | text | 'airbase' or 'flight' |
| `name` | text | Display name |
| `icao` | text | ICAO code (for airbases) |
| `latitude` | numeric(10,6) | Latitude coordinate |
| `longitude` | numeric(10,6) | Longitude coordinate |
| `position_x` | integer | UI X position |
| `position_y` | integer | UI Y position |
| `metadata` | jsonb | Additional data |
| `created_at` | timestamp | Creation timestamp |
| `updated_at` | timestamp | Last update timestamp |

### Node Types

- `'airbase'` - Represents a military airbase location
- `'flight'` - Represents a flight between locations

---

## Exported Functions

### createNode

```typescript
async function createNode(node: InsertDagNode): Promise<DagNode>
```

**Purpose**: Create a new DAG node.

**Parameters**:
- `node` - Node data including `user_id`, `node_type`, `name`, etc.

**Returns**: Created `DagNode` with generated UUID

**Database Operations**: INSERT into `dag_nodes`

---

### getNode

```typescript
async function getNode(nodeId: string, userId: number): Promise<DagNode | undefined>
```

**Purpose**: Retrieve a specific node.

**Parameters**:
- `nodeId` - UUID of the node
- `userId` - Owner's user ID

**Returns**: `DagNode` or `undefined` if not found

**Database Operations**: SELECT from `dag_nodes` WHERE id AND user_id

---

### getNodes

```typescript
async function getNodes(userId: number): Promise<DagNode[]>
```

**Purpose**: List all nodes for a user.

**Parameters**:
- `userId` - Owner's user ID

**Returns**: Array of `DagNode` objects

**Database Operations**: SELECT from `dag_nodes` WHERE user_id

---

### getNodesByIds

```typescript
async function getNodesByIds(nodeIds: string[]): Promise<DagNode[]>
```

**Purpose**: Retrieve multiple nodes by their IDs.

**Parameters**:
- `nodeIds` - Array of UUIDs

**Returns**: Array of `DagNode` objects

**Database Operations**: SELECT from `dag_nodes` WHERE id IN (...)

**Notes**: 
- Returns empty array if `nodeIds` is empty
- Does not filter by user (used internally after edge queries)

---

### updateNode

```typescript
async function updateNode(
  nodeId: string,
  userId: number,
  data: Partial<InsertDagNode>
): Promise<DagNode | undefined>
```

**Purpose**: Update an existing node.

**Parameters**:
- `nodeId` - UUID of the node
- `userId` - Owner's user ID
- `data` - Partial update data

**Returns**: Updated `DagNode` or `undefined` if not found

**Database Operations**: UPDATE `dag_nodes` SET ... WHERE id AND user_id

**Side Effects**: Automatically updates `updated_at` timestamp

---

### deleteNode

```typescript
async function deleteNode(nodeId: string, userId: number): Promise<void>
```

**Purpose**: Delete a node and all connected edges.

**Parameters**:
- `nodeId` - UUID of the node
- `userId` - Owner's user ID

**Database Operations**:
1. DELETE from `dag_edges` WHERE parent_id = nodeId AND user_id
2. DELETE from `dag_edges` WHERE child_id = nodeId AND user_id
3. DELETE from `dag_nodes` WHERE id AND user_id

**Side Effects**: Cascades deletion to all edges connected to this node

---

### getChildren

```typescript
async function getChildren(nodeId: string, userId: number): Promise<DagNode[]>
```

**Purpose**: Get direct child nodes (nodes this node points to).

**Parameters**:
- `nodeId` - UUID of the parent node
- `userId` - Owner's user ID

**Returns**: Array of child `DagNode` objects

**Database Operations**:
1. SELECT edges from `dag_edges` WHERE parent_id = nodeId
2. SELECT nodes from `dag_nodes` WHERE id IN (child_ids)

---

### getParents

```typescript
async function getParents(nodeId: string, userId: number): Promise<DagNode[]>
```

**Purpose**: Get direct parent nodes (nodes that point to this node).

**Parameters**:
- `nodeId` - UUID of the child node
- `userId` - Owner's user ID

**Returns**: Array of parent `DagNode` objects

**Database Operations**:
1. SELECT edges from `dag_edges` WHERE child_id = nodeId
2. SELECT nodes from `dag_nodes` WHERE id IN (parent_ids)

---

### getAncestors

```typescript
async function getAncestors(nodeId: string, userId: number): Promise<DagNode[]>
```

**Purpose**: Get all ancestor nodes (recursive traversal up the DAG).

**Parameters**:
- `nodeId` - UUID of the starting node
- `userId` - Owner's user ID

**Returns**: Array of all ancestor `DagNode` objects

**Database Operations**:
1. SELECT all edges from `dag_edges` WHERE user_id
2. Compute ancestor IDs using `dagValidator.getAncestorIds()`
3. SELECT nodes from `dag_nodes` WHERE id IN (ancestor_ids)

**Algorithm**: BFS traversal following parent_id edges upward

---

### getDescendants

```typescript
async function getDescendants(nodeId: string, userId: number): Promise<DagNode[]>
```

**Purpose**: Get all descendant nodes (recursive traversal down the DAG).

**Parameters**:
- `nodeId` - UUID of the starting node
- `userId` - Owner's user ID

**Returns**: Array of all descendant `DagNode` objects

**Database Operations**:
1. SELECT all edges from `dag_edges` WHERE user_id
2. Compute descendant IDs using `dagValidator.getDescendantIds()`
3. SELECT nodes from `dag_nodes` WHERE id IN (descendant_ids)

**Algorithm**: BFS traversal following child_id edges downward

---

## Type Definitions

### DagNode

```typescript
type DagNode = {
  id: string;             // UUID
  user_id: number;
  node_type: string;      // 'airbase' | 'flight'
  name: string;
  icao: string | null;
  latitude: string | null;
  longitude: string | null;
  position_x: number;
  position_y: number;
  metadata: object;
  created_at: Date;
  updated_at: Date;
}
```

### InsertDagNode

```typescript
type InsertDagNode = {
  user_id: number;
  node_type: string;
  name: string;
  icao?: string;
  latitude?: string;
  longitude?: string;
  position_x?: number;
  position_y?: number;
  metadata?: object;
}
```

---

## Usage Examples

### Create an airbase node
```typescript
import { createNode } from './services/dagNodeService';

const airbase = await createNode({
  user_id: userId,
  node_type: 'airbase',
  name: 'Kadena Air Base',
  icao: 'RODN',
  latitude: '26.3516',
  longitude: '127.7695',
  metadata: { runways: 2 }
});
```

### Create a flight node
```typescript
const flight = await createNode({
  user_id: userId,
  node_type: 'flight',
  name: 'REACH 123',
  metadata: { aircraft: 'C-17', callsign: 'REACH123' }
});
```

### Traverse the DAG
```typescript
import { getAncestors, getDescendants } from './services/dagNodeService';

// Get all nodes that lead to this node
const origins = await getAncestors(flightNodeId, userId);

// Get all nodes reachable from this node
const destinations = await getDescendants(airbaseNodeId, userId);
```

---

## DAG Structure

```
         Airbase A
              │
              ▼
         Flight 1  ──────────┐
              │              │
              ▼              ▼
         Airbase B      Airbase C
              │
              ▼
         Flight 2
              │
              ▼
         Airbase D
```

- Edges define parent → child relationships
- Airbases can connect to flights (departures)
- Flights can connect to airbases (arrivals)
- Flights can connect to flights (cargo sharing)
- Cycles are not allowed (enforced by dagEdgeService)

---

## Dependencies

- `dagValidator.getAncestorIds()` - For computing ancestor traversal
- `dagValidator.getDescendantIds()` - For computing descendant traversal
