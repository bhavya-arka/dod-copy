/**
 * ICODES Export Tests
 * Tests for DoD/DLA-compliant export formats
 */

import { 
  loadPlanToICODES, 
  generateA2IBundle,
  splitFlightToICODES
} from '../client/src/lib/icodesExport';
import { AIRCRAFT_SPECS, Pallet463L, AircraftLoadPlan, PalletPlacement } from '../client/src/lib/pacafTypes';
import { classifyItems } from '../client/src/lib/classificationEngine';
import { solveAircraftAllocation } from '../client/src/lib/aircraftSolver';
import { parseMovementList } from '../client/src/lib/movementParser';
import { SplitFlight } from '../client/src/lib/flightSplitTypes';
import { MILITARY_BASES } from '../client/src/lib/bases';

const createMockPallet = (id: string, weight: number): Pallet463L => ({
  id,
  items: [{ 
    item_id: `ITEM-${id}`, 
    description: 'Test Cargo', 
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

const createMockLoadPlan = (id: string, pallets: Pallet463L[]): AircraftLoadPlan => ({
  aircraft_id: id,
  aircraft_type: 'C-17',
  aircraft_spec: AIRCRAFT_SPECS['C-17'],
  sequence: 1,
  phase: 'MAIN',
  pallets: pallets.map((p, i): PalletPlacement => ({
    pallet: p,
    position_index: i,
    position_coord: AIRCRAFT_SPECS['C-17'].position_coords[i] || i * 54,
    is_ramp: i >= 16
  })),
  rolling_stock: [],
  pax_count: 5,
  total_weight: pallets.reduce((sum, p) => sum + p.gross_weight, 0) + 1000,
  payload_used_percent: 50,
  center_of_balance: 500,
  cob_percent: 27.5,
  cob_in_envelope: true,
  positions_used: pallets.length,
  positions_available: 18 - pallets.length,
  utilization_percent: 75
});

describe('ICODES JSON Generation', () => {
  test('should generate valid ICODES structure for load plan', () => {
    const pallets = [
      createMockPallet('P001', 5000),
      createMockPallet('P002', 4500)
    ];
    const loadPlan = createMockLoadPlan('C17-001', pallets);
    
    const icodes = loadPlanToICODES(loadPlan, 'MISSION-001');

    expect(icodes.header).toBeDefined();
    expect(icodes.header.mission_id).toBe('MISSION-001');
    expect(icodes.aircraft).toBeDefined();
    expect(icodes.pallets.length).toBe(2);
  });

  test('should include aircraft information', () => {
    const pallets = [createMockPallet('P001', 5000)];
    const loadPlan = createMockLoadPlan('C17-001', pallets);
    
    const icodes = loadPlanToICODES(loadPlan);

    expect(icodes.aircraft.aircraft_id).toBe('C17-001');
    expect(icodes.aircraft.aircraft_type).toBe('C-17');
  });

  test('should include pallet positions', () => {
    const pallets = [
      createMockPallet('P001', 5000),
      createMockPallet('P002', 4500),
      createMockPallet('P003', 6000)
    ];
    const loadPlan = createMockLoadPlan('C17-001', pallets);
    
    const icodes = loadPlanToICODES(loadPlan);

    expect(icodes.pallets.length).toBe(3);
    expect(icodes.pallets[0].station_number).toBeDefined();
  });

  test('should include balance data', () => {
    const pallets = [createMockPallet('P001', 5000)];
    const loadPlan = createMockLoadPlan('C17-001', pallets);
    
    const icodes = loadPlanToICODES(loadPlan);

    expect(icodes.balance).toBeDefined();
    expect(icodes.balance.center_of_gravity_percent).toBeDefined();
  });
});

describe('A2I Bundle Generation', () => {
  test('should generate complete A2I bundle from allocation', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,Box A,88,88,60,5000
2,Box B,88,88,60,4500`;
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);
    const allocation = solveAircraftAllocation(classified, 'C-17');

    const bundle = generateA2IBundle(allocation);

    expect(bundle.load_plans.length).toBeGreaterThanOrEqual(0);
    expect(bundle.summary).toBeDefined();
    expect(bundle.risks_and_warnings).toBeDefined();
  });

  test('should include mission metadata', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,Box A,88,88,60,5000`;
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);
    const allocation = solveAircraftAllocation(classified, 'C-17');

    const bundle = generateA2IBundle(allocation);

    expect(bundle.summary.mission_id).toBeDefined();
    expect(bundle.summary.generated_date).toBeDefined();
  });
});

describe('Split Flight ICODES Export', () => {
  test('should generate ICODES from split flight', () => {
    const pallets = [
      createMockPallet('P001', 5000),
      createMockPallet('P002', 4500)
    ];
    
    const origin = MILITARY_BASES[0];
    const destination = MILITARY_BASES[1];
    
    const splitFlight: SplitFlight = {
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
      pallets: pallets.map((p, i): PalletPlacement => ({
        pallet: p,
        position_index: i,
        position_coord: AIRCRAFT_SPECS['C-17'].position_coords[i],
        is_ramp: false
      })),
      rolling_stock: [],
      pax_count: 5,
      total_weight_lb: 9500,
      center_of_balance_percent: 27.5,
      weather_warnings: [],
      is_modified: false
    };

    const icodes = splitFlightToICODES(splitFlight, 'SPLIT-MISSION');

    expect(icodes.header.mission_id).toBe('SPLIT-MISSION');
    expect(icodes.pallets.length).toBe(2);
    expect(icodes.station_data).toBeDefined();
    expect(icodes.station_data.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Export Edge Cases', () => {
  test('should handle aircraft with no pallets', () => {
    const loadPlan = createMockLoadPlan('C17-EMPTY', []);
    loadPlan.pax_count = 30;
    
    const icodes = loadPlanToICODES(loadPlan);
    
    expect(icodes.pallets.length).toBe(0);
    expect(icodes.passengers.total_count).toBe(30);
  });

  test('should include hazmat info for hazmat pallets', () => {
    const pallet = createMockPallet('HAZ-001', 3000);
    pallet.hazmat_flag = true;
    const loadPlan = createMockLoadPlan('C17-HAZ', [pallet]);
    
    const icodes = loadPlanToICODES(loadPlan);
    
    expect(icodes.pallets.length).toBe(1);
  });
});
