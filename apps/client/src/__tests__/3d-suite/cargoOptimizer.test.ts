import { optimizeCargo, optimizeCargoIntelligent } from '../../lib/cargoOptimizer';
import { CargoItem, CargoType, CARGO_BAY_DIMENSIONS, CARGO_DIMENSIONS } from '../../lib/cargoTypes';

function createTestPallet(id: string, overrides?: Partial<CargoItem>): CargoItem {
  return {
    id,
    type: CargoType.PALLET,
    dimensions: CARGO_DIMENSIONS[CargoType.PALLET],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    color: '#4A90A4',
    ...overrides
  };
}

function createTestHumvee(id: string, overrides?: Partial<CargoItem>): CargoItem {
  return {
    id,
    type: CargoType.HUMVEE,
    dimensions: CARGO_DIMENSIONS[CargoType.HUMVEE],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    color: '#5D4037',
    ...overrides
  };
}

describe('Cargo Optimizer - optimizeCargo', () => {
  describe('Empty and single item cases', () => {
    it('should return empty array for empty input', () => {
      const result = optimizeCargo([]);
      expect(result).toEqual([]);
    });

    it('should return single position for one pallet', () => {
      const items = [createTestPallet('p1')];
      const result = optimizeCargo(items);
      expect(result.length).toBe(1);
      expect(result[0].position).toBeDefined();
      expect(result[0].rotation).toBeDefined();
    });

    it('should return single position for one humvee', () => {
      const items = [createTestHumvee('h1')];
      const result = optimizeCargo(items);
      expect(result.length).toBe(1);
    });
  });

  describe('Multiple items placement', () => {
    it('should place multiple pallets without overlap', () => {
      const items = [
        createTestPallet('p1'),
        createTestPallet('p2'),
        createTestPallet('p3')
      ];
      const result = optimizeCargo(items);
      expect(result.length).toBe(3);
      
      for (let i = 0; i < result.length; i++) {
        for (let j = i + 1; j < result.length; j++) {
          const pos1 = result[i].position;
          const pos2 = result[j].position;
          const dist = Math.sqrt(
            Math.pow(pos1[0] - pos2[0], 2) + Math.pow(pos1[2] - pos2[2], 2)
          );
          expect(dist).toBeGreaterThan(0.5);
        }
      }
    });

    it('should place humvees before pallets', () => {
      const items = [
        createTestPallet('p1'),
        createTestHumvee('h1'),
        createTestPallet('p2')
      ];
      const result = optimizeCargoIntelligent(items);
      expect(result.steps.length).toBeGreaterThan(0);
      const humveeStep = result.steps.find(s => s.cargoId === 'h1');
      expect(humveeStep).toBeDefined();
      expect(humveeStep!.stepId).toBe(1);
    });

    it('should handle mixed cargo types', () => {
      const items = [
        createTestPallet('p1'),
        createTestHumvee('h1'),
        createTestPallet('p2'),
        createTestHumvee('h2')
      ];
      const result = optimizeCargo(items);
      expect(result.length).toBe(4);
    });
  });

  describe('Rotation handling', () => {
    it('should place items with rotation when allowed', () => {
      const items = [createTestPallet('p1')];
      const result = optimizeCargo(items, true);
      expect(result[0].rotation).toBeDefined();
      expect(result[0].rotation.length).toBe(3);
    });

    it('should place items without rotation when disabled', () => {
      const items = [createTestPallet('p1')];
      const result = optimizeCargo(items, false);
      expect(result[0].rotation).toEqual([0, 0, 0]);
    });
  });
});

