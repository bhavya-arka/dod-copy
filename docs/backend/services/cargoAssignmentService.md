# Cargo Assignment Service Documentation

## Overview

The `cargoAssignmentService.ts` module provides data access functions for managing cargo assignments in the DAG system. Assignments link cargo items to nodes (airbases or flights) with status tracking and sequencing.

**File**: `apps/server/services/cargoAssignmentService.ts`

## Database Table

**Table**: `cargo_assignments`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key (auto-generated) |
| `user_id` | integer | Owner user ID |
| `cargo_id` | UUID | Reference to cargo_items.id |
| `node_id` | UUID | Reference to dag_nodes.id |
| `status` | text | Assignment status |
| `sequence` | integer | Order in cargo chain |
| `pallet_position` | integer | Position on aircraft (optional) |
| `metadata` | jsonb | Additional data |
| `created_at` | timestamp | Creation timestamp |
| `updated_at` | timestamp | Last update timestamp |

### Status Values

- `'assigned'` - Cargo assigned to node (default)
- `'in_transit'` - Cargo currently being transported
- `'delivered'` - Cargo delivered to destination
- `'pending'` - Awaiting processing

---

## Exported Functions

### createAssignment

```typescript
async function createAssignment(assignment: InsertCargoAssignment): Promise<CargoAssignment>
```

**Purpose**: Create a new cargo assignment.

**Parameters**:
- `assignment` - Assignment data including `user_id`, `cargo_id`, `node_id`

**Returns**: Created `CargoAssignment` with generated UUID

**Database Operations**: INSERT into `cargo_assignments`

---

### getAssignment

```typescript
async function getAssignment(assignmentId: string, userId: number): Promise<CargoAssignment | undefined>
```

**Purpose**: Retrieve a specific assignment.

**Parameters**:
- `assignmentId` - UUID of the assignment
- `userId` - Owner's user ID

**Returns**: `CargoAssignment` or `undefined`

**Database Operations**: SELECT from `cargo_assignments` WHERE id AND user_id

---

### getAssignments

```typescript
async function getAssignments(userId: number): Promise<CargoAssignment[]>
```

**Purpose**: List all assignments for a user.

**Parameters**:
- `userId` - Owner's user ID

**Returns**: Array of `CargoAssignment` objects

**Database Operations**: SELECT from `cargo_assignments` WHERE user_id

---

### getAssignmentsByNodeId

```typescript
async function getAssignmentsByNodeId(nodeId: string, userId: number): Promise<CargoAssignment[]>
```

**Purpose**: Get all assignments for a specific node.

**Parameters**:
- `nodeId` - UUID of the DAG node
- `userId` - Owner's user ID

**Returns**: Array of `CargoAssignment` objects

**Database Operations**: SELECT from `cargo_assignments` WHERE node_id AND user_id

---

### getAssignmentsByCargoId

```typescript
async function getAssignmentsByCargoId(cargoId: string, userId: number): Promise<CargoAssignment[]>
```

**Purpose**: Get all assignments for a specific cargo item.

**Parameters**:
- `cargoId` - UUID of the cargo item
- `userId` - Owner's user ID

**Returns**: Array of `CargoAssignment` objects

**Database Operations**: SELECT from `cargo_assignments` WHERE cargo_id AND user_id

---

### updateAssignment

```typescript
async function updateAssignment(
  assignmentId: string,
  userId: number,
  data: Partial<InsertCargoAssignment>
): Promise<CargoAssignment | undefined>
```

**Purpose**: Update an existing assignment.

**Parameters**:
- `assignmentId` - UUID of the assignment
- `userId` - Owner's user ID
- `data` - Partial update data

**Returns**: Updated `CargoAssignment` or `undefined` if not found

**Database Operations**: UPDATE `cargo_assignments` SET ... WHERE id AND user_id

**Side Effects**: Automatically updates `updated_at` timestamp

---

### deleteAssignment

```typescript
async function deleteAssignment(assignmentId: string, userId: number): Promise<void>
```

**Purpose**: Delete an assignment.

**Parameters**:
- `assignmentId` - UUID of the assignment
- `userId` - Owner's user ID

**Database Operations**: DELETE from `cargo_assignments` WHERE id AND user_id

---

### getCargoAtNode

```typescript
async function getCargoAtNode(nodeId: string, userId: number): Promise<CargoItem[]>
```

**Purpose**: Get all cargo items assigned to a node (with full cargo details).

**Parameters**:
- `nodeId` - UUID of the DAG node
- `userId` - Owner's user ID

**Returns**: Array of `CargoItem` objects

