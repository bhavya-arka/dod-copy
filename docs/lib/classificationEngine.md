# classificationEngine.ts

## Module Purpose

Classification and segmentation engine for PACAF cargo items. Separates parsed movement items by deployment phase (ADVON/MAIN) and cargo type for downstream processing by the palletization and aircraft allocation engines.

Supports both the legacy `MovementItem` system and the new `ParsedCargoItem` system with full backward compatibility.

## Exported Functions

### classifyItems (Legacy)

Classifies legacy `MovementItem` objects into categories.

```typescript
function classifyItems(parseResult: ParseResult): ClassifiedItems
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `parseResult` | `ParseResult` | Output from `parseMovementList()` |

**Returns:** `ClassifiedItems`
```typescript
interface ClassifiedItems {
  advon_items: MovementItem[];      // Items flagged for ADVON phase
  main_items: MovementItem[];       // Items for MAIN phase
  rolling_stock: MovementItem[];    // Vehicles, trailers, etc.
  prebuilt_pallets: MovementItem[]; // Pre-configured 463L pallets
  loose_items: MovementItem[];      // Items requiring palletization
  pax_items: MovementItem[];        // Passenger records
}
```

---

### classifyParsedItems (New)

Classifies new `ParsedCargoItem` objects using the updated CargoType system.

```typescript
function classifyParsedItems(parseResult: ParsedCargoResult): ClassifiedCargoItems
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `parseResult` | `ParsedCargoResult` | Output from `parseMovementListV2()` |

**Returns:** `ClassifiedCargoItems`
```typescript
interface ClassifiedCargoItems {
  palletized: ParsedCargoItem[];    // cargo_type === 'PALLETIZED'
  rolling_stock: ParsedCargoItem[]; // cargo_type === 'ROLLING_STOCK'
  loose_cargo: ParsedCargoItem[];   // cargo_type === 'LOOSE_CARGO'
  pax_records: ParsedCargoItem[];   // cargo_type === 'PAX_RECORD'
  advon_items: ParsedCargoItem[];   // advon_flag === true
  main_items: ParsedCargoItem[];    // advon_flag !== true
}
```

---

### getADVONItems / getMainItems (Legacy)

Extract phase-specific items from classified results.

```typescript
function getADVONItems(classifiedItems: ClassifiedItems): {
  rolling_stock: MovementItem[];
  prebuilt_pallets: MovementItem[];
  loose_items: MovementItem[];
  pax_items: MovementItem[];
}

function getMainItems(classifiedItems: ClassifiedItems): {
  rolling_stock: MovementItem[];
  prebuilt_pallets: MovementItem[];
  loose_items: MovementItem[];
  pax_items: MovementItem[];
}
```

---

### getADVONParsedItems / getMainParsedItems (New)

Extract phase-specific items from new classified cargo results.

```typescript
function getADVONParsedItems(classified: ClassifiedCargoItems): {
  palletized: ParsedCargoItem[];
  rolling_stock: ParsedCargoItem[];
  loose_cargo: ParsedCargoItem[];
  pax_records: ParsedCargoItem[];
}

function getMainParsedItems(classified: ClassifiedCargoItems): {
  palletized: ParsedCargoItem[];
  rolling_stock: ParsedCargoItem[];
  loose_cargo: ParsedCargoItem[];
  pax_records: ParsedCargoItem[];
}
```

---

### Sorting Utilities

```typescript
// Legacy (MovementItem)
function sortByFootprintDescending(items: MovementItem[]): MovementItem[]
function sortByWeightDescending(items: MovementItem[]): MovementItem[]
function sortByLengthDescending(items: MovementItem[]): MovementItem[]

// New (ParsedCargoItem)
function sortParsedByFootprintDescending(items: ParsedCargoItem[]): ParsedCargoItem[]
function sortParsedByWeightDescending(items: ParsedCargoItem[]): ParsedCargoItem[]
```

