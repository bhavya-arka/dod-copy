/**
 * PACAF Airlift Demo - Route Planning Types
 * 
 * Data types for route planning, flight dynamics, and visualization.
 */

export interface MilitaryBase {
  base_id: string;
  name: string;
  icao: string;
  iata?: string;
  latitude_deg: number;
  longitude_deg: number;
  country: string;
  timezone: string;
  runway_length_ft: number;
}

export interface RouteLeg {
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

export interface FlightRoute {
  id: string;
  name: string;
  legs: RouteLeg[];
  total_distance_nm: number;
  total_time_hr: number;
  total_fuel_lb: number;
  aircraft_count: number;
}

export interface WeatherData {
  wind_direction_deg: number;
  wind_speed_kt: number;
  temperature_c: number;
  turbulence_risk?: 'low' | 'moderate' | 'severe';
  icing_risk?: 'low' | 'moderate' | 'severe';
}

export interface AircraftPerformance {
  type: 'C-17' | 'C-130';
  cruise_speed_kt: number;
  fuel_lb_per_nm: number;
  service_ceiling_ft: number;
  climb_rate_fpm: number;
  descent_rate_fpm: number;
  taxi_climb_descent_hr: number;
}

export const AIRCRAFT_PERFORMANCE: Record<'C-17' | 'C-130', AircraftPerformance> = {
  'C-17': {
    type: 'C-17',
    cruise_speed_kt: 450,
    fuel_lb_per_nm: 55,
    service_ceiling_ft: 45000,
    climb_rate_fpm: 2000,
    descent_rate_fpm: 1500,
    taxi_climb_descent_hr: 0.5
  },
  'C-130': {
    type: 'C-130',
    cruise_speed_kt: 320,
    fuel_lb_per_nm: 25,
    service_ceiling_ft: 28000,
    climb_rate_fpm: 1500,
    descent_rate_fpm: 1500,
    taxi_climb_descent_hr: 0.5
  }
};

export interface AircraftSpecs {
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
  climb_time_hr: number;
  descent_time_hr: number;
  taxi_time_hr: number;
  payload_fuel_penalty_factor: number;
}

export const AIRCRAFT_SPECS: Record<'C-17' | 'C-130', AircraftSpecs> = {
  'C-17': {
    type: 'C-17',
    name: 'C-17 Globemaster III',
    cruise_speed_kt: 450,
    service_ceiling_ft: 45000,
    max_payload_lb: 170900,
    max_fuel_capacity_lb: 181054,
    fuel_burn_cruise_lb_hr: 21000,
    fuel_burn_climb_lb_hr: 28000,
    fuel_burn_descent_lb_hr: 8000,
    fuel_burn_taxi_lb_hr: 4000,
    operating_cost_per_hr: 22000,
    climb_time_hr: 0.35,
    descent_time_hr: 0.25,
    taxi_time_hr: 0.25,
    payload_fuel_penalty_factor: 0.015
  },
  'C-130': {
    type: 'C-130',
    name: 'C-130H Hercules',
    cruise_speed_kt: 320,
    service_ceiling_ft: 28000,
    max_payload_lb: 45000,
    max_fuel_capacity_lb: 61360,
    fuel_burn_cruise_lb_hr: 5500,
    fuel_burn_climb_lb_hr: 7000,
    fuel_burn_descent_lb_hr: 2500,
    fuel_burn_taxi_lb_hr: 1200,
    operating_cost_per_hr: 7000,
    climb_time_hr: 0.40,
    descent_time_hr: 0.30,
    taxi_time_hr: 0.20,
    payload_fuel_penalty_factor: 0.020
  }
};

export interface FuelCalculationConfig {
  fuel_cost_per_lb: number;
  reserve_fuel_percent: number;
  contingency_fuel_percent: number;
  alternate_fuel_nm: number;
}

export const DEFAULT_FUEL_CONFIG: FuelCalculationConfig = {
  fuel_cost_per_lb: 3.50,
  reserve_fuel_percent: 0.10,
  contingency_fuel_percent: 0.05,
  alternate_fuel_nm: 200
};

export interface RouteSettings {
  reserve_factor: number; // Default 1.25 (25% buffer)
  cruise_altitude_ft: number;
  use_live_weather: boolean;
}

export const DEFAULT_ROUTE_SETTINGS: RouteSettings = {
  reserve_factor: 1.25,
  cruise_altitude_ft: 30000,
  use_live_weather: false
};

export interface RouteInsight {
  id: string;
  type: 'efficiency' | 'risk' | 'optimization' | 'priority';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  recommendation?: string;
}

export interface ScheduledFlight {
  id: string;
  callsign: string;
  aircraft_type: 'C-17' | 'C-130';
  aircraft_id: string;
  origin: MilitaryBase;
  destination: MilitaryBase;
  scheduled_departure: Date;
  scheduled_arrival: Date;
  estimated_departure?: Date;
  estimated_arrival?: Date;
  status: 'scheduled' | 'delayed' | 'in_flight' | 'arrived' | 'cancelled';
  payload_weight_lb: number;
  pax_count: number;
  assigned_pallet_ids: string[];
  fuel_required_lb: number;
  notes?: string;
}

export interface AirbaseSchedule {
  base: MilitaryBase;
  departures: ScheduledFlight[];
  arrivals: ScheduledFlight[];
  runway_availability: TimeSlot[];
  ramp_space_available: number;
  fuel_available_lb: number;
}

export interface TimeSlot {
  start: Date;
  end: Date;
  available: boolean;
  reserved_for?: string;
}

export interface WeatherForecast {
  timestamp: Date;
  location: { lat: number; lon: number };
  wind_direction_deg: number | null;
  wind_speed_kt: number | null;
  gust_kt?: number | null;
  visibility_sm: number | null;
  visibility_nm?: number | null;
  ceiling_ft: number | null;
  temperature_c: number | null;
  dewpoint_c: number | null;
  pressure_inhg: number | null;
  conditions: 'VFR' | 'MVFR' | 'IFR' | 'LIFR' | null;
  precipitation?: 'rain' | 'snow' | 'freezing_rain' | 'thunderstorm' | 'none' | null;
  /** Indicates if this data is from live NWS vs simulated fallback */
  dataSource?: 'observations' | 'forecast' | 'simulated';
}

export interface WeatherMovement {
  id: string;
  type: 'front' | 'storm' | 'pressure_system';
  name: string;
  current_position: { lat: number; lon: number };
  velocity_kt: number;
  heading_deg: number;
  forecast_positions: Array<{
    timestamp: Date;
    position: { lat: number; lon: number };
  }>;
  severity: 'minor' | 'moderate' | 'severe';
  affects_flight_ops: boolean;
}

export interface FlightScheduleResult {
  flights: ScheduledFlight[];
  conflicts: ScheduleConflict[];
  base_schedules: Map<string, AirbaseSchedule>;
}

export interface ScheduleConflict {
  id: string;
  type: 'runway_conflict' | 'ramp_capacity' | 'fuel_shortage' | 'weather_hold' | 'crew_rest';
  affected_flights: string[];
  description: string;
  suggested_resolution: string;
}
