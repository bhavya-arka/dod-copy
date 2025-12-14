# routeCalculations.ts

## Module Purpose

Route calculation module for military airlift operations. Provides great-circle distance calculations, time en route estimates, fuel consumption, wind component analysis, and military time formatting. Core mathematical engine for flight planning.

## Dependencies

### Internal Modules
- `./routeTypes` - Type definitions (MilitaryBase, RouteLeg, FlightRoute, WeatherData, AIRCRAFT_PERFORMANCE, RouteSettings, DEFAULT_ROUTE_SETTINGS)

### External Libraries
None

## Constants

```typescript
const EARTH_RADIUS_NM = 3440.065;  // Earth's radius in nautical miles
```

## Exported Functions

### calculateGreatCircleDistance

Calculates the shortest distance between two points on Earth using the Haversine formula.

```typescript
function calculateGreatCircleDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): { distance_nm: number; distance_km: number }
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| lat1 | `number` | Origin latitude (degrees) |
| lon1 | `number` | Origin longitude (degrees) |
| lat2 | `number` | Destination latitude (degrees) |
| lon2 | `number` | Destination longitude (degrees) |

**Returns:**
```typescript
{
  distance_nm: number;  // Distance in nautical miles
  distance_km: number;  // Distance in kilometers (nm × 1.852)
}
```

**Example:**
```typescript
const result = calculateGreatCircleDistance(
  26.3513, 127.7682,  // Kadena AB
  35.7485, 139.3486   // Yokota AB
);
// Returns: { distance_nm: 834.2, distance_km: 1544.5 }
```

---

### calculateBearing

Calculates the initial bearing (azimuth) from origin to destination.

```typescript
function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number
```

**Returns:** `number` - Bearing in degrees (0-360, where 0 = North)

---

### calculateWindComponent

Calculates headwind/tailwind component based on track and wind.

```typescript
function calculateWindComponent(
  track_deg: number,
  wind_direction_deg: number,
  wind_speed_kt: number
): number
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| track_deg | `number` | Aircraft track in degrees |
| wind_direction_deg | `number` | Wind direction (from) in degrees |
| wind_speed_kt | `number` | Wind speed in knots |

**Returns:** `number` - Wind component in knots (positive = headwind, negative = tailwind)

---

### calculateTimeEnRoute

Calculates flight time considering aircraft performance and weather.

```typescript
function calculateTimeEnRoute(
  distance_nm: number,
  aircraft_type: 'C-17' | 'C-130',
  weather?: WeatherData,
  settings?: RouteSettings
): {
  time_enroute_hr: number;
  block_time_hr: number;
  ground_speed_kt: number;
  wind_component_kt: number;
}
```

**Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| distance_nm | `number` | required | Route distance in nautical miles |
| aircraft_type | `'C-17' \| 'C-130'` | required | Aircraft type |
| weather | `WeatherData` | undefined | Weather conditions for wind adjustment |
| settings | `RouteSettings` | DEFAULT | Route planning settings |

**Returns:**
```typescript
{
  time_enroute_hr: number;    // Flight time (distance / ground speed)
  block_time_hr: number;      // Total time including taxi/climb/descent
  ground_speed_kt: number;    // Actual ground speed
  wind_component_kt: number;  // Applied wind component
}
```

**Aircraft Performance:**
- C-17: ~450 kt cruise, 0.5 hr taxi/climb/descent
- C-130: ~320 kt cruise, 0.4 hr taxi/climb/descent

**Safety Floor:** Ground speed cannot drop below 50% of cruise speed

---

### calculateFuelRequired

Estimates fuel consumption with reserve factor.

```typescript
function calculateFuelRequired(
  distance_nm: number,
  aircraft_type: 'C-17' | 'C-130',
  settings?: RouteSettings
): number
```

**Returns:** `number` - Fuel required in pounds (includes reserve factor from settings)

**Formula:** `reserve_factor × (distance_nm × fuel_lb_per_nm)`

---

### createRouteLeg

Creates a complete route leg with all calculated values.

```typescript
function createRouteLeg(
  id: string,
  sequence: number,
  origin: MilitaryBase,
  destination: MilitaryBase,
  aircraft_type: 'C-17' | 'C-130',
  aircraft_id: string,
  assigned_pallet_ids?: string[],
  assigned_vehicle_ids?: string[],
  pax_count?: number,
  payload_weight_lb?: number,
  weather?: WeatherData,
  settings?: RouteSettings
): RouteLeg
```

**Returns:** `RouteLeg`
```typescript
interface RouteLeg {
  id: string;
  sequence: number;
  origin: MilitaryBase;
  destination: MilitaryBase;
  aircraft_type: 'C-17' | 'C-130';
  aircraft_id: string;
  assigned_pallet_ids: string[];
  assigned_vehicle_ids: string[];
  pax_count: number;
  distance_nm: number;
  distance_km: number;
  time_enroute_hr: number;
  block_time_hr: number;
  fuel_required_lb: number;
  payload_weight_lb: number;
  wind_component_kt: number;
  ground_speed_kt: number;
}
```

---

### calculateRouteTotals

Aggregates totals across multiple route legs.

```typescript
function calculateRouteTotals(legs: RouteLeg[]): {
  total_distance_nm: number;
  total_distance_km: number;
  total_time_hr: number;
  total_block_time_hr: number;
  total_fuel_lb: number;
  total_payload_lb: number;
}
```

---

### calculateTurnRadius

Calculates aircraft turn radius for route planning.

```typescript
function calculateTurnRadius(
  ground_speed_kt: number,
  bank_angle_deg: number
): number
```

**Returns:** `number` - Turn radius (returns Infinity if bank angle is 0)

---

### formatFlightTime

Formats hours as human-readable flight time.

```typescript
function formatFlightTime(hours: number): string
```

**Example:**
```typescript
formatFlightTime(2.75); // Returns: "2h 45m"
```

---

### formatMilitaryTime

Formats a Date as Zulu time (military format).

```typescript
function formatMilitaryTime(date: Date): string
```

**Example:**
```typescript
formatMilitaryTime(new Date('2025-01-15T14:30:00Z'));
// Returns: "1430Z"
```

---

### formatMilitaryDateTime

Formats a Date as full military date-time.

```typescript
function formatMilitaryDateTime(date: Date): string
```

**Example:**
```typescript
formatMilitaryDateTime(new Date('2025-01-15T14:30:00Z'));
// Returns: "15JAN25 1430Z"
```

---

### parseMilitaryTime

Parses military time string to hours and minutes.

```typescript
function parseMilitaryTime(
  timeStr: string
): { hours: number; minutes: number } | null
```

**Example:**
```typescript
parseMilitaryTime("1430Z"); // Returns: { hours: 14, minutes: 30 }
parseMilitaryTime("invalid"); // Returns: null
```

---

### formatDistance

Formats distance with localized number and unit.

```typescript
function formatDistance(nm: number): string
```

**Example:**
```typescript
formatDistance(1234.5); // Returns: "1,235 nm"
```

## Edge Cases and Error Handling

1. **Zero distance**: Returns 0 for all calculated values
2. **Invalid coordinates**: Haversine formula handles any valid lat/lon
3. **Extreme headwinds**: Ground speed clamped to 50% of cruise speed
4. **Zero bank angle**: Turn radius returns Infinity
5. **Invalid time string**: `parseMilitaryTime` returns null

## Notes

- All calculations use nautical miles as the primary unit
- Military time is always in Zulu (UTC)
- The module uses pure mathematical functions with no side effects
