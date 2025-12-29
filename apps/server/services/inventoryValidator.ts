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
  storage_facility: string | null;
  ship: string | null;
  ship_class: string | null;
  program_code: string | null;
  authority: string | null;
  work_item: string | null;
  cage: string | null;
  manufacturer: string | null;
  mfg_date: string | null;
  contract_no: string | null;
  asset_type: string | null;
  lot: string | null;
  raw_content: string | null;
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
  requisition_no: ['o', 'requisition_no', 'requisition', 'requisition no', 'item_id', 'req_no', 'order_id', 'id', 'req', 'reqn', 'document_no', 'document_number'],
  description: ['description', 'desc', 'item_name', 'name', 'item_description', 'nomenclature', 'item_desc', 'item'],
  quantity: ['q', 'quantity', 'qty', 'count', 'units', 'on_hand', 'oh', 'on_hand_qty'],
  length_in: ['l', 'length_in', 'length', 'len', 'length_inches'],
  width_in: ['w', 'width_in', 'width', 'wid', 'width_inches'],
  height_in: ['h', 'height_in', 'height', 'hgt', 'height_inches'],
  weight_lb: ['p', 'weight_lb', 'weight', 'weight_lbs', 'wt', 'mass'],
  unit_price: ['unit_price', 'price', 'cost', 'value', 'unit_cost', 'extended_price', 'ext_price', 'unit_price_(ska)', 'unit price (ska)', 'russian_price', 'russian price', 'current_value', 'current value'],
  nsn: ['nsn', 'national_stock_number', 'niin_nsn', 'nsn_niin', 'stock_number'],
  fsc: ['fsc', 'federal_supply_class', 'fsc_class'],
  niin: ['niin', 'national_item_identification_number', 'niin_no'],
  condition: ['condition', 'cond', 'condition_code', 'cond_code', 'status'],
  mission_id: ['mission', 'mission_id', 'mission_no', 'project', 'project_id'],
  serial_no: ['serial_no', 'serial', 'serial_number', 'sn', 's_n', 'ser_no', 'last_inv', 'last inv'],
  lin_esd: ['lin_esd', 'lin', 'esd', 'line_item', 'line_no', 'li'],
  last_moved: ['last_moved', 'last_move', 'move_date', 'last_activity', 'activity_date', 'receipt_date', 'receipt date'],
  storage_facility: ['storage_facility', 'storage facility', 'facility', 'warehouse', 'site'],
  ship: ['ship', 'vessel', 'ship_name', 'ship name'],
  ship_class: ['ship_class', 'ship class', 'vessel_class', 'vessel class'],
  program_code: ['program_code', 'program code', 'program', 'prog_code', 'prog code'],
  authority: ['authority', 'auth', 'authorization'],
  work_item: ['work_item', 'work item', 'work_order', 'work order', 'wo'],
  cage: ['cage', 'cage_code', 'cage code', 'vendor_cage', 'vendor cage'],
  manufacturer: ['manufacturer', 'mfr', 'mfg', 'vendor', 'supplier'],
  mfg_date: ['mfg_date', 'mfg date', 'manufacture_date', 'manufacture date', 'mfr_date', 'manufactured'],
  contract_no: ['contract_no', 'contract no', 'contract', 'contract_number', 'contract number'],
  asset_type: ['asset_type', 'asset type', 'type', 'item_type', 'item type'],
  lot: ['lot', 'lot_no', 'lot no', 'lot_number', 'lot number', 'batch'],
  raw_content: ['raw_content', 'raw', '_raw_line', 'raw_line', 'raw_data'],
};

const REQUIRED_FIELDS: string[] = [];
const RECOMMENDED_FIELDS = ['requisition_no', 'description', 'quantity', 'weight_lb', 'length_in', 'width_in', 'height_in'];

const NSN_REGEX = /^\d{4}-\d{2}-\d{3}-\d{4}$/;

