/**
 * PACAF Airlift Demo - Data Types and Models
 * Spec Reference: Sections 2, 3, 4, 5
 * 
 * This file defines all data structures required for the PACAF movement
 * planning system including movement items, aircraft specs, pallets, and load plans.
 */

// ============================================================================
// SECTION 2: INPUT SPECIFICATION - Movement Item Types
// ============================================================================

// Legacy type alias for backward compatibility
export type CargoCategory = 'ROLLING_STOCK' | 'PALLETIZABLE' | 'PREBUILT_PALLET' | 'PAX';

// NEW: Per pallet_parsing spec - primary cargo classification
export type CargoType = 'PALLETIZED' | 'ROLLING_STOCK' | 'LOOSE_CARGO' | 'PAX_RECORD';

// NEW: Pallet footprint classification
export type PalletFootprint = '463L' | 'NONE';

// NEW: ValidationIssue per pallet_parsing spec Section 7
export interface ValidationIssue {
  code: string;           // Machine-readable: e.g. "ERROR_INVALID_DIMENSIONS"
  message: string;        // Human-readable: e.g. "Height must be > 0"
  field?: string;         // Optional: which column caused the issue
}

// NEW: ParsedCargoItem per pallet_parsing spec Section 2
export interface ParsedCargoItem {
  rawRowIndex: number;
  description: string;
  length_in: number;
  width_in: number;
  height_in: number;
  weight_lb: number;
  lead_tcn: string | null;
  pax_count: number | null;
  cargo_type: CargoType;
  pallet_footprint: PalletFootprint;
  inferred_pallet_count: number;
  classification_reasons: string[];
  validation_errors: ValidationIssue[];
  validation_warnings: ValidationIssue[];
  
  // Generated IDs per spec Section 6
  base_id: string;
  pallet_id: string | null;
  pallet_sequence_index: number | null;
  rolling_id: string | null;
  
  // Additional fields for downstream processing
  advon_flag: boolean;
  hazmat_flag: boolean;
  axle_weights?: number[];
}

// NEW: Parsed output with aggregations per spec Section 8
export interface ParsedCargoResult {
  items: ParsedCargoItem[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  
  // Aggregations per spec Section 8
  totals: {
    total_palletized_weight: number;
    total_pallet_count: number;
    total_rolling_stock_weight: number;
    rolling_stock_count: number;
    total_loose_cargo_weight: number;
    loose_cargo_count: number;
    total_pax: number;
    total_weight: number;
  };
  
  // Individual PAX entries (e.g., [1, 1, 4, 4, 20])
  pax_individual: number[];
  // Total PAX from "Total PAX" row (e.g., 30)
  pax_total: number;
  
  // Pallet tracking for ICODES/UI
  pallet_ids: { pallet_id: string; lead_tcn: string | null }[];
}

// Legacy MovementItem - kept for backward compatibility with existing components
export interface MovementItem {
  item_id: string | number;
  utc_id?: string;
  description: string;
  quantity: number;
  weight_each_lb: number;
  length_in: number;
  width_in: number;
  height_in: number;
  type: CargoCategory;
  advon_flag: boolean;
  hazmat_flag: boolean;
  pallet_id?: string;
  axle_weights?: number[];
  lead_tcn?: string;
  tcn?: string;           // Transportation Control Number
  pax_count?: number;
  
