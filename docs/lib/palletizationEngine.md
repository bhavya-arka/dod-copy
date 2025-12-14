# palletizationEngine.ts

## Module Purpose

463L pallet bin-packing engine for PACAF cargo planning. Validates prebuilt pallets against specifications and constructs optimized pallets from loose cargo items using 2D bin-packing algorithms.

Implements the First Fit Decreasing (FFD) heuristic for optimal pallet utilization.

## Exported Functions

### processPalletization

Main entry point. Processes both prebuilt pallets and loose items.

```typescript
function processPalletization(
  prebuiltPallets: MovementItem[],
  looseItems: MovementItem[]
): PalletizationResult
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `prebuiltPallets` | `MovementItem[]` | Pre-configured pallet items (463L footprint) |
| `looseItems` | `MovementItem[]` | Items to be packed onto new pallets |

**Returns:** `PalletizationResult`
```typescript
interface PalletizationResult {
  pallets: Pallet463L[];           // All created pallets
  unpalletizable_items: MovementItem[]; // Items that couldn't fit
  total_pallets: number;           // Count of pallets created
  total_weight: number;            // Gross weight of all pallets
  warnings: string[];              // Processing warnings
}
```

**Example Output:**
```json
{
  "pallets": [
    {
      "id": "P-001",
      "items": [{ "item_id": "ITEM_0001", "description": "Supply Box", "weight_each_lb": 500 }],
      "gross_weight": 855,
      "net_weight": 500,
      "height": 36,
      "hazmat_flag": false,
      "is_prebuilt": false,
      "footprint": { "length": 108, "width": 88 }
    }
  ],
  "unpalletizable_items": [],
  "total_pallets": 1,
  "total_weight": 855,
  "warnings": []
}
```

---

### validatePrebuiltPallet

Validates a prebuilt pallet against 463L specifications.

```typescript
function validatePrebuiltPallet(item: MovementItem): {
  valid: boolean;
  pallet: Pallet463L | null;
  errors: string[];
}
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `item` | `MovementItem` | Prebuilt pallet item to validate |

**Validation Rules:**
| Check | Limit | Error Message |
|-------|-------|---------------|
| Height | ≤100" | `Height exceeds maximum 100"` |
| Weight (≤96" height) | ≤10,000 lbs | `Weight exceeds limit of 10000 lbs` |
| Weight (>96" height) | ≤8,000 lbs | `Weight exceeds limit of 8000 lbs` |

---

### palletizeLooseItems

Packs loose items onto 463L pallets using 2D bin-packing.

```typescript
function palletizeLooseItems(items: MovementItem[]): Pallet463L[]
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `items` | `MovementItem[]` | Loose cargo items to palletize |

**Returns:** Array of `Pallet463L` objects with packed items

---

### resetPalletCounter

Resets the internal pallet ID counter. Call before new allocation sessions.

```typescript
function resetPalletCounter(): void
```

## Dependencies

### Internal Modules
- `./pacafTypes` - Type definitions (MovementItem, Pallet463L, PALLET_463L constants)

### External Libraries
- None

## 463L Pallet Specifications

```typescript
const PALLET_463L = {
  length: 108,              // inches
  width: 88,                // inches
  height: 2.25,             // inches (pallet height)
  
  usable_length: 104,       // inches (cargo area)
  usable_width: 84,         // inches (cargo area)
  
  tare_weight: 290,         // lbs (pallet only)
  tare_with_nets: 355,      // lbs (pallet + nets/straps)
  
  max_payload_96in: 10000,  // lbs (for cargo ≤96" height)
  max_payload_100in: 8000,  // lbs (for cargo 96-100" height)
  max_height: 100,          // inches (absolute maximum)
  recommended_height: 96    // inches (optimal)
};
```

## Bin-Packing Algorithm

### First Fit Decreasing (FFD) Heuristic

1. **Sort items** by volume (largest first), then weight, then longest dimension
2. **For each item:**
   - Try normal orientation at available positions
   - Try rotated orientation if normal doesn't fit
   - Use multi-pass grid scanning (6" step, then 2" step)
