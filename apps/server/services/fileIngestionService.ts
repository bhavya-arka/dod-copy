import Papa from 'papaparse';
import { PDFParse } from 'pdf-parse';
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
  fileType: 'csv' | 'pdf';
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

const BATS_HEADER_ROW1_PATTERNS = [
  'storage facility', 'ship', 'ship class', 'program code', 'requisition no', 
  'authority', 'work item', 'mati ctr', 'hmhc', 'sacc', 'item acct', 
  'audit no', 'ship ind', 'ship avail', 'qty', 'description'
];

const BATS_HEADER_ROW2_PATTERNS = [
  'cage', 'manufacturer', 'mfg date', 'contract no', 'ubi', 'ui', 
  'unit price', 'russian price', 'receipt date', 'location', 'last inv', 
  'serial no', 'inventory type', 'mgmt', 'shipment', 'condition code', 
  'asset type', 'current value', 'lot', 'tax service'
];

const ALL_KNOWN_HEADERS = [
  'storage_facility', 'storage facility', 'ship', 'ship_class', 'ship class',
  'program_code', 'program code', 'requisition_no', 'requisition no', 'requisition',
  'authority', 'work_item', 'work item', 'li', 'mati_ctr', 'mati ctr',
  'hmhc', 'sacc', 'item_acct', 'item acct', 'audit_no', 'audit no',
  'ship_ind', 'ship ind', 'ship_avail', 'ship avail', 'qty', 'quantity',
  'description', 'nomenclature', 'cage', 'manufacturer', 'mfg_date', 'mfg date',
  'contract_no', 'contract no', 'ubi', 'ui', 'unit_price', 'unit price',
  'unit_price_(ska)', 'unit price (ska)', 'russian_price', 'russian price',
  'receipt_date', 'receipt date', 'location', 'last_inv', 'last inv',
  'serial_no', 'serial no', 'serial', 'inventory_type', 'inventory type',
  'mgmt', 'shipment', 'condition_code', 'condition code', 'condition',
  'asset_type', 'asset type', 'current_value', 'current value', 'lot',
  'tax_service', 'tax service', 'tax_service_note', 'tax service note',
  'nsn', 'niin', 'fsc', 'weight', 'weight_lb', 'length', 'width', 'height'
];

function isHeaderLine(line: string): boolean {
  const lowerLine = line.toLowerCase();
  let matchCount = 0;
  
  for (const pattern of BATS_HEADER_ROW1_PATTERNS) {
    if (lowerLine.includes(pattern)) matchCount++;
  }
  for (const pattern of BATS_HEADER_ROW2_PATTERNS) {
    if (lowerLine.includes(pattern)) matchCount++;
  }
  
  return matchCount >= 3;
}

function extractHeadersFromMultipleRows(lines: string[]): { headers: string[]; dataStartIndex: number } {
  console.log('[PDF Parse] Analyzing lines for multi-row headers...');
  
  const headerRows: string[] = [];
  let dataStartIndex = 0;
  
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    if (isHeaderLine(lines[i])) {
      headerRows.push(lines[i]);
      dataStartIndex = i + 1;
    } else if (headerRows.length > 0) {
      break;
    }
  }
  
  if (headerRows.length === 0) {
    return { headers: [], dataStartIndex: 0 };
  }
  
  console.log(`[PDF Parse] Found ${headerRows.length} header row(s)`);
  
  const combinedHeaders = headerRows.join(' ');
  const headers = extractHeaderTokens(combinedHeaders);
  
  console.log(`[PDF Parse] Extracted headers: ${headers.join(', ')}`);
  
  return { headers, dataStartIndex };
}

function extractHeaderTokens(headerText: string): string[] {
  const headers: string[] = [];
  const lowerText = headerText.toLowerCase();
  
  const foundPositions: { header: string; pos: number }[] = [];
  
  for (const knownHeader of ALL_KNOWN_HEADERS) {
    const pos = lowerText.indexOf(knownHeader.toLowerCase());
    if (pos !== -1) {
      const alreadyFound = foundPositions.some(f => 
        Math.abs(f.pos - pos) < 3 && f.header.length >= knownHeader.length
      );
      if (!alreadyFound) {
        foundPositions.push({ header: knownHeader, pos });
      }
    }
  }
  
  foundPositions.sort((a, b) => a.pos - b.pos);
  
  const uniqueHeaders = new Set<string>();
  for (const { header } of foundPositions) {
    const normalized = header.toLowerCase().replace(/[\s\-]+/g, '_').replace(/[()]/g, '');
    if (!uniqueHeaders.has(normalized)) {
      uniqueHeaders.add(normalized);
      headers.push(header);
    }
  }
  
  return headers;
}

