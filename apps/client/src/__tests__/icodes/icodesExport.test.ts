/**
 * ICODES Export Tests
 * Comprehensive tests for DoD/DLA-compliant export formats
 */

import {
  loadPlanToICODES,
  generateA2IBundle,
  splitFlightToICODES,
  ICODESHeader,
  ICODESAircraftRecord,
  ICODESStationData,
  ICODESPalletRecord,
  ICODESVehicleRecord,
  ICODESBalanceData,
  ICODESLoadPlan,
  A2IBundle
} from '../../lib/icodesExport';
import {
  AIRCRAFT_SPECS,
  Pallet463L,
  AircraftLoadPlan,
  PalletPlacement,
  VehiclePlacement,
  MovementItem,
  AllocationResult,
  PALLET_463L
} from '../../lib/pacafTypes';
import { SplitFlight } from '../../lib/flightSplitTypes';
import { MILITARY_BASES } from '../../lib/bases';

const createMockMovementItem = (overrides: Partial<MovementItem> = {}): MovementItem => ({
  item_id: `ITEM-${Math.random().toString(36).substr(2, 6)}`,
  description: 'Test Cargo Item',
  weight_each_lb: 1000,
  length_in: 48,
  width_in: 40,
  height_in: 36,
  type: 'PALLETIZABLE' as const,
  quantity: 1,
  advon_flag: false,
  hazmat_flag: false,
  ...overrides
});

const createMockPallet = (id: string, weight: number, options: Partial<Pallet463L> = {}): Pallet463L => ({
  id,
  items: [createMockMovementItem({ weight_each_lb: weight - PALLET_463L.tare_with_nets })],
  gross_weight: weight,
  net_weight: weight - PALLET_463L.tare_with_nets,
  height: 60,
  hazmat_flag: false,
  is_prebuilt: false,
  footprint: { length: 108, width: 88 },
  ...options
});

const createMockVehicle = (id: string, weight: number): VehiclePlacement => ({
  item_id: id,
  item: createMockMovementItem({
    item_id: id,
    description: 'HMMWV',
    weight_each_lb: weight,
    length_in: 180,
    width_in: 84,
    height_in: 72
  }),
  weight,
  length: 180,
  width: 84,
  height: 72,
  axle_weights: [weight / 2, weight / 2],
  position: { x: 0, y: 0, z: 500 },
  deck: 'MAIN'
});

const createMockLoadPlan = (
  id: string,
  aircraftType: 'C-17' | 'C-130',
  pallets: Pallet463L[],
  options: Partial<AircraftLoadPlan> = {}
): AircraftLoadPlan => ({
  aircraft_id: id,
  aircraft_type: aircraftType,
  aircraft_spec: AIRCRAFT_SPECS[aircraftType],
  sequence: 1,
  phase: 'MAIN',
  pallets: pallets.map((p, i): PalletPlacement => ({
    pallet: p,
    position_index: i,
    position_coord: AIRCRAFT_SPECS[aircraftType].stations[i]?.rdl_distance || i * 54,
    is_ramp: AIRCRAFT_SPECS[aircraftType].ramp_positions.includes(i + 1)
  })),
  rolling_stock: [],
  pax_count: 0,
  pax_weight: 0,
  seat_capacity: AIRCRAFT_SPECS[aircraftType].seat_capacity,
  seats_used: 0,
  seat_utilization_percent: 0,
  total_weight: pallets.reduce((sum, p) => sum + p.gross_weight, 0),
  payload_used_percent: (pallets.reduce((sum, p) => sum + p.gross_weight, 0) / AIRCRAFT_SPECS[aircraftType].max_payload) * 100,
  center_of_balance: 500,
  cob_percent: 27.5,
  cob_in_envelope: true,
  positions_used: pallets.length,
  positions_available: AIRCRAFT_SPECS[aircraftType].pallet_positions - pallets.length,
  utilization_percent: 75,
  ...options
});

