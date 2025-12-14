# flightSplitTypes - Flight Split Type Definitions

## Purpose

Types and utility functions for splitting flights and redistributing cargo between aircraft. Supports drag-and-drop cargo management and flight load optimization.

## Location

`apps/client/src/lib/flightSplitTypes.ts`

## Dependencies

- `./pacafTypes` - Pallet463L, MovementItem, AircraftLoadPlan, etc.
- `./routeTypes` - MilitaryBase, ScheduledFlight

## Exported Types

### SplitFlight
```typescript
interface SplitFlight {
  id: string;
  parent_flight_id: string;
  callsign: string;
  display_name?: string;
  aircraft_type: 'C-17' | 'C-130';
  aircraft_id: string;
  origin: MilitaryBase;
  destination: MilitaryBase;
  waypoints?: MilitaryBase[];
  scheduled_departure: Date;
  scheduled_arrival: Date;
  estimated_delay_minutes: number;
  pallets: PalletPlacement[];
  rolling_stock: VehiclePlacement[];
  pax_count: number;
  total_weight_lb: number;
  center_of_balance_percent: number;
  weather_warnings: WeatherWarning[];
  is_modified: boolean;
}
```

### WeatherWarning
```typescript
interface WeatherWarning {
  id: string;
  severity: 'info' | 'caution' | 'warning' | 'critical';
  type: 'wind' | 'visibility' | 'icing' | 'turbulence' | 'thunderstorm' | 'delay';
  title: string;
  description: string;
  estimated_delay_minutes?: number;
  affected_leg?: string;
  recommendation?: string;
}
```

### FlightSplitState
```typescript
interface FlightSplitState {
  original_load_plan: AircraftLoadPlan;
  split_flights: SplitFlight[];
  unassigned_pallets: Pallet463L[];
  unassigned_vehicles: MovementItem[];
  total_weight_original: number;
  total_weight_distributed: number;
}
```

### DragItem (for drag-and-drop)
```typescript
interface DragItem {
  id: string;
  type: 'pallet' | 'vehicle';
  source_flight_id: string;
  data: PalletPlacement | VehiclePlacement;
}
```

### DropTarget
```typescript
interface DropTarget {
  flight_id: string;
  position?: number;
}
```

### FlightSplitAction
```typescript
interface FlightSplitAction {
  type: 'MOVE_PALLET' | 'MOVE_VEHICLE' | 'CREATE_SPLIT' | 'MERGE_FLIGHTS' | 'UPDATE_SCHEDULE';
  payload: {
    item_id?: string;
    source_flight_id?: string;
    target_flight_id?: string;
    new_departure?: Date;
    new_destination?: MilitaryBase;
  };
}
```

## Exported Functions

### calculateFlightWeight
Calculates total weight including pallets, vehicles, and passengers.
```typescript
function calculateFlightWeight(flight: SplitFlight): number
```

### validateFlightLoad
Validates flight against payload, pallet count, and center of balance limits.
```typescript
function validateFlightLoad(flight: SplitFlight): { valid: boolean; issues: string[] }
```
Checks:
- Max payload (C-17: 170,900 lbs, C-130: 42,000 lbs)
- Max pallets (C-17: 18, C-130: 6)
- Center of balance envelope (C-17: 20-35%, C-130: 18-33%)

### calculateCenterOfBalance
Calculates CoB as percentage of MAC (Mean Aerodynamic Chord).
```typescript
function calculateCenterOfBalance(flight: SplitFlight): number
```

### estimateWeatherDelay
Estimates delay based on weather system severity.
```typescript
function estimateWeatherDelay(flight: SplitFlight, weatherSystems: Array<{ severity: string; affects_flight_ops: boolean }>): number
```
Returns delay in minutes:
- Minor: +15 min
- Moderate: +45 min
- Severe: +120 min

### reoptimizePalletPlacement
Reoptimizes pallet placement for better center of balance using station-based RDL distances.
```typescript
function reoptimizePalletPlacement(flight: SplitFlight): SplitFlight
```

## Usage Example

```typescript
import { 
  SplitFlight, 
  calculateFlightWeight, 
  validateFlightLoad,
  reoptimizePalletPlacement 
} from '@/lib/flightSplitTypes';

const flight: SplitFlight = {
  id: 'SPLIT-001',
  aircraft_type: 'C-17',
  pallets: [pallet1, pallet2],
  rolling_stock: [vehicle1],
  pax_count: 20,
  // ... other fields
};

const weight = calculateFlightWeight(flight);
const validation = validateFlightLoad(flight);

if (!validation.valid) {
  console.log('Issues:', validation.issues);
}

const optimized = reoptimizePalletPlacement(flight);
```
