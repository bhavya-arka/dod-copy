/**
 * Schema Validation Tests
 * Tests for database schema validation using Zod schemas
 */

import { z } from 'zod';

const userSchema = z.object({
  email: z.string().email('Invalid email format'),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const warehouseSiteSchema = z.object({
  user_id: z.number().int().positive(),
  code: z.string().min(1, 'Code is required'),
  name: z.string().min(1, 'Name is required'),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  timezone: z.string().default('UTC'),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  active: z.boolean().default(true),
});

const nsnPattern = /^\d{4}-\d{2}-\d{3}-\d{4}$/;

const warehouseInventoryItemSchema = z.object({
  site_id: z.number().int().positive(),
  location_id: z.number().int().positive().optional(),
  nsn: z.string().regex(nsnPattern, 'NSN must be in format XXXX-XX-XXX-XXXX').optional(),
  fsc: z.string().length(4).optional(),
  niin: z.string().length(9).optional(),
  description: z.string().min(1, 'Description is required'),
  quantity: z.number().int().nonnegative('Quantity must be non-negative'),
  weight_lbs: z.number().positive('Weight must be positive').optional(),
});

const warehouseTransferSchema = z.object({
  user_id: z.number().int().positive(),
  source_site_id: z.number().int().positive('Source site is required'),
  destination_site_id: z.number().int().positive('Destination site is required'),
  status: z.enum(['pending', 'in_transit', 'completed', 'cancelled']).default('pending'),
  transport_mode: z.enum(['land', 'sea', 'air']).default('land'),
  transfer_items: z.array(z.any()).default([]),
  notes: z.string().optional(),
});

const seaVoyageSchema = z.object({
  user_id: z.number().int().positive(),
  name: z.string().min(1, 'Name is required'),
  vessel_name: z.string().optional(),
  vessel_imo: z.string().optional(),
  vessel_hull_number: z.string().regex(/^[A-Z]-[A-Z]{2,3}\s?\d+$/, 'Invalid hull designation format').optional(),
  vessel_class: z.string().optional(),
  origin_port: z.string().min(1, 'Origin port is required'),
  destination_port: z.string().min(1, 'Destination port is required'),
  port_calls: z.array(z.any()).default([]),
  status: z.enum(['planned', 'in_transit', 'completed', 'cancelled']).default('planned'),
});

const landRouteSchema = z.object({
  user_id: z.number().int().positive(),
  name: z.string().min(1, 'Name is required'),
  origin_name: z.string().min(1, 'Origin name is required'),
  origin_lat: z.number().min(-90).max(90).optional(),
  origin_lng: z.number().min(-180).max(180).optional(),
  destination_name: z.string().min(1, 'Destination name is required'),
  destination_lat: z.number().min(-90).max(90).optional(),
  destination_lng: z.number().min(-180).max(180).optional(),
  waypoints: z.array(z.any()).default([]),
  distance_km: z.number().positive().optional(),
  estimated_duration_hrs: z.number().positive().optional(),
  status: z.enum(['planned', 'active', 'completed', 'cancelled']).default('planned'),
});

const flightPlanSchema = z.object({
  user_id: z.number().int().positive(),
  name: z.string().min(1, 'Name is required'),
  status: z.enum(['draft', 'complete', 'archived']).default('draft'),
  allocation_data: z.record(z.any()),
  movement_data: z.any().optional(),
  movement_items_count: z.number().int().nonnegative(),
  total_weight_lb: z.number().int().nonnegative(),
  aircraft_count: z.number().int().nonnegative(),
  preferred_aircraft_type_id: z.string().optional(),
  allow_mixed_fleet: z.boolean().default(true),
  mixed_fleet_mode: z.enum(['PREFERRED_FIRST', 'OPTIMIZE_COST', 'MIN_AIRCRAFT', 'USER_LOCKED']).default('PREFERRED_FIRST'),
  preference_strength: z.number().min(0).max(1).default(0.5),
});

describe('User Schema Validation', () => {
  test('should validate a complete valid user', () => {
    const validUser = {
      email: 'test@example.com',
      username: 'testuser',
      password: 'password123',
    };
    const result = userSchema.safeParse(validUser);
    expect(result.success).toBe(true);
  });

  test('should require email field', () => {
    const userWithoutEmail = {
      username: 'testuser',
      password: 'password123',
    };
    const result = userSchema.safeParse(userWithoutEmail);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes('email'))).toBe(true);
    }
  });

  test('should require password minimum length of 6 characters', () => {
    const userWithShortPassword = {
      email: 'test@example.com',
      username: 'testuser',
      password: '12345',
    };
    const result = userSchema.safeParse(userWithShortPassword);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes('password'))).toBe(true);
    }
  });

  test('should accept password with exactly 6 characters', () => {
    const user = {
      email: 'test@example.com',
      username: 'testuser',
      password: '123456',
    };
    const result = userSchema.safeParse(user);
    expect(result.success).toBe(true);
  });

  test('should reject invalid email format', () => {
    const userWithInvalidEmail = {
      email: 'not-an-email',
      username: 'testuser',
      password: 'password123',
    };
    const result = userSchema.safeParse(userWithInvalidEmail);
    expect(result.success).toBe(false);
  });
});