  // NEW: Link to ParsedCargoItem for enhanced data
  parsed_item?: ParsedCargoItem;
}

export interface RawMovementInput {
  item_id: string | number;
  description: string;
  length_in: string | number;
  width_in: string | number;
  height_in: string | number;
  weight_lb: string | number;
  lead_tcn?: string;
  pax?: string | number;
  quantity?: string | number;
  type?: string;
  advon_flag?: string | boolean;
  hazmat_flag?: string | boolean;
  axle_weights?: string;
}

// ============================================================================
// SECTION 2.1: ERROR HANDLING
// ============================================================================

export type ErrorCode = 
  | 'ERR_MISSING_FIELD'
  | 'ERR_DIMENSION_INVALID'
  | 'ERR_PHYSICAL_INVALID'
  | 'ERR_UNKNOWN_TYPE'
  | 'ERR_POSITION_INVALID'
  | 'ERR_HEIGHT_EXCEEDED'
  | 'ERR_WIDTH_EXCEEDED'
  | 'ERR_WEIGHT_EXCEEDED'
  | 'ERR_AXLE_WEIGHT_EXCEEDED'
  | 'ERR_RAMP_HEIGHT_EXCEEDED'
  | 'ERR_RAMP_WIDTH_EXCEEDED'
  | 'WARN_PALLET_OVERSPEC'
  | 'WARN_OVERSIZE_ITEM'
  | 'WARN_SHORING_REQUIRED'
  | 'WARN_WHEELBASE_EXCEEDED'
  | 'WARN_FLOOR_LOADING'
  | 'WARN_RAMP_ANGLE'
  | 'WARN_DUPLICATE_TCN';

export interface ValidationError {
  code: ErrorCode;
  item_id: string | number;
  field?: string;
  message: string;
  suggestion: string;
  severity: 'error' | 'warning';
}

export interface ParseResult {
  items: MovementItem[];
  errors: ValidationError[];
  warnings: ValidationError[];
  summary: {
    total_items: number;
    valid_items: number;
    rolling_stock_count: number;
    palletizable_count: number;
    prebuilt_pallet_count: number;
    pax_count: number;
    total_weight_lb: number;
  };
}

// ============================================================================
// SECTION 4: 463L PALLET SYSTEM
// ============================================================================

export const PALLET_463L = {
  // Physical dimensions (inches)
  length: 108,
  width: 88,
  height: 2.25,
  
  // Usable cargo area (inches)
  usable_length: 104,
  usable_width: 84,
  
  // Weight specs (lbs)
  tare_weight: 290,
  tare_with_nets: 355,
  
  // Height-based weight limits
  max_payload_96in: 10000,  // ≤96" height
  max_payload_100in: 8000,  // 96-100" height
  max_height: 100,
  recommended_height: 96,
  
  // Tiedown specs
  tiedown_rings: 22,
  ring_rating_lb: 7500,
  
  // Floor loading
  floor_loading_psi: 250
} as const;

// ============================================================================
// PAX (PASSENGER) CONSTANTS
// ============================================================================

export const PAX_WEIGHT_LB = 225; // Weight per person with gear (lbs)

export interface Pallet463L {
  id: string;
  items: MovementItem[];
  gross_weight: number;
  net_weight: number;
  height: number;
  hazmat_flag: boolean;
  is_prebuilt: boolean;
  footprint: {
    length: number;
    width: number;
  };
}

// ============================================================================
// SECTION 5: AIRCRAFT SPECIFICATIONS
// ============================================================================

export type AircraftType = 'C-17' | 'C-130';

/**
 * Station-specific constraints for pallet positions
 * Each station may have different height/width limits due to fuselage taper
 */
export interface StationConstraint {
  position: number;           // 1-indexed position number
  rdl_distance: number;       // Reference Datum Line distance (inches from aircraft datum)
  max_height: number;         // Maximum cargo height at this station (inches)
  max_width: number;          // Maximum cargo width at this station (inches)
  max_weight: number;         // Maximum weight for this position (lbs)
  is_ramp: boolean;           // Whether this position is on the ramp
  requires_shoring: boolean;  // Whether heavy vehicles require shoring plates
}

/**
 * PAX Group - represents a group of passengers from CSV parsing
 */
export interface PaxGroup {
  id: string;                 // e.g. "PAX_GRP_1"
  count: number;              // Number of passengers in this group
  weightPerPaxLb: number;     // Weight per passenger (default 210 lb with gear)
  seatZoneId?: string;        // Which seating zone they're assigned to
}

/**
 * Seat Zone - defines a seating area in the aircraft
 */
export interface SeatZone {
  id: string;                 // e.g. "C17_SIDE_SEATS_FWD"
  name: string;               // Human-readable name
  capacity: number;           // Maximum passengers in this zone
  xStartIn: number;           // Start position (inches from cargo bay start)
  xEndIn: number;             // End position (inches from cargo bay start)
  yOffsetIn: number;          // Lateral offset (negative = left wall, positive = right wall)
  side: 'left' | 'right' | 'center';  // Which side of the aircraft
}

export interface AircraftSpec {
  type: AircraftType;
  name: string;
  