**Database Operations**: 
1. SELECT assignments from `cargo_assignments` WHERE node_id
2. SELECT cargo items from `cargo_items` WHERE id IN (...)

**Notes**: Returns empty array if no assignments exist

---

### assignCargoToNode

```typescript
async function assignCargoToNode(
  cargoId: string,
  nodeId: string,
  userId: number,
  options?: {
    status?: string;
    sequence?: number;
    palletPosition?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<CargoAssignment>
```

**Purpose**: Convenience function to create an assignment with default values.

**Parameters**:
- `cargoId` - UUID of the cargo item
- `nodeId` - UUID of the DAG node
- `userId` - Owner's user ID
- `options` - Optional configuration:
  - `status` - Default: `'assigned'`
  - `sequence` - Default: `0`
  - `palletPosition` - Optional pallet position
  - `metadata` - Default: `{}`

**Returns**: Created `CargoAssignment`

**Database Operations**: INSERT into `cargo_assignments`

---

### updateAssignmentStatus

```typescript
async function updateAssignmentStatus(
  assignmentId: string,
  userId: number,
  status: string
): Promise<CargoAssignment | undefined>
```

**Purpose**: Convenience function to update only the status.

**Parameters**:
- `assignmentId` - UUID of the assignment
- `userId` - Owner's user ID
- `status` - New status value

**Returns**: Updated `CargoAssignment` or `undefined`

**Database Operations**: UPDATE `cargo_assignments` SET status

---

### getAssignmentsByStatus

```typescript
async function getAssignmentsByStatus(status: string, userId: number): Promise<CargoAssignment[]>
```

**Purpose**: Filter assignments by status.

**Parameters**:
- `status` - Status to filter by
- `userId` - Owner's user ID

**Returns**: Array of matching `CargoAssignment` objects

**Database Operations**: SELECT from `cargo_assignments` WHERE status AND user_id

---

### deleteAssignmentsByNodeId

```typescript
async function deleteAssignmentsByNodeId(nodeId: string, userId: number): Promise<void>
```

**Purpose**: Delete all assignments for a node (cleanup when deleting node).

**Parameters**:
- `nodeId` - UUID of the DAG node
- `userId` - Owner's user ID

**Database Operations**: DELETE from `cargo_assignments` WHERE node_id AND user_id

---

### deleteAssignmentsByCargoId

```typescript
async function deleteAssignmentsByCargoId(cargoId: string, userId: number): Promise<void>
```

**Purpose**: Delete all assignments for a cargo item (cleanup when deleting cargo).

**Parameters**:
- `cargoId` - UUID of the cargo item
- `userId` - Owner's user ID

**Database Operations**: DELETE from `cargo_assignments` WHERE cargo_id AND user_id

---

## Type Definitions

### CargoAssignment

```typescript
type CargoAssignment = {
  id: string;           // UUID
  user_id: number;
  cargo_id: string;     // UUID reference to cargo_items
  node_id: string;      // UUID reference to dag_nodes
  status: string;       // 'assigned' | 'in_transit' | 'delivered' | 'pending'
  sequence: number;
  pallet_position: number | null;
  metadata: object;
  created_at: Date;
  updated_at: Date;
}
```

### InsertCargoAssignment

```typescript
type InsertCargoAssignment = {
  user_id: number;
  cargo_id: string;
  node_id: string;
  status?: string;
  sequence?: number;
  pallet_position?: number;
  metadata?: object;
}
```

---

## Usage Examples

### Assign cargo to a flight node
```typescript
import { assignCargoToNode } from './services/cargoAssignmentService';

const assignment = await assignCargoToNode(
  cargoId,
  flightNodeId,
  userId,
  { status: 'assigned', sequence: 1, palletPosition: 5 }
);
```

### Track cargo through transit
```typescript
import { updateAssignmentStatus, getAssignmentsByCargoId } from './services/cargoAssignmentService';

// Update to in-transit
await updateAssignmentStatus(assignmentId, userId, 'in_transit');

// Get all assignments for a cargo item
const history = await getAssignmentsByCargoId(cargoId, userId);
```

### Get cargo at a node with details
```typescript
import { getCargoAtNode } from './services/cargoAssignmentService';

const cargoItems = await getCargoAtNode(airbaseNodeId, userId);
for (const item of cargoItems) {
  console.log(`TCN: ${item.tcn}, Weight: ${item.weight_lb} lbs`);
}
```

---

## Relationships

```
CargoItem (cargo_items)
    └── CargoAssignment (cargo_assignments) ──┘
             │
             v
        DagNode (dag_nodes)
```

- A cargo item can have multiple assignments (tracking history)
- A node can have multiple cargo assignments
- Assignments track the cargo's journey through the network