describe('Warehouse Site Schema Validation', () => {
  test('should validate a complete warehouse site', () => {
    const validSite = {
      user_id: 1,
      code: 'WH-001',
      name: 'Main Warehouse',
      address: '123 Storage Ave',
      city: 'San Diego',
      country: 'USA',
      latitude: 32.7157,
      longitude: -117.1611,
      active: true,
    };
    const result = warehouseSiteSchema.safeParse(validSite);
    expect(result.success).toBe(true);
  });

  test('should require name field', () => {
    const siteWithoutName = {
      user_id: 1,
      code: 'WH-001',
    };
    const result = warehouseSiteSchema.safeParse(siteWithoutName);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes('name'))).toBe(true);
    }
  });

  test('should default timezone to UTC', () => {
    const siteWithoutTimezone = {
      user_id: 1,
      code: 'WH-001',
      name: 'Test Warehouse',
    };
    const result = warehouseSiteSchema.parse(siteWithoutTimezone);
    expect(result.timezone).toBe('UTC');
  });
});

describe('Inventory Item Schema Validation', () => {
  test('should validate a complete inventory item', () => {
    const validItem = {
      site_id: 1,
      location_id: 10,
      nsn: '8415-01-530-2157',
      fsc: '8415',
      niin: '015302157',
      description: 'Combat Boots',
      quantity: 100,
      weight_lbs: 2.5,
    };
    const result = warehouseInventoryItemSchema.safeParse(validItem);
    expect(result.success).toBe(true);
  });

  test('should validate NSN format XXXX-XX-XXX-XXXX', () => {
    const itemWithValidNsn = {
      site_id: 1,
      nsn: '8415-01-530-2157',
      description: 'Combat Boots',
      quantity: 10,
    };
    const result = warehouseInventoryItemSchema.safeParse(itemWithValidNsn);
    expect(result.success).toBe(true);
  });

  test('should reject invalid NSN format', () => {
    const itemWithInvalidNsn = {
      site_id: 1,
      nsn: '8415012157',
      description: 'Combat Boots',
      quantity: 10,
    };
    const result = warehouseInventoryItemSchema.safeParse(itemWithInvalidNsn);
    expect(result.success).toBe(false);
  });

  test('should require positive weight when provided', () => {
    const itemWithNegativeWeight = {
      site_id: 1,
      description: 'Test Item',
      quantity: 10,
      weight_lbs: -5,
    };
    const result = warehouseInventoryItemSchema.safeParse(itemWithNegativeWeight);
    expect(result.success).toBe(false);
  });

  test('should require non-negative quantity', () => {
    const itemWithNegativeQuantity = {
      site_id: 1,
      description: 'Test Item',
      quantity: -1,
    };
    const result = warehouseInventoryItemSchema.safeParse(itemWithNegativeQuantity);
    expect(result.success).toBe(false);
  });

  test('should accept zero quantity', () => {
    const itemWithZeroQuantity = {
      site_id: 1,
      description: 'Test Item',
      quantity: 0,
    };
    const result = warehouseInventoryItemSchema.safeParse(itemWithZeroQuantity);
    expect(result.success).toBe(true);
  });
});

describe('Transfer Schema Validation', () => {
  test('should validate a complete transfer', () => {
    const validTransfer = {
      user_id: 1,
      source_site_id: 1,
      destination_site_id: 2,
      status: 'pending' as const,
      transport_mode: 'land' as const,
      transfer_items: [{ item_id: 1, quantity: 10 }],
    };
    const result = warehouseTransferSchema.safeParse(validTransfer);
    expect(result.success).toBe(true);
  });

  test('should require source site', () => {
    const transferWithoutSource = {
      user_id: 1,
      destination_site_id: 2,
    };
    const result = warehouseTransferSchema.safeParse(transferWithoutSource);
    expect(result.success).toBe(false);
  });

  test('should require destination site', () => {
    const transferWithoutDestination = {
      user_id: 1,
      source_site_id: 1,
    };
    const result = warehouseTransferSchema.safeParse(transferWithoutDestination);
    expect(result.success).toBe(false);
  });
});

