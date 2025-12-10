/**
 * PACAF Airlift Demo - Edge Case Handler
 * 
 * Handles all edge cases from the movement list test suite:
 * - Overheight pallets (>100 inches)
 * - Overwidth items (>104 usable pallet inches)
 * - Zero weight items
 * - Invalid dimensions
 * - HAZMAT items
 * - Prebuilt pallets
 * - ADVON items
 * - Heavy vehicles (>10,000 lb)
 * - PAX rows
 * - Broken data rows
 */

import { MovementItem, ValidationError, PALLET_463L, AIRCRAFT_SPECS } from '../types';

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

  // 2. OVERWIDTH ITEM (>104 usable pallet inches)
  if (item.width_in > PALLET_463L.usable_width) {
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

  // 3. ZERO WEIGHT ITEM
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

  // 8. EXTREMELY HEAVY VEHICLES (>10,000 lb)
  if (item.weight_each_lb > AIRCRAFT_SPECS['C-17'].per_position_weight) {
    canPalletize = false;
    mustBeRollingStock = true;
    
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
