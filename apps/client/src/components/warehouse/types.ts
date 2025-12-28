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
  nsn?: string;
  fsc?: string;
  niin?: string;
  condition?: string;
  mission_id?: string;
  last_moved?: string;
  rack_location?: string;
  container_id?: string;
  receipt_date?: string;
}

/** Transfer order between warehouse sites */
export interface Transfer {
  id: number;
  source_site_id: number;
  destination_site_id: number;
  status: string;
  transport_mode: string;
  items: string;
  notes?: string;
  created_at: string;
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

/** Inventory filter options */
export interface InventoryFilter {
  site: number | "all";
  condition: string;
  ageGroup: string;
  storageType: string;
  missionId: string;
}

/** Parsed NSN data */
export interface ParsedNSN {
  fsc: string;
  niin: string;
}
