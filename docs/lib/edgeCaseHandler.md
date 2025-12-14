# edgeCaseHandler.ts

## Module Purpose

Comprehensive validation module for movement list items. Handles edge cases including oversize cargo, weight limits, HAZMAT segregation, station-specific constraints, and tiedown calculations. Based on technical orders T.O. 1C-17A-9 and T.O. 1C-130H-9.

## Dependencies

### Internal Modules
- `./pacafTypes` - MovementItem, ValidationError, PALLET_463L, AIRCRAFT_SPECS, AircraftType, getStationConstraint, StationConstraint

### External Libraries
None

## Exported Interfaces

### EdgeCaseResult
```typescript
interface EdgeCaseResult {
  item: MovementItem;
  warnings: ValidationError[];
  errors: ValidationError[];
  adjustments: string[];
}
```

### EdgeCaseValidationResult
```typescript
interface EdgeCaseValidationResult {
  isValid: boolean;           // No errors present
  canPalletize: boolean;      // Item fits on 463L pallet
  mustBeRollingStock: boolean; // Item too large for pallet
  requiresC17Only: boolean;   // Exceeds C-130 limits
  cannotLoad: boolean;        // Exceeds all aircraft limits
  warnings: ValidationError[];
  errors: ValidationError[];
  adjustedItem: MovementItem; // Item with corrections applied
}
```

### StationValidationResult
```typescript
interface StationValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  requiredShoring: boolean;
  tiedownCount: number;
}
```

### ValidationError
```typescript
interface ValidationError {
  code: string;
  item_id: string | number;
  field?: string;
  message: string;
  suggestion?: string;
  severity: 'warning' | 'error';
}
```

## Exported Functions

### validateEdgeCases

Primary validation function for individual movement items.

```typescript
function validateEdgeCases(item: MovementItem): EdgeCaseValidationResult
```

**Validation Checks:**