describe('Sea Voyage Schema Validation', () => {
  test('should validate a complete sea voyage', () => {
    const validVoyage = {
      user_id: 1,
      name: 'Pacific Transit',
      vessel_name: 'USNS Comfort',
      vessel_hull_number: 'T-AH 20',
      origin_port: 'San Diego',
      destination_port: 'Yokosuka',
      status: 'planned' as const,
    };
    const result = seaVoyageSchema.safeParse(validVoyage);
    expect(result.success).toBe(true);
  });

  test('should validate MSC vessel hull designation format', () => {
    const voyageWithValidHull = {
      user_id: 1,
      name: 'Test Voyage',
      vessel_hull_number: 'T-AKR 313',
      origin_port: 'Norfolk',
      destination_port: 'Rota',
    };
    const result = seaVoyageSchema.safeParse(voyageWithValidHull);
    expect(result.success).toBe(true);
  });

  test('should accept various MSC hull designation formats', () => {
    const hullNumbers = ['T-AO 205', 'T-AKR 313', 'T-EPF 5', 'T-AH 20'];
    hullNumbers.forEach(hull => {
      const voyage = {
        user_id: 1,
        name: 'Test',
        vessel_hull_number: hull,
        origin_port: 'Port A',
        destination_port: 'Port B',
      };
      const result = seaVoyageSchema.safeParse(voyage);
      expect(result.success).toBe(true);
    });
  });
});

describe('Land Route Schema Validation', () => {
  test('should validate a complete land route', () => {
    const validRoute = {
      user_id: 1,
      name: 'Desert Express',
      origin_name: 'Camp Pendleton',
      origin_lat: 33.3865,
      origin_lng: -117.5681,
      destination_name: 'Twentynine Palms',
      destination_lat: 34.1356,
      destination_lng: -116.0542,
      distance_km: 120.5,
      estimated_duration_hrs: 2.5,
      status: 'planned' as const,
    };
    const result = landRouteSchema.safeParse(validRoute);
    expect(result.success).toBe(true);
  });

  test('should validate latitude range (-90 to 90)', () => {
    const routeWithInvalidLat = {
      user_id: 1,
      name: 'Test Route',
      origin_name: 'Origin',
      origin_lat: 95,
      destination_name: 'Destination',
    };
    const result = landRouteSchema.safeParse(routeWithInvalidLat);
    expect(result.success).toBe(false);
  });

  test('should validate longitude range (-180 to 180)', () => {
    const routeWithInvalidLng = {
      user_id: 1,
      name: 'Test Route',
      origin_name: 'Origin',
      origin_lng: 200,
      destination_name: 'Destination',
    };
    const result = landRouteSchema.safeParse(routeWithInvalidLng);
    expect(result.success).toBe(false);
  });
});

describe('Flight Plan Schema Validation', () => {
  test('should validate a complete flight plan', () => {
    const validPlan = {
      user_id: 1,
      name: 'Pacific Airlift',
      status: 'draft' as const,
      allocation_data: { flights: [] },
      movement_items_count: 10,
      total_weight_lb: 50000,
      aircraft_count: 2,
      allow_mixed_fleet: true,
      mixed_fleet_mode: 'PREFERRED_FIRST' as const,
      preference_strength: 0.5,
    };
    const result = flightPlanSchema.safeParse(validPlan);
    expect(result.success).toBe(true);
  });

  test('should validate preference_strength between 0 and 1', () => {
    const planWithInvalidStrength = {
      user_id: 1,
      name: 'Test Plan',
      allocation_data: {},
      movement_items_count: 0,
      total_weight_lb: 0,
      aircraft_count: 0,
      preference_strength: 1.5,
    };
    const result = flightPlanSchema.safeParse(planWithInvalidStrength);
    expect(result.success).toBe(false);
  });

  test('should default status to draft', () => {
    const planWithoutStatus = {
      user_id: 1,
      name: 'Test Plan',
      allocation_data: {},
      movement_items_count: 0,
      total_weight_lb: 0,
      aircraft_count: 0,
    };
    const result = flightPlanSchema.parse(planWithoutStatus);
    expect(result.status).toBe('draft');
  });
});
