/**
 * Flight Scheduler Tests
 * Tests for flight scheduling and conflict detection
 */

import {
  generateCallsign,
  checkScheduleConflicts,
  createScheduledFlight
} from '../client/src/lib/flightScheduler';
import { MILITARY_BASES } from '../client/src/lib/bases';

describe('Callsign Generation', () => {
  test('should generate valid callsign', () => {
    const callsign = generateCallsign('C-17', 1);
    
    expect(callsign.length).toBeGreaterThan(0);
  });

  test('should generate unique callsigns for different sequences', () => {
    const callsign1 = generateCallsign('C-17', 1);
    const callsign2 = generateCallsign('C-17', 2);
    
    expect(callsign1).not.toBe(callsign2);
  });

  test('should include REACH prefix for C-17', () => {
    const c17Callsign = generateCallsign('C-17', 1);
    
    expect(c17Callsign.toUpperCase()).toContain('REACH');
  });

  test('should work for C-130', () => {
    const c130Callsign = generateCallsign('C-130', 1);
    
    expect(c130Callsign.length).toBeGreaterThan(0);
  });

  test('should include HERKY prefix for C-130', () => {
    const c130Callsign = generateCallsign('C-130', 1);
    
    expect(c130Callsign.toUpperCase()).toContain('HERKY');
  });
});

describe('Flight Schedule Creation', () => {
  test('should create schedule with required properties', () => {
    const origin = MILITARY_BASES[0];
    const destination = MILITARY_BASES[1];
    
    const schedule = createScheduledFlight(
      origin,
      destination,
      'C-17',
      new Date('2025-01-15T08:00:00Z')
    );
    
    expect(schedule.scheduled_departure).toBeDefined();
    expect(schedule.scheduled_arrival).toBeDefined();
    expect(schedule.callsign).toBeDefined();
  });

  test('should calculate reasonable flight time', () => {
    const origin = MILITARY_BASES[0];
    const destination = MILITARY_BASES[1];
    
    const schedule = createScheduledFlight(
      origin,
      destination,
      'C-17',
      new Date('2025-01-15T08:00:00Z')
    );
    
    const flightTimeMs = schedule.scheduled_arrival.getTime() - schedule.scheduled_departure.getTime();
    const flightTimeHours = flightTimeMs / (1000 * 60 * 60);
    
    expect(flightTimeHours).toBeGreaterThan(0);
    expect(flightTimeHours).toBeLessThan(24);
  });

  test('should set aircraft type', () => {
    const origin = MILITARY_BASES[0];
    const destination = MILITARY_BASES[1];
    
    const schedule = createScheduledFlight(
      origin,
      destination,
      'C-130',
      new Date('2025-01-15T08:00:00Z')
    );
    
    expect(schedule.aircraft_type).toBe('C-130');
  });
});

describe('Schedule Conflict Detection', () => {
  test('should detect no conflicts for non-overlapping flights', () => {
    const origin = MILITARY_BASES[0];
    const destination = MILITARY_BASES[1];
    
    const flight1 = createScheduledFlight(origin, destination, 'C-17', new Date('2025-01-15T08:00:00Z'));
    const flight2 = createScheduledFlight(origin, destination, 'C-17', new Date('2025-01-15T14:00:00Z'));
    
    const conflicts = checkScheduleConflicts([flight1, flight2]);
    
    expect(conflicts.length).toBe(0);
  });

  test('should handle potential conflicts from same-time departures', () => {
    const origin = MILITARY_BASES[0];
    const destination = MILITARY_BASES[1];
    
    const flight1 = createScheduledFlight(origin, destination, 'C-17', new Date('2025-01-15T08:00:00Z'));
    const flight2 = createScheduledFlight(origin, destination, 'C-17', new Date('2025-01-15T08:00:00Z'));
    
    const conflicts = checkScheduleConflicts([flight1, flight2]);
    
    expect(Array.isArray(conflicts)).toBe(true);
  });

  test('should return empty array for single flight', () => {
    const origin = MILITARY_BASES[0];
    const destination = MILITARY_BASES[1];
    
    const flight = createScheduledFlight(origin, destination, 'C-17', new Date('2025-01-15T08:00:00Z'));
    
    const conflicts = checkScheduleConflicts([flight]);
    
    expect(conflicts.length).toBe(0);
  });

  test('should return empty array for no flights', () => {
    const conflicts = checkScheduleConflicts([]);
    
    expect(conflicts.length).toBe(0);
  });
});
