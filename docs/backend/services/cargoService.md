# Cargo Service Documentation

## Overview

The `cargoService.ts` module provides data access functions for managing cargo items in the DAG (Directed Acyclic Graph) system. Cargo items represent physical cargo with tracking numbers (TCN) that can be assigned to nodes in the flight network.

**File**: `apps/server/services/cargoService.ts`

## Database Table

**Table**: `cargo_items`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key (auto-generated) |
| `user_id` | integer | Owner user ID |
| `tcn` | text | Transportation Control Number |
| `description` | text | Cargo description |
| `weight_lb` | numeric(12,2) | Weight in pounds |
| `length_in` | numeric(8,2) | Length in inches |
| `width_in` | numeric(8,2) | Width in inches |
| `height_in` | numeric(8,2) | Height in inches |
| `cargo_type` | text | Type category |
| `is_hazmat` | boolean | Hazardous material flag |
| `hazmat_class` | text | Hazmat classification |
| `priority` | text | Priority level |
| `metadata` | jsonb | Additional data |
| `created_at` | timestamp | Creation timestamp |

---

## Exported Functions

### createCargoItem

```typescript
async function createCargoItem(item: InsertCargoItem): Promise<CargoItem>
```

**Purpose**: Create a new cargo item.

**Parameters**:
- `item` - Cargo item data including `user_id`, `tcn`, dimensions, etc.

**Returns**: Created `CargoItem` with generated UUID

**Database Operations**: INSERT into `cargo_items`

**Example**:
```typescript
const cargo = await createCargoItem({
  user_id: 1,
  tcn: 'V12345678',
  description: 'Medical supplies',
  weight_lb: '500.00',
  cargo_type: 'palletized',
  is_hazmat: false,
  priority: 'ADVON',
  metadata: {}
});
```

---

### getCargoItem

```typescript
async function getCargoItem(cargoId: string, userId: number): Promise<CargoItem | undefined>
```

**Purpose**: Retrieve a specific cargo item by ID.

**Parameters**:
- `cargoId` - UUID of the cargo item
- `userId` - Owner's user ID (for access control)

**Returns**: `CargoItem` or `undefined` if not found

**Database Operations**: SELECT from `cargo_items` WHERE id AND user_id

---

### getCargoItems

```typescript
async function getCargoItems(userId: number): Promise<CargoItem[]>
```

**Purpose**: List all cargo items for a user.

**Parameters**:
- `userId` - Owner's user ID

**Returns**: Array of `CargoItem` objects

**Database Operations**: SELECT from `cargo_items` WHERE user_id

---

### getCargoItemsByIds

```typescript
async function getCargoItemsByIds(cargoIds: string[]): Promise<CargoItem[]>
```

**Purpose**: Retrieve multiple cargo items by their IDs.

**Parameters**:
- `cargoIds` - Array of UUIDs

**Returns**: Array of `CargoItem` objects

**Database Operations**: SELECT from `cargo_items` WHERE id IN (...)

**Notes**: 
- Returns empty array if `cargoIds` is empty
- Does not filter by user (used internally after user validation)

---

### getCargoItemByTcn

```typescript
async function getCargoItemByTcn(tcn: string, userId: number): Promise<CargoItem | undefined>
```

**Purpose**: Find a cargo item by its Transportation Control Number.

**Parameters**:
- `tcn` - Transportation Control Number string
- `userId` - Owner's user ID

**Returns**: `CargoItem` or `undefined`

**Database Operations**: SELECT from `cargo_items` WHERE tcn AND user_id

---

### updateCargoItem

```typescript
async function updateCargoItem(
  cargoId: string,
  userId: number,
  data: Partial<InsertCargoItem>
): Promise<CargoItem | undefined>
```

**Purpose**: Update an existing cargo item.

**Parameters**:
- `cargoId` - UUID of the cargo item
- `userId` - Owner's user ID
- `data` - Partial update data

**Returns**: Updated `CargoItem` or `undefined` if not found

**Database Operations**: UPDATE `cargo_items` SET ... WHERE id AND user_id

---

### deleteCargoItem

```typescript
async function deleteCargoItem(cargoId: string, userId: number): Promise<void>
```

**Purpose**: Delete a cargo item.

**Parameters**:
- `cargoId` - UUID of the cargo item
- `userId` - Owner's user ID

**Database Operations**: DELETE from `cargo_items` WHERE id AND user_id

**Side Effects**: Does not cascade delete assignments (handle separately)

---

### getCargoItemsByType

```typescript
async function getCargoItemsByType(cargoType: string, userId: number): Promise<CargoItem[]>
```

**Purpose**: Filter cargo items by type.

**Parameters**:
- `cargoType` - Type string (e.g., 'palletized', 'rolling_stock', 'bulk', 'hazmat', 'oversized')
- `userId` - Owner's user ID

**Returns**: Array of matching `CargoItem` objects

**Database Operations**: SELECT from `cargo_items` WHERE cargo_type AND user_id

---

### getHazmatCargoItems

```typescript
async function getHazmatCargoItems(userId: number): Promise<CargoItem[]>
```

**Purpose**: Get all hazardous material cargo items.

**Parameters**:
- `userId` - Owner's user ID

**Returns**: Array of `CargoItem` objects where `is_hazmat = true`

**Database Operations**: SELECT from `cargo_items` WHERE is_hazmat = true AND user_id

---

## Type Definitions

### CargoItem

```typescript
type CargoItem = {
  id: string;           // UUID
  user_id: number;
  tcn: string;
  description: string | null;
  weight_lb: string | null;   // Numeric stored as string
  length_in: string | null;
  width_in: string | null;
  height_in: string | null;
  cargo_type: string | null;
  is_hazmat: boolean;
  hazmat_class: string | null;
  priority: string | null;
  metadata: object;
  created_at: Date;
}
```

### InsertCargoItem

```typescript
type InsertCargoItem = {
  user_id: number;
  tcn: string;
  description?: string;
  weight_lb?: string;
  length_in?: string;
  width_in?: string;
  height_in?: string;
  cargo_type?: string;
  is_hazmat?: boolean;
  hazmat_class?: string;
  priority?: string;
  metadata?: object;
}
```

---

## Usage Examples

### List all hazmat cargo
```typescript
import { getHazmatCargoItems } from './services/cargoService';

const hazmatCargo = await getHazmatCargoItems(userId);
console.log(`Found ${hazmatCargo.length} hazmat items`);
```

### Create and retrieve cargo
```typescript
import { createCargoItem, getCargoItemByTcn } from './services/cargoService';

const newCargo = await createCargoItem({
  user_id: userId,
  tcn: 'ABC12345',
  weight_lb: '1000',
  cargo_type: 'palletized'
});

const found = await getCargoItemByTcn('ABC12345', userId);
```

---

## Security Considerations

- All read/write operations require `userId` parameter for multi-tenant isolation
- `getCargoItemsByIds` does not filter by user - use only after validating ownership
- No cascade delete on assignments - clean up manually before deleting cargo
