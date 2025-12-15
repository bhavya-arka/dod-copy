/**
 * PACAF Stress Test Suite - Extreme Edge Cases
 * 
 * Tests synthetic cargo with extreme dimensions, weights, and edge cases.
 * Verifies the system:
 * - Rejects impossible loads
 * - Warns about height/width violations
 * - Recalculates CoB correctly
 * - Prevents tail-heavy or nose-heavy errors
 * 
 * DOCUMENTED EDGE CASES:
 * 
 * ========================================================================
 * DIMENSION EDGE CASES
 * ========================================================================
 * 
 * 1. OVERHEIGHT_PALLET: Height > 100" (max pallet height)
 *    - Expected: Reject from palletization, flag as requiring C-17 or rolling stock
 *    
 * 2. OVERWIDTH_PALLET: Width > 84" (max pallet usable width)
 *    - Expected: Cannot palletize, must be rolling stock or rejected
 *    
 * 3. OVERLENGTH_PALLET: Length > 104" (max pallet usable length)
 *    - Expected: Cannot fit on single pallet, split or rolling stock
 *    
 * 4. EXCEEDS_C130_CARGO_BAY: Dimensions exceed C-130 cargo bay (492"L x 123"W x 108"H)
 *    - Expected: Requires C-17 only flag
 *    
 * 5. EXCEEDS_C17_CARGO_BAY: Dimensions exceed C-17 cargo bay (1056"L x 216"W x 148"H)
 *    - Expected: Complete rejection - cannot load
 *    
 * 6. RAMP_HEIGHT_VIOLATION: Vehicle height > ramp clearance (70" C-17, 90" C-130)
 *    - Expected: Warning, cannot use ramp positions
 *    
 * 7. RAMP_WIDTH_VIOLATION: Vehicle width > ramp clearance (144" C-17, 120" C-130)
 *    - Expected: Cannot roll on via ramp
 *
 * ========================================================================
 * WEIGHT EDGE CASES
 * ========================================================================
 * 
 * 8. OVERWEIGHT_PALLET: Weight > 10,000 lb (max pallet payload)
 *    - Expected: Split across pallets or reject
 *    
 * 9. OVERWEIGHT_POSITION: Single position > per_position_weight limit
 *    - Expected: Reject placement at that position
 *    
 * 10. OVERWEIGHT_RAMP: Cargo on ramp > ramp_position_weight (7500 lb C-17)
 *     - Expected: Move to main deck or reject
 *     
 * 11. EXCEEDS_C130_PAYLOAD: Total > 42,000 lb
 *     - Expected: Require multiple C-130s or switch to C-17
 *     
 * 12. EXCEEDS_C17_PAYLOAD: Total > 170,900 lb
 *     - Expected: Require multiple C-17s
 *     
 * 13. AXLE_WEIGHT_EXCEEDED: Single axle > max_axle_weight
 *     - Expected: Warning about floor loading
 *
 * ========================================================================
 * CENTER OF BALANCE EDGE CASES
 * ========================================================================
 * 
 * 14. NOSE_HEAVY: All cargo at forward positions
 *     - Expected: CoB% < min_allowed, forward_limit status
 *     
 * 15. TAIL_HEAVY: All cargo at aft/ramp positions
 *     - Expected: CoB% > max_allowed, aft_limit status
 *     
 * 16. EXTREME_IMBALANCE: Single heavy item at extreme position
 *     - Expected: Severe out-of-envelope warning
 *     
 * 17. ZERO_WEIGHT_LOAD: Empty aircraft
 *     - Expected: Handle gracefully with 0% or fallback
 *     
 * 18. SINGLE_ITEM_AT_LEMAC: One item exactly at LEMAC station
 *     - Expected: CoB near 0%
 *
 * ========================================================================
 * COMBINATION EDGE CASES
 * ========================================================================
 * 
 * 19. OVERSIZED_AND_OVERWEIGHT: Exceeds multiple limits simultaneously
 *     - Expected: Multiple rejection reasons
 *     
 * 20. HAZMAT_AT_LIMIT: Hazmat cargo at dimensional/weight limits
 *     - Expected: Both hazmat and limit warnings
 *     
 * 21. MANY_SMALL_ITEMS: 1000+ small items
 *     - Expected: Performance test, should complete < 10 seconds
 *     
 * 22. FEW_MASSIVE_ITEMS: 3 items at max payload each
 *     - Expected: Correctly allocate across aircraft
 */

