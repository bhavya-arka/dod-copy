/**
 * Flight Validation Tests
 * Tests for flight load validation, weight limits, and CoB calculations
 */

import {
  calculateFlightWeight,
  validateFlightLoad,
  calculateCenterOfBalance,
  estimateWeatherDelay,
  reoptimizePalletPlacement,
  SplitFlight,
  WeatherWarning
} from '../../lib/flightSplitTypes';
import { Pallet463L, PalletPlacement, VehiclePlacement } from '../../lib/pacafTypes';
import { MILITARY_BASES, getBaseById } from '../../lib/bases';

const createMockPallet = (id: string, weight: number): Pallet463L => ({
  id,
  items: [{
    item_id: id,
    description: 'Test Item',
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
  position_coord: index * 54,
  is_ramp: index >= 16
});

const createMockVehicle = (id: string, weight: number): VehiclePlacement => ({
  item_id: id,
  item: {
    item_id: id,
    description: 'Test Vehicle',
    weight_each_lb: weight,
    length_in: 200,
    width_in: 80,
    height_in: 72,
    type: 'ROLLING_STOCK' as const,
    quantity: 1,
    advon_flag: false,
    hazmat_flag: false
  },
  position: { x: 0, y: 0, z: 100 },
  weight,
  length: 200,
  width: 80,
  height: 72,
  axle_weights: [weight / 2, weight / 2]
});

const createMockFlight = (
  pallets: PalletPlacement[] = [],
  vehicles: VehiclePlacement[] = [],
  paxCount: number = 0,
  aircraftType: 'C-17' | 'C-130' = 'C-17'
): SplitFlight => ({
  id: 'SF001',
  parent_flight_id: 'PARENT-001',
  callsign: 'REACH01',
  aircraft_id: 'C17-001',
  aircraft_type: aircraftType,
  origin: getBaseById('HICKAM')!,
  destination: getBaseById('KADENA')!,
  scheduled_departure: new Date(),
  scheduled_arrival: new Date(Date.now() + 4 * 60 * 60 * 1000),
  estimated_delay_minutes: 0,
  pallets,
  rolling_stock: vehicles,
  pax_count: paxCount,
  total_weight_lb: pallets.reduce((sum, p) => sum + p.pallet.gross_weight, 0),
  center_of_balance_percent: 27.5,
  weather_warnings: [],
  is_modified: false
});

describe('Flight Validation - Weight Calculation', () => {
  test('should calculate weight from pallets only', () => {
    const placements = [
      createMockPlacement(createMockPallet('P1', 5000), 0),
      createMockPlacement(createMockPallet('P2', 3000), 1)
    ];
    const flight = createMockFlight(placements);
    
    expect(calculateFlightWeight(flight)).toBe(8000);
  });

  test('should include vehicle weight', () => {
    const pallets = [createMockPlacement(createMockPallet('P1', 5000), 0)];
    const vehicles = [createMockVehicle('V1', 10000)];
    const flight = createMockFlight(pallets, vehicles);
    
    expect(calculateFlightWeight(flight)).toBe(15000);
  });

  test('should include passenger weight at 225 lbs each', () => {
    const pallets = [createMockPlacement(createMockPallet('P1', 5000), 0)];
    const flight = createMockFlight(pallets, [], 10);
    
    expect(calculateFlightWeight(flight)).toBe(5000 + 10 * 225);
  });

  test('should calculate combined weight', () => {
    const pallets = [createMockPlacement(createMockPallet('P1', 5000), 0)];
    const vehicles = [createMockVehicle('V1', 8000)];
    const flight = createMockFlight(pallets, vehicles, 5);
    
    expect(calculateFlightWeight(flight)).toBe(5000 + 8000 + 5 * 225);
  });
});

describe('Flight Validation - Load Limits', () => {
  test('should validate C-17 within weight limit', () => {
    const placements = [createMockPlacement(createMockPallet('P1', 50000), 0)];
    const flight = createMockFlight(placements);
    flight.center_of_balance_percent = 27.5;
    
    const result = validateFlightLoad(flight);
    
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  test('should detect C-17 overweight', () => {
    const placements = Array.from({ length: 18 }, (_, i) =>
      createMockPlacement(createMockPallet(`P${i}`, 12000), i)
    );
    const flight = createMockFlight(placements);
    
    const result = validateFlightLoad(flight);
    
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('Overweight'))).toBe(true);
  });

  test('should detect too many pallets for C-17', () => {
    const placements = Array.from({ length: 20 }, (_, i) =>
      createMockPlacement(createMockPallet(`P${i}`, 1000), i % 18)
    );
    const flight = createMockFlight(placements);
    
    const result = validateFlightLoad(flight);
    
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('Too many pallets'))).toBe(true);
  });

  test('should detect C-130 pallet limit exceeded', () => {
    const placements = Array.from({ length: 8 }, (_, i) =>
      createMockPlacement(createMockPallet(`P${i}`, 1000), i)
    );
    const flight = createMockFlight(placements, [], 0, 'C-130');
    flight.center_of_balance_percent = 25;
    
    const result = validateFlightLoad(flight);
    
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('pallets'))).toBe(true);
  });

  test('should validate C-130 weight limit', () => {
    const placements = Array.from({ length: 6 }, (_, i) =>
      createMockPlacement(createMockPallet(`P${i}`, 8000), i)
    );
    const flight = createMockFlight(placements, [], 0, 'C-130');
    
    const result = validateFlightLoad(flight);
    
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('Overweight'))).toBe(true);
  });
});

