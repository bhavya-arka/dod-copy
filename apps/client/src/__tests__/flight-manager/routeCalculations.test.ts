/**
 * Route Calculations Tests - Flight Manager
 * Tests for distance, fuel, and time calculations
 */

import {
  calculateGreatCircleDistance,
  calculateBearing,
  calculateTimeEnRoute,
  calculateFuelRequired,
  createRouteLeg,
  calculateRouteTotals,
  formatFlightTime,
  formatMilitaryTime,
  formatMilitaryDateTime,
  parseMilitaryTime,
  formatDistance,
  calculateTurnRadius,
  calculateWindComponent
} from '../../lib/routeCalculations';
import { MILITARY_BASES, getBaseById } from '../../lib/bases';
import { AIRCRAFT_PERFORMANCE } from '../../lib/routeTypes';

describe('Route Calculations - Distance Between Bases', () => {
  test('should calculate distance from Hickam to Kadena', () => {
    const hickam = getBaseById('HICKAM')!;
    const kadena = getBaseById('KADENA')!;
    
    const result = calculateGreatCircleDistance(
      hickam.latitude_deg, hickam.longitude_deg,
      kadena.latitude_deg, kadena.longitude_deg
    );
    
    expect(result.distance_nm).toBeGreaterThan(3500);
    expect(result.distance_nm).toBeLessThan(5000);
  });

  test('should calculate distance from Travis to Yokota', () => {
    const travis = getBaseById('TRAVIS')!;
    const yokota = getBaseById('YOKOTA')!;
    
    const result = calculateGreatCircleDistance(
      travis.latitude_deg, travis.longitude_deg,
      yokota.latitude_deg, yokota.longitude_deg
    );
    
    expect(result.distance_nm).toBeGreaterThan(4000);
  });

  test('should calculate shorter distance for nearby bases', () => {
    const osan = getBaseById('OSAN')!;
    const kunsan = getBaseById('KUNSAN')!;
    
    const result = calculateGreatCircleDistance(
      osan.latitude_deg, osan.longitude_deg,
      kunsan.latitude_deg, kunsan.longitude_deg
    );
    
    expect(result.distance_nm).toBeLessThan(100);
  });
});

describe('Route Calculations - Bearing', () => {
  test('should calculate bearing from Hickam to Kadena', () => {
    const hickam = getBaseById('HICKAM')!;
    const kadena = getBaseById('KADENA')!;
    
    const bearing = calculateBearing(
      hickam.latitude_deg, hickam.longitude_deg,
      kadena.latitude_deg, kadena.longitude_deg
    );
    
    expect(bearing).toBeGreaterThanOrEqual(0);
    expect(bearing).toBeLessThan(360);
    expect(bearing).toBeGreaterThan(250);
  });
});

describe('Route Calculations - Fuel Estimates', () => {
  test('should calculate more fuel for C-17 than C-130 on same route', () => {
    const distance = 2000;
    
    const c17Fuel = calculateFuelRequired(distance, 'C-17');
    const c130Fuel = calculateFuelRequired(distance, 'C-130');
    
    expect(c17Fuel).toBeGreaterThan(c130Fuel);
  });

  test('should apply reserve factor correctly', () => {
    const distance = 1000;
    const perf = AIRCRAFT_PERFORMANCE['C-17'];
    const baseFuel = distance * perf.fuel_lb_per_nm;
    
    const fuel = calculateFuelRequired(distance, 'C-17', { reserve_factor: 1.5, cruise_altitude_ft: 30000, use_live_weather: false });
    
    expect(fuel).toBeCloseTo(baseFuel * 1.5, 0);
  });

  test('should estimate reasonable fuel for Pacific crossing', () => {
    const hickam = getBaseById('HICKAM')!;
    const yokota = getBaseById('YOKOTA')!;
    
    const { distance_nm } = calculateGreatCircleDistance(
      hickam.latitude_deg, hickam.longitude_deg,
      yokota.latitude_deg, yokota.longitude_deg
    );
    
    const fuel = calculateFuelRequired(distance_nm, 'C-17');
    
    expect(fuel).toBeGreaterThan(100000);
    expect(fuel).toBeLessThan(500000);
  });
});

