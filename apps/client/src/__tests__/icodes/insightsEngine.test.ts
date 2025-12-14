/**
 * Insights Engine Tests
 * Tests for AI insights generation, risk detection, and recommendations
 */

import {
  analyzeMovementList,
  analyzeAllocation,
  explainAircraftCount,
  explainSecondAircraft,
  identifyWeightConstrainedPallet,
  generateQuickInsights
} from '../../lib/insightsEngine';
import {
  MovementItem,
  ClassifiedItems,
  AllocationResult,
  AircraftLoadPlan,
  AIInsight,
  InsightsSummary,
  AIRCRAFT_SPECS,
  Pallet463L,
  PalletPlacement,
  VehiclePlacement,
  PALLET_463L
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

const createMockClassifiedItems = (overrides: Partial<ClassifiedItems> = {}): ClassifiedItems => ({
  advon_items: [],
  main_items: [],
  rolling_stock: [],
  prebuilt_pallets: [],
  loose_items: [],
  pax_items: [],
  ...overrides
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

const createMockAllocation = (loadPlans: AircraftLoadPlan[] = []): AllocationResult => ({
  aircraft_type: 'C-17',
  total_aircraft: loadPlans.length,
  advon_aircraft: loadPlans.filter(p => p.phase === 'ADVON').length,
  main_aircraft: loadPlans.filter(p => p.phase === 'MAIN').length,
  load_plans: loadPlans,
  total_weight: loadPlans.reduce((sum, p) => sum + p.total_weight, 0),
  total_pallets: loadPlans.reduce((sum, p) => sum + p.pallets.length, 0),
  total_rolling_stock: loadPlans.reduce((sum, p) => sum + p.rolling_stock.length, 0),
  total_pax: loadPlans.reduce((sum, p) => sum + p.pax_count, 0),
  total_pax_weight: loadPlans.reduce((sum, p) => sum + p.pax_weight, 0),
  total_seat_capacity: loadPlans.reduce((sum, p) => sum + p.seat_capacity, 0),
  total_seats_used: loadPlans.reduce((sum, p) => sum + p.seats_used, 0),
  overall_seat_utilization: 0,
  unloaded_items: [],
  unloaded_pax: 0,
  warnings: []
});

describe('Insights Engine - Movement List Analysis', () => {
  test('should generate insights summary for empty item list', () => {
    const items: MovementItem[] = [];
    const classified = createMockClassifiedItems();
    const result = analyzeMovementList(items, classified);
    expect(result).toBeDefined();
    expect(result.insights).toBeDefined();
    expect(Array.isArray(result.insights)).toBe(true);
  });

  test('should identify weight concentration in top items', () => {
    const items = [
      createMockMovementItem({ item_id: 'HEAVY-1', description: 'Heavy Item 1', weight_each_lb: 5000 }),
      createMockMovementItem({ item_id: 'HEAVY-2', description: 'Heavy Item 2', weight_each_lb: 4000 }),
      createMockMovementItem({ item_id: 'HEAVY-3', description: 'Heavy Item 3', weight_each_lb: 3000 }),
      createMockMovementItem({ item_id: 'LIGHT-1', description: 'Light Item', weight_each_lb: 500 })
    ];
    const classified = createMockClassifiedItems();
    const result = analyzeMovementList(items, classified);
    const weightConcentration = result.insights.find(i => i.id === 'weight_concentration');
    expect(weightConcentration).toBeDefined();
  });

  test('should detect hazmat items', () => {
    const items = [
      createMockMovementItem({ item_id: 'HAZ-1', description: 'Hazmat Item', hazmat_flag: true, weight_each_lb: 1000 })
    ];
    const classified = createMockClassifiedItems();
    const result = analyzeMovementList(items, classified);
    const hazmatInsight = result.insights.find(i => i.id === 'hazmat_present');
    expect(hazmatInsight).toBeDefined();
    expect(hazmatInsight?.severity).toBe('warning');
  });

  test('should detect overheight pallets', () => {
    const tallPallet = createMockMovementItem({
      item_id: 'TALL-1',
      description: 'Tall Pallet',
      height_in: 100,
      type: 'PREBUILT_PALLET'
    });
    const items = [tallPallet];
    const classified = createMockClassifiedItems({
      prebuilt_pallets: [tallPallet]
    });
    const result = analyzeMovementList(items, classified);
    const heightInsight = result.insights.find(i => i.id === 'height_optimization');
    expect(heightInsight).toBeDefined();
  });

  test('should detect rolling stock requiring C-17', () => {
    const oversizeVehicle = createMockMovementItem({
      item_id: 'VEH-1',
      description: 'Oversize Vehicle',
      width_in: 130,
      type: 'ROLLING_STOCK',
      weight_each_lb: 10000
    });
    const items = [oversizeVehicle];
    const classified = createMockClassifiedItems({
      rolling_stock: [oversizeVehicle]
    });
    const result = analyzeMovementList(items, classified);
    const c17Required = result.insights.find(i => i.id === 'c17_required');
    expect(c17Required).toBeDefined();
    expect(c17Required?.severity).toBe('warning');
  });

  test('should include weight drivers in summary', () => {
    const items = [
      createMockMovementItem({ item_id: 'HEAVY-1', description: 'Heavy', weight_each_lb: 5000 }),
      createMockMovementItem({ item_id: 'LIGHT-1', description: 'Light', weight_each_lb: 500 })
    ];
    const classified = createMockClassifiedItems();
    const result = analyzeMovementList(items, classified);
    expect(result.weight_drivers.length).toBeGreaterThan(0);
    expect(result.weight_drivers[0].weight).toBeGreaterThanOrEqual(result.weight_drivers[1]?.weight || 0);
  });

  test('should include volume drivers in summary', () => {
    const items = [
      createMockMovementItem({
        item_id: 'BIG-1',
        description: 'Big Item',
        length_in: 100,
        width_in: 80,
        height_in: 60
      }),
      createMockMovementItem({
        item_id: 'SMALL-1',
        description: 'Small Item',
        length_in: 20,
        width_in: 20,
        height_in: 20
      })
    ];
    const classified = createMockClassifiedItems();
    const result = analyzeMovementList(items, classified);
    expect(result.volume_drivers.length).toBeGreaterThan(0);
  });

  test('should detect pax with hazmat conflict', () => {
    const paxItem = createMockMovementItem({
      item_id: 'PAX-1',
      type: 'PAX' as const,
      pax_count: 20
    });
    const hazmatItem = createMockMovementItem({
      item_id: 'HAZ-1',
      hazmat_flag: true
    });
    const items = [paxItem, hazmatItem];
    const classified = createMockClassifiedItems({
      pax_items: [paxItem]
    });
    const result = analyzeMovementList(items, classified);
    expect(result.optimization_opportunities.some(o => o.includes('PAX'))).toBe(true);
  });

  test('should recommend consolidating loose items', () => {
    const looseItems = Array(10).fill(null).map((_, i) =>
      createMockMovementItem({ item_id: `LOOSE-${i}`, description: `Loose ${i}` })
    );
    const classified = createMockClassifiedItems({
      loose_items: looseItems
    });
    const result = analyzeMovementList(looseItems, classified);
    expect(result.optimization_opportunities.some(o => o.includes('loose items'))).toBe(true);
  });
});

describe('Insights Engine - Allocation Analysis', () => {
  test('should detect low utilization', () => {
    const loadPlans = [
      createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)], { utilization_percent: 50 })
    ];
    const allocation = createMockAllocation(loadPlans);
    const insights = analyzeAllocation(allocation);
    const lowUtilization = insights.find(i => i.id === 'low_utilization');
    expect(lowUtilization).toBeDefined();
  });

  test('should praise high utilization', () => {
    const loadPlans = [
      createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 100000)], { utilization_percent: 92 })
    ];
    const allocation = createMockAllocation(loadPlans);
    const insights = analyzeAllocation(allocation);
    const highUtilization = insights.find(i => i.id === 'high_utilization');
    expect(highUtilization).toBeDefined();
    expect(highUtilization?.severity).toBe('info');
  });

  test('should detect CoB out of envelope', () => {
    const loadPlans = [
      createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)], {
        cob_in_envelope: false,
        cob_percent: 45
      })
    ];
    const allocation = createMockAllocation(loadPlans);
    const insights = analyzeAllocation(allocation);
    const cobWarning = insights.find(i => i.id.startsWith('cob_warning'));
    expect(cobWarning).toBeDefined();
    expect(cobWarning?.severity).toBe('critical');
  });

  test('should detect unloaded items', () => {
    const allocation = createMockAllocation([
      createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)])
    ]);
    allocation.unloaded_items = [
      createMockMovementItem({ item_id: 'UNLOADED-1', weight_each_lb: 5000 })
    ];
    const insights = analyzeAllocation(allocation);
    const unloadedInsight = insights.find(i => i.id === 'unloaded_items');
    expect(unloadedInsight).toBeDefined();
    expect(unloadedInsight?.severity).toBe('critical');
  });

  test('should detect aircraft near max payload', () => {
    const loadPlans = [
      createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 160000)], { payload_used_percent: 96 })
    ];
    const allocation = createMockAllocation(loadPlans);
    const insights = analyzeAllocation(allocation);
    const nearMaxInsight = insights.find(i => i.id === 'near_max_weight');
    expect(nearMaxInsight).toBeDefined();
    expect(nearMaxInsight?.severity).toBe('warning');
  });

  test('should detect position-limited aircraft', () => {
    const loadPlans = [
      createMockLoadPlan('C17-001', 'C-17', Array(18).fill(null).map((_, i) => createMockPallet(`P${i}`, 3000)), {
        positions_used: 18,
        positions_available: 0,
        payload_used_percent: 50
      })
    ];
    const allocation = createMockAllocation(loadPlans);
    const insights = analyzeAllocation(allocation);
    const positionLimited = insights.find(i => i.id === 'position_limited');
    expect(positionLimited).toBeDefined();
  });
});

