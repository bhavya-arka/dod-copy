/**
 * Flight Scheduler Tests - Edge Cases and Advanced Scenarios
 * Tests for apps/client/src/lib/flightScheduler.ts
 */

import {
  generateCallsign,
  checkScheduleConflicts,
  createScheduledFlight,
  generateTimeSlots,
  buildAirbaseSchedule,
  scheduleFlights,
  getNextAvailableSlot,
  calculateCrewRestRequirement
} from '../../lib/flightScheduler';
import { MILITARY_BASES, getBaseById } from '../../lib/bases';

describe('Flight Scheduler - Callsign Generation', () => {
  test('should pad single digit indices with zero', () => {
    const callsign = generateCallsign('C-17', 0);
    expect(callsign).toBe('REACH01');
  });

  test('should handle double digit indices', () => {
    const callsign = generateCallsign('C-17', 98);
    expect(callsign).toBe('REACH99');
  });

  test('should generate different prefixes for different aircraft', () => {
    const c17Callsign = generateCallsign('C-17', 5);
    const c130Callsign = generateCallsign('C-130', 5);
    expect(c17Callsign).not.toBe(c130Callsign);
    expect(c17Callsign.startsWith('REACH')).toBe(true);
    expect(c130Callsign.startsWith('HERKY')).toBe(true);
  });
});

describe('Flight Scheduler - Time Slots', () => {
  test('should generate correct number of slots for 24 hours', () => {
    const slots = generateTimeSlots(new Date('2025-01-15T00:00:00Z'), 24, 30);
    expect(slots.length).toBe(48);
  });

  test('should generate correct number of slots for 12 hours with 60 min interval', () => {
    const slots = generateTimeSlots(new Date('2025-01-15T00:00:00Z'), 12, 60);
    expect(slots.length).toBe(12);
  });

  test('should have consecutive time slots', () => {
    const slots = generateTimeSlots(new Date('2025-01-15T00:00:00Z'), 2, 30);
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].start.getTime()).toBe(slots[i - 1].end.getTime());
    }
  });

  test('should have slot duration matching interval', () => {
    const intervalMinutes = 30;
    const slots = generateTimeSlots(new Date('2025-01-15T00:00:00Z'), 2, intervalMinutes);
    slots.forEach(slot => {
      const duration = (slot.end.getTime() - slot.start.getTime()) / (1000 * 60);
      expect(duration).toBe(intervalMinutes);
    });
  });
});

describe('Flight Scheduler - Conflict Detection Edge Cases', () => {
  test('should detect runway conflict for departures within 15 minutes', () => {
    const origin = MILITARY_BASES[0];
    const destination = MILITARY_BASES[1];
    
    const flight1 = createScheduledFlight(origin, destination, 'C-17', new Date('2025-01-15T08:00:00Z'));
    const flight2 = createScheduledFlight(origin, destination, 'C-17', new Date('2025-01-15T08:10:00Z'));
    
    const conflicts = checkScheduleConflicts([flight1, flight2]);
    
    expect(conflicts.some(c => c.type === 'runway_conflict')).toBe(true);
  });

  test('should not detect conflict for departures 20 minutes apart', () => {
    const origin = MILITARY_BASES[0];
    const destination = MILITARY_BASES[1];
    
    const flight1 = createScheduledFlight(origin, destination, 'C-17', new Date('2025-01-15T08:00:00Z'));
    const flight2 = createScheduledFlight(origin, destination, 'C-17', new Date('2025-01-15T08:20:00Z'));
    
    const conflicts = checkScheduleConflicts([flight1, flight2]);
    
    expect(conflicts.filter(c => c.type === 'runway_conflict').length).toBe(0);
  });

  test('should detect conflicts at multiple bases', () => {
    const hickam = getBaseById('HICKAM')!;
    const kadena = getBaseById('KADENA')!;
    const yokota = getBaseById('YOKOTA')!;
    
    const flight1 = createScheduledFlight(hickam, kadena, 'C-17', new Date('2025-01-15T08:00:00Z'));
    const flight2 = createScheduledFlight(hickam, yokota, 'C-17', new Date('2025-01-15T08:05:00Z'));
    
    const conflicts = checkScheduleConflicts([flight1, flight2]);
    
    expect(conflicts.length).toBeGreaterThan(0);
  });
});

describe('Flight Scheduler - Scheduled Flight Creation', () => {
  test('should use custom callsign when provided', () => {
    const origin = MILITARY_BASES[0];
    const destination = MILITARY_BASES[1];
    
    const flight = createScheduledFlight(
      origin, destination, 'C-17', new Date('2025-01-15T08:00:00Z'),
      0, 0, [], undefined, 'CUSTOM01'
    );
    
    expect(flight.callsign).toBe('CUSTOM01');
  });

  test('should use assigned aircraft ID when provided', () => {
    const origin = MILITARY_BASES[0];
    const destination = MILITARY_BASES[1];
    
    const flight = createScheduledFlight(
      origin, destination, 'C-17', new Date('2025-01-15T08:00:00Z'),
      0, 0, [], 'AC-CUSTOM-001'
    );
    
    expect(flight.aircraft_id).toBe('AC-CUSTOM-001');
  });

  test('should set payload and pax count', () => {
    const origin = MILITARY_BASES[0];
    const destination = MILITARY_BASES[1];
    
    const flight = createScheduledFlight(
      origin, destination, 'C-17', new Date('2025-01-15T08:00:00Z'),
      50000, 25, ['P1', 'P2', 'P3']
    );
    
    expect(flight.payload_weight_lb).toBe(50000);
    expect(flight.pax_count).toBe(25);
    expect(flight.assigned_pallet_ids).toHaveLength(3);
  });

  test('should calculate fuel required', () => {
    const origin = MILITARY_BASES[0];
    const destination = MILITARY_BASES[1];
    
    const flight = createScheduledFlight(
      origin, destination, 'C-17', new Date('2025-01-15T08:00:00Z')
    );
    
    expect(flight.fuel_required_lb).toBeGreaterThan(0);
  });
});

describe('Flight Scheduler - Crew Rest Requirements', () => {
  test('should require 12 hours rest for flights over 12 hours', () => {
    const result = calculateCrewRestRequirement(13, 14);
    expect(result.restRequired).toBe(true);
    expect(result.restHours).toBe(12);
  });

  test('should require 12 hours rest for duty time over 16 hours', () => {
    const result = calculateCrewRestRequirement(8, 17);
    expect(result.restRequired).toBe(true);
    expect(result.restHours).toBe(12);
  });

  test('should require 8 hours rest for flights between 8-12 hours', () => {
    const result = calculateCrewRestRequirement(10, 12);
    expect(result.restRequired).toBe(true);
    expect(result.restHours).toBe(8);
  });

  test('should not require rest for short flights', () => {
    const result = calculateCrewRestRequirement(4, 8);
    expect(result.restRequired).toBe(false);
    expect(result.restHours).toBe(0);
  });
});
