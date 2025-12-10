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

export type CargoCategory = 'ROLLING_STOCK' | 'PALLETIZABLE' | 'PREBUILT_PALLET' | 'PAX';

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
  pax_count?: number;
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
  | 'WARN_PALLET_OVERSPEC'
  | 'WARN_OVERSIZE_ITEM';

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

export interface AircraftSpec {
  type: AircraftType;
  name: string;
  
  // Cargo compartment dimensions (inches)
  cargo_length: number;
  cargo_width: number;
  cargo_height: number;
  
  // Pallet positions
  pallet_positions: number;
  ramp_positions: number[];  // Position indices that are on ramp
  
  // Payload limits (lbs)
  max_payload: number;
  per_position_weight: number;
  ramp_position_weight: number;
  
  // Floor loading (psi)
  floor_loading_psi: number;
  
  // Clearance dimensions (inches)
  ramp_clearance_width: number;
  ramp_clearance_height: number;
  
  // Center of Balance envelope (% MAC)
  cob_min_percent: number;
  cob_max_percent: number;
  mac_length: number;            // Mean Aerodynamic Chord length (inches)
  lemac_station: number;         // Leading Edge of MAC station (calibrated to cargo-floor reference)
  
  // Position coordinates (inches from datum)
  position_coords: number[];
}

export const AIRCRAFT_SPECS: Record<AircraftType, AircraftSpec> = {
  'C-17': {
    type: 'C-17',
    name: 'C-17 Globemaster III',
    cargo_length: 1056,
    cargo_width: 216,
    cargo_height: 148,
    pallet_positions: 18,
    ramp_positions: [17, 18],
    max_payload: 170900,
    per_position_weight: 10000,
    ramp_position_weight: 7500,
    floor_loading_psi: 250,
    ramp_clearance_width: 144,
    ramp_clearance_height: 142,
    cob_min_percent: 16,
    cob_max_percent: 40,
    mac_length: 309.5,
    lemac_station: 643,
    position_coords: [
      245, 303, 361, 419, 477, 535, 593, 651,  // Positions 1-8 (RDL distances)
      709, 767, 825, 883, 941, 999, 1057, 1115,  // Positions 9-16
      1173, 1215  // Ramp positions 17-18
    ]
  },
  'C-130': {
    type: 'C-130',
    name: 'C-130H/J Hercules',
    cargo_length: 492,
    cargo_width: 123,
    cargo_height: 108,
    pallet_positions: 6,
    ramp_positions: [6],
    max_payload: 42000,
    per_position_weight: 10000,
    ramp_position_weight: 10000,
    floor_loading_psi: 150,
    ramp_clearance_width: 120,
    ramp_clearance_height: 102,
    cob_min_percent: 15,
    cob_max_percent: 35,
    mac_length: 165,
    lemac_station: 409,
    position_coords: [245, 327, 409, 491, 573, 655]  // Positions 1-6 (RDL distances)
  }
};

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
    x: number;  // Lateral position from centerline
    y: number;  // Vertical position (floor = 0)
    z: number;  // Longitudinal position from datum
  };
}

// ============================================================================
// SECTION 8: AIRCRAFT ALLOCATION & LOAD PLANS
// ============================================================================

export interface PalletPlacement {
  pallet: Pallet463L;
  position_index: number;
  position_coord: number;
  is_ramp: boolean;
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
  
  // Center of Balance
  center_of_balance: number;
  cob_percent: number;
  cob_in_envelope: boolean;
  
  // Utilization metrics
  positions_used: number;
  positions_available: number;
  utilization_percent: number;
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
  
  // Items that couldn't be loaded
  unloaded_items: MovementItem[];
  
  // Warnings and issues
  warnings: string[];
}

// ============================================================================
// SECTION 9: CENTER OF BALANCE
// ============================================================================

export interface CoBCalculation {
  total_weight: number;
  total_moment: number;
  center_of_balance: number;
  cob_percent: number;
  min_allowed: number;
  max_allowed: number;
  in_envelope: boolean;
}

// ============================================================================
// SECTION 3: CLASSIFICATION & SEGMENTATION
// ============================================================================

export interface ClassifiedItems {
  advon_items: MovementItem[];
  main_items: MovementItem[];
  rolling_stock: MovementItem[];
  prebuilt_pallets: MovementItem[];
  loose_items: MovementItem[];
  pax_items: MovementItem[];
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
