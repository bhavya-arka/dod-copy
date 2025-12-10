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
    fuel_lb_per_nm: 55, // Approximate
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
  wind_direction_deg: number;
  wind_speed_kt: number;
  gust_kt?: number;
  visibility_sm: number;
  ceiling_ft: number;
  temperature_c: number;
  dewpoint_c: number;
  pressure_inhg: number;
  conditions: 'VFR' | 'MVFR' | 'IFR' | 'LIFR';
  precipitation?: 'rain' | 'snow' | 'freezing_rain' | 'thunderstorm' | 'none';
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
