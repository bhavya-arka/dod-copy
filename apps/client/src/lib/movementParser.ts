/**
 * PACAF Airlift Demo - Movement List Parser
 * Per pallet_parsing specification
 * 
 * Parses CSV movement list data with comprehensive validation.
 * Classifies items as PALLETIZED, ROLLING_STOCK, LOOSE_CARGO, or PAX_RECORD.
 */

import {
  MovementItem,
  RawMovementInput,
  ValidationError,
  ParseResult,
  CargoCategory,
  CargoType,
  PalletFootprint,
  ParsedCargoItem,
  ParsedCargoResult,
  ValidationIssue,
  PALLET_463L,
  AIRCRAFT_SPECS,
  parsedItemToMovementItem
} from './pacafTypes';
import { detectDuplicateTCN, validateEdgeCases } from './edgeCaseHandler';

// ============================================================================
// CONFIGURATION PER SPEC
// ============================================================================

// Spec Section 3.1: 463L pallet footprint
const PALLET_463L_FOOTPRINT = { length: 88, width: 108 };

// Spec Section 3.2: Text hints for pallet-like items
const PALLET_TEXT_HINTS = [
  'PALLET', 'DSP', 'SUPPLIES', 'SE AMU', 'AMU', 'OPS', 'AFE', 
  'BAG PALLET', 'WEAPONS', 'INTEL', 'CTK', 'FIRE BOTTLE', 
  'LIGHTNING', 'BRU', 'BOS', 'HESAMS'
];

// Spec Section 4.1: Rolling stock keywords (refined to avoid false positives on palletized cargo)
// Removed: 'RIG' (matches "BOS RIG/AV CTK AMU"), 'PLANT' and 'MOBILE' (too broad)
const ROLLING_STOCK_KEYWORDS = [
  'TRACTOR', 'TRK', 'TRUCK', 'TRAILER', 'TOW', 'TOWBAR',
  'LOADER', 'MHU-', 'VEH', 'FORKLIFT', 'DOLLY', 'VEHICLE'
];

// Spec Section 3.2: Approximate pallet dimension ranges
const APPROX_PALLET_DIMS = {
  length_min: 80, length_max: 96,
  width_min: 100, width_max: 116
};

// Expected CSV header columns (case-insensitive)
const EXPECTED_HEADERS = ['description', 'length', 'width', 'height', 'weight', 'lead tcn', 'pax'];

// ============================================================================
// CSV PARSING WITH REPEATED HEADER DETECTION (Spec Section 1.3)
// ============================================================================

interface RawCSVRow {
  description: string;
  length: string;
  width: string;
  height: string;
  weight: string;
  lead_tcn: string;
  pax: string;
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
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSVLineSmartDescription(line: string, expectedColumns: number = 7): string[] {
  const rawParts = line.split(',').map(p => p.trim());
  
  if (rawParts.length <= expectedColumns) {
    return rawParts;
  }
  
  const dataColumns = rawParts.slice(-(expectedColumns - 1));
  const descriptionParts = rawParts.slice(0, rawParts.length - (expectedColumns - 1));
  const description = descriptionParts.join(', ');
  
  return [description, ...dataColumns];
}

function isHeaderRow(values: string[]): boolean {
  // Header detection using strict keyword matching
  // A header row must have short, header-like values (not long descriptions)
  const headerKeywords = ['description', 'length', 'width', 'height', 'weight', 'tcn', 'pax'];
  let matches = 0;
  let hasLongValue = false;
  
  for (const value of values) {
    // Header values are typically short (under 30 chars) - long values indicate data rows
    if (value.length > 30) {
      hasLongValue = true;
      break;
    }
    
    const normalized = value.toLowerCase().replace(/[^a-z]/g, '');
    
    // Only match if the normalized value is mostly a header keyword
    // (prevents "Weightlifting Equipment" from matching "weight")
    for (const keyword of headerKeywords) {
      // Value should be primarily the keyword (e.g., "Length (in)" -> "lengthin" contains "length")
      // But "Weightlifting" -> "weightlifting" should not match "weight"
      if (normalized === keyword || 
          normalized.startsWith(keyword) || 
          (normalized.includes(keyword) && normalized.length <= keyword.length + 5)) {
        matches++;
        break;
      }
    }
  }
  
  // Header rows have short values and at least 4 keyword matches
  return !hasLongValue && matches >= 4;
}

interface ParseRawCSVResult {
  rows: RawCSVRow[];
  headerIndices: number[];
  paxTotal: number;
}

function parseRawCSV(csvContent: string): ParseRawCSVResult {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 1) {
    throw new Error('CSV file is empty');
  }

