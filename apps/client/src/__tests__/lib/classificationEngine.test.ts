/**
 * Classification Engine Test Suite
 * Tests for apps/client/src/lib/classificationEngine.ts
 */

import {
  classifyItems,
  classifyParsedItems,
  getADVONItems,
  getMainItems,
  getADVONParsedItems,
  getMainParsedItems,
  sortByFootprintDescending,
  sortByWeightDescending,
  sortParsedByFootprintDescending,
  sortParsedByWeightDescending,
  generateClassificationSummary,
  generateParsedClassificationSummary,
  convertToLegacyClassifiedItems
} from '../../lib/classificationEngine';
import { parseMovementList, parseMovementListV2 } from '../../lib/movementParser';
import { ParseResult, ParsedCargoResult, MovementItem, ParsedCargoItem } from '../../lib/pacafTypes';

describe('classificationEngine', () => {
  describe('classifyItems with ADVON items', () => {
    const advonCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
ADVON Equipment,88,108,80,5000,TCN001,
ADVANCE Party Supplies,48,40,36,1000,TCN002,`;

    it('should identify items with ADVON in description', () => {
      const parseResult = parseMovementList(advonCSV);
      const classified = classifyItems(parseResult);
      expect(classified.advon_items.length).toBeGreaterThan(0);
    });

    it('should set advon_flag for ADVON items', () => {
      const parseResult = parseMovementList(advonCSV);
      const classified = classifyItems(parseResult);
      const advonItem = classified.advon_items.find(i => 
        i.description.includes('ADVON')
      );
      expect(advonItem?.advon_flag).toBe(true);
    });

    it('should identify ADVANCE keyword as ADVON', () => {
      const parseResult = parseMovementList(advonCSV);
      const classified = classifyItems(parseResult);
      const advanceItem = classified.advon_items.find(i => 
        i.description.includes('ADVANCE')
      );
      expect(advanceItem).toBeDefined();
    });
  });

  describe('classifyItems with MAIN items', () => {
    const mainCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
Regular Equipment,88,108,80,5000,TCN001,
Standard Supplies,48,40,36,1000,TCN002,`;

    it('should classify non-ADVON items as MAIN', () => {
      const parseResult = parseMovementList(mainCSV);
      const classified = classifyItems(parseResult);
      expect(classified.main_items.length).toBe(2);
    });

    it('should have empty advon_items for non-ADVON CSV', () => {
      const parseResult = parseMovementList(mainCSV);
      const classified = classifyItems(parseResult);
      expect(classified.advon_items.length).toBe(0);
    });
  });

  describe('classifyItems with mixed items', () => {
    const mixedCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
ADVON Equipment,88,108,80,5000,TCN001,
Regular Equipment,48,40,36,1000,TCN002,
TRACTOR TOW,200,80,60,8500,TCN003,`;

    it('should correctly separate ADVON from MAIN items', () => {
      const parseResult = parseMovementList(mixedCSV);
      const classified = classifyItems(parseResult);
      expect(classified.advon_items.length).toBe(1);
      expect(classified.main_items.length).toBe(2);
    });

    it('should correctly identify rolling stock', () => {
      const parseResult = parseMovementList(mixedCSV);
      const classified = classifyItems(parseResult);
      expect(classified.rolling_stock.length).toBe(1);
    });
  });

  describe('classifyItems with empty input', () => {
    it('should handle empty items array', () => {
      const emptyResult: ParseResult = {
        items: [],
        errors: [],
        warnings: [],
        summary: {
          total_items: 0,
          valid_items: 0,
          rolling_stock_count: 0,
          palletizable_count: 0,
          prebuilt_pallet_count: 0,
          pax_count: 0,
          total_weight_lb: 0
        }
      };
      const classified = classifyItems(emptyResult);
      expect(classified.advon_items.length).toBe(0);
      expect(classified.main_items.length).toBe(0);
      expect(classified.rolling_stock.length).toBe(0);
    });
  });

  describe('HAZMAT classification', () => {
    const hazmatCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
HAZMAT Class 1,88,108,80,2000,HAZTCN01,
Regular Cargo,48,40,36,500,TCN002,`;

    it('should preserve HAZMAT flag in classified items', () => {
      const parseResult = parseMovementList(hazmatCSV);
      const classified = classifyItems(parseResult);
      const hazmatItem = [...classified.main_items].find(i => 
        i.description.includes('HAZMAT')
      );
      expect(hazmatItem?.hazmat_flag).toBe(true);
    });
  });

  describe('PAX classification', () => {
    const paxCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
,,,,,,10
,,,,,,20`;

    it('should track PAX in summary totals', () => {
      const parseResult = parseMovementList(paxCSV);
      // PAX-only rows are tracked in summary, not as cargo items
      expect(parseResult.summary.pax_count).toBeDefined();
    });

    it('should handle PAX alongside cargo items', () => {
      const mixedCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
Cargo Item,48,40,36,500,TCN001,5`;
      const parseResult = parseMovementList(mixedCSV);
      const classified = classifyItems(parseResult);
      // Cargo should be parsed
      expect(parseResult.items.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Rolling stock classification', () => {
    const rollingCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
TRACTOR TOW,200,80,60,8500,TCN001,
LOADER WEAPONS,145,53,41,4090,TCN002,
MHU-226 W/ BINS,200,89,93,6050,TCN003,`;

    it('should classify all rolling stock items', () => {
      const parseResult = parseMovementList(rollingCSV);
      const classified = classifyItems(parseResult);
      expect(classified.rolling_stock.length).toBe(3);
    });

    it('should separate rolling stock from loose items', () => {
      const parseResult = parseMovementList(rollingCSV);
      const classified = classifyItems(parseResult);
      expect(classified.loose_items.length).toBe(0);
    });
  });

  describe('Phase assignment logic', () => {
    const phaseCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
ADVON Phase 1,88,108,80,5000,TCN001,
Main Phase Equipment,48,40,36,1000,TCN002,`;

    it('should use getADVONItems to filter ADVON items by type', () => {
      const parseResult = parseMovementList(phaseCSV);
      const classified = classifyItems(parseResult);
      const advonBreakdown = getADVONItems(classified);
      expect(advonBreakdown).toBeDefined();
    });

    it('should use getMainItems to filter MAIN items by type', () => {
      const parseResult = parseMovementList(phaseCSV);
      const classified = classifyItems(parseResult);
      const mainBreakdown = getMainItems(classified);
      expect(mainBreakdown).toBeDefined();
    });
  });

  describe('Sorting utilities', () => {
    it('should sort by footprint descending', () => {
      const items: MovementItem[] = [
        { item_id: '1', description: 'Small', quantity: 1, weight_each_lb: 100, length_in: 24, width_in: 24, height_in: 24, type: 'PALLETIZABLE', advon_flag: false, hazmat_flag: false },
        { item_id: '2', description: 'Large', quantity: 1, weight_each_lb: 200, length_in: 88, width_in: 108, height_in: 80, type: 'PREBUILT_PALLET', advon_flag: false, hazmat_flag: false }
      ];
      const sorted = sortByFootprintDescending(items);
      expect(sorted[0].description).toBe('Large');
    });

    it('should sort by weight descending', () => {
      const items: MovementItem[] = [
        { item_id: '1', description: 'Light', quantity: 1, weight_each_lb: 100, length_in: 24, width_in: 24, height_in: 24, type: 'PALLETIZABLE', advon_flag: false, hazmat_flag: false },
        { item_id: '2', description: 'Heavy', quantity: 1, weight_each_lb: 500, length_in: 24, width_in: 24, height_in: 24, type: 'PALLETIZABLE', advon_flag: false, hazmat_flag: false }
      ];
      const sorted = sortByWeightDescending(items);
      expect(sorted[0].description).toBe('Heavy');
    });
  });

  describe('Classification summary', () => {
    const summaryCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
ADVON Equipment,88,108,80,5000,TCN001,
TRACTOR TOW,200,80,60,8500,TCN002,
Regular Pallet,88,108,80,3000,TCN003,`;

    it('should calculate advon_weight correctly', () => {
      const parseResult = parseMovementList(summaryCSV);
      const classified = classifyItems(parseResult);
      const summary = generateClassificationSummary(classified);
      expect(summary.advon_weight).toBe(5000);
    });

    it('should calculate main_weight correctly', () => {
      const parseResult = parseMovementList(summaryCSV);
      const classified = classifyItems(parseResult);
      const summary = generateClassificationSummary(classified);
      expect(summary.main_weight).toBe(11500);
    });

    it('should calculate total_weight correctly', () => {
      const parseResult = parseMovementList(summaryCSV);
      const classified = classifyItems(parseResult);
      const summary = generateClassificationSummary(classified);
      expect(summary.total_weight).toBe(16500);
    });

    it('should calculate rolling_stock_weight correctly', () => {
      const parseResult = parseMovementList(summaryCSV);
      const classified = classifyItems(parseResult);
      const summary = generateClassificationSummary(classified);
      expect(summary.rolling_stock_weight).toBe(8500);
    });
  });

  describe('classifyParsedItems (new version)', () => {
    const newFormatCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
AFE SUPPLIES,88,108,80,5000,TCN001,
TRACTOR TOW,200,80,60,8500,TCN002,`;

    it('should classify palletized items', () => {
      const parseResult = parseMovementListV2(newFormatCSV);
      const classified = classifyParsedItems(parseResult);
      expect(classified.palletized.length).toBeGreaterThan(0);
    });

    it('should classify rolling stock items', () => {
      const parseResult = parseMovementListV2(newFormatCSV);
      const classified = classifyParsedItems(parseResult);
      expect(classified.rolling_stock.length).toBeGreaterThan(0);
    });

    it('should convert to legacy format', () => {
      const parseResult = parseMovementListV2(newFormatCSV);
      const classified = classifyParsedItems(parseResult);
      const legacy = convertToLegacyClassifiedItems(classified);
      expect(legacy.prebuilt_pallets).toBeDefined();
      expect(legacy.rolling_stock).toBeDefined();
    });
  });
});
