/**
 * Edge Case Handler Test Suite
 * Tests for apps/client/src/lib/edgeCaseHandler.ts
 */

import {
  validateEdgeCases,
  checkHazmatPaxConflict,
  validatePrebuiltPalletIntegrity,
  validateStationPlacement,
  calculateTiedownRequirements,
  validateVehicleConstraints,
  validateRampLoading,
  detectDuplicateTCN
} from '../../lib/edgeCaseHandler';
import { MovementItem, AIRCRAFT_SPECS, PALLET_463L } from '../../lib/pacafTypes';

const createTestItem = (overrides: Partial<MovementItem> = {}): MovementItem => ({
  item_id: 'test-001',
  description: 'Test Item',
  quantity: 1,
  weight_each_lb: 5000,
  length_in: 88,
  width_in: 108,
  height_in: 80,
  type: 'PALLETIZABLE',
  advon_flag: false,
  hazmat_flag: false,
  ...overrides
});

describe('edgeCaseHandler', () => {
  describe('validateEdgeCases - Overheight items', () => {
    it('should flag items over 100 inches as cannot palletize', () => {
      const item = createTestItem({ height_in: 110 });
      const result = validateEdgeCases(item);
      expect(result.canPalletize).toBe(false);
      expect(result.mustBeRollingStock).toBe(true);
    });

    it('should flag items over C-130 height limit as C-17 only', () => {
      const c130Height = AIRCRAFT_SPECS['C-130'].cargo_height;
      const item = createTestItem({ height_in: c130Height + 10 });
      const result = validateEdgeCases(item);
      expect(result.requiresC17Only).toBe(true);
    });

    it('should flag items over C-17 height limit as cannot load', () => {
      const c17Height = AIRCRAFT_SPECS['C-17'].cargo_height;
      const item = createTestItem({ height_in: c17Height + 10 });
      const result = validateEdgeCases(item);
      expect(result.cannotLoad).toBe(true);
    });

    it('should allow items under 100 inches to be palletized', () => {
      const item = createTestItem({ height_in: 96 });
      const result = validateEdgeCases(item);
      expect(result.canPalletize).toBe(true);
    });
  });

  describe('validateEdgeCases - Overwidth items', () => {
    it('should flag items over pallet usable width as cannot palletize', () => {
      const item = createTestItem({ width_in: 120, length_in: 60 });
      const result = validateEdgeCases(item);
      expect(result.canPalletize).toBe(false);
      expect(result.mustBeRollingStock).toBe(true);
    });

    it('should flag items over C-130 ramp width as C-17 only', () => {
      const c130Width = AIRCRAFT_SPECS['C-130'].ramp_clearance_width;
      const item = createTestItem({ width_in: c130Width + 10, length_in: 60 });
      const result = validateEdgeCases(item);
      expect(result.requiresC17Only).toBe(true);
    });

    it('should flag items over C-17 ramp width as cannot load', () => {
      const c17Width = AIRCRAFT_SPECS['C-17'].ramp_clearance_width;
      const item = createTestItem({ width_in: c17Width + 10, length_in: 60 });
      const result = validateEdgeCases(item);
      expect(result.cannotLoad).toBe(true);
    });

    it('should NOT flag 463L footprint items as overwidth', () => {
      const item = createTestItem({ length_in: 88, width_in: 108 });
      const result = validateEdgeCases(item);
      expect(result.canPalletize).toBe(true);
    });
  });

  describe('checkHazmatPaxConflict', () => {
    it('should warn when HAZMAT and PAX are both present', () => {
      const hazmatItems: MovementItem[] = [
        createTestItem({ hazmat_flag: true, description: 'HAZMAT Cargo' })
      ];
      const paxItems: MovementItem[] = [
        createTestItem({ type: 'PAX', pax_count: 10, description: 'Passengers' })
      ];
      const warnings = checkHazmatPaxConflict(hazmatItems, paxItems);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0].message).toContain('HAZMAT');
    });

    it('should not warn when only HAZMAT present', () => {
      const hazmatItems: MovementItem[] = [
        createTestItem({ hazmat_flag: true })
      ];
      const paxItems: MovementItem[] = [];
      const warnings = checkHazmatPaxConflict(hazmatItems, paxItems);
      expect(warnings.length).toBe(0);
    });

    it('should not warn when only PAX present', () => {
      const hazmatItems: MovementItem[] = [];
      const paxItems: MovementItem[] = [
        createTestItem({ type: 'PAX', pax_count: 10 })
      ];
      const warnings = checkHazmatPaxConflict(hazmatItems, paxItems);
      expect(warnings.length).toBe(0);
    });
  });

  describe('validatePrebuiltPalletIntegrity', () => {
    it('should warn when prebuilt pallet has no pallet_id', () => {
      const item = createTestItem({ type: 'PREBUILT_PALLET', pallet_id: undefined });
      const errors = validatePrebuiltPalletIntegrity(item);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should not warn when prebuilt pallet has pallet_id', () => {
      const item = createTestItem({ type: 'PREBUILT_PALLET', pallet_id: 'P001' });
      const errors = validatePrebuiltPalletIntegrity(item);
      expect(errors.length).toBe(0);
    });

    it('should not check non-prebuilt items', () => {
      const item = createTestItem({ type: 'PALLETIZABLE' });
      const errors = validatePrebuiltPalletIntegrity(item);
      expect(errors.length).toBe(0);
    });
  });

  describe('validateEdgeCases - Heavy vehicles', () => {
    it('should flag items over per-position weight as rolling stock', () => {
      const heavyWeight = AIRCRAFT_SPECS['C-17'].per_position_weight + 1000;
      const item = createTestItem({ weight_each_lb: heavyWeight });
      const result = validateEdgeCases(item);
      expect(result.canPalletize).toBe(false);
      expect(result.mustBeRollingStock).toBe(true);
    });

    it('should flag items over C-130 payload as C-17 only', () => {
      const c130Payload = AIRCRAFT_SPECS['C-130'].max_payload;
      const item = createTestItem({ weight_each_lb: c130Payload + 1000 });
      const result = validateEdgeCases(item);
      expect(result.requiresC17Only).toBe(true);
    });

    it('should flag items over C-17 payload as cannot load', () => {
      const c17Payload = AIRCRAFT_SPECS['C-17'].max_payload;
      const item = createTestItem({ weight_each_lb: c17Payload + 1000 });
      const result = validateEdgeCases(item);
      expect(result.cannotLoad).toBe(true);
    });
  });

  describe('validateRampLoading', () => {
    it('should fail for items exceeding ramp height', () => {
      const c17RampHeight = AIRCRAFT_SPECS['C-17'].ramp_clearance_height;
      const item = createTestItem({ height_in: c17RampHeight + 10 });
      const result = validateRampLoading(item, 'C-17');
      expect(result.canLoadViaRamp).toBe(false);
    });

    it('should fail for items exceeding ramp width', () => {
      const c17RampWidth = AIRCRAFT_SPECS['C-17'].ramp_clearance_width;
      const item = createTestItem({ width_in: c17RampWidth + 10 });
      const result = validateRampLoading(item, 'C-17');
      expect(result.canLoadViaRamp).toBe(false);
    });

    it('should pass for items within ramp limits', () => {
      const item = createTestItem({ height_in: 60, width_in: 100 });
      const result = validateRampLoading(item, 'C-17');
      expect(result.canLoadViaRamp).toBe(true);
    });

    it('should warn for heavy items on steep ramp', () => {
      const item = createTestItem({ weight_each_lb: 25000, height_in: 60, width_in: 100 });
      const result = validateRampLoading(item, 'C-130');
      const rampWarning = result.warnings.find(w => w.code === 'WARN_RAMP_ANGLE');
      expect(rampWarning).toBeDefined();
    });
  });

  describe('validateStationPlacement', () => {
    it('should validate placement at valid position', () => {
      const item = createTestItem({ height_in: 80, width_in: 100, weight_each_lb: 5000 });
      const result = validateStationPlacement(item, 'C-17', 1);
      expect(result.valid).toBe(true);
    });

    it('should fail for invalid position number', () => {
      const item = createTestItem();
      const result = validateStationPlacement(item, 'C-17', 99);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should fail when height exceeds station limit', () => {
      const item = createTestItem({ height_in: 200 });
      const result = validateStationPlacement(item, 'C-17', 1);
      expect(result.valid).toBe(false);
    });

    it('should fail when weight exceeds station limit', () => {
      const item = createTestItem({ weight_each_lb: 15000 });
      const result = validateStationPlacement(item, 'C-17', 1);
      expect(result.valid).toBe(false);
    });

    it('should require shoring for heavy items at ramp positions', () => {
      const item = createTestItem({ weight_each_lb: 12000, height_in: 60, width_in: 100 });
      const result = validateStationPlacement(item, 'C-17', 17);
      expect(result.requiredShoring).toBe(true);
    });
  });

  describe('validateVehicleConstraints', () => {
    it('should warn when vehicle exceeds wheelbase limit', () => {
      const c17Wheelbase = AIRCRAFT_SPECS['C-17'].max_vehicle_wheelbase;
      const item = createTestItem({ 
        type: 'ROLLING_STOCK', 
        length_in: c17Wheelbase + 50 
      });
      const result = validateVehicleConstraints(item, 'C-17');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should error when axle weight exceeds limit', () => {
      const c17AxleLimit = AIRCRAFT_SPECS['C-17'].max_axle_weight;
      const item = createTestItem({ 
        type: 'ROLLING_STOCK', 
        axle_weights: [c17AxleLimit + 5000, c17AxleLimit + 5000] 
      });
      const result = validateVehicleConstraints(item, 'C-17');
      expect(result.valid).toBe(false);
    });

    it('should warn about floor loading for heavy rolling stock', () => {
      const item = createTestItem({ 
        type: 'ROLLING_STOCK', 
        weight_each_lb: 50000,
        length_in: 100,
        width_in: 100
      });
      const result = validateVehicleConstraints(item, 'C-130');
      const floorWarning = result.warnings.find(w => w.code === 'WARN_FLOOR_LOADING');
      expect(floorWarning).toBeDefined();
    });
  });

  describe('calculateTiedownRequirements', () => {
    it('should return minimum 4 tiedowns for light items', () => {
      const item = createTestItem({ weight_each_lb: 100 });
      const spec = AIRCRAFT_SPECS['C-17'];
      const tiedowns = calculateTiedownRequirements(item, spec);
      expect(tiedowns).toBe(4);
    });

    it('should calculate tiedowns based on forward G-load', () => {
      const item = createTestItem({ weight_each_lb: 50000 });
      const spec = AIRCRAFT_SPECS['C-17'];
      const tiedowns = calculateTiedownRequirements(item, spec);
      const expectedMin = Math.ceil((50000 * 3) / spec.tiedown_rating_lbs);
      expect(tiedowns).toBeGreaterThanOrEqual(expectedMin);
    });

    it('should return different values for different aircraft', () => {
      const item = createTestItem({ weight_each_lb: 20000 });
      const c17Tiedowns = calculateTiedownRequirements(item, AIRCRAFT_SPECS['C-17']);
      const c130Tiedowns = calculateTiedownRequirements(item, AIRCRAFT_SPECS['C-130']);
      expect(c17Tiedowns).not.toBe(c130Tiedowns);
    });
  });

  describe('detectDuplicateTCN', () => {
    it('should detect duplicate TCNs', () => {
      const items: MovementItem[] = [
        createTestItem({ item_id: '1', tcn: 'TCN001' }),
        createTestItem({ item_id: '2', tcn: 'TCN001' }),
        createTestItem({ item_id: '3', tcn: 'TCN002' })
      ];
      const warnings = detectDuplicateTCN(items);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0].code).toBe('WARN_DUPLICATE_TCN');
    });

    it('should not warn when all TCNs are unique', () => {
      const items: MovementItem[] = [
        createTestItem({ item_id: '1', tcn: 'TCN001' }),
        createTestItem({ item_id: '2', tcn: 'TCN002' }),
        createTestItem({ item_id: '3', tcn: 'TCN003' })
      ];
      const warnings = detectDuplicateTCN(items);
      expect(warnings.length).toBe(0);
    });

    it('should handle items without TCN', () => {
      const items: MovementItem[] = [
        createTestItem({ item_id: '1' }),
        createTestItem({ item_id: '2' })
      ];
      const warnings = detectDuplicateTCN(items);
      expect(warnings.length).toBe(0);
    });

    it('should report count of duplicates', () => {
      const items: MovementItem[] = [
        createTestItem({ item_id: '1', tcn: 'TCN001' }),
        createTestItem({ item_id: '2', tcn: 'TCN001' }),
        createTestItem({ item_id: '3', tcn: 'TCN001' })
      ];
      const warnings = detectDuplicateTCN(items);
      expect(warnings[0].message).toContain('3');
    });
  });

  describe('validateEdgeCases - Zero weight handling', () => {
    it('should correct zero weight to 1 lb', () => {
      const item = createTestItem({ weight_each_lb: 0 });
      const result = validateEdgeCases(item);
      expect(result.adjustedItem.weight_each_lb).toBe(1);
    });

    it('should correct NaN weight to 1 lb', () => {
      const item = createTestItem({ weight_each_lb: NaN });
      const result = validateEdgeCases(item);
      expect(result.adjustedItem.weight_each_lb).toBe(1);
    });

    it('should add warning for zero weight correction', () => {
      const item = createTestItem({ weight_each_lb: 0 });
      const result = validateEdgeCases(item);
      const zeroWeightWarning = result.warnings.find(w => 
        w.message.includes('ZERO_WEIGHT')
      );
      expect(zeroWeightWarning).toBeDefined();
    });
  });

  describe('validateEdgeCases - Invalid dimensions', () => {
    it('should error on zero dimensions for non-PAX items', () => {
      const item = createTestItem({ length_in: 0, width_in: 0, height_in: 0 });
      const result = validateEdgeCases(item);
      const dimError = result.errors.find(e => 
        e.code === 'ERR_DIMENSION_INVALID'
      );
      expect(dimError).toBeDefined();
    });

    it('should not error on zero dimensions for PAX items', () => {
      const item = createTestItem({ 
        type: 'PAX', 
        length_in: 0, 
        width_in: 0, 
        height_in: 0,
        pax_count: 10
      });
      const result = validateEdgeCases(item);
      const dimError = result.errors.find(e => 
        e.code === 'ERR_DIMENSION_INVALID'
      );
      expect(dimError).toBeUndefined();
    });

    it('should error on negative dimensions', () => {
      const item = createTestItem({ length_in: -10 });
      const result = validateEdgeCases(item);
      const dimError = result.errors.find(e => 
        e.code === 'ERR_DIMENSION_INVALID'
      );
      expect(dimError).toBeDefined();
    });
  });

  describe('validateEdgeCases - HAZMAT handling', () => {
    it('should add warning for HAZMAT items', () => {
      const item = createTestItem({ hazmat_flag: true });
      const result = validateEdgeCases(item);
      const hazmatWarning = result.warnings.find(w => 
        w.message.includes('HAZMAT')
      );
      expect(hazmatWarning).toBeDefined();
    });

    it('should suggest aft placement for HAZMAT', () => {
      const item = createTestItem({ hazmat_flag: true });
      const result = validateEdgeCases(item);
      const hazmatWarning = result.warnings.find(w => 
        w.message.includes('HAZMAT')
      );
      expect(hazmatWarning?.message).toContain('aft');
    });
  });

  describe('Edge cases at exact limits', () => {
    it('should allow items at exactly pallet max height', () => {
      const item = createTestItem({ height_in: PALLET_463L.max_height });
      const result = validateEdgeCases(item);
      expect(result.canPalletize).toBe(true);
    });

    it('should flag items 1 inch over pallet max height', () => {
      const item = createTestItem({ height_in: PALLET_463L.max_height + 1 });
      const result = validateEdgeCases(item);
      expect(result.canPalletize).toBe(false);
    });

    it('should allow items at exactly per-position weight', () => {
      const item = createTestItem({ 
        weight_each_lb: AIRCRAFT_SPECS['C-17'].per_position_weight 
      });
      const result = validateEdgeCases(item);
      expect(result.canPalletize).toBe(true);
    });

    it('should flag items 1 lb over per-position weight', () => {
      const item = createTestItem({ 
        weight_each_lb: AIRCRAFT_SPECS['C-17'].per_position_weight + 1 
      });
      const result = validateEdgeCases(item);
      expect(result.canPalletize).toBe(false);
    });
  });
});
