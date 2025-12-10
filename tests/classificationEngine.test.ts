/**
 * Classification Engine Tests
 * Tests for PACAF Spec Section 3: Classification
 */

import { classifyItems, getADVONItems, getMainItems } from '../client/src/lib/classificationEngine';
import { parseMovementList } from '../client/src/lib/movementParser';
import { processPalletization } from '../client/src/lib/palletizationEngine';

describe('Classification Engine - Item Classification', () => {
  test('should classify rolling stock', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,TRACTOR TOW,200,89,93,15000`;
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);
    
    expect(classified.rolling_stock.length).toBe(1);
  });

  test('should classify PAX items', () => {
    const csv = `item_id,description,pax
1,Personnel,10`;
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);
    
    expect(classified.pax_items.length).toBe(1);
  });

  test('should separate advon and main items', () => {
    const csv = `item_id,description,weight_lb,advon_flag
1,Priority Item,5000,true
2,Standard Item,3000,false`;
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);
    
    expect(classified.advon_items.length + classified.main_items.length).toBe(2);
  });
});

describe('Classification Engine - Phase Segregation', () => {
  test('should return ADVON segregated items', () => {
    const csv = `item_id,description,weight_lb
1,Standard Supplies,5000`;
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);
    const advon = getADVONItems(classified);
    
    expect(advon).toBeDefined();
    expect(advon.loose_items).toBeDefined();
    expect(advon.rolling_stock).toBeDefined();
  });

  test('should return MAIN segregated items', () => {
    const csv = `item_id,description,weight_lb
1,Standard Supplies,5000`;
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);
    const main = getMainItems(classified);
    
    expect(main).toBeDefined();
    expect(main.loose_items).toBeDefined();
  });
});

describe('Classification Engine - Summary', () => {
  test('should handle empty input', () => {
    const result = processPalletization([], []);
    expect(result.pallets.length).toBe(0);
  });

  test('should handle mixed cargo types', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb,pax
1,Small Box,40,40,40,500,
2,Vehicle,200,89,93,15000,
3,Personnel,,,,,5`;
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);
    
    expect(classified.rolling_stock.length).toBe(1);
    expect(classified.pax_items.length).toBe(1);
  });
});
