export type ValidationLevel = 'error' | 'warning';
export type ValidationScope = 'file' | 'column' | 'row';

export interface ValidationMessage {
  level: ValidationLevel;
  scope: ValidationScope;
  target: string;
  message: string;
  rowIndex?: number;
}

export interface ParsedInventoryRow {
  requisition_no: string | null;
  description: string | null;
  quantity: number | null;
  length_in: number | null;
  width_in: number | null;
  height_in: number | null;
  weight_lb: number | null;
  unit_price: number | null;
  nsn: string | null;
  fsc: string | null;
  niin: string | null;
  condition: string | null;
  mission_id: string | null;
  serial_no: string | null;
  lin_esd: string | null;
  last_moved: string | null;
  _rawRow: Record<string, any>;
  _rowIndex: number;
}

export interface ColumnSpec {
  originalName: string;
  mappedTo: string | null;
  isRequired: boolean;
  isRecognized: boolean;
}

export interface ValidationResult {
  rows: ParsedInventoryRow[];
  columns: ColumnSpec[];
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
  canCommit: boolean;
}

const COLUMN_MAPPINGS: Record<string, string[]> = {
  requisition_no: ['o', 'requisition_no', 'requisition', 'item_id', 'req_no', 'order_id', 'id', 'req', 'reqn', 'document_no', 'document_number'],
  description: ['description', 'desc', 'item_name', 'name', 'item_description', 'nomenclature', 'item_desc', 'item'],
  quantity: ['q', 'quantity', 'qty', 'count', 'units', 'on_hand', 'oh', 'on_hand_qty'],
  length_in: ['l', 'length_in', 'length', 'len', 'length_inches'],
  width_in: ['w', 'width_in', 'width', 'wid', 'width_inches'],
  height_in: ['h', 'height_in', 'height', 'hgt', 'height_inches'],
  weight_lb: ['p', 'weight_lb', 'weight', 'weight_lbs', 'wt', 'mass'],
  unit_price: ['unit_price', 'price', 'cost', 'value', 'unit_cost', 'extended_price', 'ext_price'],
  nsn: ['nsn', 'national_stock_number', 'niin_nsn', 'nsn_niin', 'stock_number'],
  fsc: ['fsc', 'federal_supply_class', 'fsc_class'],
  niin: ['niin', 'national_item_identification_number', 'niin_no'],
  condition: ['condition', 'cond', 'condition_code', 'cond_code', 'status'],
  mission_id: ['mission', 'mission_id', 'mission_no', 'project', 'project_id'],
  serial_no: ['serial_no', 'serial', 'serial_number', 'sn', 's_n', 'ser_no'],
  lin_esd: ['lin_esd', 'lin', 'esd', 'line_item', 'line_no'],
  last_moved: ['last_moved', 'last_move', 'move_date', 'last_activity', 'activity_date'],
};

// No fields are strictly required - we'll default quantity to 1 and generate IDs if missing
// Only completely empty rows are skipped
const REQUIRED_FIELDS: string[] = [];
const RECOMMENDED_FIELDS = ['requisition_no', 'description', 'quantity', 'weight_lb', 'length_in', 'width_in', 'height_in'];

const NSN_REGEX = /^\d{4}-\d{2}-\d{3}-\d{4}$/;

export function mapColumnName(originalHeader: string): string | null {
  const normalized = originalHeader.toLowerCase().trim().replace(/[\s\-_]+/g, '_');
  
  for (const [mappedName, variations] of Object.entries(COLUMN_MAPPINGS)) {
    if (variations.includes(normalized)) {
      return mappedName;
    }
  }
  return null;
}

export function detectColumns(headers: string[]): ColumnSpec[] {
  const specs: ColumnSpec[] = [];
  const mappedColumns = new Set<string>();
  
  for (const header of headers) {
    const mapped = mapColumnName(header);
    if (mapped && !mappedColumns.has(mapped)) {
      mappedColumns.add(mapped);
      specs.push({
        originalName: header,
        mappedTo: mapped,
        isRecognized: true,
        isRequired: REQUIRED_FIELDS.includes(mapped),
      });
    } else {
      specs.push({
        originalName: header,
        mappedTo: null,
        isRecognized: false,
        isRequired: false,
      });
    }
  }
  
  return specs;
}

export function validateNSN(nsn: string): boolean {
  return NSN_REGEX.test(nsn);
}

export function parseNumber(value: any): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = parseFloat(String(value).replace(/[,$]/g, ''));
  return isNaN(num) ? null : num;
}

