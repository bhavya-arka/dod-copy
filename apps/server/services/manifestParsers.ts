/**
 * Manifest Parsers for MILSTRIP, FEDLOG, and enhanced CSV formats
 * Normalizes incoming data into unified warehouse inventory format
 */

import { z } from "zod";

// Unified normalized item schema (matches warehouseInventoryItems)
export interface NormalizedInventoryItem {
  nsn?: string;
  partNumber?: string;
  nomenclature: string;
  quantity: number;
  unitOfIssue?: string;
  weightLbs?: number;
  lengthIn?: number;
  widthIn?: number;
  heightIn?: number;
  cubeFt?: number;
  lastReceivedDate?: Date;
  milstripNumber?: string;
  fedlogCode?: string;
  unitPrice?: number;
  cageCode?: string;
  fsc?: string; // Federal Supply Class (first 4 chars of NSN)
  niin?: string; // National Item Identification Number (last 9 chars of NSN)
  location?: string;
  condition?: string;
  serialNumber?: string;
  lotNumber?: string;
  expirationDate?: Date;
}

export interface ParseResult {
  success: boolean;
  items: NormalizedInventoryItem[];
  errors: string[];
  warnings: string[];
  format: 'milstrip' | 'fedlog' | 'csv' | 'unknown';
  totalRows: number;
  successfulRows: number;
}

/**
 * MILSTRIP Parser
 * Military Standard Requisitioning and Issue Procedures
 * Fixed-width format with specific field positions
 */
export function parseMilstrip(content: string): ParseResult {
  const lines = content.split('\n').filter(line => line.trim().length > 0);
  const items: NormalizedInventoryItem[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    try {
      // MILSTRIP format: Document Identifier (3), Routing Identifier (3), 
      // Media & Status (1), NSN (13), Unit of Issue (2), Quantity (5), etc.
      if (line.length < 30) {
        warnings.push(`Line ${lineNum}: Too short for MILSTRIP format, skipped`);
        continue;
      }

      const docId = line.substring(0, 3).trim();
      const routingId = line.substring(3, 6).trim();
      const nsn = line.substring(8, 21).trim().replace(/\s+/g, '');
      const unitOfIssue = line.substring(21, 23).trim();
      const quantity = parseInt(line.substring(23, 28).trim()) || 1;
      const demandCode = line.substring(28, 29).trim();
      const supplementaryAddr = line.substring(29, 35).trim();
      const signalCode = line.substring(35, 36).trim();
      const fundCode = line.substring(36, 38).trim();
      const distributionCode = line.substring(38, 41).trim();
      const projectCode = line.substring(41, 44).trim();
      const priority = line.substring(44, 46).trim();
      const requisitionDate = line.substring(46, 50).trim(); // Julian date
      const serialNumber = line.substring(50, 54).trim();
      
      // Validate NSN format (####-##-###-####)
      if (nsn.length >= 9) {
        const fsc = nsn.substring(0, 4);
        const niin = nsn.substring(4);
        
        items.push({
          nsn: formatNsn(nsn),
          nomenclature: `MILSTRIP Item - NSN ${formatNsn(nsn)}`,
          quantity,
          unitOfIssue: unitOfIssue || 'EA',
          milstripNumber: `${docId}${routingId}${serialNumber}`,
          fsc,
          niin,
        });
      } else {
        errors.push(`Line ${lineNum}: Invalid NSN format`);
      }
    } catch (err) {
      errors.push(`Line ${lineNum}: Parse error - ${err}`);
    }
  }

  return {
    success: errors.length === 0,
    items,
    errors,
    warnings,
    format: 'milstrip',
    totalRows: lines.length,
    successfulRows: items.length,
  };
}

/**
 * FEDLOG Parser
 * Federal Logistics Database format
 * Tab or pipe-delimited with header row
 */
