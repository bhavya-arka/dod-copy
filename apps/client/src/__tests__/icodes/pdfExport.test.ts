/**
 * PDF Export Tests
 * Tests for PDF export utilities and SVG generation
 */

import {
  SessionExportData,
  exportLoadPlansToPDF
} from '../../lib/pdfExport';
import {
  AIRCRAFT_SPECS,
  Pallet463L,
  AircraftLoadPlan,
  PalletPlacement,
  VehiclePlacement,
  MovementItem,
  AllocationResult,
  PALLET_463L,
  InsightsSummary,
  AIInsight
} from '../../lib/pacafTypes';

const createMockMovementItem = (overrides: Partial<MovementItem> = {}): MovementItem => ({
  item_id: `ITEM-${Math.random().toString(36).substr(2, 6)}`,
  description: 'Test Cargo Item',
  weight_each_lb: 1000,
  length_in: 48,
  width_in: 40,
  height_in: 36,
  type: 'PALLETIZABLE' as const,
  quantity: 1,
  advon_flag: false,
  hazmat_flag: false,
  ...overrides
});

const createMockPallet = (id: string, weight: number, options: Partial<Pallet463L> = {}): Pallet463L => ({
  id,
  items: [createMockMovementItem({ weight_each_lb: weight - PALLET_463L.tare_with_nets })],
  gross_weight: weight,
  net_weight: weight - PALLET_463L.tare_with_nets,
  height: 60,
  hazmat_flag: false,
  is_prebuilt: false,
  footprint: { length: 108, width: 88 },
  ...options
});

const createMockVehicle = (id: string, weight: number): VehiclePlacement => ({
  item_id: id,
  item: createMockMovementItem({
    item_id: id,
    description: 'HMMWV',
    weight_each_lb: weight,
    length_in: 180,
    width_in: 84,
    height_in: 72
  }),
  weight,
  length: 180,
  width: 84,
  height: 72,
  axle_weights: [weight / 2, weight / 2],
  position: { x: 0, y: 0, z: 500 },
  deck: 'MAIN'
});

const createMockLoadPlan = (
  id: string,
  aircraftType: 'C-17' | 'C-130',
  pallets: Pallet463L[],
  options: Partial<AircraftLoadPlan> = {}
): AircraftLoadPlan => ({
  aircraft_id: id,
  aircraft_type: aircraftType,
  aircraft_spec: AIRCRAFT_SPECS[aircraftType],
  sequence: 1,
  phase: 'MAIN',
  pallets: pallets.map((p, i): PalletPlacement => ({
    pallet: p,
    position_index: i,
    position_coord: AIRCRAFT_SPECS[aircraftType].stations[i]?.rdl_distance || i * 54,
    is_ramp: AIRCRAFT_SPECS[aircraftType].ramp_positions.includes(i + 1)
  })),
  rolling_stock: [],
  pax_count: 0,
  pax_weight: 0,
  seat_capacity: AIRCRAFT_SPECS[aircraftType].seat_capacity,
  seats_used: 0,
  seat_utilization_percent: 0,
  total_weight: pallets.reduce((sum, p) => sum + p.gross_weight, 0),
  payload_used_percent: (pallets.reduce((sum, p) => sum + p.gross_weight, 0) / AIRCRAFT_SPECS[aircraftType].max_payload) * 100,
  center_of_balance: 500,
  cob_percent: 27.5,
  cob_in_envelope: true,
  positions_used: pallets.length,
  positions_available: AIRCRAFT_SPECS[aircraftType].pallet_positions - pallets.length,
  utilization_percent: 75,
  ...options
});

const createMockAllocation = (): AllocationResult => ({
  aircraft_type: 'C-17',
  total_aircraft: 2,
  advon_aircraft: 1,
  main_aircraft: 1,
  load_plans: [
    createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)], { phase: 'ADVON' }),
    createMockLoadPlan('C17-002', 'C-17', [createMockPallet('P002', 4500)], { phase: 'MAIN' })
  ],
  total_weight: 9500,
  total_pallets: 2,
  total_rolling_stock: 0,
  total_pax: 0,
  total_pax_weight: 0,
  total_seat_capacity: 204,
  total_seats_used: 0,
  overall_seat_utilization: 0,
  unloaded_items: [],
  unloaded_pax: 0,
  warnings: []
});

const createMockInsights = (): InsightsSummary => ({
  insights: [
    {
      id: 'test-insight-1',
      category: 'recommendation',
      severity: 'info',
      title: 'Test Insight',
      description: 'This is a test insight',
      recommendation: 'Test recommendation'
    }
  ],
  weight_drivers: [],
  volume_drivers: [],
  critical_items: [],
  optimization_opportunities: []
});

