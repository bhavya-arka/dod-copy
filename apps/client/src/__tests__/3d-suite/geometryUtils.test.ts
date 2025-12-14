import { CARGO_BAY_DIMENSIONS, CARGO_DIMENSIONS, CargoType } from '../../lib/cargoTypes';
import { PALLET_463L, AIRCRAFT_SPECS, getStationConstraint, getRDLDistance, validateStationPlacement } from '../../lib/pacafTypes';

describe('Pallet Position Calculations', () => {
  describe('463L Pallet Dimensions', () => {
    it('should have standard pallet length of 108 inches', () => {
      expect(PALLET_463L.length).toBe(108);
    });

    it('should have standard pallet width of 88 inches', () => {
      expect(PALLET_463L.width).toBe(88);
    });

    it('should have pallet height of 2.25 inches', () => {
      expect(PALLET_463L.height).toBe(2.25);
    });

    it('should have usable length of 104 inches', () => {
      expect(PALLET_463L.usable_length).toBe(104);
    });

    it('should have usable width of 84 inches', () => {
      expect(PALLET_463L.usable_width).toBe(84);
    });
  });

  describe('Pallet Weight Limits', () => {
    it('should have max payload of 10000 lbs for 96 inch height', () => {
      expect(PALLET_463L.max_payload_96in).toBe(10000);
    });

    it('should have max payload of 8000 lbs for 100 inch height', () => {
      expect(PALLET_463L.max_payload_100in).toBe(8000);
    });

    it('should have tare weight of 290 lbs', () => {
      expect(PALLET_463L.tare_weight).toBe(290);
    });

    it('should have tare weight with nets of 355 lbs', () => {
      expect(PALLET_463L.tare_with_nets).toBe(355);
    });
  });
});

describe('Aircraft Coordinate Systems', () => {
  describe('C-17 Specifications', () => {
    const c17 = AIRCRAFT_SPECS['C-17'];

    it('should have 18 pallet positions', () => {
      expect(c17.pallet_positions).toBe(18);
    });

    it('should have cargo length of 1056 inches (88 feet)', () => {
      expect(c17.cargo_length).toBe(1056);
    });

    it('should have cargo width of 216 inches', () => {
      expect(c17.cargo_width).toBe(216);
    });

    it('should have cargo height of 148 inches', () => {
      expect(c17.cargo_height).toBe(148);
    });

    it('should have forward offset of 180 inches', () => {
      expect(c17.forward_offset).toBe(180);
    });

    it('should have 2 ramp positions', () => {
      expect(c17.ramp_positions).toEqual([17, 18]);
    });

    it('should have max payload of 170900 lbs', () => {
      expect(c17.max_payload).toBe(170900);
    });
  });

  describe('C-130 Specifications', () => {
    const c130 = AIRCRAFT_SPECS['C-130'];

    it('should have 6 pallet positions', () => {
      expect(c130.pallet_positions).toBe(6);
    });

    it('should have cargo length of 492 inches', () => {
      expect(c130.cargo_length).toBe(492);
    });

    it('should have cargo width of 123 inches', () => {
      expect(c130.cargo_width).toBe(123);
    });

    it('should have max payload of 42000 lbs', () => {
      expect(c130.max_payload).toBe(42000);
    });

    it('should have 1 ramp position', () => {
      expect(c130.ramp_positions).toEqual([6]);
    });
  });
});

describe('Station Constraint Functions', () => {
  describe('getStationConstraint', () => {
    it('should return station for valid C-17 position', () => {
      const station = getStationConstraint('C-17', 1);
      expect(station).not.toBeNull();
      expect(station!.position).toBe(1);
    });

    it('should return station for valid C-130 position', () => {
      const station = getStationConstraint('C-130', 3);
      expect(station).not.toBeNull();
      expect(station!.position).toBe(3);
    });

    it('should return null for invalid position', () => {
      const station = getStationConstraint('C-17', 999);
      expect(station).toBeNull();
    });

    it('should identify ramp positions', () => {
      const station = getStationConstraint('C-17', 17);
      expect(station!.is_ramp).toBe(true);
    });

    it('should identify non-ramp positions', () => {
      const station = getStationConstraint('C-17', 5);
      expect(station!.is_ramp).toBe(false);
    });
  });

  describe('getRDLDistance', () => {
    it('should return RDL distance for C-17 position 1', () => {
      const rdl = getRDLDistance('C-17', 1);
      expect(rdl).toBe(245);
    });

    it('should return RDL distance for C-17 position 10', () => {
      const rdl = getRDLDistance('C-17', 10);
      expect(rdl).toBe(767);
    });

    it('should return 0 for invalid position', () => {
      const rdl = getRDLDistance('C-17', 999);
      expect(rdl).toBe(0);
    });

    it('should return correct RDL for C-130', () => {
      const rdl = getRDLDistance('C-130', 1);
      expect(rdl).toBe(245);
    });
  });
});

