/**
 * PACAF Airlift Demo - Movement List Parser
 * Spec Reference: Section 2 (Input Specification)
 * 
 * Parses CSV/JSON movement list data with comprehensive validation and error handling.
 * Automatically classifies items as ROLLING_STOCK, PALLETIZABLE, PREBUILT_PALLET, or PAX.
 */

import {
  MovementItem,
  RawMovementInput,
  ValidationError,
  ParseResult,
  CargoCategory,
  PALLET_463L,
  AIRCRAFT_SPECS
} from '../types';

// ============================================================================
// PARSER CONFIGURATION
// ============================================================================

const PALLET_FOOTPRINT_TOLERANCE = 5; // inches tolerance for pallet detection
const ROLLING_STOCK_KEYWORDS = ['TRACTOR', 'LOADER', 'VEHICLE', 'TRUCK', 'TRAILER', 'FORKLIFT', 'TOW'];

// ============================================================================
// CSV PARSING
// ============================================================================

export function parseCSV(csvContent: string): RawMovementInput[] {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV file must contain header row and at least one data row');
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const rows: RawMovementInput[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0 || values.every(v => v.trim() === '')) continue;

    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx]?.trim() || '';
    });

    rows.push({
      item_id: row.item_id || String(i),
      description: row.description || '',
      length_in: row.length_in || '',
      width_in: row.width_in || '',
      height_in: row.height_in || '',
      weight_lb: row.weight_lb || '',
      lead_tcn: row.lead_tcn || '',
      pax: row.pax || '',
      quantity: row.quantity || '1',
      type: row.type || '',
      advon_flag: row.advon_flag || 'false',
      hazmat_flag: row.hazmat_flag || 'false',
      axle_weights: row.axle_weights || ''
    });
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// ============================================================================
// ITEM CLASSIFICATION (Spec Section 3)
// ============================================================================

function classifyItemType(item: RawMovementInput): CargoCategory {
  // Check for PAX entries (only reasonable personnel counts, 1-500)
  const paxValue = parseInt(String(item.pax), 10);
  const hasPaxValue = !isNaN(paxValue) && paxValue > 0;
  const isValidPaxCount = hasPaxValue && paxValue <= 500;
  
  if (isValidPaxCount) {
    return 'PAX';
  }
  
  // If pax value is provided but out of range (>500), do NOT classify as PAX
  // This prevents weight values from being misinterpreted as personnel counts
  if (hasPaxValue && paxValue > 500) {
    // Fall through to cargo classification - don't use description-based PAX detection
    // The item has an invalid pax value, so treat it as cargo
  } else {
    // Only check description for PAX keyword if no pax value is provided
    // (i.e., pax field is empty/zero/NaN)
    if (item.description?.toUpperCase().includes('PAX') && 
        !item.description?.toUpperCase().includes('PALLET')) {
      return 'PAX';
    }
  }

  // Check for explicit type
  if (item.type) {
    const upperType = item.type.toUpperCase();
    if (upperType === 'ROLLING_STOCK') return 'ROLLING_STOCK';
    if (upperType === 'PREBUILT_PALLET') return 'PREBUILT_PALLET';
    if (upperType === 'PALLETIZABLE') return 'PALLETIZABLE';
    if (upperType === 'PAX') return 'PAX';
  }

  const length = parseFloat(String(item.length_in)) || 0;
  const width = parseFloat(String(item.width_in)) || 0;
  const description = (item.description || '').toUpperCase();

  // Check for rolling stock keywords
  for (const keyword of ROLLING_STOCK_KEYWORDS) {
    if (description.includes(keyword)) {
      return 'ROLLING_STOCK';
    }
  }

  // Check if dimensions match 463L pallet footprint (likely prebuilt pallet)
  const isPalletFootprint = 
    (Math.abs(length - PALLET_463L.width) <= PALLET_FOOTPRINT_TOLERANCE &&
     Math.abs(width - PALLET_463L.length) <= PALLET_FOOTPRINT_TOLERANCE) ||
    (Math.abs(length - PALLET_463L.length) <= PALLET_FOOTPRINT_TOLERANCE &&
     Math.abs(width - PALLET_463L.width) <= PALLET_FOOTPRINT_TOLERANCE);

  if (isPalletFootprint) {
    return 'PREBUILT_PALLET';
  }

  // Check if item exceeds pallet usable area (must be rolling stock)
  if (length > PALLET_463L.usable_length || width > PALLET_463L.usable_width) {
    return 'ROLLING_STOCK';
  }

  // Default to palletizable
  return 'PALLETIZABLE';
}

