/**
 * Route Calculations Test Suite
 * Tests for apps/client/src/lib/routeCalculations.ts
 */

import {
  calculateGreatCircleDistance,
  calculateBearing,
  calculateWindComponent,
  calculateTimeEnRoute,
  calculateFuelRequired,
  createRouteLeg,
  calculateRouteTotals,
  calculateTurnRadius,
  formatFlightTime,
  formatMilitaryTime,
  formatMilitaryDateTime,
  parseMilitaryTime,
  formatDistance
} from '../../lib/routeCalculations';
import { AIRCRAFT_PERFORMANCE, MilitaryBase, RouteLeg } from '../../lib/routeTypes';

const createTestBase = (overrides: Partial<MilitaryBase> = {}): MilitaryBase => ({
  base_id: 'test-base',
  name: 'Test Base',
  icao: 'KTEST',
  latitude_deg: 38.9,
  longitude_deg: -77.0,
  country: 'USA',
  timezone: 'America/New_York',
  runway_length_ft: 10000,
  ...overrides
});

describe('routeCalculations', () => {
  describe('calculateGreatCircleDistance', () => {
    it('should calculate distance between two points', () => {
      const result = calculateGreatCircleDistance(
        38.9, -77.0,  
        51.5, -0.1    
      );
      expect(result.distance_nm).toBeGreaterThan(3000);
      expect(result.distance_nm).toBeLessThan(4000);
    });

    it('should return both nm and km', () => {
      const result = calculateGreatCircleDistance(38.9, -77.0, 51.5, -0.1);
      expect(result.distance_nm).toBeDefined();
      expect(result.distance_km).toBeDefined();
      expect(result.distance_km).toBeCloseTo(result.distance_nm * 1.852, 1);
    });

    it('should handle same point (zero distance)', () => {
      const result = calculateGreatCircleDistance(38.9, -77.0, 38.9, -77.0);
      expect(result.distance_nm).toBe(0);
      expect(result.distance_km).toBe(0);
    });

    it('should handle antipodal points (maximum distance)', () => {
      const result = calculateGreatCircleDistance(0, 0, 0, 180);
      expect(result.distance_nm).toBeGreaterThan(10000);
    });

    it('should handle crossing the equator', () => {
      const result = calculateGreatCircleDistance(10, -10, -10, 10);
      expect(result.distance_nm).toBeGreaterThan(0);
    });

    it('should handle crossing the prime meridian', () => {
      const result = calculateGreatCircleDistance(40, -5, 40, 5);
      expect(result.distance_nm).toBeGreaterThan(0);
    });

    it('should handle crossing the international date line', () => {
      const result = calculateGreatCircleDistance(35, 175, 35, -175);
      expect(result.distance_nm).toBeGreaterThan(0);
      expect(result.distance_nm).toBeLessThan(1000);
    });
  });

  describe('calculateBearing', () => {
    it('should calculate bearing between two points', () => {
      const bearing = calculateBearing(38.9, -77.0, 51.5, -0.1);
      expect(bearing).toBeGreaterThanOrEqual(0);
      expect(bearing).toBeLessThan(360);
    });

    it('should return 0 for due north', () => {
      const bearing = calculateBearing(0, 0, 10, 0);
      expect(bearing).toBeCloseTo(0, 0);
    });

    it('should return ~90 for due east', () => {
      const bearing = calculateBearing(0, 0, 0, 10);
      expect(bearing).toBeCloseTo(90, 0);
    });

    it('should return ~180 for due south', () => {
      const bearing = calculateBearing(10, 0, 0, 0);
      expect(bearing).toBeCloseTo(180, 0);
    });

    it('should return ~270 for due west', () => {
      const bearing = calculateBearing(0, 10, 0, 0);
      expect(bearing).toBeCloseTo(270, 0);
    });
  });

  describe('calculateWindComponent', () => {
    it('should calculate headwind component', () => {
      const component = calculateWindComponent(0, 180, 50);
      expect(component).toBeCloseTo(-50, 1);
    });

    it('should calculate tailwind component', () => {
      const component = calculateWindComponent(0, 0, 50);
      expect(component).toBeCloseTo(50, 1);
    });

    it('should calculate crosswind as zero component', () => {
      const component = calculateWindComponent(0, 90, 50);
      expect(component).toBeCloseTo(0, 1);
    });

    it('should handle quartering winds', () => {
      const component = calculateWindComponent(0, 45, 50);
      expect(component).toBeGreaterThan(0);
      expect(component).toBeLessThan(50);
    });
  });

  describe('calculateTimeEnRoute', () => {
    it('should calculate time for C-17', () => {
      const result = calculateTimeEnRoute(1000, 'C-17');
      expect(result.time_enroute_hr).toBeGreaterThan(0);
      expect(result.block_time_hr).toBeGreaterThan(result.time_enroute_hr);
    });

    it('should calculate time for C-130', () => {
      const result = calculateTimeEnRoute(1000, 'C-130');
      expect(result.time_enroute_hr).toBeGreaterThan(0);
    });

    it('should return slower time for C-130 vs C-17', () => {
      const c17Time = calculateTimeEnRoute(1000, 'C-17');
      const c130Time = calculateTimeEnRoute(1000, 'C-130');
      expect(c130Time.time_enroute_hr).toBeGreaterThan(c17Time.time_enroute_hr);
    });

    it('should include taxi/climb/descent in block time', () => {
      const result = calculateTimeEnRoute(1000, 'C-17');
      const perf = AIRCRAFT_PERFORMANCE['C-17'];
      expect(result.block_time_hr).toBeCloseTo(
        result.time_enroute_hr + perf.taxi_climb_descent_hr, 
        2
      );
    });

    it('should handle zero distance', () => {
      const result = calculateTimeEnRoute(0, 'C-17');
      expect(result.time_enroute_hr).toBe(0);
    });

    it('should adjust for weather when enabled', () => {
      const weather = { 
        wind_direction_deg: 0, 
        wind_speed_kt: 50, 
        temperature_c: 15 
      };
      const settings = { reserve_factor: 1.25, cruise_altitude_ft: 30000, use_live_weather: true };
      const result = calculateTimeEnRoute(1000, 'C-17', weather, settings);
      expect(result.wind_component_kt).toBe(50);
    });
  });

  describe('calculateFuelRequired', () => {
    it('should calculate fuel for C-17', () => {
      const fuel = calculateFuelRequired(1000, 'C-17');
      expect(fuel).toBeGreaterThan(0);
    });

    it('should calculate fuel for C-130', () => {
      const fuel = calculateFuelRequired(1000, 'C-130');
      expect(fuel).toBeGreaterThan(0);
    });

    it('should require more fuel for longer distances', () => {
      const shortFuel = calculateFuelRequired(500, 'C-17');
      const longFuel = calculateFuelRequired(1000, 'C-17');
      expect(longFuel).toBeGreaterThan(shortFuel);
    });

    it('should apply reserve factor', () => {
      const settings = { reserve_factor: 1.25, cruise_altitude_ft: 30000, use_live_weather: false };
      const perf = AIRCRAFT_PERFORMANCE['C-17'];
      const baseFuel = 1000 * perf.fuel_lb_per_nm;
      const fuel = calculateFuelRequired(1000, 'C-17', settings);
      expect(fuel).toBeCloseTo(baseFuel * 1.25, 0);
    });

    it('should return zero for zero distance', () => {
      const fuel = calculateFuelRequired(0, 'C-17');
      expect(fuel).toBe(0);
    });
  });

  describe('createRouteLeg', () => {
    it('should create a route leg with calculated values', () => {
      const origin = createTestBase({ icao: 'KORD', latitude_deg: 41.9, longitude_deg: -87.9 });
      const dest = createTestBase({ icao: 'KJFK', latitude_deg: 40.6, longitude_deg: -73.8 });
      
      const leg = createRouteLeg(
        'leg-001', 1, origin, dest, 'C-17', 'aircraft-001'
      );
      
      expect(leg.distance_nm).toBeGreaterThan(0);
      expect(leg.time_enroute_hr).toBeGreaterThan(0);
      expect(leg.fuel_required_lb).toBeGreaterThan(0);
    });

    it('should include aircraft information', () => {
      const origin = createTestBase();
      const dest = createTestBase({ latitude_deg: 45.0 });
      
      const leg = createRouteLeg(
        'leg-001', 1, origin, dest, 'C-130', 'ac-002'
      );
      
      expect(leg.aircraft_type).toBe('C-130');
      expect(leg.aircraft_id).toBe('ac-002');
    });

    it('should include assigned cargo', () => {
      const origin = createTestBase();
      const dest = createTestBase({ latitude_deg: 45.0 });
      
      const leg = createRouteLeg(
        'leg-001', 1, origin, dest, 'C-17', 'ac-001',
        ['pallet-1', 'pallet-2'],
        ['vehicle-1'],
        10,
        50000
      );
      
      expect(leg.assigned_pallet_ids).toHaveLength(2);
      expect(leg.assigned_vehicle_ids).toHaveLength(1);
      expect(leg.pax_count).toBe(10);
      expect(leg.payload_weight_lb).toBe(50000);
    });
  });

  describe('calculateRouteTotals', () => {
    it('should sum totals from multiple legs', () => {
      const legs: RouteLeg[] = [
        {
          id: 'leg-1', sequence: 1,
          origin: createTestBase(), destination: createTestBase({ latitude_deg: 45 }),
          aircraft_type: 'C-17', aircraft_id: 'ac-001',
          assigned_pallet_ids: [], assigned_vehicle_ids: [], pax_count: 5,
          distance_nm: 500, distance_km: 926, time_enroute_hr: 1.1, block_time_hr: 1.6,
          fuel_required_lb: 30000, payload_weight_lb: 20000, wind_component_kt: 0, ground_speed_kt: 450
        },
        {
          id: 'leg-2', sequence: 2,
          origin: createTestBase({ latitude_deg: 45 }), destination: createTestBase({ latitude_deg: 50 }),
          aircraft_type: 'C-17', aircraft_id: 'ac-001',
          assigned_pallet_ids: [], assigned_vehicle_ids: [], pax_count: 3,
          distance_nm: 300, distance_km: 556, time_enroute_hr: 0.7, block_time_hr: 1.2,
          fuel_required_lb: 18000, payload_weight_lb: 15000, wind_component_kt: 0, ground_speed_kt: 450
        }
      ];
      
      const totals = calculateRouteTotals(legs);
      
      expect(totals.total_distance_nm).toBe(800);
      expect(totals.total_time_hr).toBeCloseTo(1.8, 1);
      expect(totals.total_fuel_lb).toBe(48000);
      expect(totals.total_payload_lb).toBe(35000);
    });

    it('should handle empty legs array', () => {
      const totals = calculateRouteTotals([]);
      expect(totals.total_distance_nm).toBe(0);
      expect(totals.total_fuel_lb).toBe(0);
    });
  });

  describe('calculateTurnRadius', () => {
    it('should calculate turn radius based on speed and bank', () => {
      const radius = calculateTurnRadius(250, 30);
      expect(radius).toBeGreaterThan(0);
    });

    it('should return larger radius for higher speeds', () => {
      const slowRadius = calculateTurnRadius(200, 30);
      const fastRadius = calculateTurnRadius(400, 30);
      expect(fastRadius).toBeGreaterThan(slowRadius);
    });

    it('should return smaller radius for steeper banks', () => {
      const shallowRadius = calculateTurnRadius(250, 15);
      const steepRadius = calculateTurnRadius(250, 45);
      expect(steepRadius).toBeLessThan(shallowRadius);
    });

    it('should return Infinity for zero bank angle', () => {
      const radius = calculateTurnRadius(250, 0);
      expect(radius).toBe(Infinity);
    });
  });

  describe('formatFlightTime', () => {
    it('should format hours to hours and minutes', () => {
      const formatted = formatFlightTime(2.5);
      expect(formatted).toBe('2h 30m');
    });

    it('should handle zero hours', () => {
      const formatted = formatFlightTime(0);
      expect(formatted).toBe('0h 00m');
    });

    it('should round minutes', () => {
      const formatted = formatFlightTime(1.99);
      expect(formatted).toBe('1h 59m');
    });

    it('should handle fractional hours', () => {
      const formatted = formatFlightTime(0.25);
      expect(formatted).toBe('0h 15m');
    });
  });

  describe('formatMilitaryTime', () => {
    it('should format time as HHMM with Z suffix', () => {
      const date = new Date('2025-01-15T14:30:00Z');
      const formatted = formatMilitaryTime(date);
      expect(formatted).toMatch(/^\d{4}Z$/);
    });

    it('should pad hours and minutes', () => {
      const date = new Date('2025-01-15T08:05:00Z');
      const formatted = formatMilitaryTime(date);
      expect(formatted).toBe('0805Z');
    });

    it('should handle midnight', () => {
      const date = new Date('2025-01-15T00:00:00Z');
      const formatted = formatMilitaryTime(date);
      expect(formatted).toBe('0000Z');
    });

    it('should handle end of day', () => {
      const date = new Date('2025-01-15T23:59:00Z');
      const formatted = formatMilitaryTime(date);
      expect(formatted).toBe('2359Z');
    });
  });

  describe('formatMilitaryDateTime', () => {
    it('should format as DDMMMYY HHMMZ', () => {
      const date = new Date('2025-01-15T14:30:00Z');
      const formatted = formatMilitaryDateTime(date);
      expect(formatted).toMatch(/^\d{2}[A-Z]{3}\d{2} \d{4}Z$/);
    });

    it('should use 3-letter month abbreviation', () => {
      const date = new Date('2025-01-15T14:30:00Z');
      const formatted = formatMilitaryDateTime(date);
      expect(formatted).toContain('JAN');
    });

    it('should handle different months', () => {
      const dates = [
        { date: new Date('2025-02-15'), month: 'FEB' },
        { date: new Date('2025-06-15'), month: 'JUN' },
        { date: new Date('2025-12-15'), month: 'DEC' }
      ];
      dates.forEach(({ date, month }) => {
        const formatted = formatMilitaryDateTime(date);
        expect(formatted).toContain(month);
      });
    });
  });

  describe('parseMilitaryTime', () => {
    it('should parse HHMMZ format', () => {
      const result = parseMilitaryTime('1430Z');
      expect(result).toEqual({ hours: 14, minutes: 30 });
    });

    it('should parse HHMM format without Z', () => {
      const result = parseMilitaryTime('0830');
      expect(result).toEqual({ hours: 8, minutes: 30 });
    });

    it('should handle midnight', () => {
      const result = parseMilitaryTime('0000Z');
      expect(result).toEqual({ hours: 0, minutes: 0 });
    });

    it('should return null for invalid format', () => {
      const result = parseMilitaryTime('14:30');
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = parseMilitaryTime('');
      expect(result).toBeNull();
    });
  });

  describe('formatDistance', () => {
    it('should format distance with nm suffix', () => {
      const formatted = formatDistance(1234);
      expect(formatted).toBe('1,234 nm');
    });

    it('should round to nearest integer', () => {
      const formatted = formatDistance(1234.7);
      expect(formatted).toBe('1,235 nm');
    });

    it('should handle zero', () => {
      const formatted = formatDistance(0);
      expect(formatted).toBe('0 nm');
    });

    it('should format large numbers with commas', () => {
      const formatted = formatDistance(12345678);
      expect(formatted).toBe('12,345,678 nm');
    });
  });
});
