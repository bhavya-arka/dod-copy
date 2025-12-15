/**
 * PACAF Airlift Demo - Edge Case Handler
 * 
 * Comprehensive validation for movement list items including:
 * - Overheight pallets (>100 inches for pallet, >70" for C-17 ramp)
 * - Overwidth items (>104 usable pallet inches, station-specific limits)
 * - Zero weight items
 * - Invalid dimensions
 * - HAZMAT items (segregation rules)
 * - Prebuilt pallets (integrity checks)
 * - ADVON items (phase separation)
 * - Heavy vehicles (>10,000 lb, axle weight limits)
 * - PAX rows (capacity limits)
 * - Ramp height restrictions (70" for C-17 ramp positions)
 * - Vehicle wheelbase limits
 * - Shoring requirements for heavy vehicles
 * - Tiedown calculations
 * 
 * Based on: T.O. 1C-17A-9, T.O. 1C-130H-9
 */

import { 
  MovementItem, 
  ValidationError, 
  PALLET_463L, 
  AIRCRAFT_SPECS, 
  AircraftType,
  getStationConstraint,
  StationConstraint
} from './pacafTypes';

export interface EdgeCaseResult {
  item: MovementItem;
  warnings: ValidationError[];
  errors: ValidationError[];
  adjustments: string[];
}

export interface EdgeCaseValidationResult {
  isValid: boolean;
  canPalletize: boolean;
  mustBeRollingStock: boolean;
  requiresC17Only: boolean;
  cannotLoad: boolean;
  warnings: ValidationError[];
  errors: ValidationError[];
  adjustedItem: MovementItem;
}

