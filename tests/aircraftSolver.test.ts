/**
 * Aircraft Allocation Solver Tests
 * Tests for PACAF Spec Section 5, 7, 8: Aircraft Specifications and Allocation
 */

import { 
  solveAircraftAllocation, 
  calculateCenterOfBalance,
  calculateMinimumAircraft
} from '../client/src/lib/aircraftSolver';
import { AIRCRAFT_SPECS } from '../client/src/lib/pacafTypes';
import { classifyItems } from '../client/src/lib/classificationEngine';
import { parseMovementList } from '../client/src/lib/movementParser';

describe('Aircraft Specifications', () => {
  test('C-17 should have correct specifications', () => {
    const c17 = AIRCRAFT_SPECS['C-17'];
    
    expect(c17.cargo_length).toBe(1056);
    expect(c17.cargo_width).toBe(216);
    expect(c17.cargo_height).toBe(148);
    expect(c17.pallet_positions).toBe(18);
    expect(c17.max_payload).toBe(170900);
  });

  test('C-130 should have correct specifications', () => {
    const c130 = AIRCRAFT_SPECS['C-130'];
    
    expect(c130.cargo_length).toBe(492);
    expect(c130.cargo_width).toBe(123);
    expect(c130.cargo_height).toBe(108);
    expect(c130.pallet_positions).toBe(6);
    expect(c130.max_payload).toBe(42000);
  });

  test('C-17 should have correct CoB envelope', () => {
    const c17 = AIRCRAFT_SPECS['C-17'];
    expect(c17.cob_min_percent).toBe(20);
    expect(c17.cob_max_percent).toBe(35);
  });

  test('C-130 should have correct CoB envelope', () => {
    const c130 = AIRCRAFT_SPECS['C-130'];
    expect(c130.cob_min_percent).toBe(18);
    expect(c130.cob_max_percent).toBe(33);
  });

  test('C-17 should have ramp positions defined', () => {
    const c17 = AIRCRAFT_SPECS['C-17'];
    expect(c17.ramp_positions.length).toBe(2);
    expect(c17.ramp_position_weight).toBe(7500);
  });
});

describe('Minimum Aircraft Calculation', () => {
  test('should calculate 1 aircraft for light load', () => {
    const result = calculateMinimumAircraft(5, 50000, 'C-17');
    expect(result.minimum).toBe(1);
  });

  test('should calculate multiple aircraft for heavy load', () => {
    const result = calculateMinimumAircraft(20, 200000, 'C-17');
    expect(result.minimum).toBeGreaterThan(1);
  });

  test('should respect pallet position limits', () => {
    const result = calculateMinimumAircraft(10, 30000, 'C-130');
    expect(result.byPallets).toBe(2);
  });
});

describe('Aircraft Allocation', () => {
  test('should allocate light load to single C-17', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,Box A,88,88,60,5000
2,Box B,88,88,60,5000`;
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);
    const result = solveAircraftAllocation(classified, 'C-17');

    expect(result.total_aircraft).toBe(1);
  });

  test('should allocate light load to single C-130', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,Box A,40,40,40,5000
2,Box B,40,40,40,5000`;
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);
    const result = solveAircraftAllocation(classified, 'C-130');

    expect(result.total_aircraft).toBe(1);
  });

  test('should handle empty input', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb`;
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);
    const result = solveAircraftAllocation(classified, 'C-17');

    expect(result.total_aircraft).toBe(0);
  });

  test('should handle PAX only', () => {
    const csv = `item_id,description,pax
1,Personnel,30`;
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);
    const result = solveAircraftAllocation(classified, 'C-17');

    expect(result.total_pax).toBe(30);
  });

  test('should assign phase to aircraft', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,Box A,88,88,60,5000`;
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);
    const result = solveAircraftAllocation(classified, 'C-17');

    if (result.load_plans.length > 0) {
      expect(['ADVON', 'MAIN']).toContain(result.load_plans[0].phase);
    }
  });
});

describe('Center of Balance Calculations', () => {
  test('should calculate CoB for loaded pallet positions', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,Box A,88,88,60,5000
2,Box B,88,88,60,5000`;
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);
    const result = solveAircraftAllocation(classified, 'C-17');

    if (result.load_plans.length > 0) {
      const cob = result.load_plans[0].cob_percent;
      expect(cob).toBeGreaterThanOrEqual(10);
      expect(cob).toBeLessThanOrEqual(50);
    }
  });
});
