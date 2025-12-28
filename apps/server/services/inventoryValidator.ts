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
  _rawRow: Record<string, any>;
  _rowIndex: number;
}

export interface ColumnSpec {
  originalName: string;
  mappedName: string;
  detected: boolean;
  required: boolean;
}

export interface ValidationResult {
  rows: ParsedInventoryRow[];
  columns: ColumnSpec[];
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
  canCommit: boolean;
}

const COLUMN_MAPPINGS: Record<string, string[]> = {
  requisition_no: ['o', 'requisition_no', 'item_id', 'req_no', 'order_id', 'id'],
  description: ['description', 'desc', 'item_name', 'name', 'item_description'],
  quantity: ['q', 'quantity', 'qty', 'count', 'units'],
  length_in: ['l', 'length_in', 'length', 'len', 'length_inches'],
  width_in: ['w', 'width_in', 'width', 'wid', 'width_inches'],
  height_in: ['h', 'height_in', 'height', 'hgt', 'height_inches'],
  weight_lb: ['p', 'weight_lb', 'weight', 'weight_lbs', 'wt', 'mass'],
  unit_price: ['unit_price', 'price', 'cost', 'value'],
  nsn: ['nsn', 'national_stock_number'],
  fsc: ['fsc', 'federal_supply_class'],
  niin: ['niin', 'national_item_identification_number'],
};

const REQUIRED_FIELDS = ['requisition_no', 'quantity'];
const RECOMMENDED_FIELDS = ['description', 'weight_lb', 'length_in', 'width_in', 'height_in'];

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
        mappedName: mapped,
        detected: true,
        required: REQUIRED_FIELDS.includes(mapped),
      });
    } else {
      specs.push({
        originalName: header,
        mappedName: header,
        detected: false,
        required: false,
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
    _rawRow: row,
    _rowIndex: rowIndex,
  };
  
  if (!parsed.requisition_no) {
    errors.push({
      level: 'error',
      scope: 'row',
      target: 'requisition_no',
      message: 'Missing required field: requisition_no',
      rowIndex,
    });
  }
  
  if (parsed.quantity === null) {
    errors.push({
      level: 'error',
      scope: 'row',
      target: 'quantity',
      message: 'Missing required field: quantity',
      rowIndex,
    });
  } else if (parsed.quantity < 0) {
    errors.push({
      level: 'error',
      scope: 'row',
      target: 'quantity',
      message: `Invalid quantity: ${parsed.quantity}. Must be non-negative.`,
      rowIndex,
    });
  } else if (parsed.quantity === 0) {
    warnings.push({
      level: 'warning',
      scope: 'row',
      target: 'quantity',
      message: 'Quantity is zero',
      rowIndex,
    });
  }
  
  if (!parsed.description) {
    warnings.push({
      level: 'warning',
      scope: 'row',
      target: 'description',
      message: 'Missing recommended field: description',
      rowIndex,
    });
  }
  
  if (parsed.weight_lb === null) {
    warnings.push({
      level: 'warning',
      scope: 'row',
      target: 'weight_lb',
      message: 'Missing recommended field: weight_lb',
      rowIndex,
    });
  } else if (parsed.weight_lb < 0) {
    errors.push({
      level: 'error',
      scope: 'row',
      target: 'weight_lb',
      message: `Invalid weight: ${parsed.weight_lb}. Must be non-negative.`,
      rowIndex,
    });
  }
  
  const hasDimensions = parsed.length_in !== null || parsed.width_in !== null || parsed.height_in !== null;
  const hasAllDimensions = parsed.length_in !== null && parsed.width_in !== null && parsed.height_in !== null;
  
  if (!hasDimensions) {
    warnings.push({
      level: 'warning',
      scope: 'row',
      target: 'dimensions',
      message: 'Missing recommended fields: dimensions (length, width, height)',
      rowIndex,
    });
  } else if (!hasAllDimensions) {
    warnings.push({
      level: 'warning',
      scope: 'row',
      target: 'dimensions',
      message: 'Incomplete dimensions: some values are missing',
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
    if (col.detected) {
      columnMap.set(col.originalName, col.mappedName);
      foundMappedColumns.add(col.mappedName);
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
  
  const unmappedColumns = columns.filter(c => !c.detected);
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
  
  const hasRequiredColumns = REQUIRED_FIELDS.every(field => 
    Array.from(columnMap.values()).includes(field)
  );
  
  const hasRowErrors = allErrors.some(e => e.scope === 'row');
  const hasColumnErrors = allErrors.some(e => e.scope === 'column');
  const hasFileErrors = allErrors.some(e => e.scope === 'file');
  
  const canCommit = hasRequiredColumns && !hasColumnErrors && !hasFileErrors;
  
  return {
    rows: parsedRows,
    columns,
    errors: allErrors,
    warnings: allWarnings,
    canCommit,
  };
}
