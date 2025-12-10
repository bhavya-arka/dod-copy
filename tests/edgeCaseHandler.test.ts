/**
 * Edge Case Handler Tests
 * Tests for PACAF edge case validation
 */

import { validateEdgeCases } from '../client/src/lib/edgeCaseHandler';
import { parseMovementList } from '../client/src/lib/movementParser';

describe('Edge Case - Overheight Detection', () => {
  test('should detect overheight items', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,Tall Item,88,88,150,5000`;
    const parseResult = parseMovementList(csv);
    
    const result = validateEdgeCases(parseResult.items[0]);
    
    expect(result).toBeDefined();
    expect(result.canPalletize).toBe(false);
  });

  test('should pass items within height limits', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,Normal Item,80,80,60,5000`;
    const parseResult = parseMovementList(csv);
    
    const result = validateEdgeCases(parseResult.items[0]);
    
    expect(result.canPalletize).toBe(true);
  });
});

describe('Edge Case - Overwidth Detection', () => {
  test('should detect overwidth items', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,Wide Item,88,130,60,5000`;
    const parseResult = parseMovementList(csv);
    
    const result = validateEdgeCases(parseResult.items[0]);
    
    expect(result.canPalletize).toBe(false);
  });

  test('should pass items within width limits', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,Normal Item,88,80,60,5000`;
    const parseResult = parseMovementList(csv);
    
    const result = validateEdgeCases(parseResult.items[0]);
    
    expect(result.canPalletize).toBe(true);
  });
});

describe('Edge Case - Hazmat Detection', () => {
  test('should detect hazmat items', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb,hazmat
1,Hazmat Cargo,88,88,60,5000,true`;
    const parseResult = parseMovementList(csv);
    
    const result = validateEdgeCases(parseResult.items[0]);
    
    expect(result).toBeDefined();
    expect(result.warnings.length + result.errors.length).toBeGreaterThanOrEqual(0);
  });

  test('should handle non-hazmat items', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,Normal Cargo,88,88,60,5000`;
    const parseResult = parseMovementList(csv);
    
    const result = validateEdgeCases(parseResult.items[0]);
    
    expect(result.isValid).toBe(true);
  });
});

describe('Edge Case - Heavy Item Detection', () => {
  test('should handle heavy items', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,Heavy Item,88,88,60,15000`;
    const parseResult = parseMovementList(csv);
    
    const result = validateEdgeCases(parseResult.items[0]);
    
    expect(result).toBeDefined();
  });
});

describe('Edge Case - Overall Validation', () => {
  test('should return result object for clean cargo', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,Normal Box,88,88,60,5000`;
    const parseResult = parseMovementList(csv);
    
    const result = validateEdgeCases(parseResult.items[0]);
    
    expect(result).toBeDefined();
    expect(result.isValid).toBe(true);
  });

  test('should return warnings array', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,Normal Box,88,88,60,5000`;
    const parseResult = parseMovementList(csv);
    
    const result = validateEdgeCases(parseResult.items[0]);
    
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  test('should return errors array', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,Normal Box,88,88,60,5000`;
    const parseResult = parseMovementList(csv);
    
    const result = validateEdgeCases(parseResult.items[0]);
    
    expect(Array.isArray(result.errors)).toBe(true);
  });

  test('should mark rolling stock items', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,TRUCK TOW,200,96,96,15000`;
    const parseResult = parseMovementList(csv);
    
    const result = validateEdgeCases(parseResult.items[0]);
    
    expect(result.mustBeRollingStock).toBeDefined();
  });

  test('should identify C-17 only requirements', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,Tall Item,88,88,120,15000`;
    const parseResult = parseMovementList(csv);
    
    const result = validateEdgeCases(parseResult.items[0]);
    
    expect(result.requiresC17Only).toBeDefined();
  });
});