describe('Insights Engine - Explanation Functions', () => {
  test('should explain aircraft count', () => {
    const allocation = createMockAllocation([
      createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)], { phase: 'ADVON' }),
      createMockLoadPlan('C17-002', 'C-17', [createMockPallet('P002', 4500)], { phase: 'MAIN' })
    ]);
    const explanation = explainAircraftCount(allocation);
    expect(explanation).toContain('2');
    expect(explanation).toContain('C-17');
    expect(explanation).toContain('ADVON');
    expect(explanation).toContain('MAIN');
  });

  test('should explain single aircraft scenario', () => {
    const allocation = createMockAllocation([
      createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)])
    ]);
    const explanation = explainSecondAircraft(allocation);
    expect(explanation).toContain('Only one aircraft');
  });

  test('should explain why second aircraft is needed', () => {
    const loadPlan1 = createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 100000)], {
      payload_used_percent: 95,
      positions_used: 18,
      positions_available: 0
    });
    const loadPlan2 = createMockLoadPlan('C17-002', 'C-17', [createMockPallet('P002', 5000)]);
    const allocation = createMockAllocation([loadPlan1, loadPlan2]);
    const explanation = explainSecondAircraft(allocation);
    expect(explanation).toContain('second');
    expect(explanation).toContain('required');
  });

  test('should identify weight constrained pallet', () => {
    const heavyPallet = createMockPallet('HEAVY-P001', 9500);
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [heavyPallet]);
    const allocation = createMockAllocation([loadPlan]);
    const explanation = identifyWeightConstrainedPallet(allocation);
    expect(explanation).toContain('HEAVY-P001');
  });

  test('should handle no weight constrained pallets', () => {
    const allocation = createMockAllocation([]);
    const explanation = identifyWeightConstrainedPallet(allocation);
    expect(explanation).toContain('No pallets');
  });
});