// ============================================================================
// VALIDATION (Spec Section 2.1)
// ============================================================================

function validateItem(
  raw: RawMovementInput,
  index: number
): { item: MovementItem | null; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const itemId = raw.item_id || String(index + 1);

  // Handle PAX items specially
  // Only treat as PAX if the value is reasonable (1-500 range for personnel count)
  // Larger numbers are likely weight values, not personnel counts
  const paxValue = parseInt(String(raw.pax), 10);
  const isValidPaxCount = !isNaN(paxValue) && paxValue > 0 && paxValue <= 500;
  
  if (isValidPaxCount) {
    return {
      item: {
        item_id: itemId,
        description: raw.description || 'PAX',
        quantity: 1,
        weight_each_lb: 225 * paxValue, // Standard PAX weight with gear (225 lbs per person)
        length_in: 0,
        width_in: 0,
        height_in: 0,
        type: 'PAX',
        advon_flag: raw.advon_flag === 'true' || raw.advon_flag === true,
        hazmat_flag: false,
        pax_count: paxValue
      },
      errors: []
    };
  }
  
  // If pax field has a value > 500, add a warning (likely misformatted data)
  if (!isNaN(paxValue) && paxValue > 500) {
    errors.push({
      code: 'WARN_PALLET_OVERSPEC',
      item_id: itemId,
      field: 'pax',
      message: `Item ${itemId}: PAX value ${paxValue} exceeds maximum (500). Treating as cargo item.`,
      suggestion: 'If this is personnel count, split into multiple entries <= 500. If this is a weight, clear the pax column.',
      severity: 'warning'
    });
  }

  // Parse dimensions - use defaults if missing (lenient parsing)
  let length = parseFloat(String(raw.length_in));
  let width = parseFloat(String(raw.width_in));
  let height = parseFloat(String(raw.height_in));
  let weight = parseFloat(String(raw.weight_lb));

  // Validate required fields - missing description is a warning, use default
  const description = (raw.description && raw.description.trim() !== '') 
    ? raw.description 
    : `Unknown Item ${itemId}`;
  
  if (!raw.description || raw.description.trim() === '') {
    errors.push({
      code: 'WARN_PALLET_OVERSPEC',
      item_id: itemId,
      field: 'description',
      message: `Item ${itemId}: Missing description - using default`,
      suggestion: 'Add a description for this item',
      severity: 'warning'
    });
  }

  // Validate dimensions - use defaults if missing (lenient parsing with warnings)
  if (isNaN(length) || length <= 0) {
    length = 24; // Default small item size
    errors.push({
      code: 'WARN_PALLET_OVERSPEC',
      item_id: itemId,
      field: 'length_in',
      message: `Item ${itemId}: Invalid length (${raw.length_in}) - using default 24"`,
      suggestion: 'Provide actual length for accurate load planning',
      severity: 'warning'
    });
  }

  if (isNaN(width) || width <= 0) {
    width = 24; // Default small item size
    errors.push({
      code: 'WARN_PALLET_OVERSPEC',
      item_id: itemId,
      field: 'width_in',
      message: `Item ${itemId}: Invalid width (${raw.width_in}) - using default 24"`,
      suggestion: 'Provide actual width for accurate load planning',
      severity: 'warning'
    });
  }

  if (isNaN(height) || height <= 0) {
    height = 24; // Default small item size
    errors.push({
      code: 'WARN_PALLET_OVERSPEC',
      item_id: itemId,
      field: 'height_in',
      message: `Item ${itemId}: Invalid height (${raw.height_in}) - using default 24"`,
      suggestion: 'Provide actual height for accurate load planning',
      severity: 'warning'
    });
  }

  if (isNaN(weight) || weight <= 0) {
    weight = 100; // Default 100 lb item
    errors.push({
      code: 'WARN_PALLET_OVERSPEC',
      item_id: itemId,
      field: 'weight_lb',
      message: `Item ${itemId}: Invalid weight (${raw.weight_lb}) - using default 100 lbs`,
      suggestion: 'Provide actual weight for accurate load planning',
      severity: 'warning'
    });
  }

  const itemType = classifyItemType(raw);

  // Validate pallet constraints (Spec Section 4)
  if (itemType === 'PREBUILT_PALLET' || itemType === 'PALLETIZABLE') {
    // Check height limits
    if (height > PALLET_463L.max_height) {
      errors.push({
        code: 'WARN_PALLET_OVERSPEC',
        item_id: itemId,
        field: 'height_in',
        message: `Item ${itemId}: Height ${height}" exceeds max pallet height of ${PALLET_463L.max_height}"`,
        suggestion: 'Reduce cargo height or mark as ROLLING_STOCK',
        severity: 'warning'
      });
    }

    // Check weight limits based on height
    const maxWeight = height > PALLET_463L.recommended_height 
      ? PALLET_463L.max_payload_100in 
      : PALLET_463L.max_payload_96in;
    
    if (weight > maxWeight) {
      errors.push({
        code: 'WARN_PALLET_OVERSPEC',
        item_id: itemId,
        field: 'weight_lb',
        message: `Item ${itemId}: Weight ${weight} lbs exceeds limit of ${maxWeight} lbs for height ${height}"`,
        suggestion: 'Split cargo across multiple pallets or reduce weight',
        severity: 'warning'
      });
    }
  }

  // Validate rolling stock dimensions against aircraft limits
  if (itemType === 'ROLLING_STOCK') {
    const c17Width = AIRCRAFT_SPECS['C-17'].ramp_clearance_width;
    const c130Width = AIRCRAFT_SPECS['C-130'].ramp_clearance_width;

    if (width > c17Width) {
      errors.push({
        code: 'WARN_OVERSIZE_ITEM',
        item_id: itemId,
        field: 'width_in',
        message: `Item ${itemId}: Width ${width}" exceeds C-17 ramp clearance of ${c17Width}"`,
        suggestion: 'This item cannot be transported by C-17 or C-130',
        severity: 'warning'
      });
    } else if (width > c130Width) {
      errors.push({
        code: 'WARN_OVERSIZE_ITEM',
        item_id: itemId,
        field: 'width_in',
        message: `Item ${itemId}: Width ${width}" exceeds C-130 ramp clearance of ${c130Width}"`,
        suggestion: 'This item requires C-17 transport',
        severity: 'warning'
      });
    }
  }

  return {
    item: {
      item_id: itemId,
      utc_id: raw.lead_tcn || undefined,
      description: description,
      quantity: parseInt(String(raw.quantity), 10) || 1,
      weight_each_lb: weight,
      length_in: length,
      width_in: width,
      height_in: height,
      type: itemType,
      advon_flag: raw.advon_flag === 'true' || raw.advon_flag === true,
      hazmat_flag: raw.hazmat_flag === 'true' || raw.hazmat_flag === true,
      lead_tcn: raw.lead_tcn || undefined,
      axle_weights: raw.axle_weights ? raw.axle_weights.split(',').map(Number) : undefined
    },
    errors
  };
}