export function parseInteger(value: any): number | null {
  const num = parseNumber(value);
  if (num === null) return null;
  return Math.floor(num);
}

export function validateRow(row: Record<string, any>, rowIndex: number, columnMap: Map<string, string>): {
  parsed: ParsedInventoryRow;
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
} {
  const errors: ValidationMessage[] = [];
  const warnings: ValidationMessage[] = [];
  
  const getValue = (field: string): any => {
    for (const [original, mapped] of columnMap.entries()) {
      if (mapped === field) {
        return row[original];
      }
    }
    return undefined;
  };
  
  const requisition_no = getValue('requisition_no');
  const description = getValue('description');
  const quantity = getValue('quantity');
  const length_in = getValue('length_in');
  const width_in = getValue('width_in');
  const height_in = getValue('height_in');
  const weight_lb = getValue('weight_lb');
  const unit_price = getValue('unit_price');
  const nsn = getValue('nsn');
  const fsc = getValue('fsc');
  const niin = getValue('niin');
  const condition = getValue('condition');
  const mission_id = getValue('mission_id');
  const serial_no = getValue('serial_no');
  const lin_esd = getValue('lin_esd');
  const last_moved = getValue('last_moved');
  
  const parsed: ParsedInventoryRow = {
    requisition_no: requisition_no ? String(requisition_no).trim() : null,
    description: description ? String(description).trim() : null,
    quantity: parseInteger(quantity),
    length_in: parseNumber(length_in),
    width_in: parseNumber(width_in),
    height_in: parseNumber(height_in),
    weight_lb: parseNumber(weight_lb),
    unit_price: parseNumber(unit_price),
    nsn: nsn ? String(nsn).trim() : null,
    fsc: fsc ? String(fsc).trim() : null,
    niin: niin ? String(niin).trim() : null,
    condition: condition ? String(condition).trim() : null,
    mission_id: mission_id ? String(mission_id).trim() : null,
    serial_no: serial_no ? String(serial_no).trim() : null,
    lin_esd: lin_esd ? String(lin_esd).trim() : null,
    last_moved: last_moved ? String(last_moved).trim() : null,
    _rawRow: row,
    _rowIndex: rowIndex,
  };
  
  // Default quantity to 1 if missing
  if (parsed.quantity === null) {
    parsed.quantity = 1;
  }
  
  // Only validate data format - negative values are still errors
  if (parsed.quantity < 0) {
    errors.push({
      level: 'error',
      scope: 'row',
      target: 'quantity',
      message: `Invalid quantity: ${parsed.quantity}. Must be non-negative.`,
      rowIndex,
    });
  }
  
  // Weight validation - only error on invalid data, not missing
  if (parsed.weight_lb !== null && parsed.weight_lb < 0) {
    errors.push({
      level: 'error',
      scope: 'row',
      target: 'weight_lb',
      message: `Invalid weight: ${parsed.weight_lb}. Must be non-negative.`,
      rowIndex,
    });
  }
  
  if (parsed.length_in !== null && parsed.length_in < 0) {
    errors.push({
      level: 'error',
      scope: 'row',
      target: 'length_in',
      message: `Invalid length: ${parsed.length_in}. Must be non-negative.`,
      rowIndex,
    });
  }
  
  if (parsed.width_in !== null && parsed.width_in < 0) {
    errors.push({
      level: 'error',
      scope: 'row',
      target: 'width_in',
      message: `Invalid width: ${parsed.width_in}. Must be non-negative.`,
      rowIndex,
    });
  }
  
  if (parsed.height_in !== null && parsed.height_in < 0) {
    errors.push({
      level: 'error',
      scope: 'row',
      target: 'height_in',
      message: `Invalid height: ${parsed.height_in}. Must be non-negative.`,
      rowIndex,
    });
  }
  
  if (parsed.unit_price !== null && parsed.unit_price < 0) {
    errors.push({
      level: 'error',
      scope: 'row',
      target: 'unit_price',
      message: `Invalid unit_price: ${parsed.unit_price}. Must be non-negative.`,
      rowIndex,
    });
  }
  
  if (parsed.nsn) {
    if (!validateNSN(parsed.nsn)) {
      warnings.push({
        level: 'warning',
        scope: 'row',
        target: 'nsn',
        message: `Malformed NSN: "${parsed.nsn}". Expected format: XXXX-XX-XXX-XXXX`,
        rowIndex,
      });
    }
  }
  
  return { parsed, errors, warnings };
}