  // Cargo compartment dimensions (inches)
  cargo_length: number;       // Total cargo floor length
  cargo_width: number;        // Maximum cargo width
  cargo_height: number;       // Maximum cargo height (main deck)
  
  // Forward offset - cargo doesn't start at nose
  forward_offset: number;     // Distance from aircraft nose to cargo start (inches)
  crew_area_length: number;   // Length of crew/flight deck area (no cargo)
  
  // Pallet positions
  pallet_positions: number;
  ramp_positions: number[];   // Position indices that are on ramp (1-indexed)
  ramp_length: number;        // Length of ramp section (inches)
  ramp_angle_deg: number;     // Ramp slope angle (degrees)
  
  // Payload limits (lbs)
  max_payload: number;
  per_position_weight: number;
  ramp_position_weight: number;
  
  // Floor loading (psi)
  floor_loading_psi: number;
  ramp_floor_loading_psi: number;
  
  // Clearance dimensions (inches)
  ramp_clearance_width: number;
  ramp_clearance_height: number;  // Height restriction for ramp loading
  main_deck_height: number;       // Height on main deck (before fuselage curve)
  
  // Fuselage taper - width narrows toward front/back
  taper_start_position: number;   // Position where taper begins (1-indexed)
  taper_width_reduction: number;  // Width reduction per position after taper start (inches)
  
  // Center of Balance envelope (% of MAC - Mean Aerodynamic Chord)
  cob_min_percent: number;
  cob_max_percent: number;
  mac_length: number;            // Mean Aerodynamic Chord length (inches)
  lemac_station: number;         // Leading Edge of MAC station (inches from datum)
  cargo_bay_fs_start: number;    // Fuselage Station (FS) where solver X=0 begins (for CG calculations)
  
  // Derived: Envelope limits in station coordinates (computed from LEMAC + %MAC)
  // These are calculated at runtime to avoid duplication
  
  // Station-specific constraints
  stations: StationConstraint[];
  
  // Tiedown requirements
  tiedown_rings_per_position: number;
  tiedown_rating_lbs: number;
  
  // Vehicle-specific limits
  max_vehicle_wheelbase: number;
  max_axle_weight: number;
  