  const rows: RawCSVRow[] = [];
  const headerIndices: number[] = [];
  let columnMapping: { [key: string]: number } = {};
  let hasFoundHeader = false;
  let paxTotal = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawValues = parseCSVLine(lines[i]);
    const values = hasFoundHeader ? parseCSVLineSmartDescription(lines[i], 7) : rawValues;
    
    // Check if this is a header row (Spec Section 1.3)
    if (isHeaderRow(rawValues)) {
      headerIndices.push(i);
      hasFoundHeader = true;
      
      // Map column positions
      columnMapping = {};
      values.forEach((v, idx) => {
        const normalized = v.toLowerCase().replace(/[^a-z]/g, '');
        const normalizedWithSpaces = v.toLowerCase().trim();
        if (normalized.includes('description') || normalized.includes('item') || normalized.includes('nomenclature')) {
          columnMapping.description = idx;
        } else if (normalized.includes('length') && !normalized.includes('wheel')) {
          columnMapping.length = idx;
        } else if (normalized.includes('width')) {
          columnMapping.width = idx;
        } else if (normalized.includes('weight') || (normalized.includes('wt') && !normalized.startsWith('ht')) || normalized.includes('gross')) {
          // Check weight BEFORE height; ensure 'wt' doesn't match abbreviations like 'htin'
          columnMapping.weight = idx;
        } else if (normalized.includes('height') || normalized.startsWith('ht')) {
          // Match 'height' or abbreviations like 'ht', 'htin' (but not 'weight' which is handled above)
          columnMapping.height = idx;
        } else if (normalizedWithSpaces.includes('lead tcn') || normalizedWithSpaces.includes('tcn') || normalized.includes('leadtcn') || normalized.includes('transportationcontrol')) {
          columnMapping.lead_tcn = idx;
        } else if (normalized === 'pax' || normalizedWithSpaces.includes('pax') || normalized.includes('personnel') || normalized.includes('passengers')) {
          columnMapping.pax = idx;
        }
      });
      
      // Debug log column mapping
      console.log('[MovementParser] Detected column mapping:', columnMapping);
      continue;
    }

    // Skip if we haven't found header yet
    if (!hasFoundHeader) continue;

    // Skip completely empty rows
    if (values.every(v => v === '')) continue;

    // Parse data row using column mapping
    const description = values[columnMapping.description ?? 0] || '';
    const length = values[columnMapping.length ?? 1] || '';
    const width = values[columnMapping.width ?? 2] || '';
    const height = values[columnMapping.height ?? 3] || '';
    const weight = values[columnMapping.weight ?? 4] || '';
    const lead_tcn = columnMapping.lead_tcn !== undefined ? (values[columnMapping.lead_tcn] || '') : '';
    const pax = columnMapping.pax !== undefined ? (values[columnMapping.pax] || '') : '';

    // Normalize description for PAX detection
    // Handle case where description is empty and "PAX" or "Total PAX" appears in another column
    const descUpper = description.trim().toUpperCase();
    const lengthUpper = length.trim().toUpperCase();
    
    // Check for "Total PAX" row - extract the total and skip
    // This can appear as Description="Total PAX" or as empty Description with Length="Total PAX"
    if (descUpper === 'TOTAL PAX' || (descUpper === '' && lengthUpper === 'TOTAL PAX')) {
      const paxStr = pax.replace(/[^\d]/g, '');
      if (paxStr) {
        paxTotal = parseInt(paxStr, 10);
        console.log('[MovementParser] Found Total PAX row:', paxTotal);
      }
      continue; // Skip this row - don't add to items
    }

    // Check for PAX section marker (Description="PAX" with no PAX count)
    // This can appear as Description="PAX" or as empty Description with Length="PAX"
    const isPaxMarker = (descUpper === 'PAX' || (descUpper === '' && lengthUpper === 'PAX'));
    const hasPaxCount = pax.trim() !== '' && !isNaN(parseInt(pax.replace(/[^\d]/g, ''), 10));
    
    if (isPaxMarker && !hasPaxCount) {
      // Skip PAX section marker row (no count)
      console.log('[MovementParser] Skipping PAX section marker row (no count)');
      continue;
    }

