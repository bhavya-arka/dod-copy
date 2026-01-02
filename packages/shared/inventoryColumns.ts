/**
 * Dynamic inventory column configuration
 * This is the single source of truth for all inventory table columns
 * Both frontend and backend should use this to stay in sync
 */

export interface InventoryColumnDefinition {
  key: string;
  label: string;
  sortable: boolean;
  align: "left" | "right" | "center";
  width?: string;
  defaultVisible: boolean;
  category: "identification" | "logistics" | "financial" | "tracking" | "metadata";
}

/**
 * All available inventory columns derived from the database schema
 * This list is automatically kept in sync with warehouse_inventory_items table
 */
export const INVENTORY_COLUMN_DEFINITIONS: InventoryColumnDefinition[] = [
  // Identification & Ship Info
  { key: "storage_facility", label: "Storage Facility", sortable: true, align: "left", defaultVisible: true, category: "identification" },
  { key: "ship", label: "Ship", sortable: true, align: "left", defaultVisible: true, category: "identification" },
  { key: "ship_class", label: "Ship Class", sortable: true, align: "left", defaultVisible: true, category: "identification" },
  { key: "program_code", label: "Program Code", sortable: true, align: "left", defaultVisible: true, category: "identification" },
  { key: "requisition_no", label: "Requisition No", sortable: true, align: "left", defaultVisible: true, category: "identification" },
  
  // Authority & Control
  { key: "authority", label: "Authority", sortable: true, align: "left", defaultVisible: true, category: "logistics" },
  { key: "work_item", label: "Work Item", sortable: true, align: "left", defaultVisible: true, category: "logistics" },
  { key: "li", label: "LI", sortable: true, align: "left", defaultVisible: true, category: "logistics" },
  { key: "matl_ctrl", label: "MATL CTRL", sortable: true, align: "left", defaultVisible: true, category: "logistics" },
  { key: "hmic", label: "HMIC", sortable: true, align: "left", defaultVisible: true, category: "logistics" },
  { key: "smcc", label: "SMCC", sortable: true, align: "left", defaultVisible: true, category: "logistics" },
  
  // Audit Fields
  { key: "item_audit", label: "Item Audit", sortable: true, align: "left", defaultVisible: true, category: "tracking" },
  { key: "audit_no", label: "Audit No", sortable: true, align: "left", defaultVisible: true, category: "tracking" },
  { key: "ship_ind", label: "Ship Ind", sortable: true, align: "left", defaultVisible: true, category: "tracking" },
  { key: "ship_avail", label: "Ship Avail", sortable: true, align: "left", defaultVisible: true, category: "tracking" },
  
  // Item Details
  { key: "nsn", label: "NSN", sortable: true, align: "left", defaultVisible: true, category: "identification" },
  { key: "fsc", label: "FSC", sortable: true, align: "left", defaultVisible: true, category: "identification" },
  { key: "niin", label: "NIIN", sortable: true, align: "left", defaultVisible: true, category: "identification" },
  { key: "quantity", label: "Qty", sortable: true, align: "right", defaultVisible: true, category: "logistics" },
  { key: "description", label: "Description", sortable: true, align: "left", width: "200px", defaultVisible: true, category: "identification" },
  
  // Manufacturer Info
  { key: "cage", label: "CAGE", sortable: true, align: "left", defaultVisible: true, category: "identification" },
  { key: "manufacturer", label: "Manufacturer", sortable: true, align: "left", defaultVisible: true, category: "identification" },
  { key: "mfg_date", label: "Mfg Date", sortable: true, align: "left", defaultVisible: true, category: "tracking" },
  { key: "contract_no", label: "Contract No", sortable: true, align: "left", defaultVisible: true, category: "financial" },
  { key: "iuid", label: "IUID", sortable: true, align: "left", defaultVisible: true, category: "identification" },
  
  // Units & Pricing
  { key: "unit", label: "UI", sortable: true, align: "left", defaultVisible: true, category: "logistics" },
  { key: "unit_price", label: "Unit Price", sortable: true, align: "right", defaultVisible: true, category: "financial" },
  { key: "receipt_price", label: "Receipt Price", sortable: true, align: "right", defaultVisible: true, category: "financial" },
  { key: "receipt_date", label: "Receipt Date", sortable: true, align: "left", defaultVisible: true, category: "tracking" },
  
  // Location & Storage
  { key: "location", label: "Location", sortable: true, align: "left", defaultVisible: true, category: "logistics" },
  { key: "lot_no", label: "Lot No", sortable: true, align: "left", defaultVisible: true, category: "tracking" },
  { key: "serial_no", label: "Serial No", sortable: true, align: "left", defaultVisible: true, category: "identification" },
  { key: "barcode", label: "Barcode", sortable: true, align: "left", defaultVisible: true, category: "identification" },
  
  // Inventory Status
  { key: "inventory_type", label: "Inventory Type", sortable: true, align: "left", defaultVisible: true, category: "logistics" },
  { key: "material_disposition", label: "Mat Disposition", sortable: true, align: "left", defaultVisible: true, category: "logistics" },
  { key: "condition_code", label: "Condition Code", sortable: true, align: "left", defaultVisible: true, category: "logistics" },
  { key: "condition", label: "Condition", sortable: true, align: "left", defaultVisible: true, category: "logistics" },
  { key: "asset_type", label: "Asset Type", sortable: true, align: "left", defaultVisible: true, category: "logistics" },
  
  // Dates
  { key: "exp_date", label: "Exp Date", sortable: true, align: "left", defaultVisible: true, category: "tracking" },
  { key: "ext_date", label: "Ext Date", sortable: true, align: "left", defaultVisible: true, category: "tracking" },
  { key: "insp_date", label: "Insp Date", sortable: true, align: "left", defaultVisible: true, category: "tracking" },
  { key: "last_audit_date", label: "Last Audit Date", sortable: true, align: "left", defaultVisible: true, category: "tracking" },
  { key: "in_service_date", label: "In Service Date", sortable: true, align: "left", defaultVisible: true, category: "tracking" },
  
  // Metadata
  { key: "data_user_id", label: "User ID", sortable: true, align: "left", defaultVisible: true, category: "metadata" },
  { key: "remarks", label: "Remarks", sortable: true, align: "left", defaultVisible: true, category: "metadata" },
  { key: "warranty_item", label: "Warranty Item", sortable: true, align: "left", defaultVisible: true, category: "metadata" },
  
  // Mission & Movement
  { key: "mission_id", label: "Mission", sortable: true, align: "left", defaultVisible: true, category: "logistics" },
  { key: "last_moved", label: "Last Moved", sortable: true, align: "left", defaultVisible: true, category: "tracking" },
  { key: "lin_esd", label: "LIN/ESD", sortable: true, align: "left", defaultVisible: true, category: "logistics" },
  { key: "weight_lbs", label: "Weight", sortable: true, align: "right", defaultVisible: true, category: "logistics" },
];

/**
 * Get all column keys for filtering/validation
 */
export function getInventoryColumnKeys(): string[] {
  return INVENTORY_COLUMN_DEFINITIONS.map(col => col.key);
}

/**
 * Get columns by category
 */
export function getColumnsByCategory(category: InventoryColumnDefinition["category"]): InventoryColumnDefinition[] {
  return INVENTORY_COLUMN_DEFINITIONS.filter(col => col.category === category);
}

/**
 * Get default visible columns
 */
export function getDefaultVisibleColumns(): InventoryColumnDefinition[] {
  return INVENTORY_COLUMN_DEFINITIONS.filter(col => col.defaultVisible);
}