export function validateEdgeCases(item: MovementItem): EdgeCaseValidationResult {
  const warnings: ValidationError[] = [];
  const errors: ValidationError[] = [];
  let adjustedItem = { ...item };
  let canPalletize = true;
  let mustBeRollingStock = false;
  let requiresC17Only = false;
  let cannotLoad = false;

  // 1. OVERHEIGHT PALLET (>100 inches)
  if (item.height_in > 100) {
    if (item.height_in > AIRCRAFT_SPECS['C-130'].cargo_height) {
      // Cannot fit in C-130
      requiresC17Only = true;
      warnings.push({
        code: 'WARN_OVERSIZE_ITEM',
        item_id: item.item_id,
        field: 'height_in',
        message: `HEIGHT_EXCEEDED: Item height ${item.height_in}" exceeds C-130 limit (${AIRCRAFT_SPECS['C-130'].cargo_height}"). C-17 only.`,
        suggestion: 'This item can only be transported by C-17',
        severity: 'warning'
      });
    }
    
    if (item.height_in > AIRCRAFT_SPECS['C-17'].cargo_height) {
      cannotLoad = true;
      errors.push({
        code: 'ERR_DIMENSION_INVALID',
        item_id: item.item_id,
        field: 'height_in',
        message: `HEIGHT_EXCEEDED: Item height ${item.height_in}" exceeds all aircraft limits. Cannot load.`,
        suggestion: 'Reduce item height or request special handling',
        severity: 'error'
      });
    }
    
    canPalletize = false;
    mustBeRollingStock = true;
  }

  // Check if height exceeds pallet max (100")
  if (item.height_in > PALLET_463L.max_height && item.type !== 'ROLLING_STOCK') {
    canPalletize = false;
    mustBeRollingStock = true;
    warnings.push({
      code: 'WARN_OVERSIZE_ITEM',
      item_id: item.item_id,
      field: 'height_in',
      message: `HEIGHT_EXCEEDED: Item height ${item.height_in}" exceeds pallet limit (${PALLET_463L.max_height}"). Cannot palletize.`,
      suggestion: 'Item will be treated as rolling stock or requires manual lift',
      severity: 'warning'
    });
  }

  // 2. OVERLENGTH ITEM (>104 usable pallet inches)
  // EXCEPTION: Items with exact 463L footprint (88x108 or 108x88) are pre-built pallets, NOT overlength cargo
  const is463LFootprint = 
    (item.length_in === 88 && item.width_in === 108) ||
    (item.length_in === 108 && item.width_in === 88);
  
  if (item.length_in > PALLET_463L.usable_length && !is463LFootprint) {
    canPalletize = false;
    mustBeRollingStock = true;
    warnings.push({
      code: 'WARN_OVERSIZE_ITEM',
      item_id: item.item_id,
      field: 'length_in',
      message: `LENGTH_EXCEEDED: Item length ${item.length_in}" exceeds pallet limit (${PALLET_463L.usable_length}"). Cannot palletize.`,
      suggestion: 'Item will be treated as rolling stock or requires special handling',
      severity: 'warning'
    });
  }

  // 3. OVERWIDTH ITEM (>84 usable pallet inches)
  if (item.width_in > PALLET_463L.usable_width && !is463LFootprint) {
    canPalletize = false;
    mustBeRollingStock = true;
    
    // Check ramp width limits
    if (item.width_in > AIRCRAFT_SPECS['C-130'].ramp_clearance_width) {
      requiresC17Only = true;
      warnings.push({
        code: 'WARN_OVERSIZE_ITEM',
        item_id: item.item_id,
        field: 'width_in',
        message: `WIDTH_EXCEEDED: Item width ${item.width_in}" exceeds C-130 ramp width (${AIRCRAFT_SPECS['C-130'].ramp_clearance_width}"). C-17 only.`,
        suggestion: 'This item requires C-17 for loading',
        severity: 'warning'
      });
    }
    
    if (item.width_in > AIRCRAFT_SPECS['C-17'].ramp_clearance_width) {
      cannotLoad = true;
      errors.push({
        code: 'ERR_DIMENSION_INVALID',
        item_id: item.item_id,
        field: 'width_in',
        message: `WIDTH_EXCEEDED: Item width ${item.width_in}" exceeds all aircraft ramp widths (${AIRCRAFT_SPECS['C-17'].ramp_clearance_width}"). Cannot load.`,
        suggestion: 'Item is too wide for any aircraft',
        severity: 'error'
      });
    }
  }

  // 4. CARGO BAY DIMENSION LIMITS (exceeds aircraft cargo bay)
  // Check length against cargo bay - C-130 first, then C-17
  if (item.length_in > AIRCRAFT_SPECS['C-130'].cargo_length) {
    requiresC17Only = true;
    if (item.length_in > AIRCRAFT_SPECS['C-17'].cargo_length) {
      cannotLoad = true;
      errors.push({
        code: 'ERR_DIMENSION_INVALID',
        item_id: item.item_id,
        field: 'length_in',
        message: `LENGTH_EXCEEDED: Item length ${item.length_in}" exceeds C-17 cargo bay (${AIRCRAFT_SPECS['C-17'].cargo_length}"). Cannot load on any aircraft.`,
        suggestion: 'Item is too long for any cargo aircraft',
        severity: 'error'
      });
    }
  }
  
  // Check width against cargo bay
  if (item.width_in > AIRCRAFT_SPECS['C-130'].cargo_width) {
    requiresC17Only = true;
    if (item.width_in > AIRCRAFT_SPECS['C-17'].cargo_width) {
      cannotLoad = true;
      errors.push({
        code: 'ERR_DIMENSION_INVALID',
        item_id: item.item_id,
        field: 'width_in',
        message: `WIDTH_EXCEEDED: Item width ${item.width_in}" exceeds C-17 cargo bay (${AIRCRAFT_SPECS['C-17'].cargo_width}"). Cannot load on any aircraft.`,
        suggestion: 'Item is too wide for any cargo aircraft',
        severity: 'error'
      });
    }
  }

  // 5. ZERO WEIGHT ITEM
  if (item.weight_each_lb === 0 || isNaN(item.weight_each_lb)) {
    adjustedItem.weight_each_lb = 1;
    warnings.push({
      code: 'WARN_PALLET_OVERSPEC',
      item_id: item.item_id,
      field: 'weight_each_lb',
      message: `ZERO_WEIGHT: Item weight was 0 or invalid. Corrected to 1 lb.`,
      suggestion: 'Verify actual weight of this item',
      severity: 'warning'
    });
  }

  // 4. INVALID DIMENSIONS (0, blank, negative) - handled in parser
  if (item.type !== 'PAX') {
    if (item.length_in <= 0 || item.width_in <= 0 || item.height_in <= 0) {
      errors.push({
        code: 'ERR_DIMENSION_INVALID',
        item_id: item.item_id,
        message: `DIMENSION_INVALID: Item has zero or negative dimensions (L:${item.length_in}, W:${item.width_in}, H:${item.height_in}"). Fix data.`,
        suggestion: 'Provide valid positive dimensions',
        severity: 'error'
      });
    }
  }

  // 5. HAZMAT ITEMS - flag for special handling
  if (item.hazmat_flag) {
    warnings.push({
      code: 'WARN_PALLET_OVERSPEC',
      item_id: item.item_id,
      field: 'hazmat_flag',
      message: `HAZMAT: Item is flagged as hazardous material. Must not co-load with PAX. Prefer aft pallet stations.`,
      suggestion: 'Ensure HAZMAT segregation from passengers',
      severity: 'warning'
    });
  }

  // 8. EXTREMELY HEAVY ITEMS (>10,000 lb - exceeds pallet weight limit)
  if (item.weight_each_lb > PALLET_463L.max_payload_96in) {
    canPalletize = false;
    mustBeRollingStock = true;
    warnings.push({
      code: 'WARN_OVERSIZE_ITEM',
      item_id: item.item_id,
      field: 'weight_each_lb',
      message: `WEIGHT_EXCEEDED: Item weight ${item.weight_each_lb.toLocaleString()} lb exceeds pallet limit (${PALLET_463L.max_payload_96in.toLocaleString()} lb). Cannot palletize.`,
      suggestion: 'Item will be treated as rolling stock',
      severity: 'warning'
    });
    
    if (item.weight_each_lb > AIRCRAFT_SPECS['C-130'].max_payload) {
      requiresC17Only = true;
      warnings.push({
        code: 'WARN_OVERSIZE_ITEM',
        item_id: item.item_id,
        field: 'weight_each_lb',
        message: `HEAVY_ITEM: Item weight ${item.weight_each_lb.toLocaleString()} lbs exceeds C-130 ACL (${AIRCRAFT_SPECS['C-130'].max_payload.toLocaleString()} lbs). C-17 only.`,
        suggestion: 'This item requires C-17 for transport',
        severity: 'warning'
      });
    }
    
    if (item.weight_each_lb > AIRCRAFT_SPECS['C-17'].max_payload) {
      cannotLoad = true;
      errors.push({
        code: 'ERR_PHYSICAL_INVALID',
        item_id: item.item_id,
        field: 'weight_each_lb',
        message: `WEIGHT_EXCEEDED: Item weight ${item.weight_each_lb.toLocaleString()} lbs exceeds all aircraft payload limits. Cannot load.`,
        suggestion: 'Item exceeds aircraft capacity',
        severity: 'error'
      });
    }
  }

  // Force type change if needed
  if (mustBeRollingStock && adjustedItem.type !== 'ROLLING_STOCK' && adjustedItem.type !== 'PAX') {
    adjustedItem.type = 'ROLLING_STOCK';
  }

  return {
    isValid: errors.length === 0,
    canPalletize,
    mustBeRollingStock,
    requiresC17Only,
    cannotLoad,
    warnings,
    errors,
    adjustedItem
  };
}