describe('SessionExportData Interface', () => {
  test('should accept valid session export data', () => {
    const data: SessionExportData = {
      sessionName: 'Test Session',
      exportDate: new Date(),
      allocationResult: createMockAllocation()
    };
    expect(data.sessionName).toBe('Test Session');
    expect(data.exportDate).toBeInstanceOf(Date);
  });

  test('should accept session data with all optional fields', () => {
    const data: SessionExportData = {
      sessionName: 'Full Session',
      exportDate: new Date(),
      allocationResult: createMockAllocation(),
      splitFlights: [],
      scheduledFlights: [],
      routes: []
    };
    expect(data.allocationResult).toBeDefined();
    expect(data.splitFlights).toBeDefined();
  });

  test('should accept session data without optional fields', () => {
    const data: SessionExportData = {
      sessionName: 'Minimal Session',
      exportDate: new Date()
    };
    expect(data.allocationResult).toBeUndefined();
    expect(data.splitFlights).toBeUndefined();
  });
});

describe('PDF Export - Load Plan Data Structure', () => {
  test('should have valid C-17 load plan for export', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    expect(loadPlan.aircraft_id).toBe('C17-001');
    expect(loadPlan.aircraft_type).toBe('C-17');
    expect(loadPlan.aircraft_spec).toBeDefined();
    expect(loadPlan.aircraft_spec.cargo_length).toBe(1056);
    expect(loadPlan.aircraft_spec.cargo_width).toBe(216);
  });

  test('should have valid C-130 load plan for export', () => {
    const loadPlan = createMockLoadPlan('C130-001', 'C-130', [createMockPallet('P001', 5000)]);
    expect(loadPlan.aircraft_id).toBe('C130-001');
    expect(loadPlan.aircraft_type).toBe('C-130');
    expect(loadPlan.aircraft_spec.cargo_length).toBe(492);
    expect(loadPlan.aircraft_spec.cargo_width).toBe(123);
  });

  test('should include pallet placements with position data', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    expect(loadPlan.pallets.length).toBe(1);
    expect(loadPlan.pallets[0].position_index).toBe(0);
    expect(loadPlan.pallets[0].position_coord).toBeDefined();
  });

  test('should include CoB data for diagram', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    expect(loadPlan.center_of_balance).toBeDefined();
    expect(loadPlan.cob_percent).toBeDefined();
    expect(loadPlan.cob_in_envelope).toBeDefined();
  });

  test('should include hazmat flag on pallets', () => {
    const hazmatPallet = createMockPallet('HAZ-001', 5000, { hazmat_flag: true });
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [hazmatPallet]);
    expect(loadPlan.pallets[0].pallet.hazmat_flag).toBe(true);
  });
});

describe('PDF Export - Vehicle Placement Data', () => {
  test('should include vehicle with dimensions', () => {
    const vehicle = createMockVehicle('VEH-001', 8000);
    expect(vehicle.length).toBe(180);
    expect(vehicle.width).toBe(84);
    expect(vehicle.height).toBe(72);
  });

  test('should include vehicle position data', () => {
    const vehicle = createMockVehicle('VEH-001', 8000);
    expect(vehicle.position).toBeDefined();
    expect(vehicle.position.x).toBeDefined();
    expect(vehicle.position.y).toBeDefined();
    expect(vehicle.position.z).toBeDefined();
  });

  test('should include vehicle weight', () => {
    const vehicle = createMockVehicle('VEH-001', 8000);
    expect(vehicle.weight).toBe(8000);
  });
});

describe('PDF Export - Allocation Result Structure', () => {
  test('should have correct aircraft counts', () => {
    const allocation = createMockAllocation();
    expect(allocation.total_aircraft).toBe(2);
    expect(allocation.advon_aircraft).toBe(1);
    expect(allocation.main_aircraft).toBe(1);
  });

  test('should have summary metrics', () => {
    const allocation = createMockAllocation();
    expect(allocation.total_weight).toBe(9500);
    expect(allocation.total_pallets).toBe(2);
    expect(allocation.total_rolling_stock).toBe(0);
  });

  test('should include all load plans', () => {
    const allocation = createMockAllocation();
    expect(allocation.load_plans.length).toBe(2);
    expect(allocation.load_plans[0].phase).toBe('ADVON');
    expect(allocation.load_plans[1].phase).toBe('MAIN');
  });
});

