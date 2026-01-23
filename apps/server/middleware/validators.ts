export function escapeRegexPattern(pattern: string): string {
  return pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isSafeIdentifier(value: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value);
}

export function sanitizeSearchTerm(term: string, maxLength: number = 500): string {
  if (typeof term !== 'string') return '';
  return term
    .trim()
    .slice(0, maxLength)
    .replace(/[\x00-\x1F\x7F]/g, '');
}

export function validatePaginationParam(value: unknown, min: number, max: number, defaultValue: number): number {
  const parsed = parseInt(String(value), 10);
  if (isNaN(parsed) || parsed < min) return defaultValue;
  return Math.min(parsed, max);
}

export const ALLOWED_INVENTORY_SORT_COLUMNS = [
  'id', 'requisition_no', 'nsn', 'niin', 'fsc', 'description', 'quantity',
  'condition', 'mission_id', 'serial_no', 'lin_esd', 'unit_price', 'weight_lbs',
  'location', 'cage', 'manufacturer', 'aging_days', 'created_at', 'updated_at'
] as const;

export function validateSortColumn(column: string): string {
  if (ALLOWED_INVENTORY_SORT_COLUMNS.includes(column as any)) {
    return column;
  }
  return 'id';
}
