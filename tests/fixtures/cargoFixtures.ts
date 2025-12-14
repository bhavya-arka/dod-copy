export interface MovementItem {
  id: string;
  tcn: string;
  name: string;
  weight: number;
  length: number;
  width: number;
  height: number;
  hazmat: boolean;
  priority: 'routine' | 'priority' | 'urgent';
  origin: string;
  destination: string;
}

export interface Pallet {
  id: string;
  type: '463L' | 'commercial';
  length: number;
  width: number;
  height: number;
  maxWeight: number;
  items: MovementItem[];
  totalWeight: number;
  utilizationPercent: number;
}

export interface LoadPlan {
  id: string;
  flightId: string;
  aircraft: string;
  pallets: Pallet[];
  totalWeight: number;
  cgPercentMac: number;
  balanced: boolean;
}

export const sampleMovementItems: MovementItem[] = [
  {
    id: 'mov-001',
    tcn: 'TCN001234567890',
    name: 'Medical Supplies',
    weight: 500,
    length: 48,
    width: 40,
    height: 36,
    hazmat: false,
    priority: 'urgent',
    origin: 'KADW',
    destination: 'RJTY'
  },
  {
    id: 'mov-002',
    tcn: 'TCN001234567891',
    name: 'Vehicle Parts',
    weight: 1200,
    length: 84,
    width: 84,
    height: 48,
    hazmat: false,
    priority: 'routine',
    origin: 'KDOV',
    destination: 'RKSO'
  },
  {
    id: 'mov-003',
    tcn: 'TCN001234567892',
    name: 'Communication Equipment',
    weight: 350,
    length: 36,
    width: 30,
    height: 24,
    hazmat: false,
    priority: 'priority',
    origin: 'KBAD',
    destination: 'RODN'
  },
  {
    id: 'mov-004',
    tcn: 'TCN001234567893',
    name: 'Ammunition',
    weight: 2000,
    length: 88,
    width: 108,
    height: 60,
    hazmat: true,
    priority: 'routine',
    origin: 'KWRI',
    destination: 'PGUA'
  }
];

export const sample463LPallet: Pallet = {
  id: 'pallet-001',
  type: '463L',
  length: 88,
  width: 108,
  height: 96,
  maxWeight: 10000,
  items: [sampleMovementItems[0], sampleMovementItems[2]],
  totalWeight: 850,
  utilizationPercent: 8.5
};

export const sampleLoadPlan: LoadPlan = {
  id: 'lp-001',
  flightId: 'flight-001',
  aircraft: 'C-17A',
  pallets: [sample463LPallet],
  totalWeight: 850,
  cgPercentMac: 28.5,
  balanced: true
};

export function createMovementItem(overrides: Partial<MovementItem> = {}): MovementItem {
  return {
    id: `mov-${Date.now()}`,
    tcn: `TCN${Math.random().toString().slice(2, 17)}`,
    name: 'Test Cargo',
    weight: 500,
    length: 48,
    width: 40,
    height: 36,
    hazmat: false,
    priority: 'routine',
    origin: 'KADW',
    destination: 'RJTY',
    ...overrides
  };
}

export function createPallet(overrides: Partial<Pallet> = {}): Pallet {
  return {
    id: `pallet-${Date.now()}`,
    type: '463L',
    length: 88,
    width: 108,
    height: 96,
    maxWeight: 10000,
    items: [],
    totalWeight: 0,
    utilizationPercent: 0,
    ...overrides
  };
}

export function createLoadPlan(overrides: Partial<LoadPlan> = {}): LoadPlan {
  return {
    id: `lp-${Date.now()}`,
    flightId: `flight-${Date.now()}`,
    aircraft: 'C-17A',
    pallets: [],
    totalWeight: 0,
    cgPercentMac: 25.0,
    balanced: true,
    ...overrides
  };
}
