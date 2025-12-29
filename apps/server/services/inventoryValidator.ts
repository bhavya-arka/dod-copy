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
  ui: string | null;
  location: string | null;
  inventory_type: string | null;
  audit_no: string | null;
  receipt_price: string | null;
  receipt_date: string | null;
  barcode: string | null;
  mat_disposition: string | null;
  iuid: string | null;
  li: string | null;
  matl_ctrl: string | null;
  hmic: string | null;
  smcc: string | null;
  item_audit: string | null;
  ship_ind: string | null;
  ship_avail: string | null;
  exp_date: string | null;
  ext_date: string | null;
  insp_date: string | null;
  last_audit_date: string | null;
  user_id: string | null;
  remarks: string | null;
  in_service_date: string | null;
  warranty_item: string | null;
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
  requisition_no: ['requisition_no', 'requisition', 'requisition no', 'item_id', 'req_no', 'order_id', 'id', 'req', 'reqn', 'document_no', 'document_number'],
  description: ['description', 'desc', 'item_name', 'name', 'item_description', 'nomenclature', 'item_desc', 'item'],
  quantity: ['qty', 'quantity', 'count', 'units', 'on_hand', 'oh', 'on_hand_qty'],
  length_in: ['length_in', 'length', 'len', 'length_inches'],
  width_in: ['width_in', 'width', 'wid', 'width_inches'],
  height_in: ['height_in', 'height', 'hgt', 'height_inches'],
  weight_lb: ['weight_lb', 'weight', 'weight_lbs', 'wt', 'mass'],
  unit_price: ['unit_price', 'price', 'cost', 'value', 'unit_cost', 'extended_price', 'ext_price', 'unit_price__mac_', 'unit_price_mac', 'current_value'],
  nsn: ['nsn', 'national_stock_number', 'niin_nsn', 'nsn_niin', 'stock_number'],
  fsc: ['fsc', 'federal_supply_class', 'fsc_class'],
  niin: ['niin', 'national_item_identification_number', 'niin_no'],
  condition: ['condition', 'cond', 'condition_code', 'cond_code', 'status'],
  mission_id: ['mission', 'mission_id', 'mission_no', 'project', 'project_id'],
  serial_no: ['serial_no', 'serial', 'serial_number', 'sn', 's_n', 'ser_no'],
  lin_esd: ['lin_esd', 'lin', 'esd', 'line_item', 'line_no', 'li'],
  last_moved: ['last_moved', 'last_move', 'move_date', 'last_activity', 'activity_date'],
  storage_facility: ['storage_facility', 'facility', 'warehouse', 'site'],
  ship: ['ship', 'vessel', 'ship_name'],
  ship_class: ['ship_class', 'vessel_class'],
  program_code: ['program_code', 'program', 'prog_code'],
  authority: ['authority', 'auth', 'authorization'],
  work_item: ['work_item', 'work_order', 'wo'],
  cage: ['cage', 'cage_code', 'vendor_cage'],
  manufacturer: ['manufacturer', 'mfr', 'mfg', 'vendor', 'supplier'],
  mfg_date: ['mfg_date', 'manufacture_date', 'mfr_date', 'manufactured'],
  contract_no: ['contract_no', 'contract', 'contract_number'],
  asset_type: ['asset_type', 'type', 'item_type'],
  lot: ['lot', 'lot_no', 'lot_number', 'batch'],
  raw_content: ['raw_content', 'raw', '_raw_line', 'raw_line', 'raw_data'],
  
  ui: ['ui', 'unit_of_issue', 'uom', 'unit'],
  location: ['location', 'loc', 'bin', 'bin_location', 'storage_location'],
  inventory_type: ['inventory_type', 'inv_type'],
  audit_no: ['audit_no', 'audit_number'],
  receipt_price: ['receipt_price', 'received_price'],
  receipt_date: ['receipt_date', 'received_date', 'received', 'last_inv'],
  barcode: ['barcode', 'bar_code', 'upc'],
  mat_disposition: ['mat_disposition', 'material_disposition', 'disposition'],
  iuid: ['iuid', 'unique_id'],
  li: ['li'],
  matl_ctrl: ['matl_ctrl', 'material_control'],
  hmic: ['hmic', 'hmhc'],
  smcc: ['smcc', 'sacc'],
  item_audit: ['item_audit', 'item_acct'],
  ship_ind: ['ship_ind', 'ship_indicator'],
  ship_avail: ['ship_avail', 'ship_availability'],
  exp_date: ['exp_date', 'expiration_date', 'expiry'],
  ext_date: ['ext_date', 'extension_date'],
  insp_date: ['insp_date', 'inspection_date'],
  last_audit_date: ['last_audit_date'],
  user_id: ['user_id', 'user'],
  remarks: ['remarks', 'notes', 'comments'],
  in_service_date: ['in_service_date', 'service_date'],
  warranty_item: ['warranty_item', 'warranty'],
};

const REQUIRED_FIELDS: string[] = [];
const RECOMMENDED_FIELDS = ['description', 'quantity'];

