/**
 * Movement Parser Tests
 * Tests for PACAF Spec Section 2: Input Parsing
 */

import { parseMovementList } from '../apps/client/src/lib/movementParser';

describe('Movement Parser - CSV Parsing', () => {
  const validCSV = `item_id,description,length_in,width_in,height_in,weight_lb,lead_tcn,pax
1,AFE SUPPLIES,88,108,80,5133,FYS3P112S200080XX,
2,MHU-226,200,89,93,6050,FYSPP102S100020XX,
3,HESAMS,88,108,96,8025,FYS3P112S100050XX,`;

  test('should parse valid CSV with all columns', () => {
    const result = parseMovementList(validCSV);
    expect(result.items.length).toBe(3);
    expect(result.errors.length).toBe(0);
  });

  test('should extract correct item properties', () => {
    const result = parseMovementList(validCSV);
    const firstItem = result.items[0];
    
    expect(firstItem.item_id).toBe('1');
    expect(firstItem.description).toBe('AFE SUPPLIES');
    expect(firstItem.length_in).toBe(88);
    expect(firstItem.width_in).toBe(108);
    expect(firstItem.height_in).toBe(80);
    expect(firstItem.weight_each_lb).toBe(5133);
    expect(firstItem.lead_tcn).toBe('FYS3P112S200080XX');
  });

  test('should handle missing optional columns with defaults', () => {
    const csvMissingData = `item_id,description,weight_lb
1,Test Item,1000`;
    const result = parseMovementList(csvMissingData);
    
    expect(result.items.length).toBe(1);
    expect(result.items[0].length_in).toBe(24);
    expect(result.items[0].width_in).toBe(24);
    expect(result.items[0].height_in).toBe(24);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test('should reject completely empty input', () => {
    expect(() => parseMovementList('')).toThrow();
  });

  test('should handle headers only', () => {
    const headersOnly = 'item_id,description,weight_lb';
    expect(() => parseMovementList(headersOnly)).toThrow();
  });

  test('should classify rolling stock', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,TRACTOR TOW,200,89,93,15000`;
    const result = parseMovementList(csv);
    expect(result.items[0].type).toBe('ROLLING_STOCK');
  });

  test('should detect hazmat from column', () => {
    const csv = `item_id,description,weight_lb,hazmat_flag
1,Munitions,5000,true`;
    const result = parseMovementList(csv);
    expect(result.items[0].hazmat_flag).toBe(true);
  });

  test('should handle large datasets', () => {
    const rows = Array.from({ length: 100 }, (_, i) => `${i+1},Item ${i+1},50,50,50,1000,,`);
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb,lead_tcn,pax\n${rows.join('\n')}`;
    const result = parseMovementList(csv);
    
    expect(result.items.length).toBe(100);
    expect(result.errors.length).toBe(0);
  });

  test('should count totals correctly', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb,lead_tcn,pax
1,Cargo,50,50,50,1000,,
2,Cargo,50,50,50,2000,,
3,Personnel,,,,,,10`;
    const result = parseMovementList(csv);
    
    expect(result.summary.total_items).toBe(3);
    expect(result.summary.total_weight_lb).toBeGreaterThanOrEqual(3000);
    expect(result.summary.pax_count).toBe(10);
  });
});
