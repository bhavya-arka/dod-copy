# movementParser.ts

## Module Purpose

CSV and JSON parsing module for PACAF movement list data. Parses cargo manifests with comprehensive validation and classifies items into cargo types: `PALLETIZED`, `ROLLING_STOCK`, `LOOSE_CARGO`, or `PAX_RECORD`.

The parser supports both legacy format CSV files and the new specification-compliant format with automatic detection.

## Exported Functions

### parseMovementList

Primary entry point for CSV parsing. Auto-detects format and routes to appropriate parser.

```typescript
function parseMovementList(csvContent: string): ParseResult
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `csvContent` | `string` | Raw CSV content as string |

**Returns:** `ParseResult`
```typescript
interface ParseResult {
  items: MovementItem[];
  errors: ValidationError[];
  warnings: ValidationError[];
  summary: {
    total_items: number;
    valid_items: number;
    rolling_stock_count: number;
    palletizable_count: number;
    prebuilt_pallet_count: number;
    pax_count: number;
    total_weight_lb: number;
  };
}
```

---

### parseMovementListV2

New specification-compliant parser. Uses classification rules from the pallet_parsing specification.

```typescript
function parseMovementListV2(csvContent: string): ParsedCargoResult
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `csvContent` | `string` | Raw CSV content with headers: Description, Length, Width, Height, Weight, Lead TCN, PAX |

**Returns:** `ParsedCargoResult`
```typescript
interface ParsedCargoResult {
  items: ParsedCargoItem[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  totals: {
    total_palletized_weight: number;
    total_pallet_count: number;
    total_rolling_stock_weight: number;
    rolling_stock_count: number;
    total_loose_cargo_weight: number;
    loose_cargo_count: number;
    total_pax: number;
    total_weight: number;
  };
  pax_individual: number[];
  pax_total: number;
  pallet_ids: { pallet_id: string; lead_tcn: string | null }[];
}
```

**Example JSON Output:**
```json
{
  "items": [
    {
      "rawRowIndex": 0,
      "description": "DSP PALLET - WEAPONS",
      "length_in": 88,
      "width_in": 108,
      "height_in": 72,
      "weight_lb": 4500,
      "lead_tcn": "ABC123",
      "pax_count": null,
      "cargo_type": "PALLETIZED",
      "pallet_footprint": "463L",
      "inferred_pallet_count": 1,
      "classification_reasons": ["DIM_MATCH_463L"],
      "base_id": "ABC123",
      "pallet_id": "ABC123_P01",
      "advon_flag": false,
      "hazmat_flag": false
    }
  ],
  "totals": {
    "total_palletized_weight": 4500,
    "total_pallet_count": 1,
    "rolling_stock_count": 0,
    "total_pax": 0,
    "total_weight": 4500
  }
}
```

---

### parseMovementListJSON

Parses movement data from JSON format.

```typescript
function parseMovementListJSON(jsonContent: string): ParseResult
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `jsonContent` | `string` | JSON string containing array of `RawMovementInput` objects |

**Input JSON Structure:**
```typescript
interface RawMovementInput {
  item_id: string | number;
  description: string;
  length_in: string | number;
  width_in: string | number;
  height_in: string | number;
  weight_lb: string | number;
  lead_tcn?: string;
  pax?: string | number;
  quantity?: string | number;
  type?: string;
  advon_flag?: string | boolean;
  hazmat_flag?: string | boolean;
  axle_weights?: string;
}
```

**Returns:** `ParseResult` (same as parseMovementList)

---

### convertToLegacyParseResult

Converts new `ParsedCargoResult` to legacy `ParseResult` format for backward compatibility.

```typescript
function convertToLegacyParseResult(parsed: ParsedCargoResult): ParseResult
```

## Dependencies

### Internal Modules
- `./pacafTypes` - Type definitions (MovementItem, ParseResult, ParsedCargoItem, etc.)
- `./edgeCaseHandler` - Edge case validation (detectDuplicateTCN, validateEdgeCases)

### External Libraries
- None (pure TypeScript)

## Classification Logic

### Cargo Type Detection Priority

1. **PALLETIZED** - Exact 463L footprint (88×108 or 108×88 inches) with weight ≤10,000 lbs
2. **ROLLING_STOCK** - Contains keywords: TRACTOR, TRK, TRUCK, TRAILER, TOW, LOADER, MHU-, VEH, FORKLIFT, DOLLY, VEHICLE
3. **PAX_RECORD** - PAX count present with no cargo dimensions
4. **PALLETIZED** - Text hints (PALLET, DSP, WEAPONS, etc.) + approximate pallet dimensions (80-96L × 100-116W)
5. **ROLLING_STOCK** - Long items (length ≥ 1.5× width) or heavy equipment (≥3,000 lbs)
6. **LOOSE_CARGO** - Default fallback

### 463L Pallet Footprint
```typescript
const PALLET_463L_FOOTPRINT = { length: 88, width: 108 };
```

## Example Usage

```typescript
import { parseMovementList, parseMovementListV2 } from './movementParser';