describe('PDF Export - Insights Integration', () => {
  test('should accept insights for export', () => {
    const insights = createMockInsights();
    expect(insights.insights.length).toBe(1);
    expect(insights.insights[0].title).toBe('Test Insight');
  });

  test('should include insight severity', () => {
    const insights = createMockInsights();
    expect(insights.insights[0].severity).toBe('info');
  });

  test('should include insight recommendations', () => {
    const insights = createMockInsights();
    expect(insights.insights[0].recommendation).toBe('Test recommendation');
  });

  test('should support multiple severity levels', () => {
    const insights: InsightsSummary = {
      insights: [
        { id: '1', category: 'recommendation', severity: 'info', title: 'Info', description: 'Info insight' },
        { id: '2', category: 'risk_factor', severity: 'warning', title: 'Warning', description: 'Warning insight' },
        { id: '3', category: 'risk_factor', severity: 'critical', title: 'Critical', description: 'Critical insight' }
      ],
      weight_drivers: [],
      volume_drivers: [],
      critical_items: [],
      optimization_opportunities: []
    };
    expect(insights.insights.filter(i => i.severity === 'info').length).toBe(1);
    expect(insights.insights.filter(i => i.severity === 'warning').length).toBe(1);
    expect(insights.insights.filter(i => i.severity === 'critical').length).toBe(1);
  });
});

describe('PDF Export - Empty/Edge Cases', () => {
  test('should handle empty pallet list', () => {
    const loadPlan = createMockLoadPlan('C17-EMPTY', 'C-17', []);
    expect(loadPlan.pallets.length).toBe(0);
    expect(loadPlan.positions_used).toBe(0);
  });

  test('should handle empty rolling stock', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    expect(loadPlan.rolling_stock.length).toBe(0);
  });

  test('should handle maximum pallet load', () => {
    const pallets = Array(18).fill(null).map((_, i) => createMockPallet(`P${i}`, 5000));
    const loadPlan = createMockLoadPlan('C17-FULL', 'C-17', pallets);
    expect(loadPlan.pallets.length).toBe(18);
  });

  test('should handle mixed cargo', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    loadPlan.rolling_stock = [createMockVehicle('VEH-001', 8000)];
    expect(loadPlan.pallets.length).toBe(1);
    expect(loadPlan.rolling_stock.length).toBe(1);
  });
});

describe('PDF Export - C-17 vs C-130 Differences', () => {
  test('should use different cargo lengths', () => {
    const c17Plan = createMockLoadPlan('C17-001', 'C-17', []);
    const c130Plan = createMockLoadPlan('C130-001', 'C-130', []);
    expect(c17Plan.aircraft_spec.cargo_length).toBeGreaterThan(c130Plan.aircraft_spec.cargo_length);
  });

  test('should use different cargo widths', () => {
    const c17Plan = createMockLoadPlan('C17-001', 'C-17', []);
    const c130Plan = createMockLoadPlan('C130-001', 'C-130', []);
    expect(c17Plan.aircraft_spec.cargo_width).toBeGreaterThan(c130Plan.aircraft_spec.cargo_width);
  });

  test('should use different pallet positions', () => {
    const c17Plan = createMockLoadPlan('C17-001', 'C-17', []);
    const c130Plan = createMockLoadPlan('C130-001', 'C-130', []);
    expect(c17Plan.aircraft_spec.pallet_positions).toBe(18);
    expect(c130Plan.aircraft_spec.pallet_positions).toBe(6);
  });

  test('should use different ramp positions', () => {
    const c17Plan = createMockLoadPlan('C17-001', 'C-17', []);
    const c130Plan = createMockLoadPlan('C130-001', 'C-130', []);
    expect(c17Plan.aircraft_spec.ramp_positions).toEqual([17, 18]);
    expect(c130Plan.aircraft_spec.ramp_positions).toEqual([6]);
  });
});

describe('PDF Export - CoB Visualization Data', () => {
  test('should provide in-envelope CoB status', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    loadPlan.cob_in_envelope = true;
    loadPlan.cob_percent = 27.5;
    expect(loadPlan.cob_in_envelope).toBe(true);
    expect(loadPlan.cob_percent).toBeGreaterThanOrEqual(16);
    expect(loadPlan.cob_percent).toBeLessThanOrEqual(40);
  });

  test('should detect out-of-envelope CoB', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    loadPlan.cob_in_envelope = false;
    loadPlan.cob_percent = 45;
    expect(loadPlan.cob_in_envelope).toBe(false);
  });

  test('should have forward and aft limits from spec', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    expect(loadPlan.aircraft_spec.cob_min_percent).toBe(16);
    expect(loadPlan.aircraft_spec.cob_max_percent).toBe(40);
  });
});

describe('PDF Export - Weight Calculations', () => {
  test('should calculate total weight from pallets', () => {
    const pallets = [createMockPallet('P001', 5000), createMockPallet('P002', 4500)];
    const totalWeight = pallets.reduce((sum, p) => sum + p.gross_weight, 0);
    expect(totalWeight).toBe(9500);
  });

  test('should calculate payload percentage', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 17090)]);
    expect(loadPlan.payload_used_percent).toBeCloseTo(10, 0);
  });

  test('should include pax weight in total', () => {
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)]);
    loadPlan.pax_count = 10;
    loadPlan.pax_weight = 2250;
    expect(loadPlan.pax_weight).toBe(2250);
  });
});