describe('Cargo Optimizer - optimizeCargoIntelligent', () => {
  describe('Optimization result structure', () => {
    it('should return positions array', () => {
      const items = [createTestPallet('p1')];
      const result = optimizeCargoIntelligent(items);
      expect(Array.isArray(result.positions)).toBe(true);
    });

    it('should return steps array', () => {
      const items = [createTestPallet('p1')];
      const result = optimizeCargoIntelligent(items);
      expect(Array.isArray(result.steps)).toBe(true);
    });

    it('should return metrics object', () => {
      const items = [createTestPallet('p1')];
      const result = optimizeCargoIntelligent(items);
      expect(result.metrics).toBeDefined();
      expect(typeof result.metrics.volumeUtilization).toBe('number');
      expect(typeof result.metrics.weightDistribution).toBe('number');
      expect(typeof result.metrics.optimizationScore).toBe('number');
    });
  });

  describe('Optimization steps tracking', () => {
    it('should create step for each item', () => {
      const items = [
        createTestPallet('p1'),
        createTestPallet('p2')
      ];
      const result = optimizeCargoIntelligent(items);
      expect(result.steps.length).toBe(2);
    });

    it('should have valid step structure', () => {
      const items = [createTestPallet('p1')];
      const result = optimizeCargoIntelligent(items);
      const step = result.steps[0];
      expect(step.stepId).toBeDefined();
      expect(step.description).toBeDefined();
      expect(step.cargoId).toBe('p1');
      expect(step.fromPosition).toBeDefined();
      expect(step.toPosition).toBeDefined();
      expect(step.rotation).toBeDefined();
      expect(step.reasoning).toBeDefined();
    });

    it('should have incrementing step IDs', () => {
      const items = [
        createTestPallet('p1'),
        createTestPallet('p2'),
        createTestPallet('p3')
      ];
      const result = optimizeCargoIntelligent(items);
      for (let i = 0; i < result.steps.length; i++) {
        expect(result.steps[i].stepId).toBe(i + 1);
      }
    });
  });

  describe('Metrics calculations', () => {
    it('should calculate volume utilization', () => {
      const items = [createTestPallet('p1')];
      const result = optimizeCargoIntelligent(items);
      expect(result.metrics.volumeUtilization).toBeGreaterThan(0);
      expect(result.metrics.volumeUtilization).toBeLessThanOrEqual(100);
    });

    it('should calculate free space correctly', () => {
      const result = optimizeCargoIntelligent([]);
      const totalVolume = CARGO_BAY_DIMENSIONS.width * CARGO_BAY_DIMENSIONS.height * CARGO_BAY_DIMENSIONS.length;
      expect(result.metrics.freeSpace).toBeCloseTo(totalVolume, 0);
    });

    it('should have balance score between 0 and 100', () => {
      const items = [createTestPallet('p1')];
      const result = optimizeCargoIntelligent(items);
      expect(result.metrics.balanceScore).toBeGreaterThanOrEqual(0);
      expect(result.metrics.balanceScore).toBeLessThanOrEqual(100);
    });

    it('should calculate center of gravity X coordinate', () => {
      const items = [createTestPallet('p1')];
      const result = optimizeCargoIntelligent(items);
      expect(typeof result.metrics.centerOfGravityX).toBe('number');
    });

    it('should calculate center of gravity Z coordinate', () => {
      const items = [createTestPallet('p1')];
      const result = optimizeCargoIntelligent(items);
      expect(typeof result.metrics.centerOfGravityZ).toBe('number');
    });

    it('should have optimization score between 0 and 100', () => {
      const items = [createTestPallet('p1')];
      const result = optimizeCargoIntelligent(items);
      expect(result.metrics.optimizationScore).toBeGreaterThanOrEqual(0);
      expect(result.metrics.optimizationScore).toBeLessThanOrEqual(100);
    });
  });

  describe('Weight distribution', () => {
    it('should calculate weight distribution score', () => {
      const items = [
        createTestHumvee('h1'),
        createTestHumvee('h2')
      ];
      const result = optimizeCargoIntelligent(items);
      expect(result.metrics.weightDistribution).toBeDefined();
      expect(typeof result.metrics.weightDistribution).toBe('number');
    });

    it('should handle heavy items symmetrically', () => {
      const items = [
        createTestHumvee('h1'),
        createTestHumvee('h2')
      ];
      const result = optimizeCargoIntelligent(items);
      expect(Math.abs(result.metrics.centerOfGravityX)).toBeLessThan(2.0);
    });
  });

  describe('Center of gravity optimization', () => {
    it('should keep CG near center for balanced load', () => {
      const items = [
        createTestPallet('p1'),
        createTestPallet('p2'),
        createTestPallet('p3'),
        createTestPallet('p4')
      ];
      const result = optimizeCargoIntelligent(items);
      expect(Math.abs(result.metrics.centerOfGravityX)).toBeLessThan(CARGO_BAY_DIMENSIONS.width / 4);
    });

    it('should place heavy items strategically', () => {
      const items = [
        createTestHumvee('h1'),
        createTestPallet('p1'),
        createTestPallet('p2')
      ];
      const result = optimizeCargoIntelligent(items);
      expect(result.metrics.balanceScore).toBeGreaterThan(50);
    });
  });

  describe('Cargo bay boundary constraints', () => {
    it('should keep items within cargo bay width', () => {
      const items = [
        createTestPallet('p1'),
        createTestPallet('p2')
      ];
      const result = optimizeCargoIntelligent(items);
      
      for (const pos of result.positions) {
        const halfWidth = CARGO_DIMENSIONS[CargoType.PALLET].width / 2;
        expect(Math.abs(pos.position[0]) + halfWidth).toBeLessThanOrEqual(CARGO_BAY_DIMENSIONS.width / 2 + 0.1);
      }
    });

    it('should keep items within cargo bay length', () => {
      const items = [
        createTestPallet('p1')
      ];
      const result = optimizeCargoIntelligent(items);
      
      for (const pos of result.positions) {
        const halfLength = CARGO_DIMENSIONS[CargoType.PALLET].length / 2;
        expect(Math.abs(pos.position[2]) + halfLength).toBeLessThanOrEqual(CARGO_BAY_DIMENSIONS.length / 2 + 0.1);
      }
    });

    it('should keep items below cargo bay height', () => {
      const items = [createTestPallet('p1')];
      const result = optimizeCargoIntelligent(items);
      
      for (const pos of result.positions) {
        expect(pos.position[1]).toBeLessThan(CARGO_BAY_DIMENSIONS.height);
      }
    });
  });

  describe('Large cargo sets', () => {
    it('should handle 10 pallets', () => {
      const items = Array.from({ length: 10 }, (_, i) => createTestPallet(`p${i}`));
      const result = optimizeCargoIntelligent(items);
      expect(result.positions.length).toBeGreaterThan(0);
    });

    it('should handle 20 mixed items', () => {
      const items = [
        ...Array.from({ length: 5 }, (_, i) => createTestHumvee(`h${i}`)),
        ...Array.from({ length: 15 }, (_, i) => createTestPallet(`p${i}`))
      ];
      const result = optimizeCargoIntelligent(items);
      expect(result.steps.length).toBe(items.length);
    });

    it('should provide reasonable optimization score for large sets', () => {
      const items = Array.from({ length: 15 }, (_, i) => createTestPallet(`p${i}`));
      const result = optimizeCargoIntelligent(items);
      expect(result.metrics.optimizationScore).toBeGreaterThan(0);
    });
  });
});