describe('Route Calculations - Time En Route', () => {
  test('should calculate longer time for C-130 than C-17', () => {
    const distance = 2000;
    
    const c17Time = calculateTimeEnRoute(distance, 'C-17');
    const c130Time = calculateTimeEnRoute(distance, 'C-130');
    
    expect(c130Time.time_enroute_hr).toBeGreaterThan(c17Time.time_enroute_hr);
  });

  test('should include block time overhead', () => {
    const result = calculateTimeEnRoute(1000, 'C-17');
    
    expect(result.block_time_hr).toBeGreaterThan(result.time_enroute_hr);
  });

  test('should adjust ground speed for headwind', () => {
    const weather = { wind_direction_deg: 180, wind_speed_kt: 50, temperature_c: 15 };
    const settings = { reserve_factor: 1.25, cruise_altitude_ft: 30000, use_live_weather: true };
    
    const result = calculateTimeEnRoute(1000, 'C-17', weather, settings);
    
    expect(result.wind_component_kt).toBeLessThan(0);
  });

  test('should adjust ground speed for tailwind', () => {
    const weather = { wind_direction_deg: 0, wind_speed_kt: 50, temperature_c: 15 };
    const settings = { reserve_factor: 1.25, cruise_altitude_ft: 30000, use_live_weather: true };
    
    const result = calculateTimeEnRoute(1000, 'C-17', weather, settings);
    
    expect(result.wind_component_kt).toBeGreaterThan(0);
  });
});

describe('Route Calculations - Wind Component', () => {
  test('should calculate full headwind at 180 degree offset', () => {
    const component = calculateWindComponent(90, 270, 40);
    expect(component).toBeCloseTo(-40, 0);
  });

  test('should calculate full tailwind at 0 degree offset', () => {
    const component = calculateWindComponent(180, 180, 40);
    expect(component).toBeCloseTo(40, 0);
  });

  test('should calculate zero for pure crosswind', () => {
    const component = calculateWindComponent(0, 90, 40);
    expect(Math.abs(component)).toBeLessThan(1);
  });
});

describe('Route Calculations - Route Leg Creation', () => {
  test('should create leg with all properties', () => {
    const hickam = getBaseById('HICKAM')!;
    const kadena = getBaseById('KADENA')!;
    
    const leg = createRouteLeg(
      'LEG-001', 1, hickam, kadena, 'C-17', 'AC-001',
      ['P1', 'P2'], ['V1'], 20, 80000
    );
    
    expect(leg.origin.base_id).toBe('HICKAM');
    expect(leg.destination.base_id).toBe('KADENA');
    expect(leg.distance_nm).toBeGreaterThan(0);
    expect(leg.fuel_required_lb).toBeGreaterThan(0);
    expect(leg.assigned_pallet_ids).toEqual(['P1', 'P2']);
    expect(leg.pax_count).toBe(20);
  });
});

describe('Route Calculations - Military Time Formatting', () => {
  test('should format noon correctly', () => {
    const date = new Date('2025-06-15T12:00:00Z');
    expect(formatMilitaryTime(date)).toBe('1200Z');
  });

  test('should format single digit hours with padding', () => {
    const date = new Date('2025-06-15T09:30:00Z');
    expect(formatMilitaryTime(date)).toBe('0930Z');
  });

  test('should parse military time with Z suffix', () => {
    const parsed = parseMilitaryTime('1545Z');
    expect(parsed).toEqual({ hours: 15, minutes: 45 });
  });

  test('should return null for malformed time', () => {
    expect(parseMilitaryTime('invalid')).toBeNull();
    expect(parseMilitaryTime('25:00')).toBeNull();
  });
});