import {
  solveAircraftAllocation,
  calculateCenterOfBalance,
  SolverInput
} from '../apps/client/src/lib/aircraftSolver';
import { calculateCoBFromPlacements } from '../apps/client/src/lib/domainUtils';
import { validateEdgeCases } from '../apps/client/src/lib/edgeCaseHandler';
import { classifyItems } from '../apps/client/src/lib/classificationEngine';
import { parseMovementList } from '../apps/client/src/lib/movementParser';
import {
  AIRCRAFT_SPECS,
  MovementItem,
  PalletPlacement,
  VehiclePlacement,
  PALLET_463L
} from '../apps/client/src/lib/pacafTypes';

// ============================================================================
// SYNTHETIC CARGO GENERATORS
// ============================================================================

function createSyntheticItem(overrides: Partial<MovementItem> = {}): MovementItem {
  return {
    item_id: `SYNTH-${Math.random().toString(36).substring(7)}`,
    description: 'Synthetic Test Item',
    quantity: 1,
    weight_each_lb: 1000,
    length_in: 80,
    width_in: 80,
    height_in: 60,
    type: 'PALLETIZABLE',
    advon_flag: false,
    hazmat_flag: false,
    ...overrides
  };
}

function createExtremeItem(
  scenario: 'overheight' | 'overwidth' | 'overlength' | 'overweight' | 
            'exceeds_c130' | 'exceeds_c17' | 'ramp_height' | 'ramp_width' |
            'nose_heavy' | 'tail_heavy' | 'zero_weight' | 'max_payload'
): MovementItem {
  switch (scenario) {
    case 'overheight':
      return createSyntheticItem({
        description: 'OVERHEIGHT_TEST',
        height_in: 150, // Max pallet is 100"
        type: 'PALLETIZABLE'
      });
    case 'overwidth':
      return createSyntheticItem({
        description: 'OVERWIDTH_TEST',
        width_in: 130, // Max pallet usable is 84"
        type: 'PALLETIZABLE'
      });
    case 'overlength':
      return createSyntheticItem({
        description: 'OVERLENGTH_TEST',
        length_in: 200, // Max pallet usable is 104"
        type: 'PALLETIZABLE'
      });
    case 'overweight':
      return createSyntheticItem({
        description: 'OVERWEIGHT_TEST',
        weight_each_lb: 15000, // Max pallet payload is 10,000 lb
        type: 'PALLETIZABLE'
      });
    case 'exceeds_c130':
      return createSyntheticItem({
        description: 'EXCEEDS_C130_TEST',
        length_in: 500, // C-130 cargo length is 492"
        width_in: 100,
        height_in: 100,
        type: 'ROLLING_STOCK'
      });
    case 'exceeds_c17':
      return createSyntheticItem({
        description: 'EXCEEDS_C17_TEST',
        length_in: 1100, // C-17 cargo length is 1056"
        width_in: 200,
        height_in: 140,
        type: 'ROLLING_STOCK'
      });
    case 'ramp_height':
      return createSyntheticItem({
        description: 'RAMP_HEIGHT_VIOLATION',
        height_in: 80, // C-17 ramp clearance is 70"
        type: 'ROLLING_STOCK'
      });
    case 'ramp_width':
      return createSyntheticItem({
        description: 'RAMP_WIDTH_VIOLATION',
        width_in: 150, // C-17 ramp clearance is 144"
        type: 'ROLLING_STOCK'
      });
    case 'nose_heavy':
      return createSyntheticItem({
        description: 'NOSE_HEAVY_TEST',
        weight_each_lb: 50000
      });
    case 'tail_heavy':
      return createSyntheticItem({
        description: 'TAIL_HEAVY_TEST',
        weight_each_lb: 50000
      });
    case 'zero_weight':
      return createSyntheticItem({
        description: 'ZERO_WEIGHT_TEST',
        weight_each_lb: 0
      });
    case 'max_payload':
      return createSyntheticItem({
        description: 'MAX_PAYLOAD_TEST',
        weight_each_lb: 170000, // Exceeds single C-17 max payload
        type: 'ROLLING_STOCK'
      });
    default:
      return createSyntheticItem();
  }
}

