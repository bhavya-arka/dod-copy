/**
 * Warehouse Algorithms Tests
 * Tests for warehouse optimization, placement, and capacity algorithms
 */

interface InventoryItem {
  id: string;
  description: string;
  weight_lbs: number;
  length_in: number;
  width_in: number;
  height_in: number;
  value: number;
  receivedDate: Date;
  priority: 'low' | 'medium' | 'high';
}

interface WarehouseZone {
  id: string;
  name: string;
  weightLimit: number;
  capacityPallets: number;
  currentPallets: number;
  zoneType: 'bulk' | 'rack' | 'cold' | 'hazmat';
}

interface Bin {
  id: string;
  width: number;
  height: number;
  depth: number;
  maxWeight: number;
}

const WEIGHT_CONSTRAINT_LBS = 2000;
const SPACE_RESERVATION_DAYS = 90;

function calculateAging(receivedDate: Date, currentDate: Date = new Date()): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((currentDate.getTime() - receivedDate.getTime()) / msPerDay);
}

function checkWeightConstraint(weight: number, limit: number = WEIGHT_CONSTRAINT_LBS): boolean {
  return weight <= limit;
}

function calculateCapacityPercentage(currentPallets: number, totalCapacity: number): number {
  if (totalCapacity <= 0) return 0;
  return Math.round((currentPallets / totalCapacity) * 100 * 100) / 100;
}

function basicBinPacking(items: InventoryItem[], bin: Bin): InventoryItem[] {
  const packed: InventoryItem[] = [];
  let currentWeight = 0;
  
  const sortedItems = [...items].sort((a, b) => b.weight_lbs - a.weight_lbs);
  
  for (const item of sortedItems) {
    if (currentWeight + item.weight_lbs <= bin.maxWeight) {
      packed.push(item);
      currentWeight += item.weight_lbs;
    }
  }
  
  return packed;
}

function cardStackGroup(items: InventoryItem[], tolerance: number = 2): InventoryItem[][] {
  const groups: InventoryItem[][] = [];
  const remaining = [...items];
  
  while (remaining.length > 0) {
    const baseItem = remaining.shift()!;
    const group: InventoryItem[] = [baseItem];
    
    for (let i = remaining.length - 1; i >= 0; i--) {
      const item = remaining[i];
      const dimMatch = 
        Math.abs(item.length_in - baseItem.length_in) <= tolerance &&
        Math.abs(item.width_in - baseItem.width_in) <= tolerance;
      
      if (dimMatch) {
        group.push(item);
        remaining.splice(i, 1);
      }
    }
    
    groups.push(group);
  }
  
  return groups;
}

interface SizeCategory {
  name: string;
  minVolume: number;
  maxVolume: number;
}

const SIZE_CATEGORIES: SizeCategory[] = [
  { name: 'small', minVolume: 0, maxVolume: 1000 },
  { name: 'medium', minVolume: 1000, maxVolume: 5000 },
  { name: 'large', minVolume: 5000, maxVolume: 20000 },
  { name: 'oversized', minVolume: 20000, maxVolume: Infinity },
];

function groupBySize(items: InventoryItem[]): Record<string, InventoryItem[]> {
  const groups: Record<string, InventoryItem[]> = {
    small: [],
    medium: [],
    large: [],
    oversized: [],
  };
  
  for (const item of items) {
    const volume = item.length_in * item.width_in * item.height_in;
    const category = SIZE_CATEGORIES.find(c => volume >= c.minVolume && volume < c.maxVolume);
    if (category) {
      groups[category.name].push(item);
    }
  }
  
  return groups;
}

function calculateValueDensity(item: InventoryItem): number {
  const volume = item.length_in * item.width_in * item.height_in;
  if (volume === 0) return 0;
  return item.value / volume;
}

function rankByValueDensity(items: InventoryItem[]): InventoryItem[] {
  return [...items].sort((a, b) => calculateValueDensity(b) - calculateValueDensity(a));
}