**Sorting Criteria:**
- `sortByFootprintDescending`: Primary by area (length × width), secondary by weight
- `sortByWeightDescending`: By weight only
- `sortByLengthDescending`: Primary by length, secondary by weight

---

### Summary Generation

```typescript
// Legacy
function generateClassificationSummary(classifiedItems: ClassifiedItems): {
  advon_weight: number;
  main_weight: number;
  total_weight: number;
  advon_pax: number;
  main_pax: number;
  total_pax: number;
  rolling_stock_weight: number;
  pallet_weight: number;
}

// New
function generateParsedClassificationSummary(classified: ClassifiedCargoItems): {
  advon_weight: number;
  main_weight: number;
  total_weight: number;
  advon_pax: number;
  main_pax: number;
  total_pax: number;
  palletized_weight: number;
  rolling_stock_weight: number;
  loose_cargo_weight: number;
}
```

---

### convertToLegacyClassifiedItems

Converts new `ClassifiedCargoItems` to legacy `ClassifiedItems` format.

```typescript
function convertToLegacyClassifiedItems(classified: ClassifiedCargoItems): ClassifiedItems
```

## Dependencies

### Internal Modules
- `./pacafTypes` - Type definitions (MovementItem, ParsedCargoItem, ClassifiedItems, etc.)

### External Libraries
- None

## Type Mapping

| Legacy Type (`CargoCategory`) | New Type (`CargoType`) |
|-------------------------------|------------------------|
| `PREBUILT_PALLET` | `PALLETIZED` |
| `ROLLING_STOCK` | `ROLLING_STOCK` |
| `PALLETIZABLE` | `LOOSE_CARGO` |
| `PAX` | `PAX_RECORD` |

## Example Usage

```typescript
import { parseMovementListV2 } from './movementParser';
import { 
  classifyParsedItems, 
  getADVONParsedItems,
  generateParsedClassificationSummary 
} from './classificationEngine';

// Parse CSV
const parseResult = parseMovementListV2(csvContent);

// Classify items
const classified = classifyParsedItems(parseResult);

console.log(`Palletized items: ${classified.palletized.length}`);
console.log(`Rolling stock: ${classified.rolling_stock.length}`);
console.log(`Loose cargo: ${classified.loose_cargo.length}`);
console.log(`PAX records: ${classified.pax_records.length}`);

// Get ADVON phase items only
const advonItems = getADVONParsedItems(classified);
console.log(`ADVON rolling stock: ${advonItems.rolling_stock.length}`);

// Generate summary
const summary = generateParsedClassificationSummary(classified);
console.log(`Total weight: ${summary.total_weight} lbs`);
console.log(`Total PAX: ${summary.total_pax}`);

// Legacy workflow
import { parseMovementList } from './movementParser';
import { classifyItems, getMainItems } from './classificationEngine';

const legacyResult = parseMovementList(csvContent);
const legacyClassified = classifyItems(legacyResult);
const mainPhase = getMainItems(legacyClassified);
```

## Edge Cases and Error Handling

### Empty Input
- Empty arrays are returned for all categories when no items are parsed
- Summary functions return 0 for all metrics

### Phase Detection
- Items with `advon_flag === true` go to ADVON phase
- All other items (including `advon_flag === undefined`) go to MAIN phase

### Duplicate Items
- Items can appear in both category arrays (e.g., `palletized`) AND phase arrays (e.g., `advon_items`)
- Phase functions use ID-based filtering to extract correct items

### Weight Calculations
```typescript
// Legacy uses quantity multiplier
weight = item.weight_each_lb * item.quantity

// New uses direct weight
weight = item.weight_lb
```

### Debug Logging
Classification results are logged to console:
```typescript
console.log('[ClassificationEngine] Classified items:', {
  totalItems: items.length,
  rollingStock: rolling_stock.length,
  prebuiltPallets: prebuilt_pallets.length,
  looseItems: loose_items.length,
  paxItems: pax_items.length,
  rollingStockDescriptions: rolling_stock.map(i => i.description)
});
```