describe('Insights Engine - Quick Insights', () => {
  test('should generate quick insights for allocation', () => {
    const allocation = createMockAllocation([
      createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)], { utilization_percent: 80 })
    ]);
    const insights = generateQuickInsights(allocation);
    expect(Array.isArray(insights)).toBe(true);
  });

  test('should warn on low utilization', () => {
    const allocation = createMockAllocation([
      createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)], { utilization_percent: 50 })
    ]);
    const insights = generateQuickInsights(allocation);
    expect(insights.some(i => i.includes('utilization') || i.includes('unused'))).toBe(true);
  });

  test('should praise high utilization', () => {
    const allocation = createMockAllocation([
      createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 100000)], { utilization_percent: 92 })
    ]);
    const insights = generateQuickInsights(allocation);
    expect(insights.some(i => i.toLowerCase().includes('excellent') || i.includes('92%'))).toBe(true);
  });

  test('should warn on CoB issues', () => {
    const allocation = createMockAllocation([
      createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)], {
        cob_in_envelope: false,
        cob_percent: 45
      })
    ]);
    const insights = generateQuickInsights(allocation);
    expect(insights.some(i => i.includes('⚠️') || i.includes('Center of Balance'))).toBe(true);
  });

  test('should detect hazmat requiring special handling', () => {
    const hazmatPallet = createMockPallet('HAZ-001', 5000, { hazmat_flag: true });
    const loadPlan = createMockLoadPlan('C17-001', 'C-17', [hazmatPallet]);
    const allocation = createMockAllocation([loadPlan]);
    const insights = generateQuickInsights(allocation);
    expect(insights.some(i => i.includes('HAZMAT'))).toBe(true);
  });

  test('should recommend staggered departures for large formations', () => {
    const loadPlans = Array(5).fill(null).map((_, i) =>
      createMockLoadPlan(`C17-00${i + 1}`, 'C-17', [createMockPallet(`P${i}`, 5000)], { utilization_percent: 80 })
    );
    const allocation = createMockAllocation(loadPlans);
    const insights = generateQuickInsights(allocation);
    expect(insights.some(i => i.includes('formation') || i.includes('stagger'))).toBe(true);
  });

  test('should include fuel breakdown insights when provided', () => {
    const allocation = createMockAllocation([
      createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 5000)], { utilization_percent: 80 })
    ]);
    const fuelBreakdown = {
      base_fuel_lb: 50000,
      additional_fuel_from_splits: 10000,
      cost_per_lb: 3
    };
    const insights = generateQuickInsights(allocation, fuelBreakdown);
    expect(insights.some(i => i.includes('fuel') || i.includes('$'))).toBe(true);
  });
});