function tryParseWithKnownPatterns(text: string): { headers: string[]; rows: Record<string, any>[] } {
  console.log('[PDF Parse] Attempting pattern-based parsing for BATS-style PDF...');
  
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  console.log(`[PDF Parse] Total lines in PDF: ${lines.length}`);
  console.log('[PDF Parse] First 5 lines:');
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    console.log(`  Line ${i}: "${lines[i].substring(0, 100)}${lines[i].length > 100 ? '...' : ''}"`);
  }
  
  const { headers, dataStartIndex } = extractHeadersFromMultipleRows(lines);
  
  if (headers.length === 0) {
    console.log('[PDF Parse] No BATS headers detected, returning empty');
    return { headers: [], rows: [] };
  }
  
  const rows: Record<string, any>[] = [];
  let currentRow: Record<string, any> = {};
  let rawContent = '';
  
  for (let i = dataStartIndex; i < lines.length; i++) {
    const line = lines[i];
    
    if (isHeaderLine(line)) {
      continue;
    }
    
    const looksLikeNewRecord = /^[A-Z0-9]{2,}[\s\-]/.test(line) || 
                               /^\d{4}[\-\/]/.test(line) ||
                               /^[A-Z]{2,}\s+\d/.test(line);
    
    if (looksLikeNewRecord && rawContent.length > 0) {
      currentRow['raw_content'] = rawContent.trim();
      currentRow['_raw_line'] = rawContent.trim();
      
      const extractedValues = extractValuesFromRaw(rawContent, headers);
      for (const [key, value] of Object.entries(extractedValues)) {
        currentRow[key] = value;
      }
      
      if (Object.keys(currentRow).length > 1) {
        rows.push(currentRow);
      }
      currentRow = {};
      rawContent = line + ' ';
    } else {
      rawContent += line + ' ';
    }
  }
  
  if (rawContent.trim().length > 0) {
    currentRow['raw_content'] = rawContent.trim();
    currentRow['_raw_line'] = rawContent.trim();
    
    const extractedValues = extractValuesFromRaw(rawContent, headers);
    for (const [key, value] of Object.entries(extractedValues)) {
      currentRow[key] = value;
    }
    
    if (Object.keys(currentRow).length > 1) {
      rows.push(currentRow);
    }
  }
  
  console.log(`[PDF Parse] Extracted ${rows.length} data rows using pattern matching`);
  
  if (rows.length > 0) {
    console.log(`[PDF Parse] Sample first row keys: ${Object.keys(rows[0]).join(', ')}`);
  }
  
  return { headers, rows };
}