// ============================================================================
// QUANTITY NORMALIZATION (Critical for spec compliance)
// ============================================================================

/**
 * Expands items with quantity > 1 into individual items.
 * This ensures correct aircraft allocation, weight calculations, and CoB.
 * Per spec: each physical item must be tracked separately for placement.
 */
function expandQuantities(items: MovementItem[]): MovementItem[] {
  const expanded: MovementItem[] = [];
  
  for (const item of items) {
    // PAX items are handled differently - they stay as single entries with pax_count
    if (item.type === 'PAX') {
      expanded.push(item);
      continue;
    }
    
    const qty = item.quantity || 1;
    for (let i = 0; i < qty; i++) {
      expanded.push({
        ...item,
        item_id: qty > 1 ? `${item.item_id}_${i + 1}` : item.item_id,
        quantity: 1  // Each expanded item has quantity 1
      });
    }
  }
  
  return expanded;
}

// ============================================================================
// MAIN PARSER FUNCTION
// ============================================================================

export function parseMovementList(csvContent: string): ParseResult {
  const rawItems = parseCSV(csvContent);
  const validItems: MovementItem[] = [];
  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationError[] = [];

  let rollingStockCount = 0;
  let palletizableCount = 0;
  let prebuiltPalletCount = 0;
  let paxCount = 0;
  let totalWeight = 0;

  for (let i = 0; i < rawItems.length; i++) {
    const { item, errors } = validateItem(rawItems[i], i);
    
    errors.forEach(e => {
      if (e.severity === 'error') {
        allErrors.push(e);
      } else {
        allWarnings.push(e);
      }
    });

    if (item) {
      validItems.push(item);
      totalWeight += item.weight_each_lb * item.quantity;

      switch (item.type) {
        case 'ROLLING_STOCK':
          rollingStockCount += item.quantity;
          break;
        case 'PALLETIZABLE':
          palletizableCount += item.quantity;
          break;
        case 'PREBUILT_PALLET':
          prebuiltPalletCount += item.quantity;
          break;
        case 'PAX':
          paxCount += item.pax_count || 1;
          break;
      }
    }
  }

  // Expand quantities into individual items for correct allocation
  const expandedItems = expandQuantities(validItems);

  return {
    items: expandedItems,
    errors: allErrors,
    warnings: allWarnings,
    summary: {
      total_items: rawItems.length,
      valid_items: expandedItems.length,
      rolling_stock_count: rollingStockCount,
      palletizable_count: palletizableCount,
      prebuilt_pallet_count: prebuiltPalletCount,
      pax_count: paxCount,
      total_weight_lb: totalWeight
    }
  };
}

