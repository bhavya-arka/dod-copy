# aircraftSolver.ts

## Module Purpose

Aircraft allocation solver for PACAF cargo planning. Allocates pallets, rolling stock, and passengers to C-17 and C-130 aircraft with dimension-based placement, Center of Balance (CoB) calculations, and weapons loading priority.

Key features:
- Dimension-based cargo placement (longitudinal packing)
- Weapons items loaded first (priority loading)
- Fill aircraft to maximum capacity before using next
- Valid Center of Balance calculations (15-40% MAC range)

## Exported Functions

### solveAircraftAllocation

Main solver entry point. Allocates all cargo to aircraft.

```typescript
function solveAircraftAllocation(
  classifiedItems: ClassifiedItems,
  aircraftType: AircraftType
): AllocationResult
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `classifiedItems` | `ClassifiedItems` | Output from `classifyItems()` |
| `aircraftType` | `'C-17' \| 'C-130'` | Target aircraft type |

**Returns:** `AllocationResult`
```typescript
interface AllocationResult {
  aircraft_type: AircraftType;
  total_aircraft: number;
  advon_aircraft: number;
  main_aircraft: number;
  load_plans: AircraftLoadPlan[];
  
  total_weight: number;
  total_pallets: number;
  total_rolling_stock: number;
  total_pax: number;
  total_pax_weight: number;
  
  total_seat_capacity: number;
  total_seats_used: number;
  overall_seat_utilization: number;
  
  unloaded_items: MovementItem[];
  unloaded_pax: number;
  warnings: string[];
}
```

**Example Output:**
```json
{
  "aircraft_type": "C-17",
  "total_aircraft": 2,
  "advon_aircraft": 1,
  "main_aircraft": 1,
  "load_plans": [
    {
      "aircraft_id": "C-17-ADVON-1",
      "aircraft_type": "C-17",
      "phase": "ADVON",
      "pallets": [{ "pallet": {...}, "position_index": 0, "x_start_in": 0 }],
      "rolling_stock": [],
      "pax_count": 20,
      "total_weight": 45000,
      "cob_percent": 28.5,
      "cob_in_envelope": true
    }
  ],
  "total_weight": 85000,
  "total_pallets": 8,
  "warnings": []
}
```

---

### calculateCenterOfBalance

Calculates Center of Balance as percentage of Mean Aerodynamic Chord (MAC).

```typescript
function calculateCenterOfBalance(
  pallets: PalletPlacement[],
  vehicles: VehiclePlacement[],
  aircraftSpec: AircraftSpec
): CoBCalculation
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `pallets` | `PalletPlacement[]` | Placed pallets with positions |
| `vehicles` | `VehiclePlacement[]` | Placed vehicles with positions |
| `aircraftSpec` | `AircraftSpec` | Aircraft specifications |

**Returns:** `CoBCalculation`
```typescript
interface CoBCalculation {
  total_weight: number;
  total_moment: number;
  center_of_balance: number;  // CG position in inches
  cob_percent: number;        // As % of MAC
  min_allowed: number;        // Forward limit (% MAC)
  max_allowed: number;        // Aft limit (% MAC)
  in_envelope: boolean;
  envelope_status: 'in_envelope' | 'forward_limit' | 'aft_limit';
  envelope_deviation: number;
}
```

**CoB Calculation Formula:**
```typescript
cgPosition = totalMoment / totalWeight;
normalizedPosition = cgPosition / cargoLength;
cobPercent = min_percent + normalizedPosition * (max_percent - min_percent);
```

---

### getCoBStatusMessage

Returns human-readable CoB status.

```typescript
function getCoBStatusMessage(cob: CoBCalculation): string
```

**Examples:**
```
"CoB 28.5% MAC - Within envelope (16-40%)"
"WARNING: CoB 12.3% MAC exceeds forward limit (16%) by 3.7%"
```

---

### calculateMinimumAircraft

Estimates minimum aircraft needed based on pallets and weight.

```typescript
function calculateMinimumAircraft(
  totalPallets: number,
  totalWeight: number,
  aircraftType: AircraftType
): { byPallets: number; byWeight: number; minimum: number }
```

---

### quickEstimateAircraft

Quick estimate for urgent brief mode.

```typescript
function quickEstimateAircraft(
  totalWeight: number,
  palletCount: number,
  rollingStockCount: number,
  aircraftType: AircraftType
): {
  estimated_aircraft: number;
  weight_limited: boolean;
  position_limited: boolean;
  confidence: 'high' | 'medium' | 'low';
}
```

## Dependencies

### Internal Modules
- `./pacafTypes` - Types (MovementItem, AircraftSpec, AIRCRAFT_SPECS, etc.)
- `./palletizationEngine` - Pallet creation (processPalletization, resetPalletCounter)
- `./classificationEngine` - Sorting utilities (sortByLengthDescending, sortByWeightDescending)
- `./geometry` - 3D placement (createAircraftGeometry, findNonOverlappingPosition, etc.)

### External Libraries
- None

## Aircraft Specifications

### C-17 Globemaster III
| Property | Value |
|----------|-------|
| Cargo Length | 1056" (88 ft) |
| Cargo Width | 216" |
| Cargo Height | 148" |
| Max Payload | 170,900 lbs |
| Pallet Positions | 18 |
| Seat Capacity | 102 |
| CoB Envelope | 16-40% MAC |