    // Add row to results
    rows.push({
      description,
      length,
      width,
      height,
      weight,
      lead_tcn,
      pax
    });
  }

  return { rows, headerIndices, paxTotal };
}

// ============================================================================
// ID GENERATION (Spec Section 6)
// ============================================================================

function sanitizeTCN(tcn: string): string {
  return tcn.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9]/g, '_');
}

function generateBaseId(leadTcn: string | null, rowIndex: number): string {
  if (leadTcn && leadTcn.trim()) {
    return sanitizeTCN(leadTcn);
  }
  return `ITEM_${String(rowIndex + 1).padStart(4, '0')}`;
}

// Track pallet indices per TCN
const tcnPalletIndex = new Map<string, number>();
let globalPalletCounter = 0;
let globalVehicleCounter = 0;

function resetIdCounters(): void {
  tcnPalletIndex.clear();
  globalPalletCounter = 0;
  globalVehicleCounter = 0;
}

function generatePalletId(leadTcn: string | null): string {
  if (leadTcn && leadTcn.trim()) {
    const sanitized = sanitizeTCN(leadTcn);
    const currentIndex = tcnPalletIndex.get(sanitized) || 0;
    tcnPalletIndex.set(sanitized, currentIndex + 1);
    return `${sanitized}_P${String(currentIndex + 1).padStart(2, '0')}`;
  }
  globalPalletCounter++;
  return `P-${String(globalPalletCounter).padStart(3, '0')}`;
}

function generateRollingId(leadTcn: string | null): string {
  if (leadTcn && leadTcn.trim()) {
    const sanitized = sanitizeTCN(leadTcn);
    const currentIndex = tcnPalletIndex.get(sanitized + '_V') || 0;
    tcnPalletIndex.set(sanitized + '_V', currentIndex + 1);
    return `${sanitized}_V${currentIndex + 1}`;
  }
  globalVehicleCounter++;
  return `VEH-${String(globalVehicleCounter).padStart(3, '0')}`;
}

// ============================================================================
// CLASSIFICATION LOGIC (Spec Sections 3, 4, 5)
// ============================================================================

interface ClassificationResult {
  cargo_type: CargoType;
  pallet_footprint: PalletFootprint;
  inferred_pallet_count: number;
  classification_reasons: string[];
  warnings: ValidationIssue[];
}

