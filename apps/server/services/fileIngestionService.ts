import Papa from 'papaparse';
import { createRequire } from 'module';

// Use createRequire for pdf-parse due to ESM/CJS compatibility issues
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
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

function detectTableFromPDF(text: string): { headers: string[]; rows: Record<string, any>[] } {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  if (lines.length < 2) {
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
  
  const splitLine = (line: string): string[] => {
    return line.split(bestDelimiter as any).map((v: string) => v.trim());
  };
  
  const headerLine = lines[0];
  const headers = splitLine(headerLine);
  
  const rows: Record<string, any>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitLine(lines[i]);
    if (values.length === 0 || (values.length === 1 && values[0] === '')) continue;
    
    const row: Record<string, any> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || '';
    }
    rows.push(row);
  }
  
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
    const pdfData = await pdfParse(buffer);
    const text = pdfData.text;
    
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
      message: 'PDF parsing uses heuristic table detection. Please verify extracted data.',
    });
    
    const { headers, rows } = detectTableFromPDF(text);
    
    if (headers.length === 0) {
      errors.push({
        level: 'error',
        scope: 'file',
        target: 'structure',
        message: 'Could not detect table structure in PDF. No tabular data with recognizable headers was found. Consider using CSV format instead.',
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
      canCommit: validationResult.canCommit && errors.filter(e => e.scope !== 'row').length === 0,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    };
    
    uploadSessions.set(uploadId, session);
    console.log(`[FileIngestion] Created PDF session: ${uploadId}, rows: ${validationResult.rows.length}`);
    
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
