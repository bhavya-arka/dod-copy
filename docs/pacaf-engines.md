# PACAF Computational Engines

This document describes the core computational engines in `packages/utils`.

## Module Structure

```
packages/utils/src/
├── types/           # Type definitions
│   ├── pacafTypes.ts
│   ├── routeTypes.ts
│   └── flightSplitTypes.ts
├── parser/          # Input processing
│   ├── movementParser.ts
│   └── classificationEngine.ts
├── solver/          # Allocation algorithms
│   ├── palletizationEngine.ts
│   ├── aircraftSolver.ts
│   ├── edgeCaseHandler.ts
│   └── flightSplitUtils.ts
├── scheduler/       # Route & scheduling
│   ├── routeCalculations.ts
│   ├── flightScheduler.ts
│   └── weatherService.ts
└── export/          # Output formats
    ├── icodesExport.ts
    ├── insightsEngine.ts
    └── pdfExport.ts
```

## Movement Parser

Parses CSV/JSON movement lists with comprehensive validation.

```typescript
import { parseMovementList, parseCSV, parseJSON } from '@arka/utils';

// Parse CSV content
const result = parseMovementList(csvContent, 'csv');

// Result includes items and any validation errors
console.log(result.items);    // MovementItem[]
console.log(result.errors);   // ValidationError[]
console.log(result.warnings); // ValidationError[]
```

### Lenient Parsing

The parser uses default values for missing data:
- Missing dimensions: 24" default
- Missing weight: 100 lb default
- Warnings are generated for defaulted values

## Classification Engine

Separates items by phase and cargo type.

```typescript
import { classifyItems } from '@arka/utils';

const classified = classifyItems(parseResult);

// By phase
classified.advon_items   // ADVON priority items
classified.main_items    // MAIN body items

// By cargo type
classified.rolling_stock     // Vehicles
classified.prebuilt_pallets  // Pre-built 463L pallets
classified.loose_items       // Items to palletize
classified.pax_items         // Personnel
```

## Palletization Engine

Builds 463L pallets using 2D bin-packing.

```typescript
import { processPalletization } from '@arka/utils';

const result = processPalletization(classifiedItems);

// Result includes built pallets and any items that couldn't fit
console.log(result.pallets);        // Pallet463L[]
console.log(result.unpalletized);   // MovementItem[]
```

### 463L Rules
- Max height: 100" (96" for full 10,000 lb capacity)
- Max weight: 10,000 lb (8,000 lb if 96-100" height)
- 22 tiedown rings, 7,500 lb each

## Aircraft Solver

Allocates cargo to aircraft with CoB optimization.

```typescript
import { solveAircraftAllocation } from '@arka/utils';

const allocation = solveAircraftAllocation({
  pallets: builtPallets,
  rolling_stock: vehicles,
  pax_count: personnelCount,
  fleet: ['C-17', 'C-130']
});

// Returns complete allocation with CoB calculations
allocation.aircraft_loads.forEach(load => {
  console.log(load.aircraft_type);
  console.log(load.cob_calculation);
});
```

## Route Calculations

Great-circle distance and flight planning.

```typescript
import { 
  calculateGreatCircleDistance,
  calculateTimeEnRoute,
  calculateFuelRequired
} from '@arka/utils';

const { distance_nm, distance_km } = calculateGreatCircleDistance(
  origin.latitude_deg, origin.longitude_deg,
  dest.latitude_deg, dest.longitude_deg
);

const { flight_time_hr, block_time_hr } = calculateTimeEnRoute(
  distance_nm, 
  'C-17'
);
```

## Flight Scheduler

Manages flight scheduling and conflict detection.

```typescript
import { 
  createScheduledFlight,
  detectScheduleConflicts,
  generateCallsign
} from '@arka/utils';

const flight = createScheduledFlight(
  originBase,
  destinationBase,
  'C-17',
  departureTime,
  payloadWeight,
  paxCount
);

const conflicts = detectScheduleConflicts(schedules, newFlight);
```

## ICODES Export

Generates DoD/DLA-compliant export formats.

```typescript
import { 
  generateICODESPackage,
  allocationToICODES,
  exportToA2IBundle
} from '@arka/utils';

// Generate ICODES-compatible JSON
const icodesData = allocationToICODES(allocation, missionId);

// Export A2I bundle format
const bundle = exportToA2IBundle(allocation, options);
```

## Insights Engine

AI-powered analysis and recommendations.

```typescript
import { analyzeMovementList, generateOptimizationInsights } from '@arka/utils';

const insights = analyzeMovementList(items, classifiedItems);

console.log(insights.weight_drivers);    // Top 5 heavy items
console.log(insights.volume_drivers);    // Top 5 bulky items
console.log(insights.recommendations);   // Optimization suggestions
```
