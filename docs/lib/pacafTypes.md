# pacafTypes - Core PACAF Type Definitions

## Purpose

Core data types and models for the PACAF (Pacific Air Forces) airlift movement planning system. Defines structures for movement items, aircraft specifications, 463L pallets, load plans, and center of balance calculations.

## Location

`apps/client/src/lib/pacafTypes.ts`

## Exported Types

### Cargo Classification

```typescript
// Legacy cargo categories
type CargoCategory = 'ROLLING_STOCK' | 'PALLETIZABLE' | 'PREBUILT_PALLET' | 'PAX';

// Primary cargo classification (per pallet_parsing spec)
type CargoType = 'PALLETIZED' | 'ROLLING_STOCK' | 'LOOSE_CARGO' | 'PAX_RECORD';

// Pallet footprint classification
type PalletFootprint = '463L' | 'NONE';
```

### ValidationIssue
```typescript
interface ValidationIssue {
  code: string;      // e.g., "ERROR_INVALID_DIMENSIONS"
  message: string;   // e.g., "Height must be > 0"
  field?: string;    // Which column caused the issue
}
```

### ParsedCargoItem
```typescript
interface ParsedCargoItem {
  rawRowIndex: number;
  description: string;
  length_in: number;
  width_in: number;
  height_in: number;
  weight_lb: number;
  lead_tcn: string | null;
  pax_count: number | null;
  cargo_type: CargoType;
  pallet_footprint: PalletFootprint;
  inferred_pallet_count: number;
  classification_reasons: string[];
  validation_errors: ValidationIssue[];
  validation_warnings: ValidationIssue[];
  base_id: string;
  pallet_id: string | null;
  pallet_sequence_index: number | null;
  rolling_id: string | null;
  advon_flag: boolean;
  hazmat_flag: boolean;
  axle_weights?: number[];
}
```

### MovementItem (Legacy)
```typescript
interface MovementItem {
  item_id: string | number;
  utc_id?: string;
  description: string;
  quantity: number;
  weight_each_lb: number;
  length_in: number;
  width_in: number;
  height_in: number;
  type: CargoCategory;
  advon_flag: boolean;
  hazmat_flag: boolean;
  pallet_id?: string;
  axle_weights?: number[];
  lead_tcn?: string;
  tcn?: string;
  pax_count?: number;
  parsed_item?: ParsedCargoItem;
}
```

### Pallet463L
```typescript
interface Pallet463L {
  id: string;
  items: MovementItem[];
  gross_weight: number;
  net_weight: number;
  height: number;
  hazmat_flag: boolean;
  is_prebuilt: boolean;
  footprint: { length: number; width: number; };
}
```

### Aircraft Types

```typescript
type AircraftType = 'C-17' | 'C-130';

interface StationConstraint {
  position: number;
  rdl_distance: number;      // Reference Datum Line distance (inches)
  max_height: number;
  max_width: number;
  max_weight: number;
  is_ramp: boolean;
  requires_shoring: boolean;
}

interface AircraftSpec {
  type: AircraftType;
  name: string;
  cargo_length: number;
  cargo_width: number;
  cargo_height: number;
  pallet_positions: number;
  ramp_positions: number[];
  max_payload: number;
  cob_min_percent: number;
  cob_max_percent: number;
  mac_length: number;
  lemac_station: number;
  stations: StationConstraint[];
  seat_capacity: number;
  // ... additional fields
}
```

### Load Plans

```typescript
interface PalletPlacement {
  pallet: Pallet463L;
  position_index: number;
  position_coord: number;
  is_ramp: boolean;
  lateral_placement?: { y_center_in: number; y_left_in: number; y_right_in: number; };
}

interface VehiclePlacement {
  item_id: string | number;
  item: MovementItem;
  weight: number;
  length: number;
  width: number;
  height: number;
  axle_weights: number[];
  position: { x: number; y: number; z: number; };
  deck?: 'MAIN' | 'RAMP';
}

interface AircraftLoadPlan {
  aircraft_id: string;
  aircraft_type: AircraftType;
  sequence: number;
  phase: 'ADVON' | 'MAIN';
  pallets: PalletPlacement[];
  rolling_stock: VehiclePlacement[];
  pax_count: number;
  total_weight: number;
  center_of_balance: number;
  cob_percent: number;
  cob_in_envelope: boolean;
}
```

## Constants

### PALLET_463L
```typescript
const PALLET_463L = {
  length: 108,                // inches
  width: 88,                  // inches
  tare_weight: 290,           // lbs
  max_payload_96in: 10000,    // lbs for ≤96" height
  max_payload_100in: 8000,    // lbs for 96-100" height
  max_height: 100,            // inches
}
```

### PAX_WEIGHT_LB
```typescript
const PAX_WEIGHT_LB = 225;  // Weight per person with gear
```

### AIRCRAFT_SPECS
Pre-defined specs for C-17 and C-130 aircraft including station constraints.

## Helper Functions

```typescript
function getStationConstraint(aircraftType: AircraftType, position: number): StationConstraint | null;
function getRDLDistance(aircraftType: AircraftType, position: number): number;
function validateStationPlacement(aircraftType: AircraftType, position: number, height: number, width: number, weight: number): { valid: boolean; errors: string[] };
```

## Usage Example

```typescript
import { 
  MovementItem, 
  Pallet463L, 
  AIRCRAFT_SPECS,
  getStationConstraint 
} from '@/lib/pacafTypes';

const c17 = AIRCRAFT_SPECS['C-17'];
console.log(c17.max_payload);  // 170900

const station = getStationConstraint('C-17', 5);
console.log(station?.max_height);  // 148
```
