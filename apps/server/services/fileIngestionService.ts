import Papa from 'papaparse';
import { PDFParse } from 'pdf-parse';
import * as XLSX from 'xlsx';
import { 
  validateInventoryData, 
  ValidationResult, 
  ValidationMessage,
  ParsedInventoryRow,
  ColumnSpec 
} from './inventoryValidator';

export interface UploadSession {
  uploadId: string;
  siteId: number;
  userId: number;
  filename: string;
  fileType: 'csv' | 'pdf' | 'xlsx';
  parsedRows: ParsedInventoryRow[];
  columns: ColumnSpec[];
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
  canCommit: boolean;
  createdAt: Date;
  expiresAt: Date;
}

export interface ParseResult {
  uploadId: string;
  preview: ParsedInventoryRow[];
  columns: ColumnSpec[];
  warnings: ValidationMessage[];
  errors: ValidationMessage[];
  canCommit: boolean;
  totalRows: number;
  filename: string;
}

const uploadSessions = new Map<string, UploadSession>();

const SESSION_TTL_MS = 15 * 60 * 1000;

function generateUploadId(): string {
  return `upload_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [id, session] of uploadSessions.entries()) {
    if (session.expiresAt.getTime() < now) {
      uploadSessions.delete(id);
      console.log(`[FileIngestion] Cleaned up expired session: ${id}`);
    }
  }
}

setInterval(cleanupExpiredSessions, 60 * 1000);

export function getUploadSession(uploadId: string): UploadSession | null {
  const session = uploadSessions.get(uploadId);
  if (!session) return null;
  
  if (session.expiresAt.getTime() < Date.now()) {
    uploadSessions.delete(uploadId);
    return null;
  }
  
  return session;
}

export function deleteUploadSession(uploadId: string): boolean {
  return uploadSessions.delete(uploadId);
}

export async function parseCSV(
  content: string,
  filename: string,
  siteId: number,
  userId: number
): Promise<ParseResult> {
  const uploadId = generateUploadId();
  const errors: ValidationMessage[] = [];
  const warnings: ValidationMessage[] = [];
  
  try {
    const parseResult = Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      transformHeader: (header: string) => header.trim(),
    });
    
    if (parseResult.errors && parseResult.errors.length > 0) {
      for (const error of parseResult.errors) {
        if (error.type === 'FieldMismatch') {
          warnings.push({
            level: 'warning',
            scope: 'row',
            target: 'parsing',
            message: `Row ${error.row}: ${error.message}`,
            rowIndex: error.row,
          });
        } else {
          errors.push({
            level: 'error',
            scope: 'file',
            target: 'parsing',
            message: `Parse error: ${error.message}`,
          });
        }
      }
    }
    
    const headers = parseResult.meta.fields || [];
    const rawRows = parseResult.data as Record<string, any>[];
    
    if (headers.length === 0) {
      errors.push({
        level: 'error',
        scope: 'file',
        target: 'headers',
        message: 'No headers detected in CSV file',
      });
      
      return {
        uploadId,
        preview: [],
        columns: [],
        errors,
        warnings,
        canCommit: false,
        totalRows: 0,
        filename,
      };
    }
    
    const validationResult = validateInventoryData(rawRows, headers);
    
    errors.push(...validationResult.errors);
    warnings.push(...validationResult.warnings);
    
    const session: UploadSession = {
      uploadId,
      siteId,
      userId,
      filename,
      fileType: 'csv',
      parsedRows: validationResult.rows,
      columns: validationResult.columns,
      errors,
      warnings,
      canCommit: validationResult.canCommit && errors.filter(e => e.scope !== 'row').length === 0,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    };
    
    uploadSessions.set(uploadId, session);
    console.log(`[FileIngestion] Created CSV session: ${uploadId}, rows: ${validationResult.rows.length}`);
    
    return {
      uploadId,
      preview: validationResult.rows.slice(0, 100),
      columns: validationResult.columns,
      errors,
      warnings,
      canCommit: session.canCommit,
      totalRows: validationResult.rows.length,
      filename,
    };
  } catch (error) {
    console.error('[FileIngestion] CSV parse error:', error);
    errors.push({
      level: 'error',
      scope: 'file',
      target: 'parsing',
      message: `Failed to parse CSV: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
    
    return {
      uploadId,
      preview: [],
      columns: [],
      errors,
      warnings,
      canCommit: false,
      totalRows: 0,
      filename,
    };
  }
}