describe('ICODES Export - Header Generation', () => {
  test('should generate header with format version 7.2', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.header.format_version).toBe('7.2');
  });

  test('should generate header with valid ISO date format', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.header.generated_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('should generate header with Zulu time format', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.header.generated_time_zulu).toMatch(/^\d{4}Z$/);
  });

  test('should use UNCLASSIFIED as default classification', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.header.classification).toBe('UNCLASSIFIED');
  });

  test('should use provided mission ID when specified', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    const icodes = loadPlanToICODES(loadPlan, 'CUSTOM-MISSION-123');
    expect(icodes.header.mission_id).toBe('CUSTOM-MISSION-123');
  });

  test('should generate mission ID with ARKA prefix when not provided', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.header.mission_id).toMatch(/^ARKA-\d{8}-\d{4}$/);
  });

  test('should include ARKA-PACAF-DEMO as originator', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.header.originator).toBe('ARKA-PACAF-DEMO');
  });
});

describe('ICODES Export - Aircraft Record', () => {
  test('should include correct aircraft ID', () => {
    const loadPlan = createMockLoadPlan('REACH-01', 'C-17', [createMockPallet('P001', 5000)]);
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.aircraft.aircraft_id).toBe('REACH-01');
  });

  test('should set C-17 mission design series to C-17A', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.aircraft.mission_design_series).toBe('C-17A');
  });

  test('should set C-130 mission design series to C-130J', () => {
    const loadPlan = createMockLoadPlan('C130-001', 'C-130', [createMockPallet('P001', 5000)]);
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.aircraft.mission_design_series).toBe('C-130J');
  });

  test('should set cargo configuration to PALLET for pallet-only loads', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.aircraft.cargo_configuration).toBe('PALLET');
  });

  test('should set cargo configuration to MIXED when rolling stock present', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    loadPlan.rolling_stock = [createMockVehicle('VEH-001', 8000)];
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.aircraft.cargo_configuration).toBe('MIXED');
  });
});

describe('ICODES Export - Station Data', () => {
  test('should generate station data for all pallet positions', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.station_data.length).toBe(AIRCRAFT_SPECS['C-17'].pallet_positions);
  });

  test('should mark ramp positions correctly', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', []);
    const icodes = loadPlanToICODES(loadPlan);
    const rampStations = icodes.station_data.filter(s => s.is_ramp);
    expect(rampStations.length).toBe(AIRCRAFT_SPECS['C-17'].ramp_positions.length);
  });

  test('should mark occupied stations correctly', () => {
    const pallets = [createMockPallet('P001', 5000), createMockPallet('P002', 4500)];
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', pallets);
    const icodes = loadPlanToICODES(loadPlan);
    const occupiedStations = icodes.station_data.filter(s => s.occupied);
    expect(occupiedStations.length).toBe(2);
  });

  test('should set correct cargo type for empty positions', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    const icodes = loadPlanToICODES(loadPlan);
    const emptyStations = icodes.station_data.filter(s => !s.occupied);
    expect(emptyStations.every(s => s.cargo_type === 'EMPTY')).toBe(true);
  });

  test('should include weight for occupied positions', () => {
    const pallets = [createMockPallet('P001', 5000)];
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', pallets);
    const icodes = loadPlanToICODES(loadPlan);
    const occupiedStation = icodes.station_data.find(s => s.occupied);
    expect(occupiedStation?.weight_lb).toBe(5000);
  });

  test('should set max weight for ramp positions correctly', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', []);
    const icodes = loadPlanToICODES(loadPlan);
    const rampStation = icodes.station_data.find(s => s.is_ramp);
    expect(rampStation?.max_weight_lb).toBe(AIRCRAFT_SPECS['C-17'].ramp_position_weight);
  });
});