function sortByPlacementPriority(items: InventoryItem[]): InventoryItem[] {
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  
  return [...items].sort((a, b) => {
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return calculateAging(b.receivedDate) - calculateAging(a.receivedDate);
  });
}

function assignZone(item: InventoryItem, zones: WarehouseZone[]): WarehouseZone | null {
  const volume = item.length_in * item.width_in * item.height_in;
  
  const availableZones = zones.filter(z => 
    z.currentPallets < z.capacityPallets &&
    checkWeightConstraint(item.weight_lbs, z.weightLimit)
  );
  
  if (availableZones.length === 0) return null;
  
  if (volume > 20000) {
    const bulkZone = availableZones.find(z => z.zoneType === 'bulk');
    if (bulkZone) return bulkZone;
  }
  
  return availableZones.sort((a, b) => 
    calculateCapacityPercentage(a.currentPallets, a.capacityPallets) - 
    calculateCapacityPercentage(b.currentPallets, b.capacityPallets)
  )[0];
}

function isSpaceReserved(receivedDate: Date, currentDate: Date = new Date()): boolean {
  return calculateAging(receivedDate, currentDate) <= SPACE_RESERVATION_DAYS;
}

describe('Aging Calculation', () => {
  test('should calculate aging from date correctly', () => {
    const receivedDate = new Date('2024-01-01');
    const currentDate = new Date('2024-01-11');
    expect(calculateAging(receivedDate, currentDate)).toBe(10);
  });

  test('should return 0 for same-day items', () => {
    const today = new Date();
    expect(calculateAging(today, today)).toBe(0);
  });

  test('should handle items received in the past year', () => {
    const receivedDate = new Date('2024-01-01');
    const currentDate = new Date('2024-12-31');
    expect(calculateAging(receivedDate, currentDate)).toBe(365);
  });
});

describe('Weight Constraint Checking', () => {
  test('should accept weight at exactly 2000 lbs limit', () => {
    expect(checkWeightConstraint(2000)).toBe(true);
  });

  test('should accept weight below 2000 lbs limit', () => {
    expect(checkWeightConstraint(1999)).toBe(true);
    expect(checkWeightConstraint(1000)).toBe(true);
    expect(checkWeightConstraint(0)).toBe(true);
  });

  test('should reject weight above 2000 lbs limit', () => {
    expect(checkWeightConstraint(2001)).toBe(false);
    expect(checkWeightConstraint(3000)).toBe(false);
  });

  test('should respect custom weight limits', () => {
    expect(checkWeightConstraint(1500, 1000)).toBe(false);
    expect(checkWeightConstraint(1500, 2000)).toBe(true);
  });
});

describe('Capacity Percentage Calculation', () => {
  test('should calculate capacity percentage correctly', () => {
    expect(calculateCapacityPercentage(50, 100)).toBe(50);
    expect(calculateCapacityPercentage(25, 100)).toBe(25);
    expect(calculateCapacityPercentage(100, 100)).toBe(100);
  });

  test('should handle zero capacity', () => {
    expect(calculateCapacityPercentage(10, 0)).toBe(0);
  });

  test('should handle empty warehouse', () => {
    expect(calculateCapacityPercentage(0, 100)).toBe(0);
  });

  test('should round to 2 decimal places', () => {
    expect(calculateCapacityPercentage(33, 100)).toBe(33);
    expect(calculateCapacityPercentage(1, 3)).toBe(33.33);
  });
});