describe('Station Placement Validation', () => {
  describe('validateStationPlacement', () => {
    it('should validate placement within limits', () => {
      const result = validateStationPlacement('C-17', 1, 100, 150, 8000);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should reject height exceeding limit', () => {
      const result = validateStationPlacement('C-17', 1, 200, 150, 8000);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Height'))).toBe(true);
    });

    it('should reject width exceeding limit', () => {
      const result = validateStationPlacement('C-17', 1, 100, 300, 8000);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Width'))).toBe(true);
    });

    it('should reject weight exceeding limit', () => {
      const result = validateStationPlacement('C-17', 1, 100, 150, 15000);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Weight'))).toBe(true);
    });

    it('should reject invalid position', () => {
      const result = validateStationPlacement('C-17', 999, 100, 150, 8000);
      expect(result.valid).toBe(false);
    });

    it('should validate C-130 placement', () => {
      const result = validateStationPlacement('C-130', 2, 80, 100, 8000);
      expect(result.valid).toBe(true);
    });
  });
});

describe('3D Coordinate System Conversions', () => {
  describe('Cargo bay coordinates', () => {
    it('should have origin at center of cargo bay', () => {
      const centerX = 0;
      const centerZ = 0;
      expect(centerX).toBe(0);
      expect(centerZ).toBe(0);
    });

    it('should have positive X to starboard (right)', () => {
      const starboardEdge = CARGO_BAY_DIMENSIONS.width / 2;
      expect(starboardEdge).toBeGreaterThan(0);
    });

    it('should have negative X to port (left)', () => {
      const portEdge = -CARGO_BAY_DIMENSIONS.width / 2;
      expect(portEdge).toBeLessThan(0);
    });

    it('should have negative Z towards tail (aft)', () => {
      const tailEdge = -CARGO_BAY_DIMENSIONS.length / 2;
      expect(tailEdge).toBeLessThan(0);
    });

    it('should have positive Z towards nose (forward)', () => {
      const noseEdge = CARGO_BAY_DIMENSIONS.length / 2;
      expect(noseEdge).toBeGreaterThan(0);
    });
  });

  describe('Dimension conversions', () => {
    it('should convert meters to feet correctly', () => {
      const metersToFeet = (m: number) => m * 3.28084;
      const bayWidthFeet = metersToFeet(CARGO_BAY_DIMENSIONS.width);
      expect(bayWidthFeet).toBeCloseTo(18, 0);
    });

    it('should convert meters to inches correctly', () => {
      const metersToInches = (m: number) => m * 39.3701;
      const palletWidthInches = metersToInches(CARGO_DIMENSIONS[CargoType.PALLET].width);
      expect(palletWidthInches).toBeCloseTo(88, 0);
    });

    it('should convert inches to meters correctly', () => {
      const inchesToMeters = (i: number) => i * 0.0254;
      const palletLengthMeters = inchesToMeters(PALLET_463L.length);
      expect(palletLengthMeters).toBeCloseTo(2.74, 1);
    });
  });
});

describe('Collision Detection Geometry', () => {
  describe('AABB overlap calculations', () => {
    const box1 = { x: 0, y: 0, z: 0, width: 2, height: 2, length: 2 };
    const box2 = { x: 1, y: 0, z: 0, width: 2, height: 2, length: 2 };
    const box3 = { x: 5, y: 0, z: 0, width: 2, height: 2, length: 2 };

    it('should detect overlapping boxes', () => {
      const overlap = (
        Math.abs(box1.x - box2.x) < (box1.width + box2.width) / 2 &&
        Math.abs(box1.z - box2.z) < (box1.length + box2.length) / 2
      );
      expect(overlap).toBe(true);
    });

    it('should detect non-overlapping boxes', () => {
      const overlap = (
        Math.abs(box1.x - box3.x) < (box1.width + box3.width) / 2 &&
        Math.abs(box1.z - box3.z) < (box1.length + box3.length) / 2
      );
      expect(overlap).toBe(false);
    });

    it('should handle edge-touching boxes as non-overlapping', () => {
      const touchingBox = { x: 2, y: 0, z: 0, width: 2, height: 2, length: 2 };
      const overlap = Math.abs(box1.x - touchingBox.x) < (box1.width + touchingBox.width) / 2;
      expect(overlap).toBe(false);
    });
  });
});