const BATS_HEADER_ALIASES: Record<string, string[]> = {
  'storage_facility': ['storage facility', 'storage_facility', 'facility', 'site'],
  'ship': ['ship', 'vessel', 'ship_name'],
  'ship_class': ['ship class', 'ship_class', 'vessel_class'],
  'program_code': ['program code', 'program_code', 'program', 'prog_code'],
  'requisition_no': ['requisition no', 'requisition no.', 'requisition_no', 'requisition', 'req_no', 'reqn'],
  'authority': ['authority', 'auth'],
  'work_item': ['work item', 'work_item', 'work_order', 'wo'],
  'li': ['li', 'line_item', 'line item'],
  'matl_ctrl': ['matl ctrl', 'matl_ctrl', 'matl ctr', 'material_control'],
  'hmic': ['hmic', 'hmhc'],
  'smcc': ['smcc', 'sacc'],
  'item_audit': ['item audit?', 'item_audit', 'item acct', 'item_acct', 'audit'],
  'audit_no': ['audit no', 'audit_no', 'audit_number'],
  'ship_ind': ['ship ind', 'ship_ind', 'ship_indicator'],
  'ship_avail': ['ship avail', 'ship_avail', 'ship avail.', 'ship_availability'],
  'qty': ['qty', 'quantity', 'count', 'on_hand'],
  'description': ['description', 'desc', 'nomenclature', 'item_description', 'item_name'],
  'cage': ['cage', 'cage_code', 'vendor_cage'],
  'manufacturer': ['manufacturer', 'mfr', 'mfg', 'vendor'],
  'mfg_date': ['mfg. date', 'mfg_date', 'mfg date', 'manufacture_date'],
  'contract_no': ['contract no', 'contract_no', 'contract no.', 'contract'],
  'iuid': ['iuid', 'unique_id'],
  'ui': ['ui', 'unit_of_issue', 'unit of issue', 'uom'],
  'unit_price': ['unit price', 'unit_price', 'unit price (mac)', 'unit_price_(mac)', 'price', 'cost'],
  'receipt_price': ['receipt price', 'receipt_price'],
  'receipt_date': ['receipt date', 'receipt_date', 'received_date', 'received'],
  'location': ['location', 'loc', 'bin', 'bin_location', 'storage_location'],
  'lot': ['lot', 'lot no', 'lot_no', 'lot_number', 'batch'],
  'serial_no': ['serial no', 'serial_no', 'serial', 'serial_number', 'sn'],
  'barcode': ['barcode', 'bar_code', 'upc'],
  'inventory_type': ['inventory type', 'inventory_type', 'inv_type', 'type'],
  'mat_disposition': ['mat. disposition', 'mat_disposition', 'material_disposition', 'disposition'],
  'condition_code': ['condition code', 'condition_code', 'condition', 'cond_code', 'cond'],
  'asset_type': ['asset type', 'asset_type', 'type'],
  'exp_date': ['exp. date', 'exp_date', 'expiration_date', 'expiry'],
  'ext_date': ['ext. date', 'ext_date', 'extension_date'],
  'insp_date': ['insp. date', 'insp_date', 'inspection_date'],
  'last_audit_date': ['last audit date', 'last_audit_date'],
  'user_id': ['user id', 'user_id', 'user'],
  'remarks': ['remarks', 'notes', 'comments'],
  'in_service_date': ['in service date', 'in_service_date', 'service_date'],
  'warranty_item': ['warranty item', 'warranty_item', 'warranty'],
  'nsn': ['nsn', 'national_stock_number', 'stock_number'],
  'niin': ['niin', 'national_item_identification_number'],
  'fsc': ['fsc', 'federal_supply_class'],
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/[\s\.\-]+/g, '_').replace(/[()]/g, '').replace(/__+/g, '_');
}

function mapBATSHeader(rawHeader: string): string {
  const normalized = normalizeHeader(rawHeader);
  const lowerHeader = rawHeader.toLowerCase().trim();
  
  for (const [mappedName, aliases] of Object.entries(BATS_HEADER_ALIASES)) {
    for (const alias of aliases) {
      if (lowerHeader === alias || normalized === normalizeHeader(alias)) {
        return mappedName;
      }
    }
  }
  
  for (const [mappedName, aliases] of Object.entries(BATS_HEADER_ALIASES)) {
    for (const alias of aliases) {
      if (lowerHeader.includes(alias) || normalized.includes(normalizeHeader(alias))) {
        return mappedName;
      }
    }
  }
  
  return normalized;
}