function classifyItem(
  row: RawCSVRow,
  length: number,
  width: number,
  height: number,
  weight: number,
  paxCount: number | null
): ClassificationResult {
  const reasons: string[] = [];
  const warnings: ValidationIssue[] = [];
  const description = row.description.toUpperCase();
  
  // PRIORITY 1: Check exact 463L footprint FIRST - items with 88x108 dimensions are PALLETS
  // This takes precedence over rolling stock keywords to avoid misclassifying pallet items
  const is463LFootprint = 
    (length === PALLET_463L_FOOTPRINT.length && width === PALLET_463L_FOOTPRINT.width) ||
    (length === PALLET_463L_FOOTPRINT.width && width === PALLET_463L_FOOTPRINT.length);

  if (is463LFootprint && weight <= 10000) {
    reasons.push('DIM_MATCH_463L');
    return {
      cargo_type: 'PALLETIZED',
      pallet_footprint: '463L',
      inferred_pallet_count: 1,
      classification_reasons: reasons,
      warnings
    };
  }

  // PRIORITY 2: Check for rolling stock keywords (only for non-463L footprint items)
  const descUpper = description.toUpperCase();
  const isRollingStock = ROLLING_STOCK_KEYWORDS.some(keyword => descUpper.includes(keyword.toUpperCase()));
  
  if (isRollingStock && (length > 0 || width > 0 || height > 0 || weight > 0)) {
    reasons.push('TEXT_MATCH_ROLLING_STOCK');
    if (paxCount !== null && paxCount > 0) {
      warnings.push({
        code: 'WARNING_ROLLING_STOCK_WITH_PAX',
        message: `Rolling stock item has trailing PAX value of ${paxCount} - may indicate associated personnel`,
        field: 'pax'
      });
    }
    return {
      cargo_type: 'ROLLING_STOCK',
      pallet_footprint: 'NONE',
      inferred_pallet_count: 0,
      classification_reasons: reasons,
      warnings
    };
  }

  // PRIORITY 3: PAX Record Check (for PAX-only rows without significant cargo)
  if (paxCount !== null && paxCount > 0) {
    const hasSignificantCargo = (length > 0 || width > 0 || height > 0 || weight > 0);
    
    if (!hasSignificantCargo) {
      reasons.push('PAX_COUNT_NO_CARGO');
      return {
        cargo_type: 'PAX_RECORD',
        pallet_footprint: 'NONE',
        inferred_pallet_count: 0,
        classification_reasons: reasons,
        warnings
      };
    }
    
    reasons.push('PAX_COUNT_WITH_CARGO');
  }

  // Section 3.2: Text-based hints with approximate dimensions
  const hasTextHint = PALLET_TEXT_HINTS.some(hint => description.includes(hint));
  const isApproxPalletDims = 
    (length >= APPROX_PALLET_DIMS.length_min && length <= APPROX_PALLET_DIMS.length_max) &&
    (width >= APPROX_PALLET_DIMS.width_min && width <= APPROX_PALLET_DIMS.width_max);

  if (hasTextHint && isApproxPalletDims) {
    reasons.push('TEXT_HINT_PALLET_LIKE');
    warnings.push({
      code: 'WARNING_APPROX_DIM_MATCH_463L',
      message: `Item has pallet-like dimensions (${length}"×${width}") but not exact 463L footprint`,
      field: 'dimensions'
    });
    return {
      cargo_type: 'PALLETIZED',
      pallet_footprint: '463L',
      inferred_pallet_count: 1,
      classification_reasons: reasons,
      warnings
    };
  }

  // Section 4.1: Rolling stock detection
  const hasRollingKeyword = ROLLING_STOCK_KEYWORDS.some(keyword => description.includes(keyword));
  const isLongItem = length >= 1.5 * width && (length >= 120 || width >= 90);
  const isHeavyEquipment = weight >= 3000 && !hasTextHint;

  if (hasRollingKeyword || isLongItem || isHeavyEquipment) {
    reasons.push('ROLLING_STOCK_DIM_OR_TEXT_MATCH');
    return {
      cargo_type: 'ROLLING_STOCK',
      pallet_footprint: 'NONE',
      inferred_pallet_count: 0,
      classification_reasons: reasons,
      warnings
    };
  }

  // Section 4.2: Default to loose cargo
  reasons.push('DEFAULT_LOOSE_CARGO');
  return {
    cargo_type: 'LOOSE_CARGO',
    pallet_footprint: 'NONE',
    inferred_pallet_count: 0,
    classification_reasons: reasons,
    warnings
  };
}

// ============================================================================
// VALIDATION (Spec Section 7)
// ============================================================================

interface ValidationResult {
  length: number;
  width: number;
  height: number;
  weight: number;
  paxCount: number | null;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

function validateAndParseRow(row: RawCSVRow, rowIndex: number): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // Parse numeric values
  let length = parseFloat(row.length.replace(/[^\d.-]/g, ''));
  let width = parseFloat(row.width.replace(/[^\d.-]/g, ''));
  let height = parseFloat(row.height.replace(/[^\d.-]/g, ''));
  let weight = parseFloat(row.weight.replace(/[^\d.-]/g, ''));
  const paxStr = row.pax.replace(/[^\d]/g, '');
  let paxCount: number | null = paxStr ? parseInt(paxStr, 10) : null;

  // Check for PAX row (empty cargo dimensions but valid PAX - may or may not have description)
  const hasBlankCargoDimensions = 
    (!row.length || row.length.trim() === '') &&
    (!row.width || row.width.trim() === '') &&
    (!row.height || row.height.trim() === '') &&
    (!row.weight || row.weight.trim() === '');
  
  const isPaxRow = hasBlankCargoDimensions && paxCount !== null && paxCount > 0;

  if (isPaxRow) {
    // PAX rows with blank cargo data should use 0 dimensions, not defaults
    return {
      length: 0,
      width: 0,
      height: 0,
      weight: 0,
      paxCount,
      errors: [],
      warnings: []
    };
  }

  // Section 7.1: Required error conditions
  if (!row.description || row.description.trim() === '') {
    errors.push({
      code: 'ERROR_MISSING_DESCRIPTION',
      message: 'Description is required',
      field: 'description'
    });
  }