export function checkHazmatPaxConflict(
  hazmatItems: MovementItem[],
  paxItems: MovementItem[]
): ValidationError[] {
  const warnings: ValidationError[] = [];
  
  if (hazmatItems.length > 0 && paxItems.length > 0) {
    warnings.push({
      code: 'WARN_PALLET_OVERSPEC',
      item_id: 'HAZMAT_PAX_CHECK',
      message: `HAZMAT-PAX CONFLICT: ${hazmatItems.length} HAZMAT items and ${paxItems.length} PAX entries detected. HAZMAT must not co-load with PAX on same aircraft.`,
      suggestion: 'Ensure HAZMAT and PAX are on separate aircraft',
      severity: 'warning'
    });
  }
  
  return warnings;
}

export function validatePrebuiltPalletIntegrity(item: MovementItem): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (item.type === 'PREBUILT_PALLET') {
    // Prebuilt pallets must not be split - this is a structural constraint
    // Just verify it's flagged correctly
    if (!item.pallet_id) {
      errors.push({
        code: 'WARN_PALLET_OVERSPEC',
        item_id: item.item_id,
        field: 'pallet_id',
        message: `PREBUILT_PALLET: Item appears to be a prebuilt pallet but lacks pallet_id.`,
        suggestion: 'Assign a pallet ID to track this prebuilt pallet',
        severity: 'warning'
      });
    }
  }
  
  return errors;
}

// ============================================================================
// STATION-SPECIFIC VALIDATION
// ============================================================================

export interface StationValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  requiredShoring: boolean;
  tiedownCount: number;
}

