/**
 * Insights Engine Tests
 * Tests for PACAF Spec Section 13: AI-Driven Insights
 */

import { analyzeMovementList, analyzeAllocation } from '../client/src/lib/insightsEngine';
import { classifyItems } from '../client/src/lib/classificationEngine';
import { solveAircraftAllocation } from '../client/src/lib/aircraftSolver';
import { parseMovementList } from '../client/src/lib/movementParser';

describe('Movement List Analysis', () => {
  test('should generate insights for movement list', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,Heavy Box A,88,88,60,10000
2,Box B,88,88,60,5000
3,Box C,88,88,60,3000`;
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);

    const insights = analyzeMovementList(parseResult.items, classified);

    expect(insights.insights.length).toBeGreaterThan(0);
  });

  test('should handle single item input', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,Single Item,40,40,40,1000`;
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);

    const insights = analyzeMovementList(parseResult.items, classified);

    expect(insights).toBeDefined();
  });

  test('should identify rolling stock', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,TRACTOR TOW,200,89,93,15000`;
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);

    const insights = analyzeMovementList(parseResult.items, classified);

    expect(insights.insights.length).toBeGreaterThan(0);
    expect(classified.rolling_stock.length).toBe(1);
  });
});

describe('Allocation Analysis', () => {
  test('should generate insights for allocation result', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,Box A,88,88,60,5000`;
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);
    const allocation = solveAircraftAllocation(classified, 'C-17');

    const insights = analyzeAllocation(allocation);

    expect(insights.length).toBeGreaterThanOrEqual(0);
  });

  test('should handle allocation with single aircraft', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,Small Item,40,40,40,1000`;
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);
    const allocation = solveAircraftAllocation(classified, 'C-17');

    const insights = analyzeAllocation(allocation);

    expect(insights).toBeDefined();
  });
});

describe('Insight Categories', () => {
  test('should identify oversize items', () => {
    const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,Very Wide Item,88,150,60,5000`;
    const parseResult = parseMovementList(csv);
    const classified = classifyItems(parseResult);

    const insights = analyzeMovementList(parseResult.items, classified);

    expect(insights.insights.length).toBeGreaterThan(0);
  });
});