  // Validate dimensions - use defaults with warnings if invalid (lenient parsing)
  if (isNaN(length) || length <= 0) {
    length = 24;
    warnings.push({
      code: 'WARNING_INVALID_LENGTH',
      message: `Invalid length "${row.length}" - using default 24"`,
      field: 'length'
    });
  }

  if (isNaN(width) || width <= 0) {
    width = 24;
    warnings.push({
      code: 'WARNING_INVALID_WIDTH',
      message: `Invalid width "${row.width}" - using default 24"`,
      field: 'width'
    });
  }

  if (isNaN(height) || height <= 0) {
    height = 24;
    warnings.push({
      code: 'WARNING_INVALID_HEIGHT',
      message: `Invalid height "${row.height}" - using default 24"`,
      field: 'height'
    });
  }

  if (isNaN(weight) || weight <= 0) {
    weight = 100;
    warnings.push({
      code: 'WARNING_INVALID_WEIGHT',
      message: `Invalid weight "${row.weight}" - using default 100 lbs`,
      field: 'weight'
    });
  }

  // Section 7.2: Warnings
  if (!row.lead_tcn || row.lead_tcn.trim() === '') {
    warnings.push({
      code: 'WARNING_NO_LEAD_TCN',
      message: 'No Lead TCN present - synthetic ID will be generated',
      field: 'lead_tcn'
    });
  }

  return { length, width, height, weight, paxCount, errors, warnings };
}

// ============================================================================
// MAIN PARSER - NEW SPEC COMPLIANT
// ============================================================================