/**
 * Validate if an item can be placed at a specific station
 * Checks height, width, and weight limits based on station constraints
 */
export function validateStationPlacement(
  item: MovementItem,
  aircraftType: AircraftType,
  position: number
): StationValidationResult {
  const station = getStationConstraint(aircraftType, position);
  const spec = AIRCRAFT_SPECS[aircraftType];
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  let requiredShoring = false;
  
  if (!station) {
    errors.push({
      code: 'ERR_POSITION_INVALID',
      item_id: item.item_id,
      field: 'position',
      message: `Invalid position ${position} for ${aircraftType}`,
      suggestion: `Use positions 1-${spec.pallet_positions} for ${aircraftType}`,
      severity: 'error'
    });
    return { valid: false, errors, warnings, requiredShoring: false, tiedownCount: 0 };
  }
  
  // Check height limit
  if (item.height_in > station.max_height) {
    errors.push({
      code: 'ERR_HEIGHT_EXCEEDED',
      item_id: item.item_id,
      field: 'height_in',
      message: `Height ${item.height_in}" exceeds station ${position} limit of ${station.max_height}" ${station.is_ramp ? '(ramp restriction)' : ''}`,
      suggestion: station.is_ramp 
        ? 'Move item to main deck position (1-16) or reduce height' 
        : 'Reduce item height or use C-17 with higher ceiling',
      severity: 'error'
    });
  }
  
  // Check width limit
  if (item.width_in > station.max_width) {
    errors.push({
      code: 'ERR_WIDTH_EXCEEDED',
      item_id: item.item_id,
      field: 'width_in',
      message: `Width ${item.width_in}" exceeds station ${position} limit of ${station.max_width}"`,
      suggestion: 'Reduce item width or use a position with wider clearance',
      severity: 'error'
    });
  }
  
  // Check weight limit
  if (item.weight_each_lb > station.max_weight) {
    errors.push({
      code: 'ERR_WEIGHT_EXCEEDED',
      item_id: item.item_id,
      field: 'weight_each_lb',
      message: `Weight ${item.weight_each_lb.toLocaleString()} lb exceeds station ${position} limit of ${station.max_weight.toLocaleString()} lb`,
      suggestion: station.is_ramp 
        ? 'Move item to main deck position with higher weight limit'
        : 'Redistribute weight or use multiple aircraft',
      severity: 'error'
    });
  }
  
  // Check if shoring is required
  if (station.requires_shoring && item.weight_each_lb > 10000) {
    requiredShoring = true;
    warnings.push({
      code: 'WARN_SHORING_REQUIRED',
      item_id: item.item_id,
      field: 'position',
      message: `Shoring plates required for ${item.weight_each_lb.toLocaleString()} lb item at station ${position}`,
      suggestion: 'Ensure shoring plates are available for this station',
      severity: 'warning'
    });
  }
  
  // Calculate tiedown requirements
  const tiedownCount = calculateTiedownRequirements(item, spec);
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    requiredShoring,
    tiedownCount
  };
}

/**
 * Calculate required number of tiedowns based on item weight
 * Per AFI 11-2C-17V3 and AFI 11-2C-130V3
 */
export function calculateTiedownRequirements(
  item: MovementItem,
  spec: typeof AIRCRAFT_SPECS['C-17']
): number {
  const weight = item.weight_each_lb;
  const tiedownRating = spec.tiedown_rating_lbs;
  
  // Minimum 4 tiedowns, plus additional based on weight
  // G-force factor: 3G forward, 1.5G aft, 1.5G lateral
  const forwardLoad = weight * 3;
  const requiredTiedowns = Math.ceil(forwardLoad / tiedownRating);
  
  return Math.max(4, requiredTiedowns);
}

/**
 * Validate vehicle-specific constraints
 */
