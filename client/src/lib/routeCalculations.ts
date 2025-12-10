/**
 * PACAF Airlift Demo - Route Calculations
 * 
 * Great-circle distance, time en route, fuel estimates, and flight dynamics.
 */

import {
  MilitaryBase,
  RouteLeg,
  FlightRoute,
  WeatherData,
  AIRCRAFT_PERFORMANCE,
  RouteSettings,
  DEFAULT_ROUTE_SETTINGS
} from './routeTypes';

const EARTH_RADIUS_NM = 3440.065;

export function calculateGreatCircleDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): { distance_nm: number; distance_km: number } {
  const toRad = (deg: number) => deg * (Math.PI / 180);
  
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance_nm = EARTH_RADIUS_NM * c;
  const distance_km = distance_nm * 1.852;
  
  return { distance_nm, distance_km };
}

export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => deg * (Math.PI / 180);
  const toDeg = (rad: number) => rad * (180 / Math.PI);
  
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  
  let bearing = toDeg(Math.atan2(y, x));
  bearing = (bearing + 360) % 360;
  
  return bearing;
}

export function calculateWindComponent(
  track_deg: number,
  wind_direction_deg: number,
  wind_speed_kt: number
): number {
  const toRad = (deg: number) => deg * (Math.PI / 180);
  const angle = toRad(track_deg - wind_direction_deg);
  return wind_speed_kt * Math.cos(angle);
}

export function calculateTimeEnRoute(
  distance_nm: number,
  aircraft_type: 'C-17' | 'C-130',
  weather?: WeatherData,
  settings: RouteSettings = DEFAULT_ROUTE_SETTINGS
): {
  time_enroute_hr: number;
  block_time_hr: number;
  ground_speed_kt: number;
  wind_component_kt: number;
} {
  const perf = AIRCRAFT_PERFORMANCE[aircraft_type];
  let ground_speed_kt = perf.cruise_speed_kt;
  let wind_component_kt = 0;
  
  if (weather && settings.use_live_weather) {
    wind_component_kt = calculateWindComponent(
      0, // Would need actual track
      weather.wind_direction_deg,
      weather.wind_speed_kt
    );
    ground_speed_kt = perf.cruise_speed_kt - wind_component_kt;
    
    // Safety floor
    if (ground_speed_kt < perf.cruise_speed_kt * 0.5) {
      ground_speed_kt = perf.cruise_speed_kt * 0.5;
    }
  }
  
  const time_enroute_hr = distance_nm / ground_speed_kt;
  const block_time_hr = time_enroute_hr + perf.taxi_climb_descent_hr;
  
  return {
    time_enroute_hr,
    block_time_hr,
    ground_speed_kt,
    wind_component_kt
  };
}

export function calculateFuelRequired(
  distance_nm: number,
  aircraft_type: 'C-17' | 'C-130',
  settings: RouteSettings = DEFAULT_ROUTE_SETTINGS
): number {
  const perf = AIRCRAFT_PERFORMANCE[aircraft_type];
  return settings.reserve_factor * (distance_nm * perf.fuel_lb_per_nm);
}

export function createRouteLeg(
  id: string,
  sequence: number,
  origin: MilitaryBase,
  destination: MilitaryBase,
  aircraft_type: 'C-17' | 'C-130',
  aircraft_id: string,
  assigned_pallet_ids: string[] = [],
  assigned_vehicle_ids: string[] = [],
  pax_count: number = 0,
  payload_weight_lb: number = 0,
  weather?: WeatherData,
  settings: RouteSettings = DEFAULT_ROUTE_SETTINGS
): RouteLeg {
  const { distance_nm, distance_km } = calculateGreatCircleDistance(
    origin.latitude_deg,
    origin.longitude_deg,
    destination.latitude_deg,
    destination.longitude_deg
  );
  
  const timeResult = calculateTimeEnRoute(
    distance_nm,
    aircraft_type,
    weather,
    settings
  );
  
  const fuel_required_lb = calculateFuelRequired(
    distance_nm,
    aircraft_type,
    settings
  );
  
  return {
    id,
    sequence,
    origin,
    destination,
    aircraft_type,
    aircraft_id,
    assigned_pallet_ids,
    assigned_vehicle_ids,
    pax_count,
    distance_nm,
    distance_km,
    time_enroute_hr: timeResult.time_enroute_hr,
    block_time_hr: timeResult.block_time_hr,
    fuel_required_lb,
    payload_weight_lb,
    wind_component_kt: timeResult.wind_component_kt,
    ground_speed_kt: timeResult.ground_speed_kt
  };
}

export function calculateRouteTotals(legs: RouteLeg[]): {
  total_distance_nm: number;
  total_distance_km: number;
  total_time_hr: number;
  total_block_time_hr: number;
  total_fuel_lb: number;
  total_payload_lb: number;
} {
  return {
    total_distance_nm: legs.reduce((sum, l) => sum + l.distance_nm, 0),
    total_distance_km: legs.reduce((sum, l) => sum + l.distance_km, 0),
    total_time_hr: legs.reduce((sum, l) => sum + l.time_enroute_hr, 0),
    total_block_time_hr: legs.reduce((sum, l) => sum + l.block_time_hr, 0),
    total_fuel_lb: legs.reduce((sum, l) => sum + l.fuel_required_lb, 0),
    total_payload_lb: legs.reduce((sum, l) => sum + l.payload_weight_lb, 0)
  };
}

export function calculateTurnRadius(
  ground_speed_kt: number,
  bank_angle_deg: number
): number {
  const tanBank = Math.tan(bank_angle_deg * (Math.PI / 180));
  if (tanBank === 0) return Infinity;
  return (ground_speed_kt ** 2) / (11.26 * tanBank);
}

export function formatFlightTime(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

export function formatMilitaryTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}${minutes}Z`;
}

export function formatMilitaryDateTime(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const month = months[date.getMonth()];
  const year = date.getFullYear().toString().slice(-2);
  const time = formatMilitaryTime(date);
  return `${day}${month}${year} ${time}`;
}

export function parseMilitaryTime(timeStr: string): { hours: number; minutes: number } | null {
  const match = timeStr.match(/^(\d{2})(\d{2})Z?$/);
  if (!match) return null;
  return { hours: parseInt(match[1], 10), minutes: parseInt(match[2], 10) };
}

export function formatDistance(nm: number): string {
  return `${Math.round(nm).toLocaleString()} nm`;
}