export function parseMovementListV2(csvContent: string): ParsedCargoResult {
  resetIdCounters();
  
  const { rows, paxTotal: parsedPaxTotal } = parseRawCSV(csvContent);
  const items: ParsedCargoItem[] = [];
  const allErrors: ValidationIssue[] = [];
  const allWarnings: ValidationIssue[] = [];

  // Totals
  let totalPalletizedWeight = 0;
  let totalPalletCount = 0;
  let totalRollingStockWeight = 0;
  let rollingStockCount = 0;
  let totalLooseCargoWeight = 0;
  let looseCargoCount = 0;
  let totalPax = 0;
  
  // Track individual PAX entries
  const paxIndividual: number[] = [];

  const palletIds: { pallet_id: string; lead_tcn: string | null }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    // Validate and parse numeric values
    const validation = validateAndParseRow(row, i);
    
    // Add row-level errors/warnings
    validation.errors.forEach(e => allErrors.push({ ...e, message: `Row ${i + 1}: ${e.message}` }));
    validation.warnings.forEach(w => allWarnings.push({ ...w, message: `Row ${i + 1}: ${w.message}` }));

    // Skip rows with critical errors (except PAX-only rows)
    if (validation.errors.some(e => e.code === 'ERROR_MISSING_DESCRIPTION') && 
        validation.paxCount === null) {
      continue;
    }

    const { length, width, height, weight, paxCount } = validation;

    // Classify the item
    const classification = classifyItem(row, length, width, height, weight, paxCount);
    classification.warnings.forEach(w => allWarnings.push({ ...w, message: `Row ${i + 1}: ${w.message}` }));
    
    // Debug logging for rolling stock detection
    if (classification.cargo_type === 'ROLLING_STOCK') {
      console.log(`[MovementParser] Row ${i + 1} classified as ROLLING_STOCK:`, {
        description: row.description,
        dimensions: `${length}L x ${width}W x ${height}H`,
        weight,
        reasons: classification.classification_reasons
      });
    }

    // Section 3.3: Height validation for palletized items
    if (classification.cargo_type === 'PALLETIZED' && height > 96) {
      allWarnings.push({
        code: 'WARNING_OVERHEIGHT_PALLET',
        message: `Row ${i + 1}: Palletized item height ${height}" exceeds standard limit of 96"`,
        field: 'height'
      });
    }

    // Generate IDs per Section 6
    const leadTcn = row.lead_tcn.trim() || 'N/A';
    const baseId = generateBaseId(leadTcn, i);
    
    let palletId: string | null = null;
    let palletSeqIndex: number | null = null;
    let rollingId: string | null = null;

    if (classification.cargo_type === 'PALLETIZED') {
      palletId = generatePalletId(leadTcn);
      palletSeqIndex = classification.inferred_pallet_count;
      palletIds.push({ pallet_id: palletId, lead_tcn: leadTcn });
      totalPalletizedWeight += weight;
      totalPalletCount += classification.inferred_pallet_count;
    } else if (classification.cargo_type === 'ROLLING_STOCK') {
      rollingId = generateRollingId(leadTcn);
      totalRollingStockWeight += weight;
      rollingStockCount++;
    } else if (classification.cargo_type === 'LOOSE_CARGO') {
      totalLooseCargoWeight += weight;
      looseCargoCount++;
    } else if (classification.cargo_type === 'PAX_RECORD') {
      const paxValue = paxCount || 1;
      totalPax += paxValue;
      // Track individual PAX entries for display
      paxIndividual.push(paxValue);
      // PAX is metadata only - do NOT add to cargo items array
      continue;
    }

    // Detect HAZMAT from description
    const hazmatFlag = row.description.toUpperCase().includes('HAZMAT') ||
                       row.description.toUpperCase().includes('CLASS') ||
                       row.description.toUpperCase().includes('EXPLOSIVE');

    // Detect ADVON from description
    const advonFlag = row.description.toUpperCase().includes('ADVON') ||
                      row.description.toUpperCase().includes('ADVANCE');

    const parsedItem: ParsedCargoItem = {
      rawRowIndex: i,
      description: row.description.trim() || (paxCount ? 'PAX' : `Unknown Item ${i + 1}`),
      length_in: length,
      width_in: width,
      height_in: height,
      weight_lb: weight,
      lead_tcn: leadTcn,
      pax_count: classification.cargo_type === 'PAX_RECORD' ? paxCount : null,
      cargo_type: classification.cargo_type,
      pallet_footprint: classification.pallet_footprint,
      inferred_pallet_count: classification.inferred_pallet_count,
      classification_reasons: classification.classification_reasons,
      validation_errors: validation.errors,
      validation_warnings: validation.warnings,
      base_id: baseId,
      pallet_id: palletId,
      pallet_sequence_index: palletSeqIndex,
      rolling_id: rollingId,
      advon_flag: advonFlag,
      hazmat_flag: hazmatFlag
    };

    items.push(parsedItem);
  }

  // Use the "Total PAX" row value if available, otherwise sum up individual entries
  const finalPaxTotal = parsedPaxTotal > 0 ? parsedPaxTotal : totalPax;

  console.log('[MovementParser V2] Parse complete:', {
    totalItems: items.length,
    rollingStockCount,
    palletCount: totalPalletCount,
    looseCargoCount,
    paxIndividual,
    paxTotal: finalPaxTotal
  });

  return {
    items,
    errors: allErrors,
    warnings: allWarnings,
    totals: {
      total_palletized_weight: totalPalletizedWeight,
      total_pallet_count: totalPalletCount,
      total_rolling_stock_weight: totalRollingStockWeight,
      rolling_stock_count: rollingStockCount,
      total_loose_cargo_weight: totalLooseCargoWeight,
      loose_cargo_count: looseCargoCount,
      total_pax: finalPaxTotal,
      total_weight: totalPalletizedWeight + totalRollingStockWeight + totalLooseCargoWeight
    },
    pax_individual: paxIndividual,
    pax_total: finalPaxTotal,
    pallet_ids: palletIds
  };
}

// ============================================================================
// LEGACY PARSER WRAPPER - Maintains backward compatibility
// ============================================================================