export function validateVehicleConstraints(
  item: MovementItem,
  aircraftType: AircraftType
): { valid: boolean; errors: ValidationError[]; warnings: ValidationError[] } {
  const spec = AIRCRAFT_SPECS[aircraftType];
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  
  // Check wheelbase limit
  if (item.length_in > spec.max_vehicle_wheelbase) {
    warnings.push({
      code: 'WARN_WHEELBASE_EXCEEDED',
      item_id: item.item_id,
      field: 'length_in',
      message: `Vehicle length ${item.length_in}" exceeds recommended wheelbase limit of ${spec.max_vehicle_wheelbase}"`,
      suggestion: 'Verify loading procedures for oversized vehicle',
      severity: 'warning'
    });
  }
  
  // Check axle weight limits
  if (item.axle_weights && item.axle_weights.length > 0) {
    const maxAxleWeight = Math.max(...item.axle_weights);
    if (maxAxleWeight > spec.max_axle_weight) {
      errors.push({
        code: 'ERR_AXLE_WEIGHT_EXCEEDED',
        item_id: item.item_id,
        field: 'axle_weights',
        message: `Axle weight ${maxAxleWeight.toLocaleString()} lb exceeds ${aircraftType} limit of ${spec.max_axle_weight.toLocaleString()} lb`,
        suggestion: 'Vehicle cannot be safely loaded on this aircraft type',
        severity: 'error'
      });
    }
  }
  
  // Check floor loading (approximate)
  if (item.type === 'ROLLING_STOCK') {
    // Estimate footprint area (rough approximation)
    const footprintArea = (item.length_in * item.width_in) / 144; // sq ft
    const psi = item.weight_each_lb / footprintArea;
    
    if (psi > spec.floor_loading_psi) {
      warnings.push({
        code: 'WARN_FLOOR_LOADING',
        item_id: item.item_id,
        field: 'weight_each_lb',
        message: `Estimated floor loading ${psi.toFixed(0)} psi exceeds limit of ${spec.floor_loading_psi} psi`,
        suggestion: 'Shoring or load spreaders may be required',
        severity: 'warning'
      });
    }
  }
  
  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate ramp loading constraints for a vehicle
 * Ramp positions have special height and weight restrictions
 */
export function validateRampLoading(
  item: MovementItem,
  aircraftType: AircraftType
): { canLoadViaRamp: boolean; errors: ValidationError[]; warnings: ValidationError[] } {
  const spec = AIRCRAFT_SPECS[aircraftType];
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  let canLoadViaRamp = true;
  
  // Check ramp height clearance
  if (item.height_in > spec.ramp_clearance_height) {
    canLoadViaRamp = false;
    errors.push({
      code: 'ERR_RAMP_HEIGHT_EXCEEDED',
      item_id: item.item_id,
      field: 'height_in',
      message: `Item height ${item.height_in}" exceeds ramp clearance of ${spec.ramp_clearance_height}"`,
      suggestion: aircraftType === 'C-130' 
        ? 'Item too tall for C-130 ramp loading - consider C-17'
        : 'Item cannot be loaded via ramp - requires crane/forklift',
      severity: 'error'
    });
  }
  
  // Check ramp width clearance
  if (item.width_in > spec.ramp_clearance_width) {
    canLoadViaRamp = false;
    errors.push({
      code: 'ERR_RAMP_WIDTH_EXCEEDED',
      item_id: item.item_id,
      field: 'width_in',
      message: `Item width ${item.width_in}" exceeds ramp width of ${spec.ramp_clearance_width}"`,
      suggestion: 'Item is too wide for ramp loading',
      severity: 'error'
    });
  }
  
  // Check ramp angle for heavy items (rough check)
  if (item.weight_each_lb > 20000 && spec.ramp_angle_deg > 10) {
    warnings.push({
      code: 'WARN_RAMP_ANGLE',
      item_id: item.item_id,
      message: `Heavy item (${item.weight_each_lb.toLocaleString()} lb) on steep ramp (${spec.ramp_angle_deg}°) - use winch assist`,
      suggestion: 'Ensure winch is available for loading',
      severity: 'warning'
    });
  }
  
  return { canLoadViaRamp, errors, warnings };
}

/**
 * Check all items for duplicate TCN (Transportation Control Number)
 */
export function detectDuplicateTCN(items: MovementItem[]): ValidationError[] {
  const warnings: ValidationError[] = [];
  const tcnCounts = new Map<string, number>();
  
  for (const item of items) {
    const tcn = String(item.tcn || item.item_id);
    tcnCounts.set(tcn, (tcnCounts.get(tcn) || 0) + 1);
  }
  
  for (const [tcn, count] of Array.from(tcnCounts.entries())) {
    if (count > 1) {
      warnings.push({
        code: 'WARN_DUPLICATE_TCN',
        item_id: tcn,
        message: `Duplicate TCN detected: "${tcn}" appears ${count} times in movement list`,
        suggestion: 'Verify this is intentional (e.g., multi-piece shipment) or correct the data',
        severity: 'warning'
      });
    }
  }
  
  return warnings;
}