describe('Bin Packing Optimization', () => {
  const createItem = (id: string, weight: number): InventoryItem => ({
    id,
    description: `Item ${id}`,
    weight_lbs: weight,
    length_in: 10,
    width_in: 10,
    height_in: 10,
    value: 100,
    receivedDate: new Date(),
    priority: 'medium',
  });

  const testBin: Bin = {
    id: 'bin-1',
    width: 48,
    height: 48,
    depth: 40,
    maxWeight: 1000,
  };

  test('should pack items that fit within weight limit', () => {
    const items = [
      createItem('1', 300),
      createItem('2', 400),
      createItem('3', 200),
    ];
    const packed = basicBinPacking(items, testBin);
    const totalWeight = packed.reduce((sum, i) => sum + i.weight_lbs, 0);
    expect(totalWeight).toBeLessThanOrEqual(testBin.maxWeight);
  });

  test('should prioritize heavier items first', () => {
    const items = [
      createItem('1', 100),
      createItem('2', 500),
      createItem('3', 300),
    ];
    const packed = basicBinPacking(items, testBin);
    expect(packed[0].weight_lbs).toBe(500);
    expect(packed[1].weight_lbs).toBe(300);
  });

  test('should not exceed bin weight capacity', () => {
    const items = [
      createItem('1', 600),
      createItem('2', 600),
    ];
    const packed = basicBinPacking(items, testBin);
    expect(packed.length).toBe(1);
  });
});

describe('Card Stack Algorithm', () => {
  const createItem = (id: string, length: number, width: number): InventoryItem => ({
    id,
    description: `Item ${id}`,
    weight_lbs: 100,
    length_in: length,
    width_in: width,
    height_in: 10,
    value: 100,
    receivedDate: new Date(),
    priority: 'medium',
  });

  test('should group items with similar dimensions', () => {
    const items = [
      createItem('1', 48, 40),
      createItem('2', 48, 40),
      createItem('3', 24, 20),
      createItem('4', 48, 41),
    ];
    const groups = cardStackGroup(items, 2);
    expect(groups.length).toBe(2);
    expect(groups[0].length).toBe(3);
  });

  test('should create separate groups for different dimensions', () => {
    const items = [
      createItem('1', 48, 40),
      createItem('2', 24, 20),
    ];
    const groups = cardStackGroup(items, 1);
    expect(groups.length).toBe(2);
  });

  test('should respect tolerance setting', () => {
    const items = [
      createItem('1', 48, 40),
      createItem('2', 50, 42),
    ];
    const strictGroups = cardStackGroup(items, 1);
    const looseGroups = cardStackGroup(items, 3);
    expect(strictGroups.length).toBe(2);
    expect(looseGroups.length).toBe(1);
  });
});

describe('Size Standardization Grouping', () => {
  const createItem = (id: string, length: number, width: number, height: number): InventoryItem => ({
    id,
    description: `Item ${id}`,
    weight_lbs: 100,
    length_in: length,
    width_in: width,
    height_in: height,
    value: 100,
    receivedDate: new Date(),
    priority: 'medium',
  });

  test('should categorize items by volume', () => {
    const items = [
      createItem('small', 5, 5, 5),
      createItem('medium', 10, 10, 20),
      createItem('large', 30, 30, 20),
      createItem('oversized', 50, 50, 50),
    ];
    const groups = groupBySize(items);
    expect(groups.small.length).toBe(1);
    expect(groups.medium.length).toBe(1);
    expect(groups.large.length).toBe(1);
    expect(groups.oversized.length).toBe(1);
  });

  test('should handle empty input', () => {
    const groups = groupBySize([]);
    expect(groups.small.length).toBe(0);
    expect(groups.medium.length).toBe(0);
    expect(groups.large.length).toBe(0);
    expect(groups.oversized.length).toBe(0);
  });
});

describe('Value Density Ranking', () => {
  const createItem = (id: string, value: number, volume: number): InventoryItem => ({
    id,
    description: `Item ${id}`,
    weight_lbs: 100,
    length_in: Math.cbrt(volume),
    width_in: Math.cbrt(volume),
    height_in: Math.cbrt(volume),
    value,
    receivedDate: new Date(),
    priority: 'medium',
  });

  test('should rank by value density (value per cubic inch)', () => {
    const items = [
      createItem('low', 100, 1000),
      createItem('high', 1000, 100),
      createItem('medium', 500, 500),
    ];
    const ranked = rankByValueDensity(items);
    expect(ranked[0].id).toBe('high');
    expect(ranked[ranked.length - 1].id).toBe('low');
  });

  test('should handle items with same value density', () => {
    const items = [
      createItem('a', 100, 100),
      createItem('b', 200, 200),
    ];
    const ranked = rankByValueDensity(items);
    expect(ranked.length).toBe(2);
  });
});