export function mapColumnName(originalHeader: string): string | null {
  const normalized = originalHeader.toLowerCase().trim().replace(/[\s\-_]+/g, '_').replace(/[()]/g, '');
  
  for (const [mappedName, variations] of Object.entries(COLUMN_MAPPINGS)) {
    for (const variation of variations) {
      const normalizedVariation = variation.toLowerCase().replace(/[\s\-_]+/g, '_').replace(/[()]/g, '');
      if (normalized === normalizedVariation) {
        return mappedName;
      }
    }
  }
  
  for (const [mappedName, variations] of Object.entries(COLUMN_MAPPINGS)) {
    for (const variation of variations) {
      if (normalized.includes(variation.toLowerCase().replace(/[\s\-_]+/g, '_'))) {
        return mappedName;
      }
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
  const storage_facility = getValue('storage_facility');
  const ship = getValue('ship');
  const ship_class = getValue('ship_class');
  const program_code = getValue('program_code');
  const authority = getValue('authority');
  const work_item = getValue('work_item');
  const cage = getValue('cage');
  const manufacturer = getValue('manufacturer');
  const mfg_date = getValue('mfg_date');
  const contract_no = getValue('contract_no');
  const asset_type = getValue('asset_type');
  const lot = getValue('lot');
  const raw_content = getValue('raw_content') || row['raw_content'] || row['_raw_line'];
  
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
    storage_facility: storage_facility ? String(storage_facility).trim() : null,
    ship: ship ? String(ship).trim() : null,
    ship_class: ship_class ? String(ship_class).trim() : null,
    program_code: program_code ? String(program_code).trim() : null,
    authority: authority ? String(authority).trim() : null,
    work_item: work_item ? String(work_item).trim() : null,
    cage: cage ? String(cage).trim() : null,
    manufacturer: manufacturer ? String(manufacturer).trim() : null,
    mfg_date: mfg_date ? String(mfg_date).trim() : null,
    contract_no: contract_no ? String(contract_no).trim() : null,
    asset_type: asset_type ? String(asset_type).trim() : null,
    lot: lot ? String(lot).trim() : null,
    raw_content: raw_content ? String(raw_content).trim() : null,
    _rawRow: row,
    _rowIndex: rowIndex,
  };
  
  if (parsed.quantity === null) {
    parsed.quantity = 1;
  }
  
  if (parsed.quantity < 0) {
    errors.push({
      level: 'error',
      scope: 'row',
      target: 'quantity',
      message: `Invalid quantity: ${parsed.quantity}. Must be non-negative.`,
      rowIndex,
    });
  }
  
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
  if (unmappedColumns.length > 0 && unmappedColumns.length <= 10) {
    for (const col of unmappedColumns) {
      warnings.push({
        level: 'warning',
        scope: 'column',
        target: col.originalName,
        message: `Unrecognized column: "${col.originalName}" - will be stored in raw data`,
      });
    }
  } else if (unmappedColumns.length > 10) {
    warnings.push({
      level: 'warning',
      scope: 'column',
      target: 'columns',
      message: `${unmappedColumns.length} columns could not be mapped to known fields - data will be stored in raw format`,
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
  
  const missingRequisitionCount = parsedRows.filter(r => !r.requisition_no).length;
  const missingDescriptionCount = parsedRows.filter(r => !r.description).length;
  const missingWeightCount = parsedRows.filter(r => r.weight_lb === null).length;
  const missingDimensionsCount = parsedRows.filter(r => 
    r.length_in === null || r.width_in === null || r.height_in === null
  ).length;
  
  const hasRawContent = parsedRows.filter(r => r.raw_content).length;
  
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
  
  if (hasRawContent > 0 && hasRawContent === parsedRows.length) {
    allWarnings.push({
      level: 'warning',
      scope: 'file',
      target: 'parsing',
      message: `All ${hasRawContent} rows contain raw unparsed content - manual column mapping may be needed`,
    });
  }
  
  const hasFileErrors = allErrors.some(e => e.scope === 'file');
  const hasDataErrors = allErrors.some(e => e.scope === 'row' && e.target !== 'empty_row');
  
  const validRowCount = parsedRows.filter(r => r.description || r.requisition_no || r.nsn || r.raw_content).length;
  const canCommit = !hasFileErrors && validRowCount > 0;
  
  return {
    rows: parsedRows,
    columns,
    errors: allErrors,
    warnings: allWarnings,
    canCommit,
  };
}
