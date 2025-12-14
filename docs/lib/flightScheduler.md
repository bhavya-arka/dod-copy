# flightScheduler.ts

## Module Purpose

Flight scheduling module for PACAF Airlift operations. Manages flight scheduling, conflict detection, time-based planning, and crew rest calculations. Generates callsigns, creates scheduled flights with automatic arrival time calculations, and detects runway/ramp conflicts.

## Dependencies

### Internal Modules
- `./routeTypes` - Type definitions (MilitaryBase, ScheduledFlight, AirbaseSchedule, TimeSlot, FlightScheduleResult, ScheduleConflict, AIRCRAFT_PERFORMANCE)
- `./routeCalculations` - calculateGreatCircleDistance, calculateTimeEnRoute

### External Libraries
None

## Exported Functions

### generateCallsign

Generates a military callsign based on aircraft type.

```typescript
function generateCallsign(
  aircraftType: 'C-17' | 'C-130',
  index: number
): string
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| aircraftType | `'C-17' \| 'C-130'` | Type of aircraft |
| index | `number` | Flight index for numbering |

**Returns:** `string` - Callsign (e.g., "REACH01" for C-17, "HERKY01" for C-130)

**Example:**
```typescript
const callsign = generateCallsign('C-17', 0);
// Returns: "REACH01"

const callsign2 = generateCallsign('C-130', 4);
// Returns: "HERKY05"
```

---

### createScheduledFlight

Creates a fully populated scheduled flight with calculated arrival time, fuel requirements, and auto-generated IDs.

```typescript
function createScheduledFlight(
  origin: MilitaryBase,
  destination: MilitaryBase,
  aircraftType: 'C-17' | 'C-130',
  departureTime: Date,
  payloadWeight?: number,
  paxCount?: number,
  palletIds?: string[],
  assignedAircraftId?: string,
  customCallsign?: string
): ScheduledFlight
```

**Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| origin | `MilitaryBase` | required | Departure base |
| destination | `MilitaryBase` | required | Arrival base |
| aircraftType | `'C-17' \| 'C-130'` | required | Aircraft type |
| departureTime | `Date` | required | Scheduled departure time |
| payloadWeight | `number` | 0 | Cargo weight in pounds |
| paxCount | `number` | 0 | Passenger count |
| palletIds | `string[]` | [] | Assigned pallet identifiers |
| assignedAircraftId | `string` | auto | Custom aircraft ID |
| customCallsign | `string` | auto | Custom callsign |

**Returns:** `ScheduledFlight`
```typescript
interface ScheduledFlight {
  id: string;                    // e.g., "FLT0001"
  callsign: string;              // e.g., "REACH01"
  aircraft_type: 'C-17' | 'C-130';
  aircraft_id: string;
  origin: MilitaryBase;
  destination: MilitaryBase;
  scheduled_departure: Date;
  scheduled_arrival: Date;       // Auto-calculated
  status: 'scheduled';
  payload_weight_lb: number;
  pax_count: number;
  assigned_pallet_ids: string[];
  fuel_required_lb: number;      // Auto-calculated with 25% reserve
}
```

**Example:**
```typescript
const flight = createScheduledFlight(
  kadenaBase,
  yokotaBase,
  'C-17',
  new Date('2025-01-15T08:00:00Z'),
  50000,
  20,
  ['PAL001', 'PAL002']
);
```

---

### checkScheduleConflicts

Analyzes a flight schedule for runway and ramp capacity conflicts.

```typescript
function checkScheduleConflicts(
  flights: ScheduledFlight[]
): ScheduleConflict[]
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| flights | `ScheduledFlight[]` | Array of scheduled flights |

**Returns:** `ScheduleConflict[]`
```typescript
interface ScheduleConflict {
  id: string;                    // e.g., "CONF-1"
  type: 'runway_conflict' | 'ramp_capacity';
  affected_flights: string[];    // Flight IDs
  description: string;
  suggested_resolution: string;
}
```

**Conflict Detection Rules:**
- **Runway conflict**: Departures at same base within 15 minutes
- **Ramp capacity**: More than 2 aircraft arriving within 10 minutes

**Example:**
```typescript
const conflicts = checkScheduleConflicts(flights);
// Returns: [
//   {
//     id: "CONF-1",
//     type: "runway_conflict",
//     affected_flights: ["FLT0001", "FLT0002"],
//     description: "Runway conflict at KADENA: REACH01 and REACH02 depart within 10 minutes",
//     suggested_resolution: "Delay REACH02 departure by 5 minutes"
//   }
// ]
```

---

### buildAirbaseSchedule

Builds a complete schedule view for a single airbase.

```typescript
function buildAirbaseSchedule(
  base: MilitaryBase,
  flights: ScheduledFlight[],
  startDate: Date
): AirbaseSchedule
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| base | `MilitaryBase` | Target base |
| flights | `ScheduledFlight[]` | All flights to filter |
| startDate | `Date` | Start of scheduling window |

**Returns:** `AirbaseSchedule`
```typescript
interface AirbaseSchedule {
  base: MilitaryBase;
  departures: ScheduledFlight[];      // Sorted by departure time
  arrivals: ScheduledFlight[];        // Sorted by arrival time
  runway_availability: TimeSlot[];    // 48-hour slots
  ramp_space_available: number;       // Default: 6
  fuel_available_lb: number;          // Default: 500,000 lbs
}
```

---

### scheduleFlights

Master scheduling function that analyzes all flights and builds base schedules.

```typescript
function scheduleFlights(
  flights: ScheduledFlight[],
  bases: MilitaryBase[]
): FlightScheduleResult
```

**Returns:** `FlightScheduleResult`
```typescript
interface FlightScheduleResult {
  flights: ScheduledFlight[];
  conflicts: ScheduleConflict[];
  base_schedules: Map<string, AirbaseSchedule>;
}
```

---

### getNextAvailableSlot

Finds the next available runway slot at a base.

```typescript
function getNextAvailableSlot(
  base: MilitaryBase,
  afterTime: Date,
  schedule: AirbaseSchedule
): Date | null
```

**Returns:** `Date | null` - Next available slot start time, or null if none found

---

### calculateCrewRestRequirement

Calculates crew rest requirements based on flight and duty hours.

```typescript
function calculateCrewRestRequirement(
  flightTimeHours: number,
  dutyTimeHours: number
): { restRequired: boolean; restHours: number }
```

**Crew Rest Rules:**
- Flight > 12h OR Duty > 16h → 12 hours rest required
- Flight > 8h → 8 hours rest required
- Otherwise → No rest required

## Edge Cases and Error Handling

1. **Empty flight list**: `checkScheduleConflicts` returns empty array
2. **Single flight**: No conflicts detected
3. **Same-time departures**: Detected as runway conflict
4. **Module-level counter**: Flight IDs are generated sequentially using a module-level counter

## Notes

- Flight ID counter is a module-level mutable variable that increments with each flight
- Fuel calculation includes a 25% reserve factor
- Time slots default to 30-minute intervals with 90% availability