describe('ICODES Export - Pallet Records', () => {
  test('should generate pallet records for all loaded pallets', () => {
    const pallets = [
      createMockPallet('P001', 5000),
      createMockPallet('P002', 4500),
      createMockPallet('P003', 6000)
    ];
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', pallets);
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.pallets.length).toBe(3);
  });

  test('should include correct pallet ID', () => {
    const pallets = [createMockPallet('TEST-PALLET-001', 5000)];
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', pallets);
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.pallets[0].pallet_id).toBe('TEST-PALLET-001');
  });

  test('should include 463L tare weight', () => {
    const pallets = [createMockPallet('P001', 5000)];
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', pallets);
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.pallets[0].tare_weight_lb).toBe(PALLET_463L.tare_with_nets);
  });

  test('should include hazmat class for hazmat pallets', () => {
    const pallet = createMockPallet('HAZ-001', 5000, { hazmat_flag: true });
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [pallet]);
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.pallets[0].hazmat_class).toBe('1.4');
  });

  test('should not include hazmat class for non-hazmat pallets', () => {
    const pallet = createMockPallet('P001', 5000, { hazmat_flag: false });
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [pallet]);
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.pallets[0].hazmat_class).toBeUndefined();
  });

  test('should include item count', () => {
    const pallet = createMockPallet('P001', 5000);
    pallet.items.push(createMockMovementItem({ item_id: 'EXTRA-ITEM' }));
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [pallet]);
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.pallets[0].item_count).toBe(2);
  });

  test('should include height in inches', () => {
    const pallet = createMockPallet('P001', 5000, { height: 72 });
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [pallet]);
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.pallets[0].height_inches).toBe(72);
  });
});

describe('ICODES Export - Balance Data', () => {
  test('should include total cargo weight', () => {
    const pallets = [createMockPallet('P001', 5000), createMockPallet('P002', 4500)];
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', pallets);
    loadPlan.total_weight = 9500;
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.balance.total_cargo_weight_lb).toBe(9500);
  });

  test('should include center of gravity percentage', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    loadPlan.cob_percent = 28.5;
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.balance.center_of_gravity_percent).toBeCloseTo(28.5, 1);
  });

  test('should include forward limit from aircraft spec', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.balance.forward_limit_percent).toBe(AIRCRAFT_SPECS['C-17'].cob_min_percent);
  });

  test('should include aft limit from aircraft spec', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.balance.aft_limit_percent).toBe(AIRCRAFT_SPECS['C-17'].cob_max_percent);
  });

  test('should indicate within envelope when CoB is valid', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    loadPlan.cob_in_envelope = true;
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.balance.within_envelope).toBe(true);
  });

  test('should indicate outside envelope when CoB is invalid', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    loadPlan.cob_in_envelope = false;
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.balance.within_envelope).toBe(false);
  });
});

describe('ICODES Export - Summary', () => {
  test('should include total positions used', () => {
    const pallets = [createMockPallet('P001', 5000), createMockPallet('P002', 4500)];
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', pallets);
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.summary.total_positions_used).toBe(2);
  });

  test('should include payload capacity from aircraft spec', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.summary.payload_capacity_lb).toBe(AIRCRAFT_SPECS['C-17'].max_payload);
  });

  test('should calculate utilization percent correctly', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    loadPlan.utilization_percent = 65.5;
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.summary.utilization_percent).toBeCloseTo(65.5, 1);
  });
});

describe('ICODES Export - Warnings', () => {
  test('should include CoB warning when outside envelope', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    loadPlan.cob_in_envelope = false;
    loadPlan.cob_percent = 45;
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.warnings.some(w => w.includes('CENTER OF BALANCE'))).toBe(true);
  });

  test('should include hazmat warning when hazmat present', () => {
    const pallet = createMockPallet('HAZ-001', 5000, { hazmat_flag: true });
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [pallet]);
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.warnings.some(w => w.includes('HAZARDOUS MATERIALS'))).toBe(true);
  });

  test('should include capacity warning when above 95%', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    loadPlan.payload_used_percent = 97;
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.warnings.some(w => w.includes('95%'))).toBe(true);
  });
});

describe('ICODES Export - Passengers', () => {
  test('should include passenger count', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    loadPlan.pax_count = 25;
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.passengers.total_count).toBe(25);
  });

  test('should calculate passenger weight at 225 lbs each', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    loadPlan.pax_count = 10;
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.passengers.weight_lb).toBe(2250);
  });

  test('should set seating configuration to SIDEWALL when pax present', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    loadPlan.pax_count = 10;
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.passengers.seating_configuration).toBe('SIDEWALL');
  });

  test('should set seating configuration to NONE when no pax', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    loadPlan.pax_count = 0;
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.passengers.seating_configuration).toBe('NONE');
  });
});

