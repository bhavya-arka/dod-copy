/**
 * Movement Parser Test Suite
 * Tests for apps/client/src/lib/movementParser.ts
 */

import {
  parseMovementList,
  parseMovementListV2,
  parseMovementListJSON,
  parseCSV
} from '../../lib/movementParser';

describe('movementParser', () => {
  describe('parseMovementList with valid CSV', () => {
    const validCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
Medical Supplies,48,40,36,500,TCN001234567890,
Vehicle Parts,84,84,48,1200,TCN001234567891,`;

    it('should parse valid CSV and return items', () => {
      const result = parseMovementList(validCSV);
      expect(result.items).toBeDefined();
      expect(result.items.length).toBe(2);
    });

    it('should include summary information', () => {
      const result = parseMovementList(validCSV);
      expect(result.summary).toBeDefined();
      expect(result.summary.total_items).toBe(2);
      expect(result.summary.valid_items).toBe(2);
    });

    it('should extract descriptions correctly', () => {
      const result = parseMovementList(validCSV);
      expect(result.items[0].description).toBe('Medical Supplies');
      expect(result.items[1].description).toBe('Vehicle Parts');
    });
  });

  describe('parseMovementListJSON with valid JSON', () => {
    const validJSON = JSON.stringify([
      {
        item_id: 'item-001',
        description: 'Test Cargo',
        length_in: 48,
        width_in: 40,
        height_in: 36,
        weight_lb: 500
      },
      {
        item_id: 'item-002',
        description: 'Another Cargo',
        length_in: 60,
        width_in: 50,
        height_in: 40,
        weight_lb: 800
      }
    ]);

    it('should parse valid JSON array', () => {
      const result = parseMovementListJSON(validJSON);
      expect(result.items).toBeDefined();
      expect(result.items.length).toBe(2);
    });

    it('should handle invalid JSON gracefully', () => {
      const invalidJSON = 'not valid json';
      const result = parseMovementListJSON(invalidJSON);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.items.length).toBe(0);
    });

    it('should error on non-array JSON', () => {
      const nonArrayJSON = JSON.stringify({ item: 'single' });
      const result = parseMovementListJSON(nonArrayJSON);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('parseMovementList with empty input', () => {
    it('should throw error for empty CSV', () => {
      expect(() => parseMovementList('')).toThrow();
    });

    it('should return empty items for header-only CSV', () => {
      const headerOnly = 'Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX';
      const result = parseMovementList(headerOnly);
      expect(result.items.length).toBe(0);
    });
  });

  describe('parseMovementList with missing required fields', () => {
    it('should warn on missing description', () => {
      const noDescCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
,88,108,80,5000,TCN001,`;
      const result = parseMovementList(noDescCSV);
      const hasWarningOrError = result.warnings.some(w => 
        w.message.toLowerCase().includes('description')
      ) || result.errors.some(e => 
        e.message.toLowerCase().includes('description')
      );
      expect(hasWarningOrError).toBe(true);
    });

    it('should handle missing dimensions with defaults', () => {
      const noDimsCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
Test Item,,,,500,TCN001,`;
      const result = parseMovementList(noDimsCSV);
      expect(result.items.length).toBe(1);
      expect(result.items[0].length_in).toBe(24);
      expect(result.items[0].width_in).toBe(24);
      expect(result.items[0].height_in).toBe(24);
    });
  });

  describe('parseMovementList with invalid dimensions', () => {
    it('should use default 24" for invalid length', () => {
      const invalidLengthCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
Test Item,abc,40,36,500,TCN001,`;
      const result = parseMovementList(invalidLengthCSV);
      expect(result.items[0].length_in).toBe(24);
    });

    it('should use default 24" for negative dimensions', () => {
      const negativeDimCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
Test Item,-10,40,36,500,TCN001,`;
      const result = parseMovementList(negativeDimCSV);
      expect(result.items[0].length_in).toBe(24);
    });

    it('should use default 24" for zero dimensions', () => {
      const zeroDimCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
Test Item,0,0,0,500,TCN001,`;
      const result = parseMovementList(zeroDimCSV);
      expect(result.items[0].length_in).toBe(24);
      expect(result.items[0].width_in).toBe(24);
      expect(result.items[0].height_in).toBe(24);
    });
  });

  describe('parseMovementList with negative weights', () => {
    it('should use default 100 lb for negative weight', () => {
      const negativeWeightCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
Test Item,48,40,36,-100,TCN001,`;
      const result = parseMovementList(negativeWeightCSV);
      expect(result.items[0].weight_each_lb).toBe(100);
    });

    it('should use default 100 lb for zero weight', () => {
      const zeroWeightCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
Test Item,48,40,36,0,TCN001,`;
      const result = parseMovementList(zeroWeightCSV);
      expect(result.items[0].weight_each_lb).toBe(100);
    });
  });

  describe('parseMovementList with HAZMAT items', () => {
    it('should detect HAZMAT in description', () => {
      const hazmatCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
HAZMAT Class 1 Explosives,88,108,80,2000,HAZTCN01,`;
      const result = parseMovementList(hazmatCSV);
      expect(result.items[0].hazmat_flag).toBe(true);
    });

    it('should detect CLASS keyword as HAZMAT', () => {
      const classCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
CLASS 3 Flammable Liquid,88,108,80,1500,TCN002,`;
      const result = parseMovementList(classCSV);
      expect(result.items[0].hazmat_flag).toBe(true);
    });

    it('should detect EXPLOSIVE keyword as HAZMAT', () => {
      const explosiveCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
Explosive Ordnance,88,108,80,3000,TCN003,`;
      const result = parseMovementList(explosiveCSV);
      expect(result.items[0].hazmat_flag).toBe(true);
    });
  });

  describe('parseMovementList with PAX items', () => {
    it('should track PAX-only rows in totals (not items array)', () => {
      const paxCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
,,,,,,10`;
      const result = parseMovementListV2(paxCSV);
      // PAX_RECORD items are tracked in totals, not added to items array
      expect(result.totals.total_pax).toBe(10);
    });

    it('should count total PAX correctly', () => {
      const multiPaxCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
,,,,,,5
,,,,,,10
,,,,,,15`;
      const result = parseMovementListV2(multiPaxCSV);
      expect(result.totals.total_pax).toBe(30);
    });
  });

  describe('parseMovementList with rolling stock', () => {
    it('should classify TRACTOR as rolling stock', () => {
      const tractorCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
TRACTOR TOW,200,80,60,8500,TCN001,`;
      const result = parseMovementListV2(tractorCSV);
      expect(result.items[0].cargo_type).toBe('ROLLING_STOCK');
    });

    it('should classify TRAILER as rolling stock', () => {
      const trailerCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
MHU-141 TRAILER,141,92,94,7950,TCN001,`;
      const result = parseMovementListV2(trailerCSV);
      expect(result.items[0].cargo_type).toBe('ROLLING_STOCK');
    });

    it('should classify LOADER as rolling stock', () => {
      const loaderCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
LOADER WEAPONS,145,53,41,4090,TCN001,`;
      const result = parseMovementListV2(loaderCSV);
      expect(result.items[0].cargo_type).toBe('ROLLING_STOCK');
    });
  });

  describe('Duplicate TCN detection', () => {
    it('should parse items with same TCN', () => {
      const duplicateTcnCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
Item 1,48,40,36,500,TCN001,
Item 2,60,50,40,700,TCN001,`;
      const result = parseMovementList(duplicateTcnCSV);
      // Both items should be parsed with the same TCN
      expect(result.items.length).toBe(2);
      expect(result.items[0].lead_tcn).toBe('TCN001');
      expect(result.items[1].lead_tcn).toBe('TCN001');
    });
  });

  describe('Default value handling', () => {
    it('should use 24" default for all invalid dimensions', () => {
      const invalidDimsCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
Test Item,invalid,invalid,invalid,500,TCN001,`;
      const result = parseMovementList(invalidDimsCSV);
      expect(result.items[0].length_in).toBe(24);
      expect(result.items[0].width_in).toBe(24);
      expect(result.items[0].height_in).toBe(24);
    });

    it('should use 100 lb default for invalid weight', () => {
      const invalidWeightCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
Test Item,48,40,36,invalid,TCN001,`;
      const result = parseMovementList(invalidWeightCSV);
      expect(result.items[0].weight_each_lb).toBe(100);
    });
  });

  describe('Special characters in descriptions', () => {
    it('should handle commas in quoted descriptions', () => {
      const quotedCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
"Item, with comma",48,40,36,500,TCN001,`;
      const result = parseMovementListV2(quotedCSV);
      // Parser preserves the content (may include quotes from CSV format)
      expect(result.items[0].description).toContain('Item');
      expect(result.items[0].description).toContain('comma');
    });

    it('should handle slashes in descriptions', () => {
      const slashCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
AFE/OPS Equipment,88,108,80,5000,TCN001,`;
      const result = parseMovementList(slashCSV);
      expect(result.items[0].description).toContain('AFE/OPS');
    });

    it('should handle parentheses in descriptions', () => {
      const parenCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
INTEL (CLASS),88,108,80,5000,TCN001,`;
      const result = parseMovementList(parenCSV);
      expect(result.items[0].description).toContain('INTEL');
    });
  });

  describe('Large file parsing performance', () => {
    it('should parse 100 items efficiently', () => {
      let csv = 'Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX\n';
      for (let i = 0; i < 100; i++) {
        csv += `Item ${i},48,40,36,${500 + i},TCN${String(i).padStart(4, '0')},\n`;
      }
      const startTime = Date.now();
      const result = parseMovementList(csv);
      const endTime = Date.now();
      expect(result.items.length).toBe(100);
      expect(endTime - startTime).toBeLessThan(5000);
    });
  });

  describe('Error message accuracy', () => {
    it('should include item ID in error messages', () => {
      const invalidCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
Test Item,abc,40,36,500,TCN001,`;
      const result = parseMovementList(invalidCSV);
      const hasIdInMessage = result.warnings.some(w => 
        w.message.includes('1') || w.item_id !== undefined
      );
      expect(hasIdInMessage).toBe(true);
    });

    it('should include field name in validation errors', () => {
      const invalidCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
Test Item,abc,40,36,500,TCN001,`;
      const result = parseMovementList(invalidCSV);
      const hasFieldName = result.warnings.some(w => 
        w.field !== undefined || w.message.toLowerCase().includes('length')
      );
      expect(hasFieldName).toBe(true);
    });
  });

  describe('Warning generation', () => {
    it('should generate warnings for invalid dimensions', () => {
      const invalidCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
Test Item,abc,def,ghi,500,TCN001,`;
      const result = parseMovementList(invalidCSV);
      expect(result.warnings.length).toBeGreaterThanOrEqual(3);
    });

    it('should generate warning for overheight items', () => {
      const overheightCSV = `Description,Length (in),Width (in),Height (in),Weight (lbs),Lead TCN,PAX
Tall Pallet,88,108,120,5000,TCN001,`;
      const result = parseMovementList(overheightCSV);
      const overheightWarning = result.warnings.find(w => 
        w.message.toLowerCase().includes('height')
      );
      expect(overheightWarning).toBeDefined();
    });
  });
});