export function validateColumns(headers: string[]): {
  columnMap: Map<string, string>;
  columns: ColumnSpec[];
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
} {
  const errors: ValidationMessage[] = [];
  const warnings: ValidationMessage[] = [];
  const columnMap = new Map<string, string>();
  const columns = detectColumns(headers);
  
  const foundMappedColumns = new Set<string>();
  for (const col of columns) {
    if (col.isRecognized && col.mappedTo) {
      columnMap.set(col.originalName, col.mappedTo);
      foundMappedColumns.add(col.mappedTo);
    }
  }
  
  for (const required of REQUIRED_FIELDS) {
    if (!foundMappedColumns.has(required)) {
      errors.push({
        level: 'error',
        scope: 'column',
        target: required,
        message: `Missing required column: ${required}`,
      });
    }
  }
  
  for (const recommended of RECOMMENDED_FIELDS) {
    if (!foundMappedColumns.has(recommended)) {
      warnings.push({
        level: 'warning',
        scope: 'column',
        target: recommended,
        message: `Missing recommended column: ${recommended}`,
      });
    }
  }
  
  const unmappedColumns = columns.filter(c => !c.isRecognized);
  for (const col of unmappedColumns) {
    warnings.push({
      level: 'warning',
      scope: 'column',
      target: col.originalName,
      message: `Unrecognized column: "${col.originalName}" - will be ignored`,
    });
  }
  
  return { columnMap, columns, errors, warnings };
}

export function validateInventoryData(
  rawRows: Record<string, any>[],
  headers: string[]
): ValidationResult {
  const { columnMap, columns, errors: columnErrors, warnings: columnWarnings } = validateColumns(headers);
  
  const allErrors: ValidationMessage[] = [...columnErrors];
  const allWarnings: ValidationMessage[] = [...columnWarnings];
  const parsedRows: ParsedInventoryRow[] = [];
  
  if (rawRows.length === 0) {
    allErrors.push({
      level: 'error',
      scope: 'file',
      target: 'data',
      message: 'No data rows found in file',
    });
  }
  
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const { parsed, errors, warnings } = validateRow(row, i, columnMap);
    parsedRows.push(parsed);
    allErrors.push(...errors);
    allWarnings.push(...warnings);
  }
  
  // Count missing data for summary warnings
  const missingRequisitionCount = parsedRows.filter(r => !r.requisition_no).length;
  const missingDescriptionCount = parsedRows.filter(r => !r.description).length;
  const missingWeightCount = parsedRows.filter(r => r.weight_lb === null).length;
  const missingDimensionsCount = parsedRows.filter(r => 
    r.length_in === null || r.width_in === null || r.height_in === null
  ).length;
  
  // Add file-level summary warnings (not per-row)
  if (missingRequisitionCount > 0) {
    allWarnings.push({
      level: 'warning',
      scope: 'file',
      target: 'requisition_no',
      message: `${missingRequisitionCount} rows are missing requisition numbers - auto-generated IDs will be assigned`,
    });
  }
  
  if (missingDescriptionCount > 0 && missingDescriptionCount > parsedRows.length * 0.1) {
    allWarnings.push({
      level: 'warning',
      scope: 'file',
      target: 'description',
      message: `${missingDescriptionCount} rows are missing descriptions`,
    });
  }
  
  if (missingWeightCount > 0 && missingWeightCount > parsedRows.length * 0.5) {
    allWarnings.push({
      level: 'warning',
      scope: 'file',
      target: 'weight_lb',
      message: `${missingWeightCount} rows are missing weight data`,
    });
  }
  
  if (missingDimensionsCount > 0 && missingDimensionsCount > parsedRows.length * 0.5) {
    allWarnings.push({
      level: 'warning',
      scope: 'file',
      target: 'dimensions',
      message: `${missingDimensionsCount} rows are missing dimension data`,
    });
  }
  
  const hasFileErrors = allErrors.some(e => e.scope === 'file');
  const hasDataErrors = allErrors.some(e => e.scope === 'row' && e.target !== 'empty_row');
  
  // Allow commit as long as there are valid rows and no critical errors
  const validRowCount = parsedRows.filter(r => r.description || r.requisition_no || r.nsn).length;
  const canCommit = !hasFileErrors && validRowCount > 0;
  
  return {
    rows: parsedRows,
    columns,
    errors: allErrors,
    warnings: allWarnings,
    canCommit,
  };
}