describe('A2I Bundle Generation', () => {
  const createMockAllocation = (): AllocationResult => ({
    aircraft_type: 'C-17',
    total_aircraft: 2,
    advon_aircraft: 1,
    main_aircraft: 1,
    load_plans: [
      createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)], { phase: 'ADVON' }),
      createMockLoadPlan('C17-002', 'C-17', [createMockPallet('P002', 4500)], { phase: 'MAIN' })
    ],
    total_weight: 9500,
    total_pallets: 2,
    total_rolling_stock: 0,
    total_pax: 0,
    total_pax_weight: 0,
    total_seat_capacity: 204,
    total_seats_used: 0,
    overall_seat_utilization: 0,
    unloaded_items: [],
    unloaded_pax: 0,
    warnings: []
  });

  test('should generate summary with bundle ID', () => {
    const allocation = createMockAllocation();
    const bundle = generateA2IBundle(allocation);
    expect(bundle.summary.bundle_id).toBeDefined();
    expect(bundle.summary.bundle_id).toMatch(/^ARKA-/);
  });

  test('should include aircraft summary by type', () => {
    const allocation = createMockAllocation();
    const bundle = generateA2IBundle(allocation);
    expect(bundle.summary.aircraft_summary.by_type['C-17']).toBe(2);
  });

  test('should include cargo summary', () => {
    const allocation = createMockAllocation();
    const bundle = generateA2IBundle(allocation);
    expect(bundle.summary.cargo_summary.total_pallets).toBe(2);
  });

  test('should include utilization metrics', () => {
    const allocation = createMockAllocation();
    const bundle = generateA2IBundle(allocation);
    expect(bundle.summary.utilization_metrics).toBeDefined();
    expect(bundle.summary.utilization_metrics.average_acl_percent).toBeGreaterThanOrEqual(0);
  });

  test('should generate load plans for each aircraft', () => {
    const allocation = createMockAllocation();
    const bundle = generateA2IBundle(allocation);
    expect(bundle.load_plans.length).toBe(2);
  });

  test('should generate risks document', () => {
    const allocation = createMockAllocation();
    const bundle = generateA2IBundle(allocation);
    expect(bundle.risks_and_warnings).toBeDefined();
    expect(bundle.risks_and_warnings.mission_id).toBeDefined();
  });

  test('should generate manifest CSV', () => {
    const allocation = createMockAllocation();
    const bundle = generateA2IBundle(allocation);
    expect(bundle.manifest_csv).toBeDefined();
    expect(bundle.manifest_csv).toContain('ITEM_ID');
  });

  test('should identify hazmat items in risks', () => {
    const allocation = createMockAllocation();
    allocation.load_plans[0].pallets[0].pallet.hazmat_flag = true;
    allocation.load_plans[0].pallets[0].pallet.items[0].hazmat_flag = true;
    const bundle = generateA2IBundle(allocation);
    expect(bundle.risks_and_warnings.hazmat_items.length).toBeGreaterThan(0);
  });

  test('should identify underutilized sorties', () => {
    const allocation = createMockAllocation();
    allocation.load_plans[0].payload_used_percent = 30;
    allocation.load_plans[1].payload_used_percent = 60;
    const bundle = generateA2IBundle(allocation);
    expect(bundle.risks_and_warnings.underutilized_sorties.length).toBe(1);
  });

  test('should track validation status', () => {
    const allocation = createMockAllocation();
    const bundle = generateA2IBundle(allocation);
    expect(bundle.summary.validation.all_plans_valid).toBe(true);
  });

  test('should count CoB violations', () => {
    const allocation = createMockAllocation();
    allocation.load_plans[0].cob_in_envelope = false;
    const bundle = generateA2IBundle(allocation);
    expect(bundle.summary.validation.cob_violations).toBe(1);
  });
});