describe('Insights Engine - Edge Cases', () => {
  test('should handle empty allocation', () => {
    const allocation = createMockAllocation([]);
    const insights = analyzeAllocation(allocation);
    expect(Array.isArray(insights)).toBe(true);
  });

  test('should handle allocation with all valid plans', () => {
    const loadPlans = [
      createMockLoadPlan('C17-001', 'C-17', [createMockPallet('P001', 50000)], {
        utilization_percent: 85,
        cob_in_envelope: true,
        cob_percent: 28
      })
    ];
    const allocation = createMockAllocation(loadPlans);
    const insights = analyzeAllocation(allocation);
    const criticalIssues = insights.filter(i => i.severity === 'critical');
    expect(criticalIssues.length).toBe(0);
  });

  test('should handle zero weight items', () => {
    const items = [createMockMovementItem({ weight_each_lb: 0 })];
    const classified = createMockClassifiedItems();
    const result = analyzeMovementList(items, classified);
    expect(result).toBeDefined();
  });

  test('should handle very heavy single item', () => {
    const items = [createMockMovementItem({ weight_each_lb: 50000, description: 'Super Heavy' })];
    const classified = createMockClassifiedItems();
    const result = analyzeMovementList(items, classified);
    expect(result.weight_drivers[0].description).toBe('Super Heavy');
  });

  test('should handle critical items detection', () => {
    const criticalItem = createMockMovementItem({
      item_id: 'CRITICAL-1',
      weight_each_lb: 9000,
      length_in: 110,
      width_in: 110
    });
    const items = [criticalItem];
    const classified = createMockClassifiedItems();
    const result = analyzeMovementList(items, classified);
    const criticalInsight = result.insights.find(i => i.id === 'critical_items');
    expect(criticalInsight).toBeDefined();
  });
});
