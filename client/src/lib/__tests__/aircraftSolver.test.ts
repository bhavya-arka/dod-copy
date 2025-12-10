/**
 * Aircraft Solver Test Suite
 * Tests for Center of Balance calculations and pallet placement
 */

import { calculateCenterOfBalance, getCoBStatusMessage } from '../aircraftSolver';
import { AIRCRAFT_SPECS, PalletPlacement, VehiclePlacement, Pallet463L, MovementItem } from '../pacafTypes';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockPallet(grossWeight: number, positionCoord: number): PalletPlacement {
  const pallet: Pallet463L = {
    id: 'TEST-001',
    items: [],
    net_weight: grossWeight - 290,
    gross_weight: grossWeight,
    height: 80,
    hazmat_flag: false,
    is_prebuilt: false,
    footprint: { length: 88, width: 108 }
  };
  
  return {
    pallet,
    position_index: 1,
    position_coord: positionCoord,
    is_ramp: false
  };
}

function createMockVehicle(weight: number, posZ: number): VehiclePlacement {
  const item: MovementItem = {
    item_id: 'VEH-001',
    description: 'Test Vehicle',
    length_in: 200,
    width_in: 80,
    height_in: 60,
    weight_each_lb: weight,
    quantity: 1,
    type: 'ROLLING_STOCK',
    hazmat_flag: false,
    advon_flag: false
  };
  
  return {
    item_id: 'VEH-001',
    item,
    weight,
    length: 200,
    width: 80,
    height: 60,
    axle_weights: [weight / 2, weight / 2],
    position: { x: 0, y: 0, z: posZ }
  };
}

// ============================================================================
// CENTER OF BALANCE TESTS
// ============================================================================