export function parseFedlog(content: string): ParseResult {
  const lines = content.split('\n').filter(line => line.trim().length > 0);
  const items: NormalizedInventoryItem[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  if (lines.length < 2) {
    return {
      success: false,
      items: [],
      errors: ['FEDLOG file must have header row and at least one data row'],
      warnings: [],
      format: 'fedlog',
      totalRows: lines.length,
      successfulRows: 0,
    };
  }

  // Detect delimiter
  const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes('|') ? '|' : ',';
  
  // Parse header
  const headers = lines[0].split(delimiter).map(h => h.trim().toUpperCase());
  const headerMap = new Map<string, number>();
  headers.forEach((h, i) => headerMap.set(h, i));

  // FEDLOG column mappings
  const getField = (row: string[], field: string): string | undefined => {
    const aliases: Record<string, string[]> = {
      NSN: ['NSN', 'NIIN', 'NATIONAL_STOCK_NUMBER', 'STOCK_NUMBER'],
      NOMENCLATURE: ['NOMENCLATURE', 'ITEM_NAME', 'DESCRIPTION', 'NAME', 'ITEM_DESCRIPTION'],
      QUANTITY: ['QUANTITY', 'QTY', 'ON_HAND', 'STOCK_QTY'],
      UNIT: ['UNIT', 'UNIT_OF_ISSUE', 'UI', 'UOI', 'U/I'],
      WEIGHT: ['WEIGHT', 'WEIGHT_LBS', 'WT', 'UNIT_WEIGHT'],
      PRICE: ['PRICE', 'UNIT_PRICE', 'COST', 'UNIT_COST'],
      CAGE: ['CAGE', 'CAGE_CODE', 'MANUFACTURER_CODE'],
      FSC: ['FSC', 'FEDERAL_SUPPLY_CLASS', 'SUPPLY_CLASS'],
      PART_NUMBER: ['PART_NUMBER', 'P/N', 'PN', 'PART_NO', 'MANUFACTURER_PART_NUMBER'],
    };

    const possibleNames = aliases[field] || [field];
    for (const name of possibleNames) {
      const idx = headerMap.get(name);
      if (idx !== undefined && row[idx] !== undefined) {
        return row[idx].trim();
      }
    }
    return undefined;
  };

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const lineNum = i + 1;
    const row = lines[i].split(delimiter).map(c => c.trim());

    try {
      const nsn = getField(row, 'NSN');
      const nomenclature = getField(row, 'NOMENCLATURE');
      const quantity = parseInt(getField(row, 'QUANTITY') || '1') || 1;
      const unitOfIssue = getField(row, 'UNIT');
      const weight = parseFloat(getField(row, 'WEIGHT') || '0') || undefined;
      const price = parseFloat(getField(row, 'PRICE') || '0') || undefined;
      const cage = getField(row, 'CAGE');
      const fsc = getField(row, 'FSC');
      const partNumber = getField(row, 'PART_NUMBER');

      if (!nomenclature && !nsn) {
        warnings.push(`Line ${lineNum}: No nomenclature or NSN, skipped`);
        continue;
      }

      items.push({
        nsn: nsn ? formatNsn(nsn) : undefined,
        partNumber,
        nomenclature: nomenclature || `NSN ${nsn}`,
        quantity,
        unitOfIssue: unitOfIssue || 'EA',
        weightLbs: weight,
        unitPrice: price,
        cageCode: cage,
        fsc: fsc || (nsn ? nsn.substring(0, 4) : undefined),
        fedlogCode: nsn || partNumber,
      });
    } catch (err) {
      errors.push(`Line ${lineNum}: Parse error - ${err}`);
    }
  }

  return {
    success: errors.length === 0,
    items,
    errors,
    warnings,
    format: 'fedlog',
    totalRows: lines.length - 1, // Exclude header
    successfulRows: items.length,
  };
}

/**
 * Auto-detect and parse manifest format
 */
export function parseManifest(content: string, filename?: string): ParseResult {
  // Check for MILSTRIP fixed-width format (starts with document identifiers)
  const firstLine = content.split('\n')[0] || '';
  
  // MILSTRIP detection: fixed-width, starts with A0A, A0B, DI codes, etc.
  if (/^[A-Z][0-9][A-Z]/.test(firstLine.trim()) && !firstLine.includes(',') && !firstLine.includes('\t')) {
    return parseMilstrip(content);
  }
  
  // FEDLOG detection: tab or pipe delimited, has known headers
  const upperFirst = firstLine.toUpperCase();
  if (upperFirst.includes('NSN') || upperFirst.includes('NIIN') || 
      upperFirst.includes('NOMENCLATURE') || upperFirst.includes('FEDERAL')) {
    return parseFedlog(content);
  }
  
  // Default to CSV/FEDLOG parser
  return parseFedlog(content);
}

/**
 * Format NSN to standard format: ####-##-###-####
 */
function formatNsn(nsn: string): string {
  const cleaned = nsn.replace(/[^0-9A-Z]/gi, '');
  if (cleaned.length === 13) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 9)}-${cleaned.slice(9, 13)}`;
  }
  return nsn;
}

/**
 * Validate NSN format
 */
export function validateNsn(nsn: string): boolean {
  const pattern = /^\d{4}-\d{2}-\d{3}-\d{4}$/;
  return pattern.test(nsn);
}

/**
 * Extract FSC and NIIN from NSN
 */
export function parseNsn(nsn: string): { fsc: string; niin: string } | null {
  const cleaned = nsn.replace(/[^0-9]/g, '');
  if (cleaned.length === 13) {
    return {
      fsc: cleaned.substring(0, 4),
      niin: cleaned.substring(4),
    };
  }
  return null;
}
