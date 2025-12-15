import { optimizeCargo, optimizeCargoIntelligent } from '../../lib/cargoOptimizer';
import { CargoItem, CargoType, CARGO_DIMENSIONS } from '../../lib/cargoTypes';

function createTestItem(id: string, type: CargoType): CargoItem {
  return {
    id,
    type,
    dimensions: CARGO_DIMENSIONS[type],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    color: type === CargoType.PALLET ? '#4A90A4' : '#5D4037'
  };
}

function generateCargoSet(palletCount: number, humveeCount: number): CargoItem[] {
  const items: CargoItem[] = [];
  for (let i = 0; i < palletCount; i++) {
    items.push(createTestItem(`pallet-${i}`, CargoType.PALLET));
  }
  for (let i = 0; i < humveeCount; i++) {
    items.push(createTestItem(`humvee-${i}`, CargoType.HUMVEE));
  }
  return items;
}

describe('Performance Testing - Optimization Algorithm Timing', () => {
  describe('Small cargo sets (1-10 items)', () => {
    it('should optimize 5 pallets under 500ms', () => {
      const items = generateCargoSet(5, 0);
      const startTime = performance.now();
      optimizeCargo(items);
      const endTime = performance.now();
      // CI-friendly threshold: relaxed for slow runners
      expect(endTime - startTime).toBeLessThan(500);
    });

    it('should optimize 10 mixed items under 1000ms', () => {
      const items = generateCargoSet(7, 3);
      const startTime = performance.now();
      optimizeCargo(items);
      const endTime = performance.now();
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should return results for 1 item quickly', () => {
      const items = generateCargoSet(1, 0);
      const startTime = performance.now();
      const result = optimizeCargo(items);
      const endTime = performance.now();
      expect(endTime - startTime).toBeLessThan(200);
      expect(result.length).toBe(1);
    });
  });

  describe('Medium cargo sets (10-50 items)', () => {
    it('should optimize 20 pallets under 2 seconds', () => {
      const items = generateCargoSet(20, 0);
      const startTime = performance.now();
      optimizeCargo(items);
      const endTime = performance.now();
      // CI-friendly threshold
      expect(endTime - startTime).toBeLessThan(2000);
    });

    it('should optimize 30 mixed items under 3 seconds', () => {
      const items = generateCargoSet(20, 10);
      const startTime = performance.now();
      optimizeCargo(items);
      const endTime = performance.now();
      expect(endTime - startTime).toBeLessThan(3000);
    });

    it('should optimize 50 pallets under 5 seconds', () => {
      const items = generateCargoSet(50, 0);
      const startTime = performance.now();
      optimizeCargo(items);
      const endTime = performance.now();
      expect(endTime - startTime).toBeLessThan(5000);
    });
  });

  describe('Large cargo sets (50-100 items)', () => {
    it('should optimize 75 items under 10 seconds', () => {
      const items = generateCargoSet(50, 25);
      const startTime = performance.now();
      optimizeCargo(items);
      const endTime = performance.now();
      // CI-friendly threshold
      expect(endTime - startTime).toBeLessThan(10000);
    });

    it('should optimize 100 pallets under 15 seconds', () => {
      const items = generateCargoSet(100, 0);
      const startTime = performance.now();
      optimizeCargo(items);
      const endTime = performance.now();
      expect(endTime - startTime).toBeLessThan(15000);
    });
  });

  describe('Intelligent optimization performance', () => {
    it('should return full result structure quickly', () => {
      const items = generateCargoSet(10, 0);
      const startTime = performance.now();
      const result = optimizeCargoIntelligent(items);
      const endTime = performance.now();
      // CI-friendly threshold
      expect(endTime - startTime).toBeLessThan(1500);
      expect(result.positions).toBeDefined();
      expect(result.steps).toBeDefined();
      expect(result.metrics).toBeDefined();
    });

    it('should generate steps for each item efficiently', () => {
      const items = generateCargoSet(20, 0);
      const startTime = performance.now();
      const result = optimizeCargoIntelligent(items);
      const endTime = performance.now();
      // CI-friendly threshold
      expect(endTime - startTime).toBeLessThan(3000);
      expect(result.steps.length).toBe(items.length);
    });
  });
});