describe('Placement Priority Sorting', () => {
  const createItem = (id: string, priority: 'low' | 'medium' | 'high', daysOld: number): InventoryItem => {
    const receivedDate = new Date();
    receivedDate.setDate(receivedDate.getDate() - daysOld);
    return {
      id,
      description: `Item ${id}`,
      weight_lbs: 100,
      length_in: 10,
      width_in: 10,
      height_in: 10,
      value: 100,
      receivedDate,
      priority,
    };
  };

  test('should sort high priority items first', () => {
    const items = [
      createItem('low', 'low', 1),
      createItem('high', 'high', 1),
      createItem('medium', 'medium', 1),
    ];
    const sorted = sortByPlacementPriority(items);
    expect(sorted[0].id).toBe('high');
    expect(sorted[1].id).toBe('medium');
    expect(sorted[2].id).toBe('low');
  });

  test('should sort older items first within same priority', () => {
    const items = [
      createItem('new', 'high', 1),
      createItem('old', 'high', 10),
    ];
    const sorted = sortByPlacementPriority(items);
    expect(sorted[0].id).toBe('old');
    expect(sorted[1].id).toBe('new');
  });
});

describe('Zone Assignment Logic', () => {
  const zones: WarehouseZone[] = [
    { id: 'z1', name: 'Bulk Zone', weightLimit: 5000, capacityPallets: 100, currentPallets: 50, zoneType: 'bulk' },
    { id: 'z2', name: 'Rack Zone', weightLimit: 2000, capacityPallets: 200, currentPallets: 100, zoneType: 'rack' },
    { id: 'z3', name: 'Cold Zone', weightLimit: 2000, capacityPallets: 50, currentPallets: 45, zoneType: 'cold' },
  ];

  const createItem = (weight: number, volume: number): InventoryItem => ({
    id: 'test',
    description: 'Test Item',
    weight_lbs: weight,
    length_in: Math.cbrt(volume),
    width_in: Math.cbrt(volume),
    height_in: Math.cbrt(volume),
    value: 100,
    receivedDate: new Date(),
    priority: 'medium',
  });

  test('should assign oversized items to bulk zones', () => {
    const item = createItem(1000, 25000);
    const zone = assignZone(item, zones);
    expect(zone?.zoneType).toBe('bulk');
  });

  test('should prefer zones with lower capacity utilization', () => {
    const item = createItem(100, 100);
    const zone = assignZone(item, zones);
    expect(zone?.id).toBe('z1');
  });

  test('should return null when no zone can accommodate item', () => {
    const item = createItem(10000, 100);
    const zone = assignZone(item, zones);
    expect(zone).toBe(null);
  });
});

describe('Space Reservation (90-Day Hold)', () => {
  test('should reserve space for items within 90 days', () => {
    const receivedDate = new Date();
    receivedDate.setDate(receivedDate.getDate() - 30);
    expect(isSpaceReserved(receivedDate)).toBe(true);
  });

  test('should not reserve space for items older than 90 days', () => {
    const receivedDate = new Date();
    receivedDate.setDate(receivedDate.getDate() - 91);
    expect(isSpaceReserved(receivedDate)).toBe(false);
  });

  test('should reserve space for items exactly 90 days old', () => {
    const currentDate = new Date();
    const receivedDate = new Date();
    receivedDate.setDate(currentDate.getDate() - 90);
    expect(isSpaceReserved(receivedDate, currentDate)).toBe(true);
  });

  test('should reserve space for items received today', () => {
    const receivedDate = new Date();
    expect(isSpaceReserved(receivedDate)).toBe(true);
  });
});
