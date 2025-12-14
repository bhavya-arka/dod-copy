import {
  CargoType,
  CargoItem,
  CARGO_BAY_DIMENSIONS,
  CARGO_DIMENSIONS
} from '../../lib/cargoTypes';

describe('CargoType Enum', () => {
  describe('Enum values', () => {
    it('should have PALLET type', () => {
      expect(CargoType.PALLET).toBe('pallet');
    });

    it('should have HUMVEE type', () => {
      expect(CargoType.HUMVEE).toBe('humvee');
    });

    it('should have exactly 2 cargo types', () => {
      const types = Object.values(CargoType);
      expect(types.length).toBe(2);
    });
  });

  describe('Type string values', () => {
    it('should use lowercase for PALLET', () => {
      expect(CargoType.PALLET).toBe(CargoType.PALLET.toLowerCase());
    });

    it('should use lowercase for HUMVEE', () => {
      expect(CargoType.HUMVEE).toBe(CargoType.HUMVEE.toLowerCase());
    });
  });
});

describe('CARGO_BAY_DIMENSIONS', () => {
  describe('C-17 cargo bay measurements', () => {
    it('should have width property', () => {
      expect(CARGO_BAY_DIMENSIONS.width).toBeDefined();
      expect(typeof CARGO_BAY_DIMENSIONS.width).toBe('number');
    });

    it('should have height property', () => {
      expect(CARGO_BAY_DIMENSIONS.height).toBeDefined();
      expect(typeof CARGO_BAY_DIMENSIONS.height).toBe('number');
    });

    it('should have length property', () => {
      expect(CARGO_BAY_DIMENSIONS.length).toBeDefined();
      expect(typeof CARGO_BAY_DIMENSIONS.length).toBe('number');
    });

    it('should have width of 5.5 meters (18 feet)', () => {
      expect(CARGO_BAY_DIMENSIONS.width).toBe(5.5);
    });

    it('should have height of 4.1 meters (13.5 feet)', () => {
      expect(CARGO_BAY_DIMENSIONS.height).toBe(4.1);
    });

    it('should have length of 26.8 meters (88 feet)', () => {
      expect(CARGO_BAY_DIMENSIONS.length).toBe(26.8);
    });
  });

  describe('Dimension relationships', () => {
    it('should have length greater than width', () => {
      expect(CARGO_BAY_DIMENSIONS.length).toBeGreaterThan(CARGO_BAY_DIMENSIONS.width);
    });

    it('should have width greater than height', () => {
      expect(CARGO_BAY_DIMENSIONS.width).toBeGreaterThan(CARGO_BAY_DIMENSIONS.height);
    });

    it('should have positive volume', () => {
      const volume = CARGO_BAY_DIMENSIONS.width * CARGO_BAY_DIMENSIONS.height * CARGO_BAY_DIMENSIONS.length;
      expect(volume).toBeGreaterThan(0);
    });

    it('should calculate floor area correctly', () => {
      const floorArea = CARGO_BAY_DIMENSIONS.width * CARGO_BAY_DIMENSIONS.length;
      expect(floorArea).toBeCloseTo(147.4, 1);
    });
  });
});