const NSN_REGEX = /^\d{4}-\d{2}-\d{3}-\d{4}$/;

export function mapColumnName(originalHeader: string): string | null {
  const normalized = originalHeader.toLowerCase().trim().replace(/[\s\-_\.]+/g, '_').replace(/[()]/g, '');
  
  for (const [mappedName, variations] of Object.entries(COLUMN_MAPPINGS)) {
    for (const variation of variations) {
      const normalizedVariation = variation.toLowerCase().replace(/[\s\-_\.]+/g, '_').replace(/[()]/g, '');
      if (normalized === normalizedVariation) {
        return mappedName;
      }
    }
  }
  
  for (const [mappedName, variations] of Object.entries(COLUMN_MAPPINGS)) {
    for (const variation of variations) {
      const normalizedVariation = variation.toLowerCase().replace(/[\s\-_\.]+/g, '_').replace(/[()]/g, '');
      if (normalized.includes(normalizedVariation) || normalizedVariation.includes(normalized)) {
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
    if (row[field] !== undefined) {
      return row[field];
    }
    return undefined;
  };
  
  const getStringValue = (field: string): string | null => {
    const val = getValue(field);
    if (val === null || val === undefined || val === '' || val === 'N') return null;
    return String(val).trim();
  };
  
  const parsed: ParsedInventoryRow = {
    requisition_no: getStringValue('requisition_no'),
    description: getStringValue('description'),
    quantity: parseInteger(getValue('quantity')) || parseInteger(getValue('qty')),
    length_in: parseNumber(getValue('length_in')),
    width_in: parseNumber(getValue('width_in')),
    height_in: parseNumber(getValue('height_in')),
    weight_lb: parseNumber(getValue('weight_lb')),
    unit_price: parseNumber(getValue('unit_price')),
    nsn: getStringValue('nsn'),
    fsc: getStringValue('fsc'),
    niin: getStringValue('niin'),
    condition: getStringValue('condition') || getStringValue('condition_code'),
    mission_id: getStringValue('mission_id'),
    serial_no: getStringValue('serial_no'),
    lin_esd: getStringValue('lin_esd') || getStringValue('li'),
    last_moved: getStringValue('last_moved'),
    storage_facility: getStringValue('storage_facility'),
    ship: getStringValue('ship'),
    ship_class: getStringValue('ship_class'),
    program_code: getStringValue('program_code'),
    authority: getStringValue('authority'),
    work_item: getStringValue('work_item'),
    cage: getStringValue('cage'),
    manufacturer: getStringValue('manufacturer'),
    mfg_date: getStringValue('mfg_date'),
    contract_no: getStringValue('contract_no'),
    asset_type: getStringValue('asset_type'),
    lot: getStringValue('lot'),
    raw_content: getStringValue('raw_content') || row['raw_content'] || row['_raw_line'],
    
    ui: getStringValue('ui'),
    location: getStringValue('location'),
    inventory_type: getStringValue('inventory_type'),
    audit_no: getStringValue('audit_no'),
    receipt_price: getStringValue('receipt_price'),
    receipt_date: getStringValue('receipt_date'),
    barcode: getStringValue('barcode'),
    mat_disposition: getStringValue('mat_disposition'),
    iuid: getStringValue('iuid'),
    li: getStringValue('li'),
    matl_ctrl: getStringValue('matl_ctrl'),
    hmic: getStringValue('hmic'),
    smcc: getStringValue('smcc'),
    item_audit: getStringValue('item_audit'),
    ship_ind: getStringValue('ship_ind'),
    ship_avail: getStringValue('ship_avail'),
    exp_date: getStringValue('exp_date'),
    ext_date: getStringValue('ext_date'),
    insp_date: getStringValue('insp_date'),
    last_audit_date: getStringValue('last_audit_date'),
    user_id: getStringValue('user_id'),
    remarks: getStringValue('remarks'),
    in_service_date: getStringValue('in_service_date'),
    warranty_item: getStringValue('warranty_item'),
    
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
  if (unmappedColumns.length > 0 && unmappedColumns.length <= 5) {
    for (const col of unmappedColumns) {
      warnings.push({
        level: 'warning',
        scope: 'column',
        target: col.originalName,
        message: `Unrecognized column: "${col.originalName}" - will be stored in raw data`,
      });
    }
  } else if (unmappedColumns.length > 5) {
    warnings.push({
      level: 'warning',
      scope: 'column',
      target: 'columns',
      message: `${unmappedColumns.length} columns could not be mapped to known fields`,
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
  
  const hasFileErrors = allErrors.some(e => e.scope === 'file');
  
  const validRowCount = parsedRows.filter(r => 
    r.description || r.requisition_no || r.nsn || r.raw_content || r.cage || r.ship
  ).length;
  
  const canCommit = !hasFileErrors && validRowCount > 0;
  
  return {
    rows: parsedRows,
    columns,
    errors: allErrors,
    warnings: allWarnings,
    canCommit,
  };
}