  // Passenger capacity
  seat_capacity: number;         // Maximum number of passengers (PAX)
  seat_zones: SeatZone[];        // Seating zones for PAX allocation
}

/**
 * C-17 Globemaster III Station Data
 * Based on T.O. 1C-17A-9 (Loading Manual)
 * 
 * Aircraft layout (Ramp → Nose orientation):
 * [Ramp 17-18] [Main Deck 1-16] [Forward Bulkhead] [Flight Deck - No Cargo]
 * 
 * Note: Cargo floor is 88 ft (1056"), does NOT extend to aircraft nose
 * Forward ~180" is flight deck/crew area with no cargo access
 */
const C17_STATIONS: StationConstraint[] = [
  // Main deck positions 1-16 (forward to aft)
  { position: 1, rdl_distance: 245, max_height: 148, max_width: 216, max_weight: 10000, is_ramp: false, requires_shoring: false },
  { position: 2, rdl_distance: 303, max_height: 148, max_width: 216, max_weight: 10000, is_ramp: false, requires_shoring: false },
  { position: 3, rdl_distance: 361, max_height: 148, max_width: 216, max_weight: 10000, is_ramp: false, requires_shoring: false },
  { position: 4, rdl_distance: 419, max_height: 148, max_width: 216, max_weight: 10000, is_ramp: false, requires_shoring: false },
  { position: 5, rdl_distance: 477, max_height: 148, max_width: 216, max_weight: 10000, is_ramp: false, requires_shoring: false },
  { position: 6, rdl_distance: 535, max_height: 148, max_width: 216, max_weight: 10000, is_ramp: false, requires_shoring: false },
  { position: 7, rdl_distance: 593, max_height: 148, max_width: 216, max_weight: 10000, is_ramp: false, requires_shoring: false },
  { position: 8, rdl_distance: 651, max_height: 148, max_width: 216, max_weight: 10000, is_ramp: false, requires_shoring: false },
  { position: 9, rdl_distance: 709, max_height: 148, max_width: 216, max_weight: 10000, is_ramp: false, requires_shoring: false },
  { position: 10, rdl_distance: 767, max_height: 148, max_width: 216, max_weight: 10000, is_ramp: false, requires_shoring: false },
  { position: 11, rdl_distance: 825, max_height: 148, max_width: 216, max_weight: 10000, is_ramp: false, requires_shoring: false },
  { position: 12, rdl_distance: 883, max_height: 148, max_width: 216, max_weight: 10000, is_ramp: false, requires_shoring: false },
  { position: 13, rdl_distance: 941, max_height: 148, max_width: 216, max_weight: 10000, is_ramp: false, requires_shoring: false },
  { position: 14, rdl_distance: 999, max_height: 148, max_width: 216, max_weight: 10000, is_ramp: false, requires_shoring: false },
  { position: 15, rdl_distance: 1057, max_height: 148, max_width: 216, max_weight: 10000, is_ramp: false, requires_shoring: false },
  { position: 16, rdl_distance: 1115, max_height: 148, max_width: 200, max_weight: 10000, is_ramp: false, requires_shoring: false },
  // Ramp positions 17-18 (aft-most, on ramp with height restriction)
  { position: 17, rdl_distance: 1173, max_height: 70, max_width: 144, max_weight: 7500, is_ramp: true, requires_shoring: true },
  { position: 18, rdl_distance: 1215, max_height: 70, max_width: 144, max_weight: 7500, is_ramp: true, requires_shoring: true },
];

/**
 * C-130H/J Hercules Station Data
 * Based on T.O. 1C-130H-9 (Loading Manual)
 */
const C130_STATIONS: StationConstraint[] = [
  { position: 1, rdl_distance: 245, max_height: 108, max_width: 123, max_weight: 10000, is_ramp: false, requires_shoring: false },
  { position: 2, rdl_distance: 327, max_height: 108, max_width: 123, max_weight: 10000, is_ramp: false, requires_shoring: false },
  { position: 3, rdl_distance: 409, max_height: 108, max_width: 123, max_weight: 10000, is_ramp: false, requires_shoring: false },
  { position: 4, rdl_distance: 491, max_height: 108, max_width: 123, max_weight: 10000, is_ramp: false, requires_shoring: false },
  { position: 5, rdl_distance: 573, max_height: 108, max_width: 123, max_weight: 10000, is_ramp: false, requires_shoring: false },
  { position: 6, rdl_distance: 655, max_height: 90, max_width: 120, max_weight: 10000, is_ramp: true, requires_shoring: true },
];

export const AIRCRAFT_SPECS: Record<AircraftType, AircraftSpec> = {
  'C-17': {
    type: 'C-17',
    name: 'C-17 Globemaster III',
    
    // Cargo compartment: 88 ft floor (1056")
    cargo_length: 1056,
    cargo_width: 216,
    cargo_height: 148,
    
    // Forward offset - cargo starts ~180" aft of nose (flight deck area)
    forward_offset: 180,
    crew_area_length: 180,
    
    // Pallet positions
    pallet_positions: 18,
    ramp_positions: [17, 18],
    ramp_length: 180,        // ~15 ft ramp
    ramp_angle_deg: 12,      // Ramp slope
    
    // Payload limits
    max_payload: 170900,
    per_position_weight: 10000,
    ramp_position_weight: 7500,
    
    // Floor loading
    floor_loading_psi: 250,
    ramp_floor_loading_psi: 200,
    
    // Clearance dimensions
    ramp_clearance_width: 144,
    ramp_clearance_height: 70,   // Height restriction on ramp!
    main_deck_height: 148,
    
    // Fuselage taper
    taper_start_position: 15,
    taper_width_reduction: 8,
    
    // Center of Balance (% MAC) - Per T.O. 1C-17A-9
    // LEMAC: 869.7" from aircraft datum (nose)
    // MAC Length: 309.5"
    // Cargo Bay: Stations 245 to 1215 (970" length)
    // CG Envelope: 16% - 40% MAC for cargo operations
    // Target CG: 28% MAC (center of envelope)
    // cargo_bay_fs_start: FS datum where solver X=0 begins
    // Formula: targetStation - targetCG = (LEMAC + 0.28×MAC) - 528 = 956.4 - 528 = 428"
    // This ensures: centered cargo at targetCG produces ~28% MAC
    cob_min_percent: 16,
    cob_max_percent: 40,
    mac_length: 309.5,
    lemac_station: 869.7,
    cargo_bay_fs_start: 428,
    
    // Station constraints
    stations: C17_STATIONS,
    
    // Tiedown
    tiedown_rings_per_position: 6,
    tiedown_rating_lbs: 25000,
    
    // Vehicle limits
    max_vehicle_wheelbase: 400,
    max_axle_weight: 40000,
    
    // Passenger capacity
    seat_capacity: 102,
    seat_zones: [
      { id: 'C17_LEFT_FWD', name: 'Left Side Forward', capacity: 27, xStartIn: 0, xEndIn: 400, yOffsetIn: -100, side: 'left' },
      { id: 'C17_LEFT_AFT', name: 'Left Side Aft', capacity: 24, xStartIn: 400, xEndIn: 800, yOffsetIn: -100, side: 'left' },
      { id: 'C17_RIGHT_FWD', name: 'Right Side Forward', capacity: 27, xStartIn: 0, xEndIn: 400, yOffsetIn: 100, side: 'right' },
      { id: 'C17_RIGHT_AFT', name: 'Right Side Aft', capacity: 24, xStartIn: 400, xEndIn: 800, yOffsetIn: 100, side: 'right' },
    ],
  },
  'C-130': {
    type: 'C-130',
    name: 'C-130H/J Hercules',
    
    // Cargo compartment: 41 ft floor (492")
    cargo_length: 492,
    cargo_width: 123,
    cargo_height: 108,
    
    // Forward offset
    forward_offset: 180,
    crew_area_length: 180,
    
    // Pallet positions
    pallet_positions: 6,
    ramp_positions: [6],
    ramp_length: 120,
    ramp_angle_deg: 15,
    
    // Payload limits
    max_payload: 42000,
    per_position_weight: 10000,
    ramp_position_weight: 10000,
    
    // Floor loading
    floor_loading_psi: 150,
    ramp_floor_loading_psi: 120,
    
    // Clearance dimensions
    ramp_clearance_width: 120,
    ramp_clearance_height: 90,
    main_deck_height: 108,
    
    // Fuselage taper
    taper_start_position: 5,
    taper_width_reduction: 6,
    
    // Center of Balance (% MAC) - Per T.O. 1C-130H-9
    // LEMAC: 494.5" from aircraft datum (nose)
    // MAC Length: 164.5"
    // Cargo Bay: Stations 245 to 605 (360" length)
    // CG Envelope: 18% - 33% MAC for cargo operations
    // Target CG: 25.5% MAC (center of envelope)
    // cargo_bay_fs_start: FS datum where solver X=0 begins
    // Formula: targetStation - targetCG = (LEMAC + 0.255×MAC) - 246 = 536.5 - 246 = 290"
    // This ensures: centered cargo at targetCG produces ~25.5% MAC
    cob_min_percent: 18,
    cob_max_percent: 33,
    mac_length: 164.5,
    lemac_station: 494.5,
    cargo_bay_fs_start: 290,
    
    // Station constraints
    stations: C130_STATIONS,
    
    // Tiedown
    tiedown_rings_per_position: 4,
    tiedown_rating_lbs: 10000,
    
    // Vehicle limits
    max_vehicle_wheelbase: 240,
    max_axle_weight: 15000,
    
    // Passenger capacity
    seat_capacity: 92,
    seat_zones: [
      { id: 'C130_LEFT', name: 'Left Side Seats', capacity: 23, xStartIn: 0, xEndIn: 400, yOffsetIn: -55, side: 'left' },
      { id: 'C130_RIGHT', name: 'Right Side Seats', capacity: 23, xStartIn: 0, xEndIn: 400, yOffsetIn: 55, side: 'right' },
      { id: 'C130_CENTER', name: 'Center Seats', capacity: 46, xStartIn: 50, xEndIn: 350, yOffsetIn: 0, side: 'center' },
    ],
  }
};

/**
 * Helper function to get station constraint by position number
 */
export function getStationConstraint(aircraftType: AircraftType, position: number): StationConstraint | null {
  const spec = AIRCRAFT_SPECS[aircraftType];
  return spec.stations.find(s => s.position === position) || null;
}

/**
 * Helper function to get RDL distance for a position
 */
export function getRDLDistance(aircraftType: AircraftType, position: number): number {
  const station = getStationConstraint(aircraftType, position);
  return station?.rdl_distance || 0;
}

/**
 * Calculate envelope limits in station coordinates (inches from datum)
 * Per aircraft W&B technical orders, the CG envelope is defined as %MAC
 * This converts those limits to station coordinates for physics calculations
 */
export function getEnvelopeLimitsStation(spec: AircraftSpec): { 
  fwdLimit: number; 
  aftLimit: number; 
  usableLength: number;
  targetStation: number;
} {
  // Forward limit = LEMAC + (fwd%MAC × MAC_length)
  const fwdLimit = spec.lemac_station + (spec.cob_min_percent / 100) * spec.mac_length;
  // Aft limit = LEMAC + (aft%MAC × MAC_length)  
  const aftLimit = spec.lemac_station + (spec.cob_max_percent / 100) * spec.mac_length;
  // Usable envelope range
  const usableLength = aftLimit - fwdLimit;
  // Target station (midpoint of envelope)
  const targetStation = (fwdLimit + aftLimit) / 2;
  
  return { fwdLimit, aftLimit, usableLength, targetStation };
}

/**
 * Convert station CG to envelope percentage (0-100% of usable envelope)
 * Unlike %MAC, this produces values where:
 * - Forward limit = 0%
 * - Aft limit = 100%
 * - Target (center) = 50%
 * 
 * This is more intuitive for load balancing and avoids negative values
 */
export function stationToEnvelopePercent(stationCG: number, spec: AircraftSpec): {
  percent: number;
  status: 'FORWARD_OF_LIMIT' | 'AFT_OF_LIMIT' | 'WITHIN_LIMITS';
  macPercent: number; // Still provide %MAC for display
} {
  const { fwdLimit, aftLimit, usableLength } = getEnvelopeLimitsStation(spec);
  
  // Calculate %MAC (the standard display value)
  const macPercent = ((stationCG - spec.lemac_station) / spec.mac_length) * 100;
  
  // Calculate envelope percentage
  if (stationCG < fwdLimit) {
    return { percent: 0, status: 'FORWARD_OF_LIMIT', macPercent };
  }
  if (stationCG > aftLimit) {
    return { percent: 100, status: 'AFT_OF_LIMIT', macPercent };
  }
  
  const percent = ((stationCG - fwdLimit) / usableLength) * 100;
  return { percent, status: 'WITHIN_LIMITS', macPercent };
}

/**
 * Validate if cargo can be placed at a specific station
 */
export function validateStationPlacement(
  aircraftType: AircraftType, 
  position: number, 
  height: number, 
  width: number, 
  weight: number
): { valid: boolean; errors: string[] } {
  const station = getStationConstraint(aircraftType, position);
  const errors: string[] = [];
  
  if (!station) {
    errors.push(`Invalid position ${position} for ${aircraftType}`);
    return { valid: false, errors };
  }
  
  if (height > station.max_height) {
    errors.push(`Height ${height}" exceeds station ${position} limit of ${station.max_height}"`);
  }
  
  if (width > station.max_width) {
    errors.push(`Width ${width}" exceeds station ${position} limit of ${station.max_width}"`);
  }
  
  if (weight > station.max_weight) {
    errors.push(`Weight ${weight} lb exceeds station ${position} limit of ${station.max_weight} lb`);
  }
  
  return { valid: errors.length === 0, errors };
}

// ============================================================================
// SECTION 7: ROLLING STOCK PLACEMENT
// ============================================================================

export interface VehiclePlacement {
  item_id: string | number;
  item: MovementItem;
  weight: number;
  length: number;
  width: number;
  height: number;
  axle_weights: number[];
  position: {
    x: number;  // Lateral position from centerline (positive = right)
    y: number;  // Vertical position (floor = 0)
    z: number;  // Longitudinal position from datum (center of item)
  };
  lateral_placement?: {
    y_center_in: number;
    y_left_in: number;
    y_right_in: number;
    side: 'center' | 'left' | 'right';
  };
  deck?: 'MAIN' | 'RAMP';
}

// ============================================================================
// SECTION 8: AIRCRAFT ALLOCATION & LOAD PLANS
// ============================================================================

export interface PalletPlacement {
  pallet: Pallet463L;
  position_index: number;
  position_coord: number;
  is_ramp: boolean;
  lateral_placement?: {
    y_center_in: number;
    y_left_in: number;
    y_right_in: number;
  };
  x_start_in?: number;
  x_end_in?: number;
}

export interface AircraftLoadPlan {
  aircraft_id: string;
  aircraft_type: AircraftType;
  aircraft_spec: AircraftSpec;
  sequence: number;  // 1-based aircraft number
  phase: 'ADVON' | 'MAIN';
  
