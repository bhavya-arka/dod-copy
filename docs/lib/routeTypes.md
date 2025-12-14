# routeTypes - Route Planning Type Definitions

## Purpose

Data types for route planning, flight dynamics, scheduling, weather, and visualization in the PACAF airlift system.

## Location

`apps/client/src/lib/routeTypes.ts`

## Exported Types

### MilitaryBase
```typescript
interface MilitaryBase {
  base_id: string;          // e.g., 'HICKAM'
  name: string;             // e.g., 'Joint Base Pearl Harbor-Hickam'
  icao: string;             // e.g., 'PHIK'
  iata?: string;            // e.g., 'HIK'
  latitude_deg: number;
  longitude_deg: number;
  country: string;
  timezone: string;
  runway_length_ft: number;
}
```

### RouteLeg
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

### FlightRoute
```typescript
interface FlightRoute {
  id: string;
  name: string;
  legs: RouteLeg[];
  total_distance_nm: number;
  total_time_hr: number;
  total_fuel_lb: number;
  aircraft_count: number;
}
```

### WeatherData
```typescript
interface WeatherData {
  wind_direction_deg: number;
  wind_speed_kt: number;
  temperature_c: number;
  turbulence_risk?: 'low' | 'moderate' | 'severe';
  icing_risk?: 'low' | 'moderate' | 'severe';
}
```

### AircraftPerformance
```typescript
interface AircraftPerformance {
  type: 'C-17' | 'C-130';
  cruise_speed_kt: number;
  fuel_lb_per_nm: number;
  service_ceiling_ft: number;
  climb_rate_fpm: number;
  descent_rate_fpm: number;
  taxi_climb_descent_hr: number;
}
```

### AircraftSpecs
```typescript
interface AircraftSpecs {
  type: 'C-17' | 'C-130';
  name: string;
  cruise_speed_kt: number;
  service_ceiling_ft: number;
  max_payload_lb: number;
  max_fuel_capacity_lb: number;
  fuel_burn_cruise_lb_hr: number;
  fuel_burn_climb_lb_hr: number;
  fuel_burn_descent_lb_hr: number;
  fuel_burn_taxi_lb_hr: number;
  operating_cost_per_hr: number;
  payload_fuel_penalty_factor: number;
}
```

### ScheduledFlight
```typescript
interface ScheduledFlight {
  id: string;
  callsign: string;
  aircraft_type: 'C-17' | 'C-130';
  aircraft_id: string;
  origin: MilitaryBase;
  destination: MilitaryBase;
  scheduled_departure: Date;
  scheduled_arrival: Date;
  status: 'scheduled' | 'delayed' | 'in_flight' | 'arrived' | 'cancelled';
  payload_weight_lb: number;
  pax_count: number;
  assigned_pallet_ids: string[];
  fuel_required_lb: number;
}
```

### WeatherForecast
```typescript
interface WeatherForecast {
  timestamp: Date;
  location: { lat: number; lon: number };
  wind_direction_deg: number | null;
  wind_speed_kt: number | null;
  visibility_sm: number | null;
  ceiling_ft: number | null;
  temperature_c: number | null;
  conditions: 'VFR' | 'MVFR' | 'IFR' | 'LIFR' | null;
  dataSource?: 'observations' | 'forecast' | 'simulated';
}
```

### ScheduleConflict
```typescript
interface ScheduleConflict {
  id: string;
  type: 'runway_conflict' | 'ramp_capacity' | 'fuel_shortage' | 'weather_hold' | 'crew_rest';
  affected_flights: string[];
  description: string;
  suggested_resolution: string;
}
```

## Constants

### AIRCRAFT_PERFORMANCE
```typescript
const AIRCRAFT_PERFORMANCE: Record<'C-17' | 'C-130', AircraftPerformance> = {
  'C-17': { cruise_speed_kt: 450, fuel_lb_per_nm: 55, ... },
  'C-130': { cruise_speed_kt: 320, fuel_lb_per_nm: 25, ... }
}
```

### AIRCRAFT_SPECS
```typescript
const AIRCRAFT_SPECS: Record<'C-17' | 'C-130', AircraftSpecs> = {
  'C-17': { max_payload_lb: 170900, max_fuel_capacity_lb: 181054, ... },
  'C-130': { max_payload_lb: 45000, max_fuel_capacity_lb: 61360, ... }
}
```

### DEFAULT_FUEL_CONFIG
```typescript
const DEFAULT_FUEL_CONFIG: FuelCalculationConfig = {
  fuel_cost_per_lb: 3.50,
  reserve_fuel_percent: 0.10,
  contingency_fuel_percent: 0.05,
  alternate_fuel_nm: 200
}
```

### DEFAULT_ROUTE_SETTINGS
```typescript
const DEFAULT_ROUTE_SETTINGS: RouteSettings = {
  reserve_factor: 1.25,
  cruise_altitude_ft: 30000,
  use_live_weather: false
}
```

## Usage Example

```typescript
import { 
  FlightRoute, 
  RouteLeg, 
  AIRCRAFT_SPECS,
  DEFAULT_FUEL_CONFIG 
} from '@/lib/routeTypes';

const c17Specs = AIRCRAFT_SPECS['C-17'];
const fuelBurn = c17Specs.fuel_burn_cruise_lb_hr;

const route: FlightRoute = {
  id: 'ROUTE-001',
  name: 'Hickam to Kadena',
  legs: [leg1, leg2],
  total_distance_nm: 4200,
  total_time_hr: 9.3,
  total_fuel_lb: 231000,
  aircraft_count: 2
};
```