// ============================================================================
// JSON PARSER (Alternative input format)
// ============================================================================

export function parseMovementListJSON(jsonContent: string): ParseResult {
  let rawItems: RawMovementInput[];
  
  try {
    rawItems = JSON.parse(jsonContent);
    if (!Array.isArray(rawItems)) {
      throw new Error('JSON must be an array of items');
    }
  } catch (e) {
    return {
      items: [],
      errors: [{
        code: 'ERR_MISSING_FIELD',
        item_id: 'N/A',
        message: `Failed to parse JSON: ${e instanceof Error ? e.message : 'Unknown error'}`,
        suggestion: 'Ensure the JSON is valid and contains an array of movement items',
        severity: 'error'
      }],
      warnings: [],
      summary: {
        total_items: 0,
        valid_items: 0,
        rolling_stock_count: 0,
        palletizable_count: 0,
        prebuilt_pallet_count: 0,
        pax_count: 0,
        total_weight_lb: 0
      }
    };
  }

  const validItems: MovementItem[] = [];
  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationError[] = [];

  let rollingStockCount = 0;
  let palletizableCount = 0;
  let prebuiltPalletCount = 0;
  let paxCount = 0;
  let totalWeight = 0;

  for (let i = 0; i < rawItems.length; i++) {
    const { item, errors } = validateItem(rawItems[i], i);
    
    errors.forEach(e => {
      if (e.severity === 'error') {
        allErrors.push(e);
      } else {
        allWarnings.push(e);
      }
    });

    if (item) {
      validItems.push(item);
      totalWeight += item.weight_each_lb * item.quantity;

      switch (item.type) {
        case 'ROLLING_STOCK':
          rollingStockCount += item.quantity;
          break;
        case 'PALLETIZABLE':
          palletizableCount += item.quantity;
          break;
        case 'PREBUILT_PALLET':
          prebuiltPalletCount += item.quantity;
          break;
        case 'PAX':
          paxCount += item.pax_count || 1;
          break;
      }
    }
  }

  // Expand quantities into individual items for correct allocation
  const expandedItems = expandQuantities(validItems);

  return {
    items: expandedItems,
    errors: allErrors,
    warnings: allWarnings,
    summary: {
      total_items: rawItems.length,
      valid_items: expandedItems.length,
      rolling_stock_count: rollingStockCount,
      palletizable_count: palletizableCount,
      prebuilt_pallet_count: prebuiltPalletCount,
      pax_count: paxCount,
      total_weight_lb: totalWeight
    }
  };
}