// Parse CSV file
const csvContent = `Description,Length (in),Width (in),Height (in),Weight (lb),Lead TCN,PAX
DSP PALLET - WEAPONS,88,108,72,4500,ABC123,
MHU-196 TRAILER,180,84,60,3200,DEF456,
PAX TEAM ALPHA,,,,,,20`;

// Using V2 parser (recommended)
const result = parseMovementListV2(csvContent);

console.log(`Parsed ${result.items.length} items`);
console.log(`Total weight: ${result.totals.total_weight} lbs`);
console.log(`Pallets: ${result.totals.total_pallet_count}`);
console.log(`Rolling stock: ${result.totals.rolling_stock_count}`);
console.log(`PAX: ${result.totals.total_pax}`);

// Check for errors
if (result.errors.length > 0) {
  console.error('Parsing errors:', result.errors);
}

// Using legacy parser (auto-detects format)
const legacyResult = parseMovementList(csvContent);
```

## Edge Cases and Error Handling

### Header Detection
- Repeated headers in multi-sheet CSV exports are detected and skipped
- Headers must contain at least 4 keywords: description, length, width, height, weight, tcn, pax
- Values >30 characters indicate data rows, not headers

### Invalid Dimensions
| Condition | Behavior |
|-----------|----------|
| Missing or invalid length | Default to 24", warning issued |
| Missing or invalid width | Default to 24", warning issued |
| Missing or invalid height | Default to 24", warning issued |
| Missing or invalid weight | Default to 100 lbs, warning issued |

### Special Rows
| Row Type | Detection | Behavior |
|----------|-----------|----------|
| "Total PAX" | Description or Length column contains "Total PAX" | Extract count, skip row |
| PAX marker | Description = "PAX" with no count | Skip row |
| Empty rows | All values empty | Skip row |

### Validation Codes
```typescript
// Errors
'ERROR_MISSING_DESCRIPTION' - Description field required
'ERROR_INVALID_DIMENSIONS'  - Numeric parsing failed

// Warnings  
'WARNING_INVALID_LENGTH'    - Using default 24"
'WARNING_INVALID_WIDTH'     - Using default 24"
'WARNING_INVALID_HEIGHT'    - Using default 24"
'WARNING_INVALID_WEIGHT'    - Using default 100 lbs
'WARNING_NO_LEAD_TCN'       - Synthetic ID generated
'WARNING_APPROX_DIM_MATCH_463L' - Near-pallet dimensions
'WARNING_OVERHEIGHT_PALLET' - Height >96" for pallet
'WARNING_ROLLING_STOCK_WITH_PAX' - Vehicle has PAX value
```

### Duplicate TCN Detection
Items with duplicate Lead TCN values trigger `WARN_DUPLICATE_TCN` warnings.

## Internal Constants

```typescript
const PALLET_TEXT_HINTS = [
  'PALLET', 'DSP', 'SUPPLIES', 'SE AMU', 'AMU', 'OPS', 'AFE', 
  'BAG PALLET', 'WEAPONS', 'INTEL', 'CTK', 'FIRE BOTTLE', 
  'LIGHTNING', 'BRU', 'BOS', 'HESAMS'
];

const ROLLING_STOCK_KEYWORDS = [
  'TRACTOR', 'TRK', 'TRUCK', 'TRAILER', 'TOW', 'TOWBAR',
  'LOADER', 'MHU-', 'VEH', 'FORKLIFT', 'DOLLY', 'VEHICLE'
];

const APPROX_PALLET_DIMS = {
  length_min: 80, length_max: 96,
  width_min: 100, width_max: 116
};
```
