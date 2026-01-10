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

/** Zone within a warehouse site (primary organizational structure) */
export interface WarehouseZone {
  id: number;
  site_id: number;
  building_id?: number | null;
  code: string;
  name: string;
  is_outdoor: boolean;
  usage_type: string;
  bulk_available: number;
  bulk_open: number;
  rack_available: number;
  rack_open: number;
  location_pattern?: string;
  weight_limit_lbs?: number;
  capacity_pallets?: number;
  total_capacity?: number;
  current_item_count?: number;
  current_weight_lbs?: string;
  last_synced_at?: string | null;
}

/** Zone usage types */
export type ZoneUsageType = 
  | "small_material" 
  | "mixed_material" 
  | "large_material" 
  | "uncrated" 
  | "crated" 
  | "hazmat" 
  | "long_pipes" 
  | "general";

/** Inventory item in a warehouse - includes all BATS fields */
export interface InventoryItem {
  id: number;
  site_id: number;
  location_id?: number;
  storage_facility?: string;
  ship?: string;
  ship_class?: string;
  program_code?: string;
  requisition_no: string;
  authority?: string;
  work_item?: string;
  li?: string;
  matl_ctrl?: string;
  hmic?: string;
  smcc?: string;
  item_audit?: string;
  audit_no?: string;
  ship_ind?: string;
  ship_avail?: string;
  nsn?: string;
  fsc?: string;
  niin?: string;
  description?: string;
  cage?: string;
  manufacturer?: string;
  mfg_date?: string;
  contract_no?: string;
  iuid?: string;
  unit?: string;
  quantity: number;
  unit_price?: string;
  receipt_price?: string;
  receipt_date?: string;
  location?: string;
  lot_no?: string;
  serial_no?: string;
  barcode?: string;
  inventory_type?: string;
  material_disposition?: string;
  condition_code?: string;
  condition?: string;
  asset_type?: string;
  exp_date?: string;
  ext_date?: string;
  insp_date?: string;
  last_audit_date?: string;
  data_user_id?: string;
  remarks?: string;
  in_service_date?: string;
  warranty_item?: string;
  mission_id?: string;
  lin_esd?: string;
  last_moved?: string;
  weight_lb?: string;
  weight_lbs?: string;
  length_in?: string;
  width_in?: string;
  height_in?: string;
  rack_location?: string;
  container_id?: string;
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
export type WMSTab = "dashboard" | "inventory" | "operations" | "sites" | "ai-insights" | "history" | "admin";

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
  searchTerms?: string[];
  filters?: FilterCondition[];
  filterLogic?: "and" | "or";
  zone_id?: number;
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
