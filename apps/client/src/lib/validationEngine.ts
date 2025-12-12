/**
 * Enhanced Validation Engine
 * Provides structured validation with severity levels, codes, messages, and suggestions
 * Compatible with ICODES/A2I validation requirements
 */

import { 
  MovementItem, 
  RawMovementInput,
  AIRCRAFT_SPECS,
  AircraftType,
  PALLET_463L
} from './pacafTypes';

// ============================================================================
// VALIDATION TYPES
// ============================================================================

export type ValidationSeverity = 'ERROR' | 'WARNING' | 'INFO';

export type ValidationCode = 
  | 'ZERO_WEIGHT'
  | 'ZERO_DIMENSIONS'
  | 'NEGATIVE_VALUE'
  | 'WEIGHT_MISMATCH'
  | 'OVERSIZE_C17'
  | 'OVERSIZE_C130'
  | 'OVERWEIGHT_PALLET'
  | 'OVERHEIGHT_PALLET'
  | 'INVALID_TYPE'
  | 'MISSING_FIELD'
  | 'HAZMAT_PAX_CONFLICT'
  | 'INVALID_AXLE_DATA'
  | 'EXCEEDS_FLOOR_LOADING'
  | 'ROLLING_STOCK_TOO_WIDE'
  | 'ROLLING_STOCK_TOO_TALL'
  | 'PAX_HAZMAT_MIX'
  | 'UNDERUTILIZED_SORTIE'
  | 'COB_VIOLATION'
  | 'DUPLICATE_ITEM_ID';