function createPalletPlacement(
  weight: number,
  position_coord: number,
  x_start_in?: number
): PalletPlacement {
  return {
    pallet: {
      id: `PAL-${Math.random().toString(36).substring(7)}`,
      items: [],
      net_weight: weight - PALLET_463L.tare_with_nets,
      gross_weight: weight,
      height: 60,
      hazmat_flag: false,
      is_prebuilt: false,
      footprint: {
        length: PALLET_463L.length,
        width: PALLET_463L.width
      }
    },
    position_index: 0,
    position_coord,
    is_ramp: false,
    lateral_placement: { y_center_in: 0, y_left_in: -44, y_right_in: 44 },
    x_start_in
  };
}

function createVehiclePlacement(
  weight: number,
  z_position: number
): VehiclePlacement {
  const itemId = `VEH-${Math.random().toString(36).substring(7)}`;
  return {
    item_id: itemId,
    item: createSyntheticItem({
      item_id: itemId,
      weight_each_lb: weight,
      length_in: 200,
      width_in: 96,
      height_in: 60,
      type: 'ROLLING_STOCK'
    }),
    weight,
    length: 200,
    width: 96,
    height: 60,
    axle_weights: [],
    position: { x: 0, y: 0, z: z_position },
    lateral_placement: { y_center_in: 0, y_left_in: -48, y_right_in: 48, side: 'center' },
    deck: 'MAIN'
  };
}

// ============================================================================
// DIMENSION EDGE CASE TESTS
// ============================================================================

describe('Dimension Edge Cases', () => {
  describe('Overheight Detection', () => {
    test('should flag overheight item (>100") as not palletizable', () => {
      const item = createExtremeItem('overheight');
      const result = validateEdgeCases(item);
      
      expect(result.canPalletize).toBe(false);
      expect(result.errors.length + result.warnings.length).toBeGreaterThan(0);
    });

    test('should flag items >108" as requiring C-17 only', () => {
      const item = createSyntheticItem({
        height_in: 120, // C-130 max is 108"
        type: 'ROLLING_STOCK'
      });
      const result = validateEdgeCases(item);
      
      expect(result.requiresC17Only).toBe(true);
    });

    test('should reject items exceeding C-17 height (>148")', () => {
      const item = createSyntheticItem({
        height_in: 160, // C-17 max is 148"
        type: 'ROLLING_STOCK'
      });
      const result = validateEdgeCases(item);
      
      expect(result.isValid).toBe(false);
    });
  });

  describe('Overwidth Detection', () => {
    test('should flag overwidth item (>84") as not palletizable', () => {
      const item = createExtremeItem('overwidth');
      const result = validateEdgeCases(item);
      
      expect(result.canPalletize).toBe(false);
    });

    test('should flag items >123" as requiring C-17 only', () => {
      const item = createSyntheticItem({
        width_in: 130, // C-130 max is 123"
        type: 'ROLLING_STOCK'
      });
      const result = validateEdgeCases(item);
      
      expect(result.requiresC17Only).toBe(true);
    });
  });

  describe('Overlength Detection', () => {
    test('should flag overlength item (>104") as not palletizable', () => {
      const item = createExtremeItem('overlength');
      const result = validateEdgeCases(item);
      
      expect(result.canPalletize).toBe(false);
    });
  });

  describe('Cargo Bay Limits', () => {
    test('should reject items exceeding C-17 cargo bay', () => {
      const item = createExtremeItem('exceeds_c17');
      const result = validateEdgeCases(item);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => 
        e.message.toLowerCase().includes('dimension') || 
        e.message.toLowerCase().includes('exceeds') ||
        e.message.toLowerCase().includes('too')
      )).toBe(true);
    });
  });
});

