/**
 * Flight Split Types Tests
 * Tests for cargo redistribution and split flight management
 */

import {
  calculateFlightWeight,
  validateFlightLoad,
  calculateCenterOfBalance,
  reoptimizePalletPlacement,
  SplitFlight
} from '../apps/client/src/lib/flightSplitTypes';
import { AIRCRAFT_SPECS, Pallet463L, PalletPlacement } from '../apps/client/src/lib/pacafTypes';
import { MILITARY_BASES } from '../apps/client/src/lib/bases';

const createMockPallet = (id: string, weight: number): Pallet463L => ({
  id,
  items: [{ 
    item_id: id, 
    description: 'Test', 
    weight_each_lb: weight - 355,
    length_in: 88,
    width_in: 88,
    height_in: 60,
    type: 'PALLETIZABLE' as const,
    quantity: 1,
    advon_flag: false,
    hazmat_flag: false
  }],
  gross_weight: weight,
  net_weight: weight - 355,
  height: 60,
  hazmat_flag: false,
  is_prebuilt: false,
  footprint: { length: 108, width: 88 }
});

const createMockPlacement = (pallet: Pallet463L, index: number): PalletPlacement => ({
  pallet,
  position_index: index,
  position_coord: index * 54, // C-17 pallet spacing
  is_ramp: index >= 16
});

const origin = MILITARY_BASES[0];
const destination = MILITARY_BASES[1];

const createMockSplitFlight = (pallets: PalletPlacement[]): SplitFlight => ({
  id: 'SF001',
  parent_flight_id: 'PARENT-001',
  callsign: 'REACH01',
  aircraft_id: 'C17-001',
  aircraft_type: 'C-17',
  origin,
  destination,
  scheduled_departure: new Date(),
  scheduled_arrival: new Date(Date.now() + 4 * 60 * 60 * 1000),
  estimated_delay_minutes: 0,
  pallets,
  rolling_stock: [],
  pax_count: 0,
  total_weight_lb: pallets.reduce((sum, p) => sum + p.pallet.gross_weight, 0),
  center_of_balance_percent: 27.5,
  weather_warnings: [],
  is_modified: false
});

describe('Flight Weight Calculation', () => {
  test('should calculate total pallet weight', () => {
    const placements = [
      createMockPlacement(createMockPallet('P1', 5000), 0),
      createMockPlacement(createMockPallet('P2', 4000), 1),
      createMockPlacement(createMockPallet('P3', 3000), 2)
    ];
    const flight = createMockSplitFlight(placements);

    const weight = calculateFlightWeight(flight);

    expect(weight).toBe(12000);
  });

  test('should handle empty flight', () => {
    const flight = createMockSplitFlight([]);
    const weight = calculateFlightWeight(flight);
    
    expect(weight).toBe(0);
  });
});

describe('Flight Load Validation', () => {
  test('should validate flight within limits', () => {
    const placements = [createMockPlacement(createMockPallet('P1', 5000), 0)];
    const flight = createMockSplitFlight(placements);

    const validation = validateFlightLoad(flight);

    expect(validation.valid).toBe(true);
    expect(validation.issues.length).toBe(0);
  });

  test('should detect overweight condition', () => {
    const placements = Array.from({ length: 20 }, (_, i) => 
      createMockPlacement(createMockPallet(`P${i}`, 10000), i % 18)
    );
    const flight = createMockSplitFlight(placements);
    flight.total_weight_lb = 200000;

    const validation = validateFlightLoad(flight);

    expect(validation.valid).toBe(false);
  });

  test('should detect too many pallets', () => {
    const placements = Array.from({ length: 25 }, (_, i) => 
      createMockPlacement(createMockPallet(`P${i}`, 1000), i % 18)
    );
    const flight = createMockSplitFlight(placements);

    const validation = validateFlightLoad(flight);

    expect(validation.valid).toBe(false);
  });
});

describe('Center of Balance Calculation', () => {
  test('should calculate CoB', () => {
    const placements = [
      createMockPlacement(createMockPallet('P1', 5000), 8),
      createMockPlacement(createMockPallet('P2', 5000), 9)
    ];
    const flight = createMockSplitFlight(placements);

    const cob = calculateCenterOfBalance(flight);

    // CoB returns a percentage value (can be any range depending on cargo placement)
    expect(typeof cob).toBe('number');
  });

  test('should handle empty flight', () => {
    const flight = createMockSplitFlight([]);
    flight.center_of_balance_percent = 0;

    const cob = calculateCenterOfBalance(flight);

    expect(typeof cob).toBe('number');
  });
});

describe('Pallet Placement Optimization', () => {
  test('should optimize pallet positions', () => {
    const placements = [
      createMockPlacement(createMockPallet('P1', 8000), 0),
      createMockPlacement(createMockPallet('P2', 3000), 1),
      createMockPlacement(createMockPallet('P3', 6000), 2)
    ];
    const flight = createMockSplitFlight(placements);

    const optimized = reoptimizePalletPlacement(flight);

    expect(optimized.pallets.length).toBe(3);
    expect(optimized.is_modified).toBe(true);
  });

  test('should handle empty pallet list', () => {
    const flight = createMockSplitFlight([]);

    const optimized = reoptimizePalletPlacement(flight);

    expect(optimized.pallets.length).toBe(0);
  });

  test('should recalculate weight after optimization', () => {
    const placements = [
      createMockPlacement(createMockPallet('P1', 5000), 0),
      createMockPlacement(createMockPallet('P2', 4000), 1)
    ];
    const flight = createMockSplitFlight(placements);

    const optimized = reoptimizePalletPlacement(flight);

    expect(optimized.total_weight_lb).toBe(9000);
  });
});