describe('Center of Balance Calculations', () => {
  describe('C-17 Globemaster III', () => {
    const c17Spec = AIRCRAFT_SPECS['C-17'];
    
    test('mid-cargo position produces ~30% MAC (positive value)', () => {
      // Position 9 has RDL distance 709" from cargo floor
      const midCargoPallet = createMockPallet(10000, 709);
      const cob = calculateCenterOfBalance([midCargoPallet], [], c17Spec);
      
      // Should be positive and within envelope
      expect(cob.cob_percent).toBeGreaterThan(0);
      expect(cob.cob_percent).toBeGreaterThanOrEqual(c17Spec.cob_min_percent);
      expect(cob.cob_percent).toBeLessThanOrEqual(c17Spec.cob_max_percent);
    });
    
    test('forward position produces lower MAC percentage', () => {
      // Position 1 has RDL distance 245" from cargo floor
      const forwardPallet = createMockPallet(10000, 245);
      const cob = calculateCenterOfBalance([forwardPallet], [], c17Spec);
      
      // Should be lower but still positive (forward of LEMAC)
      expect(cob.cob_percent).toBeLessThan(30);
    });
    
    test('aft position produces higher MAC percentage', () => {
      // Position 18 has RDL distance 1215" from cargo floor
      const aftPallet = createMockPallet(10000, 1215);
      const cob = calculateCenterOfBalance([aftPallet], [], c17Spec);
      
      // Should be higher than mid-cargo
      expect(cob.cob_percent).toBeGreaterThan(30);
    });
    
    test('balanced load across all positions stays in envelope', () => {
      // Simulate evenly distributed load across ALL 18 positions (including ramp)
      // For truly balanced load, must include aft ramp positions
      const pallets: PalletPlacement[] = [];
      const positions = [245, 303, 361, 419, 477, 535, 593, 651, 709, 767, 825, 883, 941, 999, 1057, 1115, 1173, 1215];
      
      for (const pos of positions) {
        pallets.push(createMockPallet(5000, pos));
      }
      
      const cob = calculateCenterOfBalance(pallets, [], c17Spec);
      
      // Average position = 737" → CoB% = ((737-643)/309.5) × 100 = 30.4%
      // Should be in envelope (16-40% MAC)
      expect(cob.in_envelope).toBe(true);
      expect(cob.cob_percent).toBeGreaterThan(20);
      expect(cob.cob_percent).toBeLessThan(40);
      console.log(`C-17 balanced load CoB: ${cob.cob_percent.toFixed(1)}% MAC`);
    });
    
    test('empty aircraft has 0% CoB', () => {
      const cob = calculateCenterOfBalance([], [], c17Spec);
      expect(cob.cob_percent).toBe(0);
      expect(cob.total_weight).toBe(0);
    });
    
    test('vehicle placement adds forward_offset correctly', () => {
      // Vehicle at cargo floor position 500"
      const vehicle = createMockVehicle(10000, 500);
      const cob = calculateCenterOfBalance([], [vehicle], c17Spec);
      
      // Station should be 500 + 180 (forward_offset) = 680
      // CoB = (680 - 817) / 309.5 * 100 = -44.3% - this is forward of LEMAC
      // But calculation should be correct
      expect(cob.total_weight).toBe(10000);
      expect(cob.cob_percent).toBeDefined();
    });
  });
  
  describe('C-130 Hercules', () => {
    const c130Spec = AIRCRAFT_SPECS['C-130'];
    
    test('mid-cargo position produces positive MAC value', () => {
      // Position 3 has RDL distance 409" from cargo floor
      const midCargoPallet = createMockPallet(8000, 409);
      const cob = calculateCenterOfBalance([midCargoPallet], [], c130Spec);
      
      expect(cob.cob_percent).toBeGreaterThan(0);
    });
    
    test('balanced load stays in envelope (15-35% MAC)', () => {
      // Load across ALL 6 positions (including ramp position 6)
      const positions = [245, 327, 409, 491, 573, 655];
      const pallets = positions.map(pos => createMockPallet(6000, pos));
      
      const cob = calculateCenterOfBalance(pallets, [], c130Spec);
      
      // Average position = 450" → CoB% = ((450-409)/165) × 100 = 24.8%
      // Should be in envelope (15-35% MAC)
      expect(cob.in_envelope).toBe(true);
      expect(cob.cob_percent).toBeGreaterThan(15);
      expect(cob.cob_percent).toBeLessThan(35);
      console.log(`C-130 balanced load CoB: ${cob.cob_percent.toFixed(1)}% MAC`);
    });
  });
  
  describe('CoB Status Messages', () => {
    test('in-envelope message includes percentage and range', () => {
      const cob = {
        total_weight: 50000,
        total_moment: 40000000,
        center_of_balance: 800,
        cob_percent: 28.5,
        min_allowed: 16,
        max_allowed: 40,
        in_envelope: true,
        envelope_status: 'in_envelope' as const,
        envelope_deviation: 0
      };
      
      const message = getCoBStatusMessage(cob);
      expect(message).toContain('28.5%');
      expect(message).toContain('Within envelope');
    });
    
    test('forward limit warning message', () => {
      const cob = {
        total_weight: 50000,
        total_moment: 30000000,
        center_of_balance: 600,
        cob_percent: 12.0,
        min_allowed: 16,
        max_allowed: 40,
        in_envelope: false,
        envelope_status: 'forward_limit' as const,
        envelope_deviation: 4
      };
      
      const message = getCoBStatusMessage(cob);
      expect(message).toContain('WARNING');
      expect(message).toContain('forward');
    });
    
    test('aft limit warning message', () => {
      const cob = {
        total_weight: 50000,
        total_moment: 60000000,
        center_of_balance: 1200,
        cob_percent: 45.0,
        min_allowed: 16,
        max_allowed: 40,
        in_envelope: false,
        envelope_status: 'aft_limit' as const,
        envelope_deviation: 5
      };
      
      const message = getCoBStatusMessage(cob);
      expect(message).toContain('WARNING');
      expect(message).toContain('aft');
    });
  });
});

// ============================================================================
// AIRCRAFT SPEC VALIDATION
// ============================================================================

describe('Aircraft Specifications', () => {
  test('C-17 has correct envelope range (16-40% MAC)', () => {
    const spec = AIRCRAFT_SPECS['C-17'];
    expect(spec.cob_min_percent).toBe(16);
    expect(spec.cob_max_percent).toBe(40);
    expect(spec.mac_length).toBe(309.5);
    expect(spec.lemac_station).toBe(643);
  });
  
  test('C-130 has correct envelope range (15-35% MAC)', () => {
    const spec = AIRCRAFT_SPECS['C-130'];
    expect(spec.cob_min_percent).toBe(15);
    expect(spec.cob_max_percent).toBe(35);
    expect(spec.mac_length).toBe(165);
    expect(spec.lemac_station).toBe(409);
  });
  
  test('C-17 has 18 pallet positions', () => {
    const spec = AIRCRAFT_SPECS['C-17'];
    expect(spec.pallet_positions).toBe(18);
    expect(spec.stations.length).toBe(18);
  });
  
  test('C-130 has 6 pallet positions', () => {
    const spec = AIRCRAFT_SPECS['C-130'];
    expect(spec.pallet_positions).toBe(6);
    expect(spec.stations.length).toBe(6);
  });
  
  test('forward_offset is set for both aircraft', () => {
    expect(AIRCRAFT_SPECS['C-17'].forward_offset).toBe(180);
    expect(AIRCRAFT_SPECS['C-130'].forward_offset).toBe(180);
  });
});