| Check | Trigger | Result |
|-------|---------|--------|
| Overheight (>100") | height > 100" | mustBeRollingStock = true |
| C-130 height limit | height > 108" | requiresC17Only = true |
| C-17 height limit | height > 162" | cannotLoad = true |
| Overwidth | width > 104" (non-463L) | mustBeRollingStock = true |
| C-130 ramp width | width > 119" | requiresC17Only = true |
| C-17 ramp width | width > 216" | cannotLoad = true |
| Zero weight | weight = 0 or NaN | Corrected to 1 lb |
| Invalid dimensions | L/W/H ≤ 0 | Error (non-PAX items) |
| HAZMAT | hazmat_flag = true | Warning for segregation |
| Heavy item | weight > 10,000 lb | mustBeRollingStock = true |
| Exceeds C-130 ACL | weight > 42,000 lb | requiresC17Only = true |
| Exceeds C-17 ACL | weight > 170,900 lb | cannotLoad = true |

**Example:**
```typescript
const result = validateEdgeCases({
  item_id: 'VEH001',
  description: 'HUMVEE',
  weight_each_lb: 12000,
  length_in: 180,
  width_in: 84,
  height_in: 72,
  type: 'ROLLING_STOCK'
});

// Returns:
{
  isValid: true,
  canPalletize: false,
  mustBeRollingStock: true,
  requiresC17Only: false,
  cannotLoad: false,
  warnings: [...],
  errors: [],
  adjustedItem: { ... }
}
```

---

### checkHazmatPaxConflict

Checks for HAZMAT and passenger mixing.

```typescript
function checkHazmatPaxConflict(
  hazmatItems: MovementItem[],
  paxItems: MovementItem[]
): ValidationError[]
```

**Returns:** Warning if both HAZMAT and PAX are present

**Rule:** HAZMAT must not co-load with PAX on same aircraft

---

### validatePrebuiltPalletIntegrity

Validates prebuilt pallet structure.

```typescript
function validatePrebuiltPalletIntegrity(
  item: MovementItem
): ValidationError[]
```

**Checks:** Prebuilt pallets must have pallet_id assigned

---

### validateStationPlacement

Validates if item can be placed at specific aircraft station.

```typescript
function validateStationPlacement(
  item: MovementItem,
  aircraftType: AircraftType,
  position: number
): StationValidationResult
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| item | `MovementItem` | Item to validate |
| aircraftType | `'C-17' \| 'C-130'` | Aircraft type |
| position | `number` | Station position (1-based) |

**Validation Checks:**
- Height vs station max height
- Width vs station max width
- Weight vs station max weight
- Shoring requirements (heavy items on certain stations)

**Returns:** Includes calculated tiedown count

---

### calculateTiedownRequirements

Calculates required number of tiedowns.

```typescript
function calculateTiedownRequirements(
  item: MovementItem,
  spec: typeof AIRCRAFT_SPECS['C-17']
): number
```

**Formula:**
- Forward G-load: 3G (weight × 3)
- Required tiedowns: ceil(forwardLoad / tiedownRating)
- Minimum: 4 tiedowns

**Reference:** AFI 11-2C-17V3, AFI 11-2C-130V3

---

### validateVehicleConstraints

Validates vehicle-specific constraints.

```typescript
function validateVehicleConstraints(
  item: MovementItem,
  aircraftType: AircraftType
): { valid: boolean; errors: ValidationError[]; warnings: ValidationError[] }
```

**Checks:**
- Wheelbase limit
- Axle weight limits
- Floor loading (PSI)

---

### validateRampLoading

Validates ramp loading constraints for vehicles.

```typescript
function validateRampLoading(
  item: MovementItem,
  aircraftType: AircraftType
): { canLoadViaRamp: boolean; errors: ValidationError[]; warnings: ValidationError[] }
```

**Checks:**
- Ramp height clearance
- Ramp width clearance
- Heavy item ramp angle (>20,000 lb with steep ramp)

---

### detectDuplicateTCN

Detects duplicate Transportation Control Numbers.

```typescript
function detectDuplicateTCN(items: MovementItem[]): ValidationError[]
```

**Returns:** Warning for each TCN appearing more than once

## Error Codes Reference

| Code | Description |
|------|-------------|
| `ERR_DIMENSION_INVALID` | Zero/negative dimensions or exceeds all limits |
| `ERR_PHYSICAL_INVALID` | Weight exceeds all aircraft limits |
| `ERR_POSITION_INVALID` | Invalid station position |
| `ERR_HEIGHT_EXCEEDED` | Height exceeds station limit |
| `ERR_WIDTH_EXCEEDED` | Width exceeds station limit |
| `ERR_WEIGHT_EXCEEDED` | Weight exceeds station limit |
| `ERR_RAMP_HEIGHT_EXCEEDED` | Height exceeds ramp clearance |
| `ERR_RAMP_WIDTH_EXCEEDED` | Width exceeds ramp clearance |
| `ERR_AXLE_WEIGHT_EXCEEDED` | Axle weight exceeds limit |
| `WARN_OVERSIZE_ITEM` | Item exceeds standard limits |
| `WARN_PALLET_OVERSPEC` | Pallet constraint warning |
| `WARN_SHORING_REQUIRED` | Shoring plates needed |
| `WARN_WHEELBASE_EXCEEDED` | Vehicle length warning |
| `WARN_FLOOR_LOADING` | Floor PSI warning |
| `WARN_RAMP_ANGLE` | Heavy item ramp loading warning |
| `WARN_DUPLICATE_TCN` | Duplicate TCN detected |

## Aircraft Limits Reference

| Limit | C-17 | C-130 |
|-------|------|-------|
| Cargo Height | 162" | 108" |
| Ramp Height | 142" | 70" |
| Ramp Width | 216" | 119" |
| Max Payload | 170,900 lb | 42,000 lb |
| Per Position Weight | 10,000 lb | 8,000 lb |
| Pallet Positions | 18 | 6 |

## 463L Pallet Reference

| Dimension | Value |
|-----------|-------|
| Max Height | 100" |
| Usable Width | 104" |
| Footprint | 88" × 108" |

## Edge Cases and Error Handling

1. **463L footprint items**: Not flagged as overwidth (recognized as prebuilt pallets)
2. **PAX items**: Dimension checks skipped
3. **Zero weight**: Auto-corrected to 1 lb with warning
4. **NaN weight**: Treated as zero, corrected to 1 lb
5. **Invalid position**: Returns error with valid range
6. **Multiple violations**: All violations captured in single result
7. **Type coercion**: Automatically changes type to ROLLING_STOCK if mustBeRollingStock

## Notes

- Based on T.O. 1C-17A-9 (C-17 loading manual)
- Based on T.O. 1C-130H-9 (C-130 loading manual)
- G-force factors: 3G forward, 1.5G aft, 1.5G lateral
- Shoring required for items >10,000 lb on certain stations
