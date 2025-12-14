export interface Flight {
  id: string;
  missionNumber: string;
  aircraft: string;
  tailNumber: string;
  origin: string;
  destination: string;
  departureTime: Date;
  arrivalTime: Date;
  status: 'scheduled' | 'in-progress' | 'completed' | 'delayed' | 'cancelled';
  cargoWeight: number;
  maxCargoWeight: number;
}

export interface Route {
  id: string;
  flightId: string;
  legs: RouteLeg[];
  totalDistance: number;
  estimatedDuration: number;
}

export interface RouteLeg {
  id: string;
  origin: string;
  destination: string;
  distance: number;
  duration: number;
  fuelRequired: number;
}

export interface Schedule {
  id: string;
  flights: Flight[];
  startDate: Date;
  endDate: Date;
  totalMissions: number;
}

export const sampleFlights: Flight[] = [
  {
    id: 'flight-001',
    missionNumber: 'AMC001',
    aircraft: 'C-17A',
    tailNumber: '07-7171',
    origin: 'KDOV',
    destination: 'RJTY',
    departureTime: new Date('2025-01-15T08:00:00Z'),
    arrivalTime: new Date('2025-01-16T10:00:00Z'),
    status: 'scheduled',
    cargoWeight: 45000,
    maxCargoWeight: 170900
  },
  {
    id: 'flight-002',
    missionNumber: 'AMC002',
    aircraft: 'C-5M',
    tailNumber: '87-0037',
    origin: 'KWRI',
    destination: 'RKSO',
    departureTime: new Date('2025-01-15T12:00:00Z'),
    arrivalTime: new Date('2025-01-16T18:00:00Z'),
    status: 'in-progress',
    cargoWeight: 120000,
    maxCargoWeight: 285000
  },
  {
    id: 'flight-003',
    missionNumber: 'AMC003',
    aircraft: 'KC-10A',
    tailNumber: '84-0185',
    origin: 'KBAD',
    destination: 'PGUA',
    departureTime: new Date('2025-01-14T06:00:00Z'),
    arrivalTime: new Date('2025-01-14T16:00:00Z'),
    status: 'completed',
    cargoWeight: 65000,
    maxCargoWeight: 76560
  }
];

export const sampleRouteLeg: RouteLeg = {
  id: 'leg-001',
  origin: 'KDOV',
  destination: 'PHNL',
  distance: 4800,
  duration: 9.5,
  fuelRequired: 85000
};

export const sampleRoute: Route = {
  id: 'route-001',
  flightId: 'flight-001',
  legs: [
    sampleRouteLeg,
    {
      id: 'leg-002',
      origin: 'PHNL',
      destination: 'RJTY',
      distance: 3850,
      duration: 7.5,
      fuelRequired: 68000
    }
  ],
  totalDistance: 8650,
  estimatedDuration: 17
};

export const sampleSchedule: Schedule = {
  id: 'schedule-001',
  flights: sampleFlights,
  startDate: new Date('2025-01-14T00:00:00Z'),
  endDate: new Date('2025-01-21T00:00:00Z'),
  totalMissions: 3
};

export function createFlight(overrides: Partial<Flight> = {}): Flight {
  return {
    id: `flight-${Date.now()}`,
    missionNumber: `AMC${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
    aircraft: 'C-17A',
    tailNumber: '07-7171',
    origin: 'KDOV',
    destination: 'RJTY',
    departureTime: new Date(),
    arrivalTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
    status: 'scheduled',
    cargoWeight: 0,
    maxCargoWeight: 170900,
    ...overrides
  };
}

export function createRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: `route-${Date.now()}`,
    flightId: `flight-${Date.now()}`,
    legs: [],
    totalDistance: 0,
    estimatedDuration: 0,
    ...overrides
  };
}

export function createRouteLeg(overrides: Partial<RouteLeg> = {}): RouteLeg {
  return {
    id: `leg-${Date.now()}`,
    origin: 'KDOV',
    destination: 'RJTY',
    distance: 5000,
    duration: 10,
    fuelRequired: 75000,
    ...overrides
  };
}

export function createSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: `schedule-${Date.now()}`,
    flights: [],
    startDate: new Date(),
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    totalMissions: 0,
    ...overrides
  };
}