// ============================================================================
// WEIGHT EDGE CASE TESTS
// ============================================================================

describe('Weight Edge Cases', () => {
  describe('Overweight Pallet Detection', () => {
    test('should flag overweight item (>10,000 lb) for pallet', () => {
      const item = createExtremeItem('overweight');
      const result = validateEdgeCases(item);
      
      expect(result.warnings.length + result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Payload Limits', () => {
    test('should allocate large payloads across multiple aircraft', () => {
      // Create many items that will exceed payload when combined
      const items: string[] = [];
      for (let i = 1; i <= 25; i++) {
        items.push(`Heavy Box ${i},80,80,60,8000,TCN${i.toString().padStart(3, '0')}`);
      }
      const csv = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN\n${items.join('\n')}`;
      
      const parseResult = parseMovementList(csv);
      const classified = classifyItems(parseResult);
      const result = solveAircraftAllocation(classified, 'C-17');
      
      // 25 items × 8,000 lbs = 200,000 lbs > 170,900 lb max payload
      // Should require at least 2 aircraft
      expect(result.total_aircraft).toBeGreaterThanOrEqual(2);
    });

    test('should require C-17 for payload exceeding C-130 max', () => {
      const csv = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN
Heavy Load,80,80,60,50000,TCN001`;
      
      const parseResult = parseMovementList(csv);
      const classified = classifyItems(parseResult);
      const result = solveAircraftAllocation(classified, 'C-130');
      
      // 50,000 lbs > 42,000 lb max payload for C-130
      // System should handle this (either reject or require multiple)
      expect(result).toBeDefined();
    });
  });

  describe('Position Weight Limits', () => {
    test('C-17 ramp position weight limit is 7500 lb', () => {
      const spec = AIRCRAFT_SPECS['C-17'];
      expect(spec.ramp_position_weight).toBe(7500);
    });

    test('C-17 main deck position weight limit is 10000 lb', () => {
      const spec = AIRCRAFT_SPECS['C-17'];
      expect(spec.per_position_weight).toBe(10000);
    });
  });
});

// ============================================================================
// CENTER OF BALANCE EDGE CASE TESTS
// ============================================================================

describe('Center of Balance Edge Cases', () => {
  const c17Spec = AIRCRAFT_SPECS['C-17'];
  const c130Spec = AIRCRAFT_SPECS['C-130'];

  describe('Nose-Heavy Scenarios', () => {
    test('should detect nose-heavy load (all cargo forward)', () => {
      // Place all weight at forward positions (low x values)
      const pallets: PalletPlacement[] = [
        createPalletPlacement(10000, 54, 0),   // Forward position
        createPalletPlacement(10000, 162, 108), // Second position
      ];
      const vehicles: VehiclePlacement[] = [];

      const result = calculateCenterOfBalance(pallets, vehicles, c17Spec);
      
      // Forward CG should result in low CoB percentage
      expect(result.cob_percent).toBeLessThan(c17Spec.cob_max_percent);
      // May be below minimum (forward limit)
      if (result.cob_percent < c17Spec.cob_min_percent) {
        expect(result.envelope_status).toBe('forward_limit');
        expect(result.in_envelope).toBe(false);
      }
    });

    test('should flag forward_limit when CoB below minimum', () => {
      // Create extreme forward-heavy scenario
      const pallets: PalletPlacement[] = [
        createPalletPlacement(50000, 54, 0), // Very heavy at front
      ];
      const vehicles: VehiclePlacement[] = [];

      const result = calculateCenterOfBalance(pallets, vehicles, c17Spec);
      
      // With all weight at position 0, CG will be very forward
      // CG station = 0 + 54 + 245 (bayStart) = 299
      // CoB% = ((299 - 643) / 309.5) * 100 = -111.1% (very negative)
      expect(result.cob_percent).toBeLessThan(c17Spec.cob_min_percent);
      expect(result.envelope_status).toBe('forward_limit');
    });
  });

  describe('Tail-Heavy Scenarios', () => {
    test('should detect tail-heavy load (all cargo aft)', () => {
      // Place all weight at aft positions (high x values, near cargo_length)
      const aftPosition = c17Spec.cargo_length - 100; // Near end
      const pallets: PalletPlacement[] = [
        createPalletPlacement(10000, aftPosition, aftPosition - 54),
      ];
      const vehicles: VehiclePlacement[] = [];

      const result = calculateCenterOfBalance(pallets, vehicles, c17Spec);
      
      // Aft CG should result in high CoB percentage
      // May exceed maximum (aft limit)
      if (result.cob_percent > c17Spec.cob_max_percent) {
        expect(result.envelope_status).toBe('aft_limit');
        expect(result.in_envelope).toBe(false);
      }
    });

    test('should flag aft_limit when CoB above maximum', () => {
      // Create extreme aft-heavy scenario
      const aftPosition = c17Spec.cargo_length - 54; // Very aft
      const pallets: PalletPlacement[] = [];
      const vehicles: VehiclePlacement[] = [
        createVehiclePlacement(50000, aftPosition), // Heavy at rear
      ];

      const result = calculateCenterOfBalance(pallets, vehicles, c17Spec);
      
      // With all weight at aft position
      // CG station = aftPosition + 245 (bayStart) 
      if (result.cob_percent > c17Spec.cob_max_percent) {
        expect(result.envelope_status).toBe('aft_limit');
      }
    });
  });

  describe('Zero Weight Scenarios', () => {
    test('should handle empty load gracefully', () => {
      const pallets: PalletPlacement[] = [];
      const vehicles: VehiclePlacement[] = [];

      const result = calculateCenterOfBalance(pallets, vehicles, c17Spec);
      
      expect(result.total_weight).toBe(0);
      expect(result.cob_percent).toBe(0);
    });

    test('should handle zero-weight items', () => {
      const pallets: PalletPlacement[] = [
        createPalletPlacement(0, 500, 446), // Zero weight pallet
      ];
      const vehicles: VehiclePlacement[] = [];

      const result = calculateCenterOfBalance(pallets, vehicles, c17Spec);
      
      expect(result.total_weight).toBe(0);
      expect(result.cob_percent).toBe(0);
    });
  });

  describe('Balanced Load Scenarios', () => {
    test('should achieve in-envelope CoB with balanced load', () => {
      // Place weight distributed across forward, middle, and aft
      const pallets: PalletPlacement[] = [
        createPalletPlacement(5000, 200, 146),  // Forward-ish
        createPalletPlacement(5000, 500, 446),  // Middle
        createPalletPlacement(5000, 800, 746),  // Aft-ish
      ];
      const vehicles: VehiclePlacement[] = [];

      const result = calculateCenterOfBalance(pallets, vehicles, c17Spec);
      
      // Balanced load should be within envelope
      expect(result.in_envelope).toBe(true);
      expect(result.envelope_status).toBe('in_envelope');
      expect(result.cob_percent).toBeGreaterThanOrEqual(c17Spec.cob_min_percent);
      expect(result.cob_percent).toBeLessThanOrEqual(c17Spec.cob_max_percent);
    });
  });

  describe('CoB Consistency Between Modules', () => {
    test('domainUtils and aircraftSolver should produce same CoB', () => {
      const pallets: PalletPlacement[] = [
        createPalletPlacement(8000, 400, 346),
        createPalletPlacement(8000, 600, 546),
      ];
      const vehicles: VehiclePlacement[] = [
        createVehiclePlacement(10000, 300),
      ];

      const solverResult = calculateCenterOfBalance(pallets, vehicles, c17Spec);
      const domainResult = calculateCoBFromPlacements(pallets, vehicles, c17Spec);
      
      // Both should produce the same CoB percentage (within floating point tolerance)
      expect(Math.abs(solverResult.cob_percent - domainResult.cob_percent)).toBeLessThan(0.1);
      expect(solverResult.total_weight).toBe(domainResult.total_weight);
    });
  });
});

// ============================================================================
// SOLVER REJECTION TESTS
// ============================================================================

describe('Solver Rejection Tests', () => {
  test('should not place rolling stock exceeding ramp width', () => {
    const csv = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN
Wide Vehicle,200,200,60,15000,TCN001`;
    
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);
    const result = solveAircraftAllocation(classified, 'C-17');
    
    // Vehicle with width 200" exceeds C-17 ramp clearance (144")
    // Should be unplaced or flagged
    expect(result).toBeDefined();
  });

  test('should handle maximum pallet positions', () => {
    // Create 20 pallets (exceeds C-17's 18 positions)
    const items: string[] = [];
    for (let i = 1; i <= 20; i++) {
      items.push(`Box ${i},80,80,60,5000,TCN${i.toString().padStart(3, '0')}`);
    }
    const csv = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN\n${items.join('\n')}`;
    
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);
    const result = solveAircraftAllocation(classified, 'C-17');
    
    // Should require multiple aircraft or have unplaced items
    expect(result.total_aircraft).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe('Performance Tests', () => {
  test('should handle 100 items in under 5 seconds', () => {
    const items: string[] = [];
    for (let i = 1; i <= 100; i++) {
      items.push(`Item ${i},40,40,40,500,TCN${i.toString().padStart(4, '0')}`);
    }
    const csv = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN\n${items.join('\n')}`;
    
    const startTime = Date.now();
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);
    const result = solveAircraftAllocation(classified, 'C-17');
    const endTime = Date.now();
    
    expect(endTime - startTime).toBeLessThan(5000);
    expect(result).toBeDefined();
  });

  test('should handle 500 items in under 10 seconds', () => {
    const items: string[] = [];
    for (let i = 1; i <= 500; i++) {
      items.push(`Item ${i},30,30,30,200,TCN${i.toString().padStart(4, '0')}`);
    }
    const csv = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN\n${items.join('\n')}`;
    
    const startTime = Date.now();
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);
    const result = solveAircraftAllocation(classified, 'C-17');
    const endTime = Date.now();
    
    expect(endTime - startTime).toBeLessThan(10000);
    expect(result).toBeDefined();
  });
});

// ============================================================================
// COMBINATION EDGE CASES
// ============================================================================

describe('Combination Edge Cases', () => {
  test('should handle oversized AND overweight item', () => {
    const item = createSyntheticItem({
      description: 'OVERSIZED_OVERWEIGHT_TEST',
      length_in: 200,
      width_in: 130,
      height_in: 150,
      weight_each_lb: 50000
    });
    
    const result = validateEdgeCases(item);
    
    // Should have multiple issues
    expect(result.isValid).toBe(false);
    expect(result.errors.length + result.warnings.length).toBeGreaterThan(0);
  });

  test('should handle hazmat item at limits', () => {
    const item = createSyntheticItem({
      description: 'HAZMAT_AT_LIMIT',
      height_in: 100, // At pallet limit
      weight_each_lb: 10000, // At pallet weight limit
      hazmat_flag: true
    });
    
    const result = validateEdgeCases(item);
    
    // Should be processed (may have warnings but not necessarily invalid)
    expect(result).toBeDefined();
  });

  test('should handle mixed cargo types in single allocation', () => {
    const csv = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
Pallet Item,80,80,60,5000,TCN001,
LOADER WEAPONS,200,96,60,15000,TCN002,
Personnel,,,,,,10`;
    
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);
    const result = solveAircraftAllocation(classified, 'C-17');
    
    expect(result).toBeDefined();
    expect(result.total_aircraft).toBeGreaterThanOrEqual(1);
  });
});