  // Loaded items
  pallets: PalletPlacement[];
  rolling_stock: VehiclePlacement[];
  pax_count: number;
  
  // Weight calculations
  total_weight: number;
  payload_used_percent: number;
  pax_weight: number;              // Weight contribution from PAX (pax_count * PAX_WEIGHT_LB)
  
  // Center of Balance
  center_of_balance: number;
  cob_percent: number;
  cob_in_envelope: boolean;
  
  // Utilization metrics
  positions_used: number;
  positions_available: number;
  utilization_percent: number;
  
  // Seat utilization (PAX capacity)
  seat_capacity: number;           // Maximum seats available on this aircraft
  seats_used: number;              // Seats occupied by PAX
  seat_utilization_percent: number; // Percentage of seats used
}

export interface AllocationResult {
  aircraft_type: AircraftType;
  total_aircraft: number;
  advon_aircraft: number;
  main_aircraft: number;
  load_plans: AircraftLoadPlan[];
  
  // Summary metrics
  total_weight: number;
  total_pallets: number;
  total_rolling_stock: number;
  total_pax: number;
  total_pax_weight: number;         // Total weight from all PAX
  
  // Seat utilization summary
  total_seat_capacity: number;      // Total seats across all aircraft
  total_seats_used: number;         // Total seats used across all aircraft
  overall_seat_utilization: number; // Overall seat utilization percentage
  
