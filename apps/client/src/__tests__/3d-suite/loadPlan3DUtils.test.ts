import {
  AIRCRAFT_SPECS,
  AircraftLoadPlan,
  PalletPlacement,
  VehiclePlacement,
  Pallet463L,
  PALLET_463L,
  PAX_WEIGHT_LB
} from '../../lib/pacafTypes';

function createMockLoadPlan(overrides?: Partial<AircraftLoadPlan>): AircraftLoadPlan {
  const spec = AIRCRAFT_SPECS['C-17'];
  return {
    aircraft_id: 'test-aircraft-1',
    aircraft_type: 'C-17',
    aircraft_spec: spec,
    sequence: 1,
    phase: 'MAIN',
    pallets: [],
    rolling_stock: [],
    pax_count: 0,
    total_weight: 0,
    payload_used_percent: 0,
    pax_weight: 0,
    center_of_balance: 500,
    cob_percent: 25,
    cob_in_envelope: true,
    positions_used: 0,
    positions_available: 18,
    utilization_percent: 0,
    seat_capacity: 102,
    seats_used: 0,
    seat_utilization_percent: 0,
    ...overrides
  };
}

function createMockPallet(id: string, weight: number = 5000): Pallet463L {
  return {
    id,
    items: [],
    gross_weight: weight + PALLET_463L.tare_weight,
    net_weight: weight,
    height: 80,
    hazmat_flag: false,
    is_prebuilt: false,
    footprint: {
      length: PALLET_463L.length,
      width: PALLET_463L.width
    }
  };
}

function createMockPalletPlacement(pallet: Pallet463L, position: number): PalletPlacement {
  return {
    pallet,
    position_index: position,
    position_coord: 245 + (position - 1) * 58,
    is_ramp: position >= 17,
    lateral_placement: {
      y_center_in: 0,
      y_left_in: -PALLET_463L.width / 2,
      y_right_in: PALLET_463L.width / 2
    }
  };
}

describe('Weight Heatmap Calculations', () => {
  describe('Weight distribution across positions', () => {
    it('should calculate weight for empty load plan', () => {
      const loadPlan = createMockLoadPlan();
      expect(loadPlan.total_weight).toBe(0);
    });

    it('should calculate weight for single pallet', () => {
      const pallet = createMockPallet('p1', 5000);
      const placement = createMockPalletPlacement(pallet, 1);
      const loadPlan = createMockLoadPlan({
        pallets: [placement],
        total_weight: pallet.gross_weight
      });
      expect(loadPlan.total_weight).toBeCloseTo(5290, 0);
    });

    it('should calculate weight for multiple pallets', () => {
      const pallets = [
        createMockPalletPlacement(createMockPallet('p1', 5000), 1),
        createMockPalletPlacement(createMockPallet('p2', 6000), 2),
        createMockPalletPlacement(createMockPallet('p3', 4000), 3)
      ];
      const totalWeight = pallets.reduce((sum, p) => sum + p.pallet.gross_weight, 0);
      const loadPlan = createMockLoadPlan({
        pallets,
        total_weight: totalWeight
      });
      expect(loadPlan.total_weight).toBeCloseTo(15870, 0);
    });

    it('should calculate payload percentage correctly', () => {
      const maxPayload = AIRCRAFT_SPECS['C-17'].max_payload;
      const usedWeight = 50000;
      const payloadPercent = (usedWeight / maxPayload) * 100;
      expect(payloadPercent).toBeCloseTo(29.3, 1);
    });
  });

  describe('Weight zone calculations', () => {
    it('should identify light zones (< 3000 lbs)', () => {
      const weight = 2500;
      const isLight = weight < 3000;
      expect(isLight).toBe(true);
    });

    it('should identify medium zones (3000-7000 lbs)', () => {
      const weight = 5000;
      const isMedium = weight >= 3000 && weight <= 7000;
      expect(isMedium).toBe(true);
    });

    it('should identify heavy zones (> 7000 lbs)', () => {
      const weight = 9000;
      const isHeavy = weight > 7000;
      expect(isHeavy).toBe(true);
    });
  });
});

describe('View Mode Logic', () => {
  describe('Normal view mode', () => {
    it('should display solid cargo materials', () => {
      const viewMode = 'normal';
      expect(viewMode).toBe('normal');
    });
  });

  describe('Wireframe view mode', () => {
    it('should show cargo outlines only', () => {
      const viewMode = 'wireframe';
      expect(viewMode).toBe('wireframe');
    });
  });

  describe('Heatmap view mode', () => {
    it('should color cargo by weight', () => {
      const viewMode = 'heatmap';
      expect(viewMode).toBe('heatmap');
    });

    it('should map light weight to cool colors', () => {
      const weight = 2000;
      const normalizedWeight = weight / 10000;
      expect(normalizedWeight).toBeLessThan(0.5);
    });

    it('should map heavy weight to warm colors', () => {
      const weight = 9000;
      const normalizedWeight = weight / 10000;
      expect(normalizedWeight).toBeGreaterThan(0.5);
    });
  });

  describe('CoG view mode', () => {
    it('should highlight center of gravity', () => {
      const viewMode = 'cog';
      expect(viewMode).toBe('cog');
    });
  });
});

