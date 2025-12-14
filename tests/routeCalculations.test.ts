/**
 * Route Calculations Tests
 * Tests for distance, fuel, and time calculations
 */

import {
  calculateGreatCircleDistance,
  calculateFuelRequired,
  calculateTimeEnRoute,
  formatMilitaryTime,
  formatFlightTime
} from '../apps/client/src/lib/routeCalculations';
import { MILITARY_BASES } from '../apps/client/src/lib/bases';

describe('Great Circle Distance', () => {
  test('should calculate distance between same point as zero', () => {
    const result = calculateGreatCircleDistance(0, 0, 0, 0);
    expect(result.distance_nm).toBe(0);
  });

  test('should calculate reasonable distance between bases', () => {
    const base1 = MILITARY_BASES[0];
    const base2 = MILITARY_BASES[1];
    
    const result = calculateGreatCircleDistance(
      base1.latitude_deg, base1.longitude_deg, base2.latitude_deg, base2.longitude_deg
    );
    
    expect(result.distance_nm).toBeGreaterThan(0);
  });

  test('should calculate symmetrical distances', () => {
    const d1 = calculateGreatCircleDistance(0, 0, 45, 90);
    const d2 = calculateGreatCircleDistance(45, 90, 0, 0);
    
    expect(Math.abs(d1.distance_nm - d2.distance_nm)).toBeLessThan(1);
  });

  test('should handle crossing date line', () => {
    const result = calculateGreatCircleDistance(35, 170, 35, -170);
    expect(result.distance_nm).toBeGreaterThan(0);
    expect(result.distance_nm).toBeLessThan(2000);
  });
});

describe('Fuel Calculations', () => {
  test('should calculate C-17 fuel for 1000nm', () => {
    const fuel = calculateFuelRequired(1000, 'C-17');
    
    expect(fuel).toBeGreaterThan(0);
    expect(fuel).toBeLessThan(100000);
  });

  test('should calculate C-130 fuel for 1000nm', () => {
    const fuel = calculateFuelRequired(1000, 'C-130');
    
    expect(fuel).toBeGreaterThan(0);
    expect(fuel).toBeLessThan(50000);
  });

  test('should increase fuel with distance', () => {
    const shortFuel = calculateFuelRequired(500, 'C-17');
    const longFuel = calculateFuelRequired(2000, 'C-17');
    
    expect(longFuel).toBeGreaterThan(shortFuel);
  });

  test('should return zero for zero distance', () => {
    const fuel = calculateFuelRequired(0, 'C-17');
    expect(fuel).toBe(0);
  });
});

describe('Time En Route Calculations', () => {
  test('should calculate C-17 time for 1000nm', () => {
    const result = calculateTimeEnRoute(1000, 'C-17');
    
    expect(result.time_enroute_hr).toBeGreaterThan(2);
    expect(result.time_enroute_hr).toBeLessThan(3);
  });

  test('should calculate C-130 time for 1000nm', () => {
    const result = calculateTimeEnRoute(1000, 'C-130');
    
    expect(result.time_enroute_hr).toBeGreaterThan(2.5);
    expect(result.time_enroute_hr).toBeLessThan(4);
  });

  test('should return zero for zero distance', () => {
    const result = calculateTimeEnRoute(0, 'C-17');
    expect(result.time_enroute_hr).toBe(0);
  });

  test('C-130 should be slower than C-17', () => {
    const c17Time = calculateTimeEnRoute(1000, 'C-17');
    const c130Time = calculateTimeEnRoute(1000, 'C-130');
    
    expect(c130Time.time_enroute_hr).toBeGreaterThan(c17Time.time_enroute_hr);
  });
});

describe('Military Time Formatting', () => {
  test('should format midnight correctly', () => {
    const date = new Date('2025-01-15T00:00:00Z');
    const formatted = formatMilitaryTime(date);
    
    expect(formatted).toContain('0000');
  });

  test('should format noon correctly', () => {
    const date = new Date('2025-01-15T12:00:00Z');
    const formatted = formatMilitaryTime(date);
    
    expect(formatted).toContain('1200');
  });

  test('should include Z suffix', () => {
    const date = new Date();
    const formatted = formatMilitaryTime(date);
    
    expect(formatted.toUpperCase()).toContain('Z');
  });
});

describe('Flight Time Formatting', () => {
  test('should format whole hours', () => {
    const formatted = formatFlightTime(2);
    expect(formatted).toContain('2');
    expect(formatted.toLowerCase()).toContain('h');
  });

  test('should format hours and minutes', () => {
    const formatted = formatFlightTime(2.5);
    expect(formatted).toContain('2');
    expect(formatted).toContain('30');
  });
});

describe('Military Bases', () => {
  test('should have bases defined', () => {
    expect(MILITARY_BASES.length).toBeGreaterThan(0);
  });

  test('all bases should have valid coordinates', () => {
    MILITARY_BASES.forEach(base => {
      expect(base.latitude_deg).toBeGreaterThanOrEqual(-90);
      expect(base.latitude_deg).toBeLessThanOrEqual(90);
      expect(base.longitude_deg).toBeGreaterThanOrEqual(-180);
      expect(base.longitude_deg).toBeLessThanOrEqual(180);
    });
  });

  test('all bases should have ICAO codes', () => {
    MILITARY_BASES.forEach(base => {
      expect(base.icao.length).toBe(4);
    });
  });
});