  // Items that couldn't be loaded
  unloaded_items: MovementItem[];
  unloaded_pax: number;             // PAX that couldn't fit due to seat limits
  
  // Warnings and issues
  warnings: string[];
}

// ============================================================================
// SECTION 9: CENTER OF BALANCE
// ============================================================================

export interface CoBCalculation {
  total_weight: number;          // Total cargo weight (lbs)
  total_moment: number;          // Total moment (lb-inches)
  center_of_balance: number;     // CG station (inches from aircraft datum)
  cob_percent: number;           // CoB as percentage of MAC
  min_allowed: number;           // Forward limit (% MAC)
  max_allowed: number;           // Aft limit (% MAC)
  in_envelope: boolean;          // True if within CG limits
  
  // Extended properties for detailed warnings
  envelope_status?: 'in_envelope' | 'forward_limit' | 'aft_limit';
  envelope_deviation?: number;   // How far outside envelope (% MAC)
  
  // Lateral balance - Per T.O. 1C-17A-9 bilateral loading requirements
  lateral_cg?: number;           // Lateral CG offset from centerline (inches)
}

// ============================================================================
// SECTION 3: CLASSIFICATION & SEGMENTATION
// ============================================================================

// Legacy ClassifiedItems - kept for backward compatibility
export interface ClassifiedItems {
  advon_items: MovementItem[];
  main_items: MovementItem[];
  rolling_stock: MovementItem[];
  prebuilt_pallets: MovementItem[];
  loose_items: MovementItem[];
  pax_items: MovementItem[];
}

// NEW: ClassifiedCargoItems using new CargoType system
export interface ClassifiedCargoItems {
  palletized: ParsedCargoItem[];
  rolling_stock: ParsedCargoItem[];
  loose_cargo: ParsedCargoItem[];
  pax_records: ParsedCargoItem[];
  