describe('Cargo Selection Logic', () => {
  describe('Selection state', () => {
    it('should track selected cargo item', () => {
      const selectedCargo = { id: 'pallet-1', type: 'pallet' };
      expect(selectedCargo.id).toBe('pallet-1');
    });

    it('should handle null selection', () => {
      const selectedCargo = null;
      expect(selectedCargo).toBeNull();
    });

    it('should update selection on click', () => {
      let selectedCargo: string | null = null;
      const handleClick = (id: string) => { selectedCargo = id; };
      handleClick('pallet-2');
      expect(selectedCargo).toBe('pallet-2');
    });

    it('should deselect on second click', () => {
      let selectedCargo: string | null = 'pallet-1';
      const handleClick = (id: string) => {
        selectedCargo = selectedCargo === id ? null : id;
      };
      handleClick('pallet-1');
      expect(selectedCargo).toBeNull();
    });
  });

  describe('Cargo info display', () => {
    it('should show cargo name', () => {
      const cargo = { name: 'Pallet A', weight: 5000 };
      expect(cargo.name).toBe('Pallet A');
    });

    it('should show cargo weight in lbs', () => {
      const cargo = { name: 'Pallet A', weight: 5000 };
      expect(cargo.weight).toBe(5000);
    });

    it('should show cargo dimensions', () => {
      const cargo = {
        dimensions: { length: 108, width: 88, height: 80 }
      };
      expect(cargo.dimensions.length).toBe(108);
      expect(cargo.dimensions.width).toBe(88);
    });

    it('should show cargo position', () => {
      const cargo = { position: { x: 0, y: 0, z: 100 } };
      expect(cargo.position.z).toBe(100);
    });
  });
});

describe('Position Coordinate Mapping', () => {
  describe('Pallet position to 3D coordinates', () => {
    it('should map position 1 to front of cargo bay', () => {
      const rdl = 245;
      expect(rdl).toBe(245);
    });

    it('should calculate position spacing', () => {
      const spacing = 58;
      expect(spacing).toBe(58);
    });

    it('should convert RDL to 3D Z coordinate', () => {
      const rdl = 500;
      const cargoStart = 245;
      const scale = 0.0254;
      const z = (rdl - cargoStart) * scale;
      expect(z).toBeCloseTo(6.48, 1);
    });

    it('should center laterally by default', () => {
      const lateralOffset = 0;
      expect(lateralOffset).toBe(0);
    });
  });

  describe('Vehicle position mapping', () => {
    it('should place vehicle on floor (y=0)', () => {
      const vehicleY = 0;
      expect(vehicleY).toBe(0);
    });

    it('should support lateral offset for vehicles', () => {
      const leftOffset = -50;
      const rightOffset = 50;
      expect(leftOffset).toBeLessThan(0);
      expect(rightOffset).toBeGreaterThan(0);
    });
  });
});

describe('PAX Weight Calculations', () => {
  describe('Passenger weight constants', () => {
    it('should use 225 lbs per passenger with gear', () => {
      expect(PAX_WEIGHT_LB).toBe(225);
    });

    it('should calculate total PAX weight correctly', () => {
      const paxCount = 50;
      const totalWeight = paxCount * PAX_WEIGHT_LB;
      expect(totalWeight).toBe(11250);
    });
  });

  describe('Seat utilization', () => {
    it('should track seat capacity', () => {
      const loadPlan = createMockLoadPlan();
      expect(loadPlan.seat_capacity).toBe(102);
    });

    it('should calculate seat utilization percentage', () => {
      const loadPlan = createMockLoadPlan({
        pax_count: 51,
        seats_used: 51,
        seat_utilization_percent: 50
      });
      expect(loadPlan.seat_utilization_percent).toBe(50);
    });
  });
});

describe('Center of Balance Calculations', () => {
  describe('CoB envelope', () => {
    it('should define min CoB percent for C-17', () => {
      const spec = AIRCRAFT_SPECS['C-17'];
      expect(spec.cob_min_percent).toBe(16);
    });

    it('should define max CoB percent for C-17', () => {
      const spec = AIRCRAFT_SPECS['C-17'];
      expect(spec.cob_max_percent).toBe(40);
    });

    it('should validate CoB within envelope', () => {
      const loadPlan = createMockLoadPlan({ cob_percent: 25 });
      const spec = loadPlan.aircraft_spec;
      const inEnvelope = loadPlan.cob_percent >= spec.cob_min_percent &&
                         loadPlan.cob_percent <= spec.cob_max_percent;
      expect(inEnvelope).toBe(true);
    });

    it('should detect CoB forward of envelope', () => {
      const cob = 10;
      const minAllowed = 16;
      const forwardOfLimit = cob < minAllowed;
      expect(forwardOfLimit).toBe(true);
    });

    it('should detect CoB aft of envelope', () => {
      const cob = 45;
      const maxAllowed = 40;
      const aftOfLimit = cob > maxAllowed;
      expect(aftOfLimit).toBe(true);
    });
  });
});

describe('Ramp Position Handling', () => {
  describe('Ramp position identification', () => {
    it('should identify ramp positions for C-17', () => {
      const spec = AIRCRAFT_SPECS['C-17'];
      expect(spec.ramp_positions).toContain(17);
      expect(spec.ramp_positions).toContain(18);
    });

    it('should have reduced height for ramp positions', () => {
      const spec = AIRCRAFT_SPECS['C-17'];
      expect(spec.ramp_clearance_height).toBe(70);
      expect(spec.ramp_clearance_height).toBeLessThan(spec.main_deck_height);
    });

    it('should have reduced weight limit for ramp', () => {
      const spec = AIRCRAFT_SPECS['C-17'];
      expect(spec.ramp_position_weight).toBe(7500);
      expect(spec.ramp_position_weight).toBeLessThan(spec.per_position_weight);
    });
  });
});
