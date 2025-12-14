# weatherService.ts

## Module Purpose

Weather service module for military airlift route planning. Provides real-time weather data via NWS API integration with simulated fallback, weather system movement predictions, and route impact analysis. Supports both US-based (real NWS data) and international (simulated) locations.

## Dependencies

### Internal Modules
- `./routeTypes` - Type definitions (WeatherForecast, WeatherMovement, MilitaryBase)

### External Libraries
None (uses native fetch API)

## Exported Interfaces

### NWSForecastPeriod
```typescript
interface NWSForecastPeriod {
  number: number;
  name: string;
  startTime: string;
  endTime: string;
  isDaytime: boolean;
  temperature: number;
  temperatureUnit: string;
  temperatureTrend: string | null;
  probabilityOfPrecipitation: { value: number | null; unitCode: string } | null;
  windSpeed: string;
  windDirection: string;
  icon: string;
  shortForecast: string;
  detailedForecast: string;
}
```

### NWSCurrentConditions
```typescript
interface NWSCurrentConditions {
  textDescription?: string;
  temperature?: { value: number | null; unitCode: string };
  dewpoint?: { value: number | null; unitCode: string };
  windDirection?: { value: number | null; unitCode: string };
  windSpeed?: { value: number | null; unitCode: string };
  windGust?: { value: number | null; unitCode: string };
  barometricPressure?: { value: number | null; unitCode: string };
  visibility?: { value: number | null; unitCode: string };
  relativeHumidity?: { value: number | null; unitCode: string };
}
```

### NWSWeatherResponse
```typescript
interface NWSWeatherResponse {
  location: {
    lat: number;
    lon: number;
    city?: string;
    state?: string;
    timezone?: string;
  };
  forecast: NWSForecastPeriod[];
  forecastHourlyUrl?: string;
  currentConditions?: NWSCurrentConditions;
  generatedAt?: string;
  updateTime?: string;
  cached: boolean;
  error?: string;
}
```

## Exported Functions

### fetchRealWeather

Fetches weather data from NWS API via server proxy.