function extractValuesFromRaw(rawText: string, headers: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  
  const qtyMatch = rawText.match(/\bQty[:\s]*(\d+)/i) || rawText.match(/\b(\d+)\s*(EA|PC|SET|LOT|BX)\b/i);
  if (qtyMatch) {
    result['qty'] = qtyMatch[1];
  }
  
  const priceMatch = rawText.match(/\$[\d,]+\.?\d*/);
  if (priceMatch) {
    result['unit_price'] = priceMatch[0].replace('$', '').replace(',', '');
  }
  
  const conditionMatch = rawText.match(/\b(Condition|Cond)[:\s]*([A-Z])\b/i) || 
                         rawText.match(/\b([ABCDEF])\s*(?:condition|cond)?\b/i);
  if (conditionMatch) {
    result['condition_code'] = conditionMatch[2] || conditionMatch[1];
  }
  
  const serialMatch = rawText.match(/Serial[:\s#]*([A-Z0-9\-]+)/i);
  if (serialMatch) {
    result['serial_no'] = serialMatch[1];
  }
  
  const dateMatch = rawText.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/);
  if (dateMatch) {
    result['receipt_date'] = dateMatch[1];
  }
  
  const cageMatch = rawText.match(/\b([0-9A-Z]{5})\b/);
  if (cageMatch && !rawText.toLowerCase().includes('niin')) {
    result['cage'] = cageMatch[1];
  }
  
  const locationMatch = rawText.match(/(?:Loc|Location)[:\s]*([A-Z0-9\-]+)/i);
  if (locationMatch) {
    result['location'] = locationMatch[1];
  }
  
  return result;
}

function detectTableFromPDF(text: string): { headers: string[]; rows: Record<string, any>[] } {
  console.log('[PDF Parse] Starting table detection...');
  console.log(`[PDF Parse] Raw text length: ${text.length} characters`);
  console.log('[PDF Parse] Raw text preview (first 500 chars):');
  console.log(text.substring(0, 500));
  
  const patternResult = tryParseWithKnownPatterns(text);
  if (patternResult.headers.length > 0 && patternResult.rows.length > 0) {
    console.log('[PDF Parse] Pattern-based parsing succeeded');
    return patternResult;
  }
  
  console.log('[PDF Parse] Falling back to delimiter-based parsing...');
  
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  if (lines.length < 2) {
    console.log('[PDF Parse] Insufficient lines for table detection');
    
    if (lines.length === 1) {
      return {
        headers: ['raw_content'],
        rows: [{ raw_content: lines[0], _raw_line: lines[0] }]
      };
    }
    return { headers: [], rows: [] };
  }
  
  const potentialDelimiters = ['\t', '|', '  ', ','];
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
  let headers = splitLine(headerLine);
  
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
    
    if (text && text.trim().length > 0) {
      console.log('[FileIngestion] ========== RAW PDF EXTRACTED TEXT ==========');
      console.log(text);
      console.log('[FileIngestion] ========== END RAW PDF TEXT ==========');
    }
    
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
    
    warnings.push({
      level: 'warning',
      scope: 'file',
      target: 'format',
      message: 'PDF parsing uses heuristic table detection. Column boundaries may not be preserved accurately.',
    });
    
    const { headers, rows } = detectTableFromPDF(text);
    
    console.log(`[FileIngestion] Detected ${headers.length} headers: ${headers.slice(0, 10).join(', ')}${headers.length > 10 ? '...' : ''}`);
    console.log(`[FileIngestion] Detected ${rows.length} data rows`);
    
    if (headers.length === 0) {
      if (text.trim().length > 0) {
        warnings.push({
          level: 'warning',
          scope: 'file',
          target: 'structure',
          message: 'Could not detect table structure. Raw extracted text is stored for manual review.',
        });
        
        const fallbackRows: Record<string, any>[] = [{
          raw_content: text.trim(),
          _raw_line: 'Full PDF text content',
        }];
        
        const fallbackHeaders = ['raw_content'];
        const validationResult = validateInventoryData(fallbackRows, fallbackHeaders);
        
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
          canCommit: false,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        };
        
        uploadSessions.set(uploadId, session);
        console.log(`[FileIngestion] PDF fallback session created: ${uploadId}, storing raw text (${text.length} chars)`);
        
        return {
          uploadId,
          preview: validationResult.rows.slice(0, 100),
          columns: validationResult.columns,
          errors,
          warnings,
          canCommit: false,
          totalRows: validationResult.rows.length,
          filename,
        };
      }
      
      errors.push({
        level: 'error',
        scope: 'file',
        target: 'structure',
        message: 'Could not detect table structure in PDF. No tabular data with recognizable headers was found. Please export your data as CSV from the source system.',
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
    
    if (rows.length === 0) {
      errors.push({
        level: 'error',
        scope: 'file',
        target: 'data',
        message: 'PDF contains headers but no data rows were detected. Please verify the PDF contains tabular inventory data.',
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
    
    for (const row of rows) {
      if (!row['raw_content']) {
        row['raw_content'] = row['_raw_line'] || '';
      }
    }
    
    const validationResult = validateInventoryData(rows, headers);
    
    errors.push(...validationResult.errors);
    warnings.push(...validationResult.warnings);
    
    warnings.push({
      level: 'warning',
      scope: 'file',
      target: 'commit',
      message: 'PDF data cannot be committed directly due to parsing limitations. Please verify the extracted data and consider re-exporting as CSV.',
    });
    
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
      canCommit: false,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    };
    
    uploadSessions.set(uploadId, session);
    console.log(`[FileIngestion] Created PDF session: ${uploadId}, rows: ${validationResult.rows.length} (canCommit: false - PDF data requires manual verification)`);
    
    return {
      uploadId,
      preview: validationResult.rows.slice(0, 100),
      columns: validationResult.columns,
      errors,
      warnings,
      canCommit: false,
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

export async function parseFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  siteId: number,
  userId: number
): Promise<ParseResult> {
  const errors: ValidationMessage[] = [];
  const lowerFilename = filename.toLowerCase();
  
  if (lowerFilename.endsWith('.csv') || mimeType === 'text/csv') {
    const content = buffer.toString('utf-8');
    return parseCSV(content, filename, siteId, userId);
  }
  
  if (lowerFilename.endsWith('.pdf') || mimeType === 'application/pdf') {
    return parsePDF(buffer, filename, siteId, userId);
  }
  
  errors.push({
    level: 'error',
    scope: 'file',
    target: 'type',
    message: `Unsupported file type: ${mimeType || 'unknown'}. Only CSV and PDF files are supported.`,
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

export function getSessionStats(): { activeSessions: number; oldestSession: Date | null } {
  cleanupExpiredSessions();
  
  let oldestSession: Date | null = null;
  for (const session of uploadSessions.values()) {
    if (!oldestSession || session.createdAt < oldestSession) {
      oldestSession = session.createdAt;
    }
  }
  
  return {
    activeSessions: uploadSessions.size,
    oldestSession,
  };
}