### C-130 Hercules
| Property | Value |
|----------|-------|
| Cargo Length | 492" (41 ft) |
| Cargo Width | 123" |
| Cargo Height | 108" |
| Max Payload | 42,000 lbs |
| Pallet Positions | 6 |
| Seat Capacity | 92 |
| CoB Envelope | 15-35% MAC |

## Loading Priority

### Weapons Priority Detection
```typescript
const WEAPONS_KEYWORDS = [
  'WEAPON', 'BRU', 'LOADER', 'MUNITION', 
  'BOMB', 'MISSILE', 'AMMO', 'ORDNANCE'
];
```

Items matching these keywords are loaded first, followed by weight-based sorting.

### PAX Constants
```typescript
const PAX_WEIGHT_LB = 225; // Per person with gear
```

## Example Usage

```typescript
import { parseMovementList } from './movementParser';
import { classifyItems } from './classificationEngine';
import { 
  solveAircraftAllocation, 
  calculateCenterOfBalance,
  getCoBStatusMessage 
} from './aircraftSolver';

// Parse and classify
const parseResult = parseMovementList(csvContent);
const classified = classifyItems(parseResult);

// Solve allocation
const result = solveAircraftAllocation(classified, 'C-17');

console.log(`Total aircraft needed: ${result.total_aircraft}`);
console.log(`  ADVON: ${result.advon_aircraft}`);
console.log(`  MAIN: ${result.main_aircraft}`);

// Examine load plans
for (const plan of result.load_plans) {
  console.log(`\n${plan.aircraft_id}:`);
  console.log(`  Pallets: ${plan.pallets.length}`);
  console.log(`  Vehicles: ${plan.rolling_stock.length}`);
  console.log(`  PAX: ${plan.pax_count}`);
  console.log(`  Weight: ${plan.total_weight} lbs`);
  console.log(`  CoB: ${plan.cob_percent.toFixed(1)}% MAC`);
  console.log(`  Payload utilization: ${plan.payload_used_percent.toFixed(1)}%`);
}

// Check for issues
if (result.unloaded_items.length > 0) {
  console.warn(`${result.unloaded_items.length} items could not be loaded`);
}

result.warnings.forEach(w => console.warn(w));
```

## Load Plan Structure

```typescript
interface AircraftLoadPlan {
  aircraft_id: string;          // "C-17-ADVON-1"
  aircraft_type: AircraftType;
  aircraft_spec: AircraftSpec;
  sequence: number;             // 1-based
  phase: 'ADVON' | 'MAIN';
  
  pallets: PalletPlacement[];
  rolling_stock: VehiclePlacement[];
  pax_count: number;
  
  total_weight: number;
  payload_used_percent: number;
  pax_weight: number;
  
  center_of_balance: number;    // CG position (inches)
  cob_percent: number;          // % of MAC
  cob_in_envelope: boolean;
  
  positions_used: number;
  positions_available: number;
  utilization_percent: number;
  
  seat_capacity: number;
  seats_used: number;
  seat_utilization_percent: number;
}
```

## Edge Cases and Error Handling

### Oversized Vehicles
Vehicles exceeding ramp clearance are unloadable:
```typescript
if (item.width_in > aircraftSpec.ramp_clearance_width) {
  unplaced.push(item);
}
if (item.height_in > aircraftSpec.ramp_clearance_height) {
  unplaced.push(item);
}
```

### Weight Limits
- Per-position weight: 10,000 lbs (main deck), 7,500 lbs (ramp)
- Running weight tracked to prevent exceeding max payload

### PAX Capacity
PAX allocation respects both seat capacity and weight:
```typescript
const maxPaxByWeight = Math.floor(remainingPayloadCapacity / PAX_WEIGHT_LB);
const maxPaxAllowed = Math.min(seatCapacity, maxPaxByWeight);
```

### Aircraft Limit
Maximum 50 aircraft per phase to prevent infinite loops:
```typescript
const MAX_AIRCRAFT = 50;
if (sequence > MAX_AIRCRAFT) {
  warnings.push(`Loading capped at ${MAX_AIRCRAFT} aircraft`);
  break;
}
```

### Empty Cargo
- Returns single aircraft with 0 weight if no cargo
- CoB defaults to center of envelope

### Collision Detection
Uses geometry module for 3D placement validation:
```typescript
if (!isWithinBounds(candidateBox, aircraftGeometry) || 
    collidesWithAny(candidateBox, existingPlacements)) {
  // Try alternate position
}
```

## Placement Algorithm

### Rolling Stock
1. Sort by weapons priority, then weight
2. Find non-overlapping position using geometry engine
3. Prefer centerline placement
4. Use 4" longitudinal spacing, 2" lateral spacing
5. Track occupied X positions for pallet placement

### Pallets
1. Sort by weapons priority
2. Place sequentially from forward position
3. Start after rolling stock (12" gap)
4. Use 4" spacing between pallets
5. Check ramp vs main deck weight limits

### PAX
1. Calculate remaining payload capacity
2. Calculate remaining seats
3. Allocate minimum of seat capacity and weight capacity
4. Track unloaded PAX for warnings

## Debug Logging

```typescript
console.log('[AircraftSolver] Starting allocation:', {
  aircraftType,
  totalRollingStock: classifiedItems.rolling_stock.length,
  totalPrebuiltPallets: classifiedItems.prebuilt_pallets.length,
  totalLooseItems: classifiedItems.loose_items.length,
  totalPaxItems: classifiedItems.pax_items.length
});
```