function parseTabDelimitedData(text: string): { headers: string[]; rows: Record<string, any>[] } {
  console.log('[PDF Parse] Parsing tab-delimited BATS data...');
  
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  
  if (lines.length < 2) {
    console.log('[PDF Parse] Insufficient lines for tab-delimited parsing');
    return { headers: [], rows: [] };
  }
  
  const headerLine = lines[0];
  const rawHeaders = headerLine.split('\t').map(h => h.trim());
  
  console.log(`[PDF Parse] Found ${rawHeaders.length} raw headers`);
  console.log(`[PDF Parse] First 10 headers: ${rawHeaders.slice(0, 10).join(', ')}`);
  
  const headers = rawHeaders.map(h => mapBATSHeader(h));
  
  console.log(`[PDF Parse] Mapped headers: ${headers.slice(0, 10).join(', ')}`);
  
  const rows: Record<string, any>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.toLowerCase().includes('storage facility') && line.toLowerCase().includes('ship')) {
      continue;
    }
    
    const values = line.split('\t').map(v => v.trim());
    
    if (values.length === 0 || (values.length === 1 && values[0] === '')) {
      continue;
    }
    
    const row: Record<string, any> = {};
    
    for (let j = 0; j < headers.length && j < values.length; j++) {
      const header = headers[j];
      const value = values[j];
      
      if (value && value !== '' && value !== 'N' && value !== 'null') {
        row[header] = value;
      } else if (value === 'N') {
        row[header] = 'N';
      } else {
        row[header] = null;
      }
    }
    
    row['_raw_line'] = line;
    row['raw_content'] = line;
    
    if (Object.keys(row).length > 2) {
      rows.push(row);
    }
  }
  
  console.log(`[PDF Parse] Parsed ${rows.length} data rows from tab-delimited content`);
  
  if (rows.length > 0) {
    console.log(`[PDF Parse] Sample row keys: ${Object.keys(rows[0]).slice(0, 15).join(', ')}`);
  }
  
  return { headers, rows };
}

function detectTableFromPDF(text: string): { headers: string[]; rows: Record<string, any>[] } {
  console.log('[PDF Parse] Starting table detection...');
  console.log(`[PDF Parse] Raw text length: ${text.length} characters`);
  
  if (text.includes('\t')) {
    console.log('[PDF Parse] Detected tab characters - using tab-delimited parser');
    const result = parseTabDelimitedData(text);
    if (result.headers.length > 0 && result.rows.length > 0) {
      return result;
    }
  }
  
  console.log('[PDF Parse] Falling back to delimiter-based parsing...');
  
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  if (lines.length < 2) {
    console.log('[PDF Parse] Insufficient lines for table detection');
    return { headers: [], rows: [] };
  }
  
  const potentialDelimiters = ['|', '  ', ','];
  let bestDelimiter: string | RegExp = ',';
  let maxColumns = 0;
  
  for (const delimiter of potentialDelimiters) {
    const firstLineCols = lines[0].split(delimiter).length;
    if (firstLineCols > maxColumns) {
      maxColumns = firstLineCols;
      bestDelimiter = delimiter;
    }
  }
  
  if (maxColumns < 2) {
    const possibleSpacedData = lines[0].match(/\S+/g);
    if (possibleSpacedData && possibleSpacedData.length >= 2) {
      bestDelimiter = /\s{2,}/;
    }
  }
  
  console.log(`[PDF Parse] Best delimiter detected, max columns: ${maxColumns}`);
  
  const splitLine = (line: string): string[] => {
    return line.split(bestDelimiter as any).map((v: string) => v.trim());
  };
  
  const headerLine = lines[0];
  let headers = splitLine(headerLine).map(h => mapBATSHeader(h));
  
  if (headers.length <= 1 && text.length > 0) {
    console.log('[PDF Parse] Could not parse proper columns, storing as raw content');
    headers = ['raw_content'];
    const rows: Record<string, any>[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.length > 0) {
        rows.push({ 
          raw_content: line,
          _raw_line: line
        });
      }
    }
    
    return { headers, rows };
  }
  
  const rows: Record<string, any>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitLine(lines[i]);
    if (values.length === 0 || (values.length === 1 && values[0] === '')) continue;
    
    const row: Record<string, any> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || '';
    }
    row['_raw_line'] = lines[i];
    rows.push(row);
  }
  
  console.log(`[PDF Parse] Delimiter parsing complete: ${headers.length} headers, ${rows.length} rows`);
  
  return { headers, rows };
}