export function parseCSV(csvContent: string): RawMovementInput[] {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV file must contain header row and at least one data row');
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[()]/g, ''));
  const rows: RawMovementInput[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0 || values.every(v => v.trim() === '')) continue;

    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx]?.trim() || '';
    });

    // Handle new column naming from sample data
    const lengthVal = row.length_in || row['length_in'] || row['length'] || '';
    const widthVal = row.width_in || row['width_in'] || row['width'] || '';
    const heightVal = row.height_in || row['height_in'] || row['height'] || '';
    const weightVal = row.weight_lb || row['weight_lb'] || row['weight_lbs'] || row['weight'] || '';

    rows.push({
      item_id: row.item_id || String(i),
      description: row.description || '',
      length_in: lengthVal,
      width_in: widthVal,
      height_in: heightVal,
      weight_lb: weightVal,
      lead_tcn: row.lead_tcn || row['lead_tcn'] || '',
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

// ============================================================================
// ITEM CLASSIFICATION (Legacy - maps to new classification)
// ============================================================================

function classifyItemType(item: RawMovementInput): CargoCategory {
  const paxValue = parseInt(String(item.pax), 10);
  const hasPaxValue = !isNaN(paxValue) && paxValue > 0;
  const isValidPaxCount = hasPaxValue && paxValue <= 500;
  
  if (isValidPaxCount) {
    return 'PAX';
  }
  
  if (hasPaxValue && paxValue > 500) {
    // Fall through - not a valid PAX count
  } else {
    if (item.description?.toUpperCase().includes('PAX') && 
        !item.description?.toUpperCase().includes('PALLET')) {
      return 'PAX';
    }
  }

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

  // Check if dimensions match 463L pallet footprint
  const is463LFootprint = 
    (Math.abs(length - PALLET_463L_FOOTPRINT.width) <= 5 &&
     Math.abs(width - PALLET_463L_FOOTPRINT.length) <= 5) ||
    (Math.abs(length - PALLET_463L_FOOTPRINT.length) <= 5 &&
     Math.abs(width - PALLET_463L_FOOTPRINT.width) <= 5);

  if (is463LFootprint) {
    return 'PREBUILT_PALLET';
  }

  // Check if item exceeds pallet usable area
  if (length > PALLET_463L.usable_length || width > PALLET_463L.usable_width) {
    return 'ROLLING_STOCK';
  }

  return 'PALLETIZABLE';
}

// ============================================================================
// VALIDATION (Legacy)
// ============================================================================

function validateItem(
  raw: RawMovementInput,
  index: number
): { item: MovementItem | null; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const itemId = raw.item_id || String(index + 1);

  const paxValue = parseInt(String(raw.pax), 10);
  const isValidPaxCount = !isNaN(paxValue) && paxValue > 0 && paxValue <= 500;
  
  // Check if this is a PAX-only row (no significant cargo dimensions)
  const earlyLength = parseFloat(String(raw.length_in));
  const earlyWidth = parseFloat(String(raw.width_in));
  const earlyHeight = parseFloat(String(raw.height_in));
  const earlyWeight = parseFloat(String(raw.weight_lb));
  const hasCargoData = (!isNaN(earlyLength) && earlyLength > 0) || (!isNaN(earlyWidth) && earlyWidth > 0) || 
                       (!isNaN(earlyHeight) && earlyHeight > 0) || (!isNaN(earlyWeight) && earlyWeight > 0);
  
  // Only treat as PAX if valid PAX count AND no cargo dimensions
  if (isValidPaxCount && !hasCargoData) {
    return {
      item: {
        item_id: itemId,
        description: raw.description || 'PAX',
        quantity: 1,
        weight_each_lb: 225 * paxValue,
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
  
  if (!isNaN(paxValue) && paxValue > 500) {
    errors.push({
      code: 'WARN_PALLET_OVERSPEC',
      item_id: itemId,
      field: 'pax',
      message: `Item ${itemId}: PAX value ${paxValue} exceeds maximum (500). Treating as cargo item.`,
      suggestion: 'If this is personnel count, split into multiple entries <= 500.',
      severity: 'warning'
    });
  }

  let length = parseFloat(String(raw.length_in));
  let width = parseFloat(String(raw.width_in));
  let height = parseFloat(String(raw.height_in));
  let weight = parseFloat(String(raw.weight_lb));

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

  if (isNaN(length) || length <= 0) {
    length = 24;
    errors.push({
      code: 'WARN_PALLET_OVERSPEC',
      item_id: itemId,
      field: 'length_in',
      message: `Item ${itemId}: Invalid length - using default 24"`,
      suggestion: 'Provide actual length for accurate load planning',
      severity: 'warning'
    });
  }

  if (isNaN(width) || width <= 0) {
    width = 24;
    errors.push({
      code: 'WARN_PALLET_OVERSPEC',
      item_id: itemId,
      field: 'width_in',
      message: `Item ${itemId}: Invalid width - using default 24"`,
      suggestion: 'Provide actual width for accurate load planning',
      severity: 'warning'
    });
  }

  if (isNaN(height) || height <= 0) {
    height = 24;
    errors.push({
      code: 'WARN_PALLET_OVERSPEC',
      item_id: itemId,
      field: 'height_in',
      message: `Item ${itemId}: Invalid height - using default 24"`,
      suggestion: 'Provide actual height for accurate load planning',
      severity: 'warning'
    });
  }

  if (isNaN(weight) || weight <= 0) {
    weight = 100;
    errors.push({
      code: 'WARN_PALLET_OVERSPEC',
      item_id: itemId,
      field: 'weight_lb',
      message: `Item ${itemId}: Invalid weight - using default 100 lbs`,
      suggestion: 'Provide actual weight for accurate load planning',
      severity: 'warning'
    });
  }

  const itemType = classifyItemType(raw);

  if (itemType === 'PREBUILT_PALLET' || itemType === 'PALLETIZABLE') {
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

function expandQuantities(items: MovementItem[]): MovementItem[] {
  const expanded: MovementItem[] = [];
  
  for (const item of items) {
    if (item.type === 'PAX') {
      expanded.push(item);
      continue;
    }
    
    const qty = item.quantity || 1;
    for (let i = 0; i < qty; i++) {
      expanded.push({
        ...item,
        item_id: qty > 1 ? `${item.item_id}_${i + 1}` : item.item_id,
        quantity: 1
      });
    }
  }
  
  return expanded;
}

// ============================================================================
// MAIN LEGACY PARSER FUNCTION
// ============================================================================

// Detect if CSV uses new format (Description, Length (in), etc.) vs legacy (item_id, length_in, etc.)
function detectNewFormat(csvContent: string): boolean {
  const firstLine = csvContent.trim().split('\n')[0].toLowerCase();
  return firstLine.includes('description') && 
         (firstLine.includes('length (') || firstLine.includes('width (') || firstLine.includes('weight ('));
}

export function parseMovementList(csvContent: string): ParseResult {
  // Use V2 parser for new format CSV and convert to legacy format
  if (detectNewFormat(csvContent)) {
    const v2Result = parseMovementListV2(csvContent);
    return convertToLegacyParseResult(v2Result);
  }
  
  // Legacy parsing for old format CSV
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

  const expandedItems = expandQuantities(validItems);

  for (const item of expandedItems) {
    const edgeCaseResult = validateEdgeCases(item);
    edgeCaseResult.warnings.forEach(w => allWarnings.push(w));
    edgeCaseResult.errors.forEach(e => allErrors.push(e));
    
    if (edgeCaseResult.mustBeRollingStock && item.type !== 'ROLLING_STOCK' && item.type !== 'PAX') {
      item.type = 'ROLLING_STOCK';
    }
  }

  const duplicateWarnings = detectDuplicateTCN(expandedItems);
  duplicateWarnings.forEach(w => allWarnings.push(w));

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
// JSON PARSER (Legacy)
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

  const expandedItems = expandQuantities(validItems);

  for (const item of expandedItems) {
    const edgeCaseResult = validateEdgeCases(item);
    edgeCaseResult.warnings.forEach(w => allWarnings.push(w));
    edgeCaseResult.errors.forEach(e => allErrors.push(e));
    
    if (edgeCaseResult.mustBeRollingStock && item.type !== 'ROLLING_STOCK' && item.type !== 'PAX') {
      item.type = 'ROLLING_STOCK';
    }
  }

  const duplicateWarnings = detectDuplicateTCN(expandedItems);
  duplicateWarnings.forEach(w => allWarnings.push(w));

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
// CONVERTER: New result to legacy format
// ============================================================================

export function convertToLegacyParseResult(parsed: ParsedCargoResult): ParseResult {
  const items: MovementItem[] = parsed.items.map(parsedItemToMovementItem);
  
  const errors: ValidationError[] = parsed.errors.map(e => ({
    code: 'ERR_MISSING_FIELD' as const,
    item_id: 'N/A',
    message: e.message,
    suggestion: 'Check the data format',
    severity: 'error' as const
  }));

  const warnings: ValidationError[] = parsed.warnings.map(w => ({
    code: 'WARN_PALLET_OVERSPEC' as const,
    item_id: 'N/A',
    message: w.message,
    suggestion: 'Review for potential issues',
    severity: 'warning' as const
  }));

  return {
    items,
    errors,
    warnings,
    summary: {
      total_items: parsed.items.length,
      valid_items: parsed.items.length,
      rolling_stock_count: parsed.totals.rolling_stock_count,
      palletizable_count: parsed.totals.loose_cargo_count,
      prebuilt_pallet_count: parsed.totals.total_pallet_count,
      pax_count: parsed.totals.total_pax,
      total_weight_lb: parsed.totals.total_weight
    }
  };
}