describe('Split Flight to ICODES', () => {
  const createMockSplitFlight = (): SplitFlight => ({
    id: 'SF001',
    parent_flight_id: 'PARENT-001',
    callsign: 'REACH01',
    aircraft_id: 'C17-001',
    aircraft_type: 'C-17',
    origin: MILITARY_BASES[0],
    destination: MILITARY_BASES[1],
    scheduled_departure: new Date(),
    scheduled_arrival: new Date(Date.now() + 4 * 60 * 60 * 1000),
    estimated_delay_minutes: 0,
    pallets: [
      {
        pallet: createMockPallet('P001', 5000),
        position_index: 0,
        position_coord: 245,
        is_ramp: false
      }
    ],
    rolling_stock: [],
    pax_count: 0,
    total_weight_lb: 5000,
    center_of_balance_percent: 27.5,
    weather_warnings: [],
    is_modified: false
  });

  test('should generate ICODES from split flight', () => {
    const flight = createMockSplitFlight();
    const icodes = splitFlightToICODES(flight, 'SPLIT-MISSION');
    expect(icodes).toBeDefined();
    expect(icodes.header.mission_id).toBe('SPLIT-MISSION');
  });

  test('should use callsign as aircraft ID', () => {
    const flight = createMockSplitFlight();
    const icodes = splitFlightToICODES(flight);
    expect(icodes.aircraft.aircraft_id).toBe('REACH01');
  });

  test('should include route in remarks', () => {
    const flight = createMockSplitFlight();
    const icodes = splitFlightToICODES(flight);
    expect(icodes.remarks.some(r => r.includes('Route:'))).toBe(true);
  });

  test('should include callsign in remarks', () => {
    const flight = createMockSplitFlight();
    const icodes = splitFlightToICODES(flight);
    expect(icodes.remarks.some(r => r.includes('Callsign: REACH01'))).toBe(true);
  });

  test('should include departure time in remarks', () => {
    const flight = createMockSplitFlight();
    const icodes = splitFlightToICODES(flight);
    expect(icodes.remarks.some(r => r.includes('Departure:'))).toBe(true);
  });

  test('should calculate balance data correctly', () => {
    const flight = createMockSplitFlight();
    const icodes = splitFlightToICODES(flight);
    expect(icodes.balance).toBeDefined();
    expect(icodes.balance.center_of_gravity_percent).toBeDefined();
  });

  test('should warn on overweight condition', () => {
    const flight = createMockSplitFlight();
    flight.pallets = Array(20).fill(null).map((_, i) => ({
      pallet: createMockPallet(`P${i}`, 10000),
      position_index: i,
      position_coord: 245 + i * 58,
      is_ramp: false
    }));
    const icodes = splitFlightToICODES(flight);
    expect(icodes.warnings.some(w => w.includes('OVERWEIGHT'))).toBe(true);
  });
});

describe('ICODES Export - Edge Cases', () => {
  test('should handle empty load plan', () => {
    const loadPlan = createMockLoadPlan('C17-EMPTY', 'C-17', []);
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.pallets.length).toBe(0);
    expect(icodes.vehicles.length).toBe(0);
  });

  test('should handle C-130 aircraft', () => {
    const loadPlan = createMockLoadPlan('C130-001', 'C-130', [createMockPallet('P001', 5000)]);
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.aircraft.aircraft_type).toBe('C-130');
    expect(icodes.station_data.length).toBe(AIRCRAFT_SPECS['C-130'].pallet_positions);
  });

  test('should handle full pallet load', () => {
    const pallets = Array(18).fill(null).map((_, i) => createMockPallet(`P${i + 1}`, 5000));
    const loadPlan = createMockLoadPlan('C17-FULL', 'C-17', pallets);
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.pallets.length).toBe(18);
  });

  test('should handle pax-only flight', () => {
    const loadPlan = createMockLoadPlan('C17-PAX', 'C-17', []);
    loadPlan.pax_count = 50;
    const icodes = loadPlanToICODES(loadPlan);
    expect(icodes.passengers.total_count).toBe(50);
    expect(icodes.pallets.length).toBe(0);
  });
});