export async function parsePDF(
  buffer: Buffer,
  filename: string,
  siteId: number,
  userId: number
): Promise<ParseResult> {
  const uploadId = generateUploadId();
  const errors: ValidationMessage[] = [];
  const warnings: ValidationMessage[] = [];
  
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const text = result.text;
    
    console.log(`[FileIngestion] PDF parsing started for: ${filename}`);
    console.log(`[FileIngestion] Extracted text length: ${text?.length || 0} characters`);
    
    if (!text || text.trim().length === 0) {
      errors.push({
        level: 'error',
        scope: 'file',
        target: 'content',
        message: 'PDF contains no extractable text. It may be an image-based PDF.',
      });
      
      return {
        uploadId,
        preview: [],
        columns: [],
        errors,
        warnings,
        canCommit: false,
        totalRows: 0,
        filename,
      };
    }
    
    warnings.push({
      level: 'warning',
      scope: 'file',
      target: 'format',
      message: 'PDF table extraction has limited accuracy. For best results, please export your data as CSV from the source system.',
    });
    
    const { headers, rows } = detectTableFromPDF(text);
    
    console.log(`[FileIngestion] Detected ${headers.length} headers: ${headers.slice(0, 10).join(', ')}${headers.length > 10 ? '...' : ''}`);
    console.log(`[FileIngestion] Detected ${rows.length} data rows`);
    
    if (headers.length === 0 || rows.length === 0) {
      errors.push({
        level: 'error',
        scope: 'file',
        target: 'structure',
        message: 'Could not detect table structure in PDF.',
      });
      
      return {
        uploadId,
        preview: [],
        columns: [],
        errors,
        warnings,
        canCommit: false,
        totalRows: 0,
        filename,
      };
    }
    
    const validationResult = validateInventoryData(rows, headers);
    
    errors.push(...validationResult.errors);
    warnings.push(...validationResult.warnings);
    
    const session: UploadSession = {
      uploadId,
      siteId,
      userId,
      filename,
      fileType: 'pdf',
      parsedRows: validationResult.rows,
      columns: validationResult.columns,
      errors,
      warnings,
      canCommit: validationResult.canCommit,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    };
    
    uploadSessions.set(uploadId, session);
    console.log(`[FileIngestion] Created PDF session: ${uploadId}, rows: ${validationResult.rows.length}, canCommit: ${validationResult.canCommit}`);
    
    return {
      uploadId,
      preview: validationResult.rows.slice(0, 100),
      columns: validationResult.columns,
      errors,
      warnings,
      canCommit: validationResult.canCommit,
      totalRows: validationResult.rows.length,
      filename,
    };
  } catch (error) {
    console.error('[FileIngestion] PDF parse error:', error);
    errors.push({
      level: 'error',
      scope: 'file',
      target: 'parsing',
      message: `Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
    
    return {
      uploadId,
      preview: [],
      columns: [],
      errors,
      warnings,
      canCommit: false,
      totalRows: 0,
      filename,
    };
  }
}

export async function parseXLSX(
  buffer: Buffer,
  filename: string,
  siteId: number,
  userId: number
): Promise<ParseResult> {
  const uploadId = generateUploadId();
  const errors: ValidationMessage[] = [];
  const warnings: ValidationMessage[] = [];
  
  try {
    console.log(`[FileIngestion] XLSX parsing started for: ${filename}`);
    
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      errors.push({
        level: 'error',
        scope: 'file',
        target: 'content',
        message: 'XLSX file contains no worksheets.',
      });
      
      return {
        uploadId,
        preview: [],
        columns: [],
        errors,
        warnings,
        canCommit: false,
        totalRows: 0,
        filename,
      };
    }
    
    const worksheet = workbook.Sheets[sheetName];
    
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1,
      defval: '',
      blankrows: false,
    }) as any[][];
    
    if (jsonData.length < 2) {
      errors.push({
        level: 'error',
        scope: 'file',
        target: 'data',
        message: 'XLSX file contains no data rows.',
      });
      
      return {
        uploadId,
        preview: [],
        columns: [],
        errors,
        warnings,
        canCommit: false,
        totalRows: 0,
        filename,
      };
    }
    
    const rawHeaders = jsonData[0].map(h => String(h || '').trim());
    const headers = rawHeaders.map(h => mapBATSHeader(h));
    
    console.log(`[FileIngestion] XLSX headers: ${headers.slice(0, 10).join(', ')}...`);
    
    const rows: Record<string, any>[] = [];
    
    for (let i = 1; i < jsonData.length; i++) {
      const rowData = jsonData[i];
      const row: Record<string, any> = {};
      
      for (let j = 0; j < headers.length; j++) {
        const header = headers[j];
        const value = rowData[j];
        
        if (value !== undefined && value !== null && value !== '') {
          row[header] = String(value).trim();
        } else {
          row[header] = null;
        }
      }
      
      row['_raw_line'] = rowData.join('\t');
      row['raw_content'] = rowData.join('\t');
      
      if (Object.keys(row).length > 2) {
        rows.push(row);
      }
    }
    
    console.log(`[FileIngestion] XLSX parsed ${rows.length} data rows`);
    
    if (rows.length === 0) {
      errors.push({
        level: 'error',
        scope: 'file',
        target: 'data',
        message: 'No valid data rows found in XLSX file.',
      });
      
      return {
        uploadId,
        preview: [],
        columns: [],
        errors,
        warnings,
        canCommit: false,
        totalRows: 0,
        filename,
      };
    }
    
    const validationResult = validateInventoryData(rows, headers);
    
    errors.push(...validationResult.errors);
    warnings.push(...validationResult.warnings);
    
    const session: UploadSession = {
      uploadId,
      siteId,
      userId,
      filename,
      fileType: 'xlsx',
      parsedRows: validationResult.rows,
      columns: validationResult.columns,
      errors,
      warnings,
      canCommit: validationResult.canCommit,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    };
    
    uploadSessions.set(uploadId, session);
    console.log(`[FileIngestion] Created XLSX session: ${uploadId}, rows: ${validationResult.rows.length}, canCommit: ${validationResult.canCommit}`);
    
    return {
      uploadId,
      preview: validationResult.rows.slice(0, 100),
      columns: validationResult.columns,
      errors,
      warnings,
      canCommit: validationResult.canCommit,
      totalRows: validationResult.rows.length,
      filename,
    };
  } catch (error) {
    console.error('[FileIngestion] XLSX parse error:', error);
    errors.push({
      level: 'error',
      scope: 'file',
      target: 'parsing',
      message: `Failed to parse XLSX: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
    
    return {
      uploadId,
      preview: [],
      columns: [],
      errors,
      warnings,
      canCommit: false,
      totalRows: 0,
      filename,
    };
  }
}

export async function parseFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  siteId: number,
  userId: number
): Promise<ParseResult> {
  const errors: ValidationMessage[] = [];
  
  const lowerFilename = filename.toLowerCase();
  const isPDF = mimeType === 'application/pdf' || lowerFilename.endsWith('.pdf');
  const isXLSX = mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
                 lowerFilename.endsWith('.xlsx');
  const isXLS = mimeType === 'application/vnd.ms-excel' || lowerFilename.endsWith('.xls');
  const isCSV = mimeType === 'text/csv' || 
                mimeType === 'application/csv' || 
                lowerFilename.endsWith('.csv');
  
  if (isPDF) {
    return parsePDF(buffer, filename, siteId, userId);
  } else if (isXLSX || isXLS) {
    return parseXLSX(buffer, filename, siteId, userId);
  } else if (isCSV || mimeType === 'text/plain' || mimeType === 'application/octet-stream') {
    const content = buffer.toString('utf-8');
    return parseCSV(content, filename, siteId, userId);
  } else {
    errors.push({
      level: 'error',
      scope: 'file',
      target: 'format',
      message: `Unsupported file format: ${mimeType}. Please upload a CSV, PDF, XLSX, or XLS file.`,
    });
    
    return {
      uploadId: generateUploadId(),
      preview: [],
      columns: [],
      errors,
      warnings: [],
      canCommit: false,
      totalRows: 0,
      filename,
    };
  }
}

export function getSessionStats(): {
  activeSessions: number;
  totalRows: number;
  oldestSession: Date | null;
} {
  const now = Date.now();
  let totalRows = 0;
  let oldestSession: Date | null = null;
  let activeSessions = 0;
  
  for (const session of uploadSessions.values()) {
    if (session.expiresAt.getTime() >= now) {
      activeSessions++;
      totalRows += session.parsedRows.length;
      if (!oldestSession || session.createdAt < oldestSession) {
        oldestSession = session.createdAt;
      }
    }
  }
  
  return {
    activeSessions,
    totalRows,
    oldestSession,
  };
}