  // Phase separation
  advon_items: ParsedCargoItem[];
  main_items: ParsedCargoItem[];
}

// ============================================================================
// TYPE CONVERSION UTILITIES
// ============================================================================

/**
 * Convert new CargoType to legacy CargoCategory for backward compatibility
 */
export function cargoTypeToCategory(cargoType: CargoType): CargoCategory {
  switch (cargoType) {
    case 'PALLETIZED':
      return 'PREBUILT_PALLET';
    case 'ROLLING_STOCK':
      return 'ROLLING_STOCK';
    case 'LOOSE_CARGO':
      return 'PALLETIZABLE';
    case 'PAX_RECORD':
      return 'PAX';
    default:
      return 'PALLETIZABLE';
  }
}

/**
 * Convert ParsedCargoItem to legacy MovementItem for backward compatibility
 */
export function parsedItemToMovementItem(parsed: ParsedCargoItem): MovementItem {
  return {
    item_id: parsed.base_id,
    utc_id: parsed.lead_tcn || undefined,
    description: parsed.description,
    quantity: 1,
    weight_each_lb: parsed.weight_lb,
    length_in: parsed.length_in,
    width_in: parsed.width_in,
    height_in: parsed.height_in,
    type: cargoTypeToCategory(parsed.cargo_type),
    advon_flag: parsed.advon_flag,
    hazmat_flag: parsed.hazmat_flag,
    pallet_id: parsed.pallet_id || undefined,
    axle_weights: parsed.axle_weights,
    lead_tcn: parsed.lead_tcn || undefined,
    tcn: parsed.lead_tcn || undefined,
    pax_count: parsed.pax_count || undefined,
    parsed_item: parsed
  };
}

// ============================================================================
// SECTION 13: AI INSIGHTS
// ============================================================================

export interface AIInsight {
  id: string;
  category: 'weight_driver' | 'volume_driver' | 'risk_factor' | 'inefficiency' | 'hazmat' | 'recommendation';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  affected_items?: (string | number)[];
  recommendation?: string;
}

export interface InsightsSummary {
  insights: AIInsight[];
  weight_drivers: {
    item_id: string | number;
    description: string;
    weight: number;
    percent_of_total: number;
  }[];
  volume_drivers: {
    item_id: string | number;
    description: string;
    volume_cuft: number;
    percent_of_total: number;
  }[];
  critical_items: MovementItem[];
  optimization_opportunities: string[];
}

// ============================================================================
// SECTION 12: UI STATE
// ============================================================================

export type AppScreen = 'upload' | 'brief' | 'load_plans' | 'detail' | 'route_planning' | 'mission_workspace';

export interface AppState {
  currentScreen: AppScreen;
  selectedAircraft: AircraftType;
  movementData: ParseResult | null;
  classifiedItems: ClassifiedItems | null;
  allocationResult: AllocationResult | null;
  insights: InsightsSummary | null;
  isProcessing: boolean;
  error: string | null;
}
