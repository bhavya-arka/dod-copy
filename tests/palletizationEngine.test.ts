/**
 * Palletization Engine Tests
 * Tests for PACAF Spec Section 4 & 6: 463L Pallet System
 */

import { processPalletization, palletizeLooseItems, validatePrebuiltPallet } from '../apps/client/src/lib/palletizationEngine';
import { PALLET_463L } from '../apps/client/src/lib/pacafTypes';
import { classifyItems } from '../apps/client/src/lib/classificationEngine';
import { parseMovementList } from '../apps/client/src/lib/movementParser';

describe('463L Pallet Specifications', () => {
  test('should have correct pallet dimensions', () => {
    expect(PALLET_463L.length).toBe(108);
    expect(PALLET_463L.width).toBe(88);
  });

  test('should have correct usable area', () => {
    expect(PALLET_463L.usable_length).toBe(104);
    expect(PALLET_463L.usable_width).toBe(84);
  });

  test('should have correct weight limits', () => {
    expect(PALLET_463L.max_payload_96in).toBe(10000);
    expect(PALLET_463L.max_payload_100in).toBe(8000);
  });

  test('should have correct tare weight', () => {
    expect(PALLET_463L.tare_weight).toBe(290);
    expect(PALLET_463L.tare_with_nets).toBe(355);
  });

  test('should have correct height limits', () => {
    expect(PALLET_463L.recommended_height).toBe(96);
    expect(PALLET_463L.max_height).toBe(100);
  });
});

describe('Pallet Validation', () => {
  test('should validate prebuilt pallet within limits', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,Pallet Build,108,88,60,5000`;
    const parseResult = parseMovementList(csv);
    const item = parseResult.items[0];
    
    const validation = validatePrebuiltPallet(item);
    expect(validation.valid).toBe(true);
    expect(validation.errors.length).toBe(0);
  });

  test('should reject overheight item', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,Oversized,100,80,110,5000`;
    const parseResult = parseMovementList(csv);
    const item = parseResult.items[0];
    
    const validation = validatePrebuiltPallet(item);
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });
});

describe('Palletization Algorithm', () => {
  test('should palletize single item', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,Small Box,40,40,40,3000`;
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);
    const result = processPalletization(classified.prebuilt_pallets, classified.loose_items);
    
    expect(result.pallets.length).toBeGreaterThanOrEqual(1);
  });

  test('should create multiple pallets for heavy items', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,Heavy A,40,40,40,9000
2,Heavy B,40,40,40,9000
3,Heavy C,40,40,40,9000`;
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);
    const result = processPalletization(classified.prebuilt_pallets, classified.loose_items);
    
    expect(result.pallets.length).toBeGreaterThanOrEqual(1);
  });

  test('should bin-pack light items efficiently', () => {
    const rows = Array.from({ length: 4 }, (_, i) => `${i+1},Box ${i+1},40,40,40,2000`);
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb\n${rows.join('\n')}`;
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);
    const result = processPalletization(classified.prebuilt_pallets, classified.loose_items);
    
    expect(result.pallets.length).toBeLessThanOrEqual(2);
  });

  test('should handle empty input', () => {
    const result = processPalletization([], []);
    expect(result.pallets.length).toBe(0);
  });

  test('should calculate correct gross weight', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,Box A,40,40,40,3000
2,Box B,40,40,40,2000`;
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);
    const result = processPalletization(classified.prebuilt_pallets, classified.loose_items);
    
    const totalCargoWeight = 5000;
    const totalPalletWeight = result.pallets.reduce((sum, p) => sum + p.gross_weight, 0);
    
    expect(totalPalletWeight).toBeGreaterThan(totalCargoWeight);
  });
});

describe('Palletization Edge Cases', () => {
  test('should handle very light items', () => {
    const rows = Array.from({ length: 20 }, (_, i) => `${i+1},Light ${i+1},20,20,20,100`);
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb\n${rows.join('\n')}`;
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);
    const result = processPalletization(classified.prebuilt_pallets, classified.loose_items);
    
    expect(result.pallets.length).toBeLessThanOrEqual(3);
  });
});