```typescript
async function fetchRealWeather(
  lat: number,
  lon: number
): Promise<NWSWeatherResponse | null>
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| lat | `number` | Latitude in degrees |
| lon | `number` | Longitude in degrees |

**Returns:** `Promise<NWSWeatherResponse | null>` - Weather data or null on failure

**Error Handling:**
- 429: Rate limited → returns null
- 404: Non-US location (NWS only covers US) → returns null
- Network error → returns null with console error

---

### getRealBaseWeather

Gets weather for a military base, using real NWS data when available.

```typescript
async function getRealBaseWeather(
  base: MilitaryBase
): Promise<WeatherForecast>
```

**Returns:** `WeatherForecast`
```typescript
interface WeatherForecast {
  timestamp: Date;
  location: { lat: number; lon: number };
  wind_direction_deg: number | null;
  wind_speed_kt: number | null;
  visibility_sm: number | null;
  visibility_nm: number | null;
  ceiling_ft: number | null;
  temperature_c: number | null;
  dewpoint_c: number | null;
  pressure_inhg: number | null;
  conditions: 'VFR' | 'MVFR' | 'IFR' | 'LIFR' | null;
  precipitation: 'rain' | 'snow' | 'freezing_rain' | 'thunderstorm' | 'none' | null;
  dataSource: 'observations' | 'forecast' | 'simulated';
}
```

**Data Source Priority:**
1. Current observations (if available)
2. Forecast data (if no observations)
3. Simulated fallback (if NWS unavailable)

---

### getBaseWeather

Generates simulated weather for a base (deterministic based on base ID).

```typescript
function getBaseWeather(base: MilitaryBase): WeatherForecast
```

**Returns:** `WeatherForecast` with `dataSource: 'simulated'`

**Note:** Uses base_id hash for consistent pseudo-random values

---

### generateForecastPositions

Projects weather system movement over time.

```typescript
function generateForecastPositions(
  wx: WeatherMovement,
  hours?: number
): WeatherMovement
```

**Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| wx | `WeatherMovement` | required | Weather system to track |
| hours | `number` | 72 | Forecast horizon in hours |

**Returns:** `WeatherMovement` with populated `forecast_positions` array

**Forecast Positions Structure:**
```typescript
forecast_positions: Array<{
  timestamp: Date;
  position: { lat: number; lon: number };
}>
```

---

### getActiveWeatherSystems

Returns all tracked weather systems with forecast positions.

```typescript
function getActiveWeatherSystems(): WeatherMovement[]
```

**Returns:** Array of weather systems:
```typescript
interface WeatherMovement {
  id: string;              // e.g., "WX001"
  type: 'front' | 'storm' | 'pressure_system';
  name: string;
  current_position: { lat: number; lon: number };
  velocity_kt: number;
  heading_deg: number;
  forecast_positions: Array<{ timestamp: Date; position: { lat: number; lon: number } }>;
  severity: 'minor' | 'moderate' | 'severe';
  affects_flight_ops: boolean;
}
```

**Default Systems:**
- Cold Front Alpha (moderate, affects ops)
- Tropical Depression Beta (severe, affects ops)
- High Pressure System (minor, doesn't affect ops)

---

### willWeatherAffectRoute

Analyzes if weather systems will impact a route during flight.

```typescript
function willWeatherAffectRoute(
  origin: MilitaryBase,
  destination: MilitaryBase,
  departureTime: Date
): {
  affected: boolean;
  systems: WeatherMovement[];
  recommendation: string;
}
```

**Impact Detection:**
- Checks if any weather system will be within 200nm of route midpoint
- Only considers systems within 12 hours of departure
- Only considers systems that affect flight ops

**Recommendations:**
- Severe weather: "SEVERE WEATHER ALERT: Consider delaying departure or alternate routing."
- Moderate weather: "Weather system may impact route. Monitor conditions closely."
- Clear: "Clear weather expected along route."

---

### formatWindData

Formats wind as aviation-standard string.

```typescript
function formatWindData(
  direction: number | null,
  speed: number | null,
  gust?: number | null
): string
```

**Examples:**
```typescript
formatWindData(270, 15);      // Returns: "270/15KT"
formatWindData(180, 20, 35);  // Returns: "180/20G35KT"
formatWindData(null, null);   // Returns: "N/A"
```

---

### getConditionsColor

Returns color code for flight conditions.

```typescript
function getConditionsColor(
  conditions: 'VFR' | 'MVFR' | 'IFR' | 'LIFR' | null
): string
```

**Returns:**
| Conditions | Color |
|------------|-------|
| VFR | `#22c55e` (green) |
| MVFR | `#3b82f6` (blue) |
| IFR | `#ef4444` (red) |
| LIFR | `#a855f7` (purple) |
| null | `#ef4444` (red) |

---

### formatWeatherValue

Formats a weather value with unit, handling nulls.

```typescript
function formatWeatherValue(
  value: number | null,
  unit: string
): string
```

**Example:**
```typescript
formatWeatherValue(15, '°C');  // Returns: "15°C"
formatWeatherValue(null, 'kt'); // Returns: "N/A"
```

## Flight Conditions Reference

| Condition | Ceiling | Visibility |
|-----------|---------|------------|
| VFR | ≥3000 ft | ≥5 sm |
| MVFR | 1000-3000 ft | 3-5 sm |
| IFR | 500-1000 ft | 1-3 sm |
| LIFR | <500 ft | <1 sm |

## Edge Cases and Error Handling

1. **Non-US locations**: NWS API returns 404, falls back to simulated data
2. **Rate limiting**: API returns 429, falls back to simulated data
3. **Network failures**: Caught and logged, returns null/simulated
4. **Null values**: All formatters handle null gracefully with "N/A"
5. **Unit conversion**: Handles multiple NWS unit codes (degC, degF, m/s, km/h)

## Notes

- NWS API only covers US territories; international bases use simulated data
- Wind direction is meteorological (direction wind is FROM)
- Visibility is in statute miles (sm), can be converted to nautical miles (nm)
- Debug logging available with `[Weather requestId]` prefix