3. **Create new pallet** when current pallet is full
4. **Continue** until all items are processed or remaining items are too large

### Grid Scanning

```typescript
const passes = [6, 2]; // Coarse pass (6"), then fine pass (2")

for (const gridStep of passes) {
  for (let y = 0; y <= usable_width - itemWidth; y += gridStep) {
    for (let x = 0; x <= usable_length - itemLength; x += gridStep) {
      // Check for collision with placed items
      // Return first valid position
    }
  }
}
```

### Collision Detection

Uses AABB (Axis-Aligned Bounding Box) overlap testing:
```typescript
// No collision if any of these are true:
x + itemLength <= placed.x ||  // Item ends before placed item starts
x >= placed.x + placedLength || // Item starts after placed item ends
y + itemWidth <= placed.y ||    // Item ends above placed item
y >= placed.y + placedWidth     // Item starts below placed item
```

## Example Usage

```typescript
import { parseMovementList } from './movementParser';
import { classifyItems } from './classificationEngine';
import { processPalletization, resetPalletCounter } from './palletizationEngine';

// Parse and classify
const parseResult = parseMovementList(csvContent);
const classified = classifyItems(parseResult);

// Reset counter for new session
resetPalletCounter();

// Palletize
const result = processPalletization(
  classified.prebuilt_pallets,
  classified.loose_items
);

console.log(`Created ${result.total_pallets} pallets`);
console.log(`Total weight: ${result.total_weight} lbs`);

if (result.unpalletizable_items.length > 0) {
  console.warn('Items too large for pallets:', 
    result.unpalletizable_items.map(i => i.description));
}

// Warnings
result.warnings.forEach(w => console.warn(w));
```

## Edge Cases and Error Handling

### Oversized Items
Items exceeding pallet usable area (104×84") are added to `unpalletizable_items`:
```typescript
if (itemLength > PALLET_463L.usable_length || 
    itemWidth > PALLET_463L.usable_width) {
  // Item cannot be palletized
}
```

### Overheight Items
Items exceeding recommended height (96") use reduced weight limit:
```typescript
const maxWeight = item.height_in > 96 
  ? 8000   // Reduced capacity
  : 10000; // Standard capacity
```

### Weight Overflow
When adding an item would exceed weight limit, item goes to next pallet or is marked unpalletizable.

### Infinite Loop Prevention
The algorithm breaks when no more items can be packed:
```typescript
if (packResult.packed.length === 0) {
  console.warn('Some items cannot be palletized:', remainingItems);
  break;
}
```

### Hazmat Detection
Pallets inherit hazmat flag from any hazardous items:
```typescript
const hasHazmat = packedItems.some(i => i.hazmat_flag);
```

### Pallet Weight Calculation
```typescript
gross_weight = net_cargo_weight + PALLET_463L.tare_with_nets;
// tare_with_nets = 355 lbs (pallet + nets)
```

## Performance Considerations

- **Grid step optimization**: Coarse pass (6") for fast initial placement, fine pass (2") for gap filling
- **Early termination**: Stops scanning when valid position found
- **Pre-sorting**: Large items placed first maximize packing efficiency
- **Volume-based sorting**: Prioritizes bulky items over heavy items

### Complexity
- **Time**: O(n² × g²) where n = items, g = grid cells
- **Space**: O(n) for tracking placed items

## Output Pallet Structure

```typescript
interface Pallet463L {
  id: string;           // "P-001", "P-002", etc.
  items: MovementItem[]; // Items packed on this pallet
  gross_weight: number; // Net weight + 355 lbs tare
  net_weight: number;   // Sum of item weights
  height: number;       // Maximum item height
  hazmat_flag: boolean; // True if any item is hazmat
  is_prebuilt: boolean; // False for dynamically created
  footprint: {
    length: number;     // 108 (inches)
    width: number;      // 88 (inches)
  };
}
```
