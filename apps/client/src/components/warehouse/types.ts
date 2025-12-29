/**
 * TypeScript interfaces for Warehouse Management System
 */

/** Warehouse site location */
export interface WarehouseSite {
  id: number;
  code: string;
  name: string;
  address?: string;
  city?: string;
  country?: string;
  active: boolean;
  item_count?: number;
}

/** Building within a warehouse site */
export interface WarehouseBuilding {
  id: number;
  code: string;
  name: string;
  dimensions: string;
  capacity_percent: number;
  pallet_count: number;
  geometry_notes?: string;
  active: boolean;
}

/** Inventory item in a warehouse */
export interface InventoryItem {
  id: number;
  requisition_no: string;
  description?: string;
  quantity: number;
  unit_price?: string;
  length_in?: string;
  width_in?: string;
  height_in?: string;
  weight_lb?: string;
  weight_lbs?: string;
  nsn?: string;
  fsc?: string;
  niin?: string;
  condition?: string;
  mission_id?: string;
  last_moved?: string;
  rack_location?: string;
  container_id?: string;
  receipt_date?: string;
  serial_no?: string;
  lin_esd?: string;
}

/** Transfer item details */
export interface TransferItemDetail {
  id: number;
  requisition_no: string;
  description?: string;
  quantity: number;
  weight_lb?: string;
  unit_price?: string;
}

/** Air transport metadata */
export interface AirTransportMetadata {
  aircraft_type: 'C-17' | 'C-130H' | 'C-130J';
  mission_id?: string;
  priority: 'routine' | 'priority' | 'urgent';
}

/** PACAF-compatible manifest data */
export interface PacafManifest {
  manifest_id: string;
  transfer_id: number;
  aircraft_type: string;
  mission_id?: string;
  priority: string;
  origin_site: { id: number; code: string; name: string };
  destination_site: { id: number; code: string; name: string };
  cargo_items: {
    id: number;
    requisition_no: string;
    description?: string;
    quantity: number;
    weight_lb: number;
    dimensions?: { length_in: number; width_in: number; height_in: number };
  }[];
  totals: {
    item_count: number;
    total_weight_lb: number;
    total_value: number;
  };
  created_at: string;
}

/** Transfer order between warehouse sites */
export interface Transfer {
  id: number;
  source_site_id: number;
  destination_site_id: number;
  status: string;
  transport_mode: string;
  transfer_items: TransferItemDetail[];
  air_metadata?: AirTransportMetadata;
  pacaf_manifest?: PacafManifest;
  notes?: string;
  scheduled_date?: string;
  completed_date?: string;
  created_at: string;
}

/** Create transfer request payload */
export interface CreateTransferPayload {
  source_site_id: number;
  destination_site_id: number;
  transport_mode: 'ground' | 'air' | 'sea';
  item_ids: number[];
  notes?: string;
  air_metadata?: AirTransportMetadata;
}

/** AI optimization result for a site */
export interface OptimizationResult {
  site_name: string;
  recommendations: {
    type: string;
    message: string;
    priority: string;
  }[];
  metrics: {
    total_items: number;
    total_value: number;
    aging_alerts: number;
  };
}

/** Toast notification message */
export interface ToastMessage {
  id: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
}

/** WMS navigation tabs */
export type WMSTab = "dashboard" | "inventory" | "operations" | "sites" | "analytics" | "ai-insights" | "admin";

/** Inventory filter options (legacy) */
export interface InventoryFilter {
  site: number | "all";
  condition: string;
  ageGroup: string;
  storageType: string;
  missionId: string;
}

/** Filter operator types for advanced filtering */
export type FilterOperator = 
  | "contains" 
  | "equals" 
  | "not_equals"
  | "greater_than" 
  | "less_than" 
  | "is_empty" 
  | "is_not_empty";

/** Single filter condition */
export interface FilterCondition {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
}

/** Filter group with logic */
export interface FilterGroup {
  logic: "and" | "or";
  conditions: FilterCondition[];
}

/** Column configuration for visibility */
export interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  sortable: boolean;
  width?: string;
  align?: "left" | "right" | "center";
}

/** Pagination state */
export interface PaginationState {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

/** Sort state */
export interface SortState {
  sortBy: string;
  sortOrder: "asc" | "desc";
}

/** Paginated inventory response from API */
export interface PaginatedInventoryResponse {
  items: InventoryItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

/** Inventory query parameters */
export interface InventoryQueryParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  search?: string;
  filters?: FilterCondition[];
  filterLogic?: "and" | "or";
}

/** Parsed NSN data */
export interface ParsedNSN {
  fsc: string;
  niin: string;
}

/** Validation message from file parsing */
export interface ValidationMessage {
  level: 'error' | 'warning';
  scope: 'file' | 'column' | 'row';
  target: string;
  message: string;
  rowIndex?: number;
}

/** Column specification from parser */
export interface ColumnSpec {
  originalName: string;
  mappedTo: string | null;
  isRequired: boolean;
  isRecognized: boolean;
}

/** File upload preview result */
export interface FileUploadResult {
  uploadId: string;
  preview: Record<string, any>[];
  columns: ColumnSpec[];
  warnings: ValidationMessage[];
  errors: ValidationMessage[];
  canCommit: boolean;
  totalRows: number;
  filename: string;
}

/** File upload commit result */
export interface FileCommitResult {
  message: string;
  count: number;
  skippedRows: number;
  totalRows: number;
}