export interface StructuredValidationError {
  severity: ValidationSeverity;
  code: ValidationCode;
  item_id?: string | number;
  field?: string;
  message: string;
  suggestion: string;
  details?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors: StructuredValidationError[];
  warnings: StructuredValidationError[];
  info: StructuredValidationError[];
  summary: {
    error_count: number;
    warning_count: number;
    info_count: number;
    can_proceed: boolean;
  };
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

export function validateMovementItem(
  item: MovementItem,
  index: number,
  allItems: MovementItem[]
): StructuredValidationError[] {
  const errors: StructuredValidationError[] = [];

  if (!item.item_id) {
    errors.push({
      severity: 'ERROR',
      code: 'MISSING_FIELD',
      item_id: `Row ${index + 1}`,
      field: 'item_id',
      message: 'Item ID is required',
      suggestion: 'Provide a unique identifier for this item'
    });
  }

  const duplicates = allItems.filter(i => i.item_id === item.item_id);
  if (duplicates.length > 1) {
    errors.push({
      severity: 'WARNING',
      code: 'DUPLICATE_ITEM_ID',
      item_id: item.item_id,
      message: `Item ID "${item.item_id}" appears ${duplicates.length} times`,
      suggestion: 'Ensure each item has a unique ID or consolidate duplicates'
    });
  }

  if (item.weight_each_lb <= 0 && item.type !== 'PAX') {
    errors.push({
      severity: 'ERROR',
      code: 'ZERO_WEIGHT',
      item_id: item.item_id,
      field: 'weight_each_lb',
      message: `Item "${item.description}" has zero or negative weight`,
      suggestion: 'Enter a valid weight in pounds'
    });
  }

  if (item.type !== 'PAX' && (item.length_in <= 0 || item.width_in <= 0 || item.height_in <= 0)) {
    errors.push({
      severity: 'ERROR',
      code: 'ZERO_DIMENSIONS',
      item_id: item.item_id,
      message: `Item "${item.description}" has invalid dimensions (${item.length_in}" x ${item.width_in}" x ${item.height_in}")`,
      suggestion: 'Enter valid positive dimensions in inches'
    });
  }

  if (item.quantity < 0) {
    errors.push({
      severity: 'ERROR',
      code: 'NEGATIVE_VALUE',
      item_id: item.item_id,
      field: 'quantity',
      message: `Item "${item.description}" has negative quantity`,
      suggestion: 'Enter a positive quantity'
    });
  }

  const c17Spec = AIRCRAFT_SPECS['C-17'];
  const c130Spec = AIRCRAFT_SPECS['C-130'];

  if (item.type === 'ROLLING_STOCK') {
    if (item.width_in > c17Spec.ramp_clearance_width) {
      errors.push({
        severity: 'ERROR',
        code: 'ROLLING_STOCK_TOO_WIDE',
        item_id: item.item_id,
        message: `Vehicle "${item.description}" (${item.width_in}" wide) exceeds C-17 ramp clearance (${c17Spec.ramp_clearance_width}")`,
        suggestion: 'This vehicle cannot be loaded on any available aircraft',
        details: { width: item.width_in, max_c17: c17Spec.ramp_clearance_width }
      });
    } else if (item.width_in > c130Spec.ramp_clearance_width) {
      errors.push({
        severity: 'WARNING',
        code: 'OVERSIZE_C130',
        item_id: item.item_id,
        message: `Vehicle "${item.description}" (${item.width_in}" wide) requires C-17 (exceeds C-130 limit of ${c130Spec.ramp_clearance_width}")`,
        suggestion: 'Plan for C-17 only for this vehicle'
      });
    }

    if (item.height_in > c17Spec.ramp_clearance_height) {
      errors.push({
        severity: 'ERROR',
        code: 'ROLLING_STOCK_TOO_TALL',
        item_id: item.item_id,
        message: `Vehicle "${item.description}" (${item.height_in}" tall) exceeds C-17 ramp clearance (${c17Spec.ramp_clearance_height}")`,
        suggestion: 'This vehicle cannot be loaded on any available aircraft'
      });
    } else if (item.height_in > c130Spec.ramp_clearance_height) {
      errors.push({
        severity: 'WARNING',
        code: 'OVERSIZE_C130',
        item_id: item.item_id,
        message: `Vehicle "${item.description}" (${item.height_in}" tall) requires C-17 (exceeds C-130 limit of ${c130Spec.ramp_clearance_height}")`,
        suggestion: 'Plan for C-17 only for this vehicle'
      });
    }

    if (item.axle_weights && item.axle_weights.some(w => w > c17Spec.floor_loading_psi * 50)) {
      errors.push({
        severity: 'WARNING',
        code: 'EXCEEDS_FLOOR_LOADING',
        item_id: item.item_id,
        message: `Vehicle "${item.description}" may exceed floor loading limits`,
        suggestion: 'Verify shoring requirements before loading'
      });
    }
  }

  if (item.type === 'PALLETIZABLE') {
    if (item.height_in > PALLET_463L.max_height) {
      errors.push({
        severity: 'ERROR',
        code: 'OVERHEIGHT_PALLET',
        item_id: item.item_id,
        message: `Item "${item.description}" (${item.height_in}" tall) exceeds max pallet height (${PALLET_463L.max_height}")`,
        suggestion: 'Consider splitting into multiple pallets or classify as rolling stock'
      });
    } else if (item.height_in > PALLET_463L.recommended_height) {
      errors.push({
        severity: 'WARNING',
        code: 'OVERHEIGHT_PALLET',
        item_id: item.item_id,
        message: `Item "${item.description}" (${item.height_in}" tall) exceeds recommended height (${PALLET_463L.recommended_height}") - reduced weight limit applies`,
        suggestion: `Weight limit reduced to ${PALLET_463L.max_payload_100in} lbs for this pallet`
      });
    }

    const maxWeight = item.height_in > PALLET_463L.recommended_height 
      ? PALLET_463L.max_payload_100in 
      : PALLET_463L.max_payload_96in;
    
    if (item.weight_each_lb * item.quantity > maxWeight) {
      errors.push({
        severity: 'ERROR',
        code: 'OVERWEIGHT_PALLET',
        item_id: item.item_id,
        message: `Item "${item.description}" (${(item.weight_each_lb * item.quantity).toLocaleString()} lbs) exceeds pallet weight limit (${maxWeight.toLocaleString()} lbs)`,
        suggestion: 'Split into multiple pallets or reduce quantity'
      });
    }
  }

  const validTypes = ['ROLLING_STOCK', 'PALLETIZABLE', 'PREBUILT_PALLET', 'PAX'];
  if (!validTypes.includes(item.type)) {
    errors.push({
      severity: 'ERROR',
      code: 'INVALID_TYPE',
      item_id: item.item_id,
      field: 'type',
      message: `Item "${item.description}" has invalid type "${item.type}"`,
      suggestion: `Use one of: ${validTypes.join(', ')}`
    });
  }

  return errors;
}

export function validateMovementList(items: MovementItem[]): ValidationResult {
  const allErrors: StructuredValidationError[] = [];

  items.forEach((item, index) => {
    const itemErrors = validateMovementItem(item, index, items);
    allErrors.push(...itemErrors);
  });

  const hazmatItems = items.filter(i => i.hazmat_flag);
  const paxItems = items.filter(i => i.type === 'PAX' || i.pax_count);
  
  if (hazmatItems.length > 0 && paxItems.length > 0) {
    allErrors.push({
      severity: 'WARNING',
      code: 'PAX_HAZMAT_MIX',
      message: `Movement list contains ${hazmatItems.length} hazmat items and ${paxItems.length} PAX items - ensure proper separation`,
      suggestion: 'Hazmat and passengers may require separate aircraft depending on hazmat class'
    });
  }

  const errors = allErrors.filter(e => e.severity === 'ERROR');
  const warnings = allErrors.filter(e => e.severity === 'WARNING');
  const info = allErrors.filter(e => e.severity === 'INFO');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    info,
    summary: {
      error_count: errors.length,
      warning_count: warnings.length,
      info_count: info.length,
      can_proceed: errors.length === 0
    }
  };
}

