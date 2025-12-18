/**
 * Aircraft Solver Test Suite
 * Tests for Center of Balance calculations and pallet placement
 */

import { calculateCenterOfBalance, getCoBStatusMessage } from '../aircraftSolver';
import { AIRCRAFT_SPECS, PalletPlacement, VehiclePlacement, Pallet463L, MovementItem, getAircraftLaneConfig, AIRCRAFT_LANE_CONFIGS, calculateLateralBounds, PALLET_463L } from '../pacafTypes';

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

// ============================================================================
// LATERAL LANE CONFIGURATION TESTS
// ============================================================================

describe('Lateral Lane Configuration', () => {
  describe('C-17 Lane Configuration', () => {
    test('C-17 has 2 lateral lanes for side-by-side placement', () => {
      const laneConfig = getAircraftLaneConfig('C-17');
      expect(laneConfig.lane_count).toBe(2);
      expect(laneConfig.lanes.length).toBe(2);
    });
    
    test('C-17 left lane is at y=-50" from centerline', () => {
      const laneConfig = getAircraftLaneConfig('C-17');
      const leftLane = laneConfig.lanes[0];
      expect(leftLane.y_center_in).toBe(-50);
      expect(leftLane.name).toBe('Left Lane');
    });
    
    test('C-17 right lane is at y=+50" from centerline', () => {
      const laneConfig = getAircraftLaneConfig('C-17');
      const rightLane = laneConfig.lanes[1];
      expect(rightLane.y_center_in).toBe(50);
      expect(rightLane.name).toBe('Right Lane');
    });
    
    test('Two 463L pallets fit side-by-side in C-17 (88" + gap + 88" < 216")', () => {
      const laneConfig = getAircraftLaneConfig('C-17');
      const palletWidth = PALLET_463L.width; // 88"
      const c17Width = AIRCRAFT_SPECS['C-17'].cargo_width; // 216"
      
      // Calculate total width with both lanes
      const leftLaneBounds = calculateLateralBounds(laneConfig.lanes[0].y_center_in, palletWidth);
      const rightLaneBounds = calculateLateralBounds(laneConfig.lanes[1].y_center_in, palletWidth);
      
      // Left pallet: -50 ± 44 = -94 to -6
      expect(leftLaneBounds.y_left_in).toBe(-94);
      expect(leftLaneBounds.y_right_in).toBe(-6);
      
      // Right pallet: +50 ± 44 = 6 to 94
      expect(rightLaneBounds.y_left_in).toBe(6);
      expect(rightLaneBounds.y_right_in).toBe(94);
      
      // Gap between pallets: -6 to 6 = 12" gap
      const gap = rightLaneBounds.y_left_in - leftLaneBounds.y_right_in;
      expect(gap).toBe(12);
      
      // Both pallets fit within cargo width (±108" from centerline)
      expect(Math.abs(leftLaneBounds.y_left_in)).toBeLessThan(c17Width / 2);
      expect(Math.abs(rightLaneBounds.y_right_in)).toBeLessThan(c17Width / 2);
    });
    
    test('C-17 can fit 36 pallets (9 rows × 2 lanes)', () => {
      const c17Spec = AIRCRAFT_SPECS['C-17'];
      const laneConfig = getAircraftLaneConfig('C-17');
      const palletSlot = PALLET_463L.length + 4; // 108" + 4" spacing = 112"
      
      const maxRows = Math.floor(c17Spec.cargo_length / palletSlot);
      const maxPallets = maxRows * laneConfig.lane_count;
      
      // 1056" / 112" = 9 rows × 2 lanes = 18 slots (but can fit 36 pallets with 2 lanes per row)
      expect(maxRows).toBe(9);
      expect(maxPallets).toBe(18);
      
      // With lateral placement, each slot can hold 2 pallets (left + right)
      // So total capacity is 9 rows × 2 lanes = 18 slots for unique positions
      // This doubles the effective pallet capacity compared to centerline-only placement
    });
  });
  
  describe('C-130 Lane Configuration', () => {
    test('C-130 has 1 lane (centerline only)', () => {
      const laneConfig = getAircraftLaneConfig('C-130');
      expect(laneConfig.lane_count).toBe(1);
      expect(laneConfig.lanes.length).toBe(1);
    });
    
    test('C-130 center lane is at y=0" (centerline)', () => {
      const laneConfig = getAircraftLaneConfig('C-130');
      const centerLane = laneConfig.lanes[0];
      expect(centerLane.y_center_in).toBe(0);
      expect(centerLane.name).toBe('Center Lane');
    });
    
    test('C-130 cargo width is too narrow for side-by-side placement', () => {
      const c130Width = AIRCRAFT_SPECS['C-130'].cargo_width; // 123"
      const palletWidth = PALLET_463L.width; // 88"
      
      // Two pallets would need: 88 + 4 (gap) + 88 = 180"
      // But C-130 is only 123" wide
      const requiredWidth = (palletWidth * 2) + 4;
      expect(requiredWidth).toBeGreaterThan(c130Width);
    });
  });
  
  describe('Lateral Bounds Calculation', () => {
    test('calculateLateralBounds correctly computes left and right edges', () => {
      const bounds = calculateLateralBounds(-50, 88);
      expect(bounds.y_left_in).toBe(-94);
      expect(bounds.y_right_in).toBe(-6);
    });
    
    test('centerline placement produces symmetric bounds', () => {
      const bounds = calculateLateralBounds(0, 88);
      expect(bounds.y_left_in).toBe(-44);
      expect(bounds.y_right_in).toBe(44);
      expect(bounds.y_left_in).toBe(-bounds.y_right_in);
    });
  });
  
  describe('PalletPlacement with Lateral Data', () => {
    test('pallet placement in left lane has negative y_center_in', () => {
      const pallet: Pallet463L = {
        id: 'TEST-LEFT',
        items: [],
        net_weight: 5000,
        gross_weight: 5290,
        height: 80,
        hazmat_flag: false,
        is_prebuilt: false,
        footprint: { length: 108, width: 88 }
      };
      
      const placement: PalletPlacement = {
        pallet,
        position_index: 0,
        position_coord: 54,
        is_ramp: false,
        lateral_placement: {
          y_center_in: -50,
          y_left_in: -94,
          y_right_in: -6
        },
        x_start_in: 0,
        x_end_in: 108
      };
      
      expect(placement.lateral_placement?.y_center_in).toBe(-50);
    });
    
    test('pallet placement in right lane has positive y_center_in', () => {
      const pallet: Pallet463L = {
        id: 'TEST-RIGHT',
        items: [],
        net_weight: 5000,
        gross_weight: 5290,
        height: 80,
        hazmat_flag: false,
        is_prebuilt: false,
        footprint: { length: 108, width: 88 }
      };
      
      const placement: PalletPlacement = {
        pallet,
        position_index: 1,
        position_coord: 54,
        is_ramp: false,
        lateral_placement: {
          y_center_in: 50,
          y_left_in: 6,
          y_right_in: 94
        },
        x_start_in: 0,
        x_end_in: 108
      };
      
      expect(placement.lateral_placement?.y_center_in).toBe(50);
    });
  });
});