describe('CARGO_DIMENSIONS', () => {
  describe('463L Pallet dimensions', () => {
    it('should have pallet dimensions defined', () => {
      expect(CARGO_DIMENSIONS[CargoType.PALLET]).toBeDefined();
    });

    it('should have pallet width of 2.24m (88 inches)', () => {
      expect(CARGO_DIMENSIONS[CargoType.PALLET].width).toBe(2.24);
    });

    it('should have pallet height of 1.73m (68 inches with cargo)', () => {
      expect(CARGO_DIMENSIONS[CargoType.PALLET].height).toBe(1.73);
    });

    it('should have pallet length of 2.74m (108 inches)', () => {
      expect(CARGO_DIMENSIONS[CargoType.PALLET].length).toBe(2.74);
    });

    it('should fit pallet width within cargo bay', () => {
      expect(CARGO_DIMENSIONS[CargoType.PALLET].width).toBeLessThan(CARGO_BAY_DIMENSIONS.width);
    });

    it('should fit pallet height within cargo bay', () => {
      expect(CARGO_DIMENSIONS[CargoType.PALLET].height).toBeLessThan(CARGO_BAY_DIMENSIONS.height);
    });
  });

  describe('HUMVEE (M1114) dimensions', () => {
    it('should have humvee dimensions defined', () => {
      expect(CARGO_DIMENSIONS[CargoType.HUMVEE]).toBeDefined();
    });

    it('should have humvee width of 2.3m (~7.5 feet)', () => {
      expect(CARGO_DIMENSIONS[CargoType.HUMVEE].width).toBe(2.3);
    });

    it('should have humvee height of 1.8m (~6 feet)', () => {
      expect(CARGO_DIMENSIONS[CargoType.HUMVEE].height).toBe(1.8);
    });

    it('should have humvee length of 4.5m (~15 feet)', () => {
      expect(CARGO_DIMENSIONS[CargoType.HUMVEE].length).toBe(4.5);
    });

    it('should fit humvee width within cargo bay', () => {
      expect(CARGO_DIMENSIONS[CargoType.HUMVEE].width).toBeLessThan(CARGO_BAY_DIMENSIONS.width);
    });

    it('should fit humvee height within cargo bay', () => {
      expect(CARGO_DIMENSIONS[CargoType.HUMVEE].height).toBeLessThan(CARGO_BAY_DIMENSIONS.height);
    });
  });

  describe('Size comparisons', () => {
    it('should have humvee longer than pallet', () => {
      expect(CARGO_DIMENSIONS[CargoType.HUMVEE].length).toBeGreaterThan(CARGO_DIMENSIONS[CargoType.PALLET].length);
    });

    it('should have humvee slightly wider than pallet', () => {
      expect(CARGO_DIMENSIONS[CargoType.HUMVEE].width).toBeGreaterThan(CARGO_DIMENSIONS[CargoType.PALLET].width);
    });

    it('should have humvee slightly taller than pallet', () => {
      expect(CARGO_DIMENSIONS[CargoType.HUMVEE].height).toBeGreaterThan(CARGO_DIMENSIONS[CargoType.PALLET].height);
    });
  });
});

describe('CargoItem Interface', () => {
  const testPallet: CargoItem = {
    id: 'test-pallet-1',
    type: CargoType.PALLET,
    dimensions: CARGO_DIMENSIONS[CargoType.PALLET],
    position: [1, 2, 3],
    rotation: [0, Math.PI / 2, 0],
    color: '#4A90A4'
  };

  describe('Required properties', () => {
    it('should have id property', () => {
      expect(testPallet.id).toBeDefined();
      expect(typeof testPallet.id).toBe('string');
    });

    it('should have type property', () => {
      expect(testPallet.type).toBeDefined();
      expect(Object.values(CargoType)).toContain(testPallet.type);
    });

    it('should have dimensions object', () => {
      expect(testPallet.dimensions).toBeDefined();
      expect(testPallet.dimensions.width).toBeDefined();
      expect(testPallet.dimensions.height).toBeDefined();
      expect(testPallet.dimensions.length).toBeDefined();
    });

    it('should have position as tuple', () => {
      expect(testPallet.position).toBeDefined();
      expect(testPallet.position.length).toBe(3);
    });

    it('should have rotation as tuple', () => {
      expect(testPallet.rotation).toBeDefined();
      expect(testPallet.rotation.length).toBe(3);
    });

    it('should have color property', () => {
      expect(testPallet.color).toBeDefined();
      expect(typeof testPallet.color).toBe('string');
    });
  });

  describe('Position tuple values', () => {
    it('should have numeric x position', () => {
      expect(typeof testPallet.position[0]).toBe('number');
    });

    it('should have numeric y position', () => {
      expect(typeof testPallet.position[1]).toBe('number');
    });

    it('should have numeric z position', () => {
      expect(typeof testPallet.position[2]).toBe('number');
    });
  });

  describe('Rotation tuple values', () => {
    it('should have numeric x rotation', () => {
      expect(typeof testPallet.rotation[0]).toBe('number');
    });

    it('should have numeric y rotation', () => {
      expect(typeof testPallet.rotation[1]).toBe('number');
    });

    it('should have numeric z rotation', () => {
      expect(typeof testPallet.rotation[2]).toBe('number');
    });
  });
});