export function validateLoadPlan(
  totalWeight: number,
  cobPercent: number,
  palletCount: number,
  aircraftType: AircraftType
): StructuredValidationError[] {
  const errors: StructuredValidationError[] = [];
  const spec = AIRCRAFT_SPECS[aircraftType];

  if (totalWeight > spec.max_payload) {
    errors.push({
      severity: 'ERROR',
      code: 'OVERWEIGHT_PALLET',
      message: `Aircraft overweight: ${totalWeight.toLocaleString()} lbs exceeds max payload of ${spec.max_payload.toLocaleString()} lbs`,
      suggestion: `Remove ${(totalWeight - spec.max_payload).toLocaleString()} lbs of cargo`
    });
  }

  if (cobPercent < spec.cob_min_percent || cobPercent > spec.cob_max_percent) {
    errors.push({
      severity: 'ERROR',
      code: 'COB_VIOLATION',
      message: `Center of balance ${cobPercent.toFixed(1)}% is outside safe envelope (${spec.cob_min_percent}-${spec.cob_max_percent}%)`,
      suggestion: cobPercent < spec.cob_min_percent 
        ? 'Move heavier items forward or add weight to nose' 
        : 'Move heavier items aft or add weight to tail'
    });
  }

  if (palletCount > spec.pallet_positions) {
    errors.push({
      severity: 'ERROR',
      code: 'OVERWEIGHT_PALLET',
      message: `Too many pallets: ${palletCount} exceeds ${spec.pallet_positions} positions`,
      suggestion: 'Remove pallets or use additional aircraft'
    });
  }

  const utilization = (totalWeight / spec.max_payload) * 100;
  if (utilization < 50 && palletCount > 0) {
    errors.push({
      severity: 'INFO',
      code: 'UNDERUTILIZED_SORTIE',
      message: `Aircraft is only ${utilization.toFixed(0)}% utilized`,
      suggestion: 'Consider consolidating with other sorties to reduce aircraft count'
    });
  }

  return errors;
}

// ============================================================================
// CSV PARSING VALIDATION
// ============================================================================

export function detectDelimiter(content: string): string {
  const firstLine = content.split('\n')[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  
  if (tabCount > commaCount && tabCount > semicolonCount) return '\t';
  if (semicolonCount > commaCount && semicolonCount > tabCount) return ';';
  return ',';
}

export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function parseBoolean(value: string | boolean | undefined | null): boolean {
  if (typeof value === 'boolean') return value;
  if (!value) return false;
  const normalized = String(value).toLowerCase().trim();
  return normalized === 'true' || normalized === 'yes' || normalized === '1' || normalized === 'y';
}

export function parseAxleWeights(value: string | undefined): number[] {
  if (!value) return [];
  try {
    const cleaned = value.replace(/[\[\]]/g, '').trim();
    if (!cleaned) return [];
    return cleaned.split(/[,;]/).map(s => {
      const num = parseFloat(s.trim());
      return isNaN(num) ? 0 : num;
    }).filter(n => n > 0);
  } catch {
    return [];
  }
}

export function parseNumber(value: string | number | undefined, defaultValue: number = 0): number {
  if (typeof value === 'number') return value;
  if (!value) return defaultValue;
  const num = parseFloat(String(value).replace(/[^\d.-]/g, ''));
  return isNaN(num) ? defaultValue : num;
}

// ============================================================================
// SUMMARY GENERATION
// ============================================================================

export function generateValidationSummary(result: ValidationResult): string {
  const lines: string[] = [];
  
  if (result.valid) {
    lines.push('✓ All items passed validation');
  } else {
    lines.push(`✗ Validation failed with ${result.summary.error_count} error(s)`);
  }
  
  if (result.summary.warning_count > 0) {
    lines.push(`⚠ ${result.summary.warning_count} warning(s) found`);
  }
  
  if (result.summary.info_count > 0) {
    lines.push(`ℹ ${result.summary.info_count} informational note(s)`);
  }
  
  return lines.join('\n');
}

export function formatValidationErrors(errors: StructuredValidationError[]): string {
  return errors.map(e => {
    const prefix = e.severity === 'ERROR' ? '❌' : e.severity === 'WARNING' ? '⚠️' : 'ℹ️';
    const itemInfo = e.item_id ? ` [${e.item_id}]` : '';
    return `${prefix}${itemInfo} ${e.message}\n   → ${e.suggestion}`;
  }).join('\n\n');
}