describe('Flight Validation - Center of Balance', () => {
  test('should return default CoB for empty flight', () => {
    const flight = createMockFlight();
    
    const cob = calculateCenterOfBalance(flight);
    
    expect(cob).toBe(27.5);
  });

  test('should calculate CoB based on pallet positions', () => {
    const placements = [
      createMockPlacement(createMockPallet('P1', 5000), 8),
      createMockPlacement(createMockPallet('P2', 5000), 9)
    ];
    const flight = createMockFlight(placements);
    
    const cob = calculateCenterOfBalance(flight);
    
    expect(typeof cob).toBe('number');
    expect(isNaN(cob)).toBe(false);
  });

  test('should detect CoB out of envelope', () => {
    const placements = [createMockPlacement(createMockPallet('P1', 50000), 0)];
    const flight = createMockFlight(placements);
    flight.center_of_balance_percent = 15;
    
    const result = validateFlightLoad(flight);
    
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('Center of balance'))).toBe(true);
  });
});

describe('Flight Validation - Weather Delay Estimation', () => {
  test('should estimate no delay for non-affecting weather', () => {
    const flight = createMockFlight();
    const systems = [{ severity: 'moderate', affects_flight_ops: false }];
    
    const delay = estimateWeatherDelay(flight, systems);
    
    expect(delay).toBe(0);
  });

  test('should estimate 15 minute delay for minor weather', () => {
    const flight = createMockFlight();
    const systems = [{ severity: 'minor', affects_flight_ops: true }];
    
    const delay = estimateWeatherDelay(flight, systems);
    
    expect(delay).toBe(15);
  });

  test('should estimate 45 minute delay for moderate weather', () => {
    const flight = createMockFlight();
    const systems = [{ severity: 'moderate', affects_flight_ops: true }];
    
    const delay = estimateWeatherDelay(flight, systems);
    
    expect(delay).toBe(45);
  });

  test('should estimate 120 minute delay for severe weather', () => {
    const flight = createMockFlight();
    const systems = [{ severity: 'severe', affects_flight_ops: true }];
    
    const delay = estimateWeatherDelay(flight, systems);
    
    expect(delay).toBe(120);
  });

  test('should accumulate delays from multiple systems', () => {
    const flight = createMockFlight();
    const systems = [
      { severity: 'minor', affects_flight_ops: true },
      { severity: 'moderate', affects_flight_ops: true }
    ];
    
    const delay = estimateWeatherDelay(flight, systems);
    
    expect(delay).toBe(60);
  });
});

describe('Flight Validation - Pallet Optimization', () => {
  test('should optimize pallet placement', () => {
    const placements = [
      createMockPlacement(createMockPallet('P1', 8000), 0),
      createMockPlacement(createMockPallet('P2', 3000), 1),
      createMockPlacement(createMockPallet('P3', 6000), 2)
    ];
    const flight = createMockFlight(placements);
    
    const optimized = reoptimizePalletPlacement(flight);
    
    expect(optimized.pallets.length).toBe(3);
    expect(optimized.is_modified).toBe(true);
  });

  test('should recalculate total weight after optimization', () => {
    const placements = [
      createMockPlacement(createMockPallet('P1', 5000), 0),
      createMockPlacement(createMockPallet('P2', 4000), 1)
    ];
    const flight = createMockFlight(placements);
    
    const optimized = reoptimizePalletPlacement(flight);
    
    expect(optimized.total_weight_lb).toBe(9000);
  });

  test('should handle single pallet optimization', () => {
    const placements = [createMockPlacement(createMockPallet('P1', 5000), 0)];
    const flight = createMockFlight(placements);
    
    const optimized = reoptimizePalletPlacement(flight);
    
    expect(optimized.pallets.length).toBe(1);
    expect(optimized.is_modified).toBe(true);
  });
});