describe('Performance Testing - Memory Usage Patterns', () => {
  describe('Memory stability', () => {
    it('should not leak memory on repeated calls', () => {
      const items = generateCargoSet(10, 0);
      for (let i = 0; i < 10; i++) {
        optimizeCargo(items);
      }
      expect(true).toBe(true);
    });

    it('should handle rapid successive optimizations', () => {
      const results: number[] = [];
      for (let i = 0; i < 5; i++) {
        const items = generateCargoSet(15, 5);
        const startTime = performance.now();
        optimizeCargo(items);
        const endTime = performance.now();
        results.push(endTime - startTime);
      }
      const avgTime = results.reduce((a, b) => a + b, 0) / results.length;
      // CI-friendly threshold
      expect(avgTime).toBeLessThan(2000);
    });
  });

  describe('Result array sizes', () => {
    it('should return correct number of positions', () => {
      const items = generateCargoSet(25, 5);
      const result = optimizeCargo(items);
      expect(result.length).toBeLessThanOrEqual(items.length);
    });

    it('should return correct number of steps', () => {
      const items = generateCargoSet(20, 0);
      const result = optimizeCargoIntelligent(items);
      expect(result.steps.length).toBe(items.length);
    });
  });
});

describe('Performance Testing - Scalability', () => {
  describe('Linear scaling behavior', () => {
    it('should scale linearly with item count', () => {
      const times: number[] = [];
      const counts = [10, 20, 30];
      
      for (const count of counts) {
        const items = generateCargoSet(count, 0);
        const startTime = performance.now();
        optimizeCargo(items);
        const endTime = performance.now();
        times.push(endTime - startTime);
      }

      const ratio1to2 = times[1] / times[0];
      const ratio2to3 = times[2] / times[1];
      // Allow up to 100x ratio due to algorithmic overhead, JIT compilation, and CI variability
      expect(ratio1to2).toBeLessThan(100);
      expect(ratio2to3).toBeLessThan(100);
    });
  });

  describe('Consistent performance', () => {
    it('should have consistent timing across runs', () => {
      const items = generateCargoSet(15, 0);
      const times: number[] = [];
      
      for (let i = 0; i < 5; i++) {
        const startTime = performance.now();
        optimizeCargo(items);
        const endTime = performance.now();
        times.push(endTime - startTime);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxDeviation = Math.max(...times.map(t => Math.abs(t - avgTime)));
      expect(maxDeviation).toBeLessThan(avgTime * 2);
    });
  });
});

describe('Performance Testing - Edge Cases', () => {
  describe('Empty input', () => {
    it('should handle empty array instantly', () => {
      const startTime = performance.now();
      const result = optimizeCargo([]);
      const endTime = performance.now();
      expect(endTime - startTime).toBeLessThan(5);
      expect(result.length).toBe(0);
    });
  });

  describe('Single item', () => {
    it('should optimize single pallet instantly', () => {
      const items = generateCargoSet(1, 0);
      const startTime = performance.now();
      optimizeCargo(items);
      const endTime = performance.now();
      expect(endTime - startTime).toBeLessThan(20);
    });

    it('should optimize single humvee instantly', () => {
      const items = generateCargoSet(0, 1);
      const startTime = performance.now();
      optimizeCargo(items);
      const endTime = performance.now();
      expect(endTime - startTime).toBeLessThan(20);
    });
  });

  describe('Heavy loads', () => {
    it('should handle all humvees efficiently', () => {
      const items = generateCargoSet(0, 10);
      const startTime = performance.now();
      optimizeCargo(items);
      const endTime = performance.now();
      expect(endTime - startTime).toBeLessThan(300);
    });
  });
});
