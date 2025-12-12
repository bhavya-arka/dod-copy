/**
 * PACAF Airlift Demo - Flight Scheduler
 * 
 * Manages flight scheduling, conflicts, and time-based planning.
 */

import {
  MilitaryBase,
  ScheduledFlight,
  AirbaseSchedule,
  TimeSlot,
  FlightScheduleResult,
  ScheduleConflict,
  AIRCRAFT_PERFORMANCE
} from './routeTypes';
import { calculateGreatCircleDistance, calculateTimeEnRoute } from './routeCalculations';

let flightIdCounter = 1;

export function generateCallsign(aircraftType: 'C-17' | 'C-130', index: number): string {
  const prefix = aircraftType === 'C-17' ? 'REACH' : 'HERKY';
  return `${prefix}${(index + 1).toString().padStart(2, '0')}`;
}

export function createScheduledFlight(
  origin: MilitaryBase,
  destination: MilitaryBase,
  aircraftType: 'C-17' | 'C-130',
  departureTime: Date,
  payloadWeight: number = 0,
  paxCount: number = 0,
  palletIds: string[] = [],
  assignedAircraftId?: string,
  customCallsign?: string
): ScheduledFlight {
  const { distance_nm } = calculateGreatCircleDistance(
    origin.latitude_deg,
    origin.longitude_deg,
    destination.latitude_deg,
    destination.longitude_deg
  );
  
  const timeResult = calculateTimeEnRoute(distance_nm, aircraftType);
  const arrivalTime = new Date(departureTime.getTime() + timeResult.block_time_hr * 60 * 60 * 1000);
  
  const perf = AIRCRAFT_PERFORMANCE[aircraftType];
  const fuelRequired = distance_nm * perf.fuel_lb_per_nm * 1.25;
  
  const id = `FLT${flightIdCounter.toString().padStart(4, '0')}`;
  flightIdCounter++;
  
  const callsign = customCallsign || generateCallsign(aircraftType, flightIdCounter);
  const aircraft_id = assignedAircraftId || `${aircraftType}-${id}`;
  
  return {
    id,
    callsign,
    aircraft_type: aircraftType,
    aircraft_id,
    origin,
    destination,
    scheduled_departure: departureTime,
    scheduled_arrival: arrivalTime,
    status: 'scheduled',
    payload_weight_lb: payloadWeight,
    pax_count: paxCount,
    assigned_pallet_ids: palletIds,
    fuel_required_lb: fuelRequired
  };
}

export function generateTimeSlots(
  startDate: Date,
  hours: number = 24,
  intervalMinutes: number = 30
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const intervalMs = intervalMinutes * 60 * 1000;
  const endTime = startDate.getTime() + hours * 60 * 60 * 1000;
  
  for (let t = startDate.getTime(); t < endTime; t += intervalMs) {
    slots.push({
      start: new Date(t),
      end: new Date(t + intervalMs),
      available: Math.random() > 0.1
    });
  }
  
  return slots;
}

export function checkScheduleConflicts(flights: ScheduledFlight[]): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  
  const byBase = new Map<string, ScheduledFlight[]>();
  
  for (const flight of flights) {
    const originKey = flight.origin.base_id;
    const destKey = flight.destination.base_id;
    
    if (!byBase.has(originKey)) byBase.set(originKey, []);
    if (!byBase.has(destKey)) byBase.set(destKey, []);
    
    byBase.get(originKey)!.push(flight);
    byBase.get(destKey)!.push(flight);
  }
  
  const entries = Array.from(byBase.entries());
  for (let e = 0; e < entries.length; e++) {
    const [baseId, baseFlights] = entries[e];
    const departures = baseFlights
      .filter((f: ScheduledFlight) => f.origin.base_id === baseId)
      .sort((a: ScheduledFlight, b: ScheduledFlight) => a.scheduled_departure.getTime() - b.scheduled_departure.getTime());
    
    for (let i = 0; i < departures.length - 1; i++) {
      const current = departures[i];
      const next = departures[i + 1];
      
      const timeDiff = (next.scheduled_departure.getTime() - current.scheduled_departure.getTime()) / (1000 * 60);
      
      if (timeDiff < 15) {
        conflicts.push({
          id: `CONF-${conflicts.length + 1}`,
          type: 'runway_conflict',
          affected_flights: [current.id, next.id],
          description: `Runway conflict at ${baseId}: ${current.callsign} and ${next.callsign} depart within ${Math.round(timeDiff)} minutes`,
          suggested_resolution: `Delay ${next.callsign} departure by ${15 - Math.round(timeDiff)} minutes`
        });
      }
    }
    
    const arrivals = baseFlights
      .filter((f: ScheduledFlight) => f.destination.base_id === baseId)
      .sort((a: ScheduledFlight, b: ScheduledFlight) => a.scheduled_arrival.getTime() - b.scheduled_arrival.getTime());
    
    const simultaneousArrivals = arrivals.filter((f: ScheduledFlight, i: number) => {
      if (i === 0) return false;
      const prev = arrivals[i - 1];
      const timeDiff = (f.scheduled_arrival.getTime() - prev.scheduled_arrival.getTime()) / (1000 * 60);
      return timeDiff < 10;
    });
    
    if (simultaneousArrivals.length > 2) {
      conflicts.push({
        id: `CONF-${conflicts.length + 1}`,
        type: 'ramp_capacity',
        affected_flights: arrivals.slice(0, 4).map((f: ScheduledFlight) => f.id),
        description: `Ramp congestion at ${baseId}: ${arrivals.length} aircraft arriving within short window`,
        suggested_resolution: 'Stagger arrival times or pre-position ground support'
      });
    }
  }
  
  return conflicts;
}

export function buildAirbaseSchedule(
  base: MilitaryBase,
  flights: ScheduledFlight[],
  startDate: Date
): AirbaseSchedule {
  const departures = flights.filter(f => f.origin.base_id === base.base_id);
  const arrivals = flights.filter(f => f.destination.base_id === base.base_id);
  
  return {
    base,
    departures: departures.sort((a, b) => a.scheduled_departure.getTime() - b.scheduled_departure.getTime()),
    arrivals: arrivals.sort((a, b) => a.scheduled_arrival.getTime() - b.scheduled_arrival.getTime()),
    runway_availability: generateTimeSlots(startDate, 48),
    ramp_space_available: 6,
    fuel_available_lb: 500000
  };
}

export function scheduleFlights(
  flights: ScheduledFlight[],
  bases: MilitaryBase[]
): FlightScheduleResult {
  const conflicts = checkScheduleConflicts(flights);
  const baseSchedules = new Map<string, AirbaseSchedule>();
  
  const now = new Date();
  for (const base of bases) {
    baseSchedules.set(base.base_id, buildAirbaseSchedule(base, flights, now));
  }
  
  return {
    flights,
    conflicts,
    base_schedules: baseSchedules
  };
}

export function getNextAvailableSlot(
  base: MilitaryBase,
  afterTime: Date,
  schedule: AirbaseSchedule
): Date | null {
  const slot = schedule.runway_availability.find(
    s => s.available && s.start.getTime() >= afterTime.getTime()
  );
  return slot ? slot.start : null;
}

export function calculateCrewRestRequirement(
  flightTimeHours: number,
  dutyTimeHours: number
): { restRequired: boolean; restHours: number } {
  if (flightTimeHours > 12 || dutyTimeHours > 16) {
    return { restRequired: true, restHours: 12 };
  }
  if (flightTimeHours > 8) {
    return { restRequired: true, restHours: 8 };
  }
  return { restRequired: false, restHours: 0 };
}
