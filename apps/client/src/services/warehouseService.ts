/**
 * Warehouse Management System API Service
 * Handles all API calls for warehouse endpoints
 */

import type { WarehouseSite, InventoryItem, Transfer, OptimizationResult } from "../components/warehouse/types";

const API_BASE = "/api/warehouse";

/**
 * Fetch all warehouse sites
 * @returns Array of warehouse sites
 */
export async function fetchSites(): Promise<WarehouseSite[]> {
  const response = await fetch(`${API_BASE}/sites`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to fetch sites");
  return response.json();
}

/**
 * Create a new warehouse site
 * @param data - Site creation data
 * @returns Created site
 */
export async function createSite(data: {
  code: string;
  name: string;
  city?: string;
  country?: string;
}): Promise<WarehouseSite> {
  const response = await fetch(`${API_BASE}/sites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to create site");
  }
  return response.json();
}

/**
 * Fetch inventory for a specific site
 * @param siteId - Site ID
 * @returns Array of inventory items
 */
export async function fetchInventory(siteId: number): Promise<InventoryItem[]> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/inventory`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to fetch inventory");
  return response.json();
}

/**
 * Add a single inventory item to a site
 * @param siteId - Site ID
 * @param data - Item data
 * @returns Created inventory item
 */
export async function addInventoryItem(
  siteId: number,
  data: {
    requisition_no: string;
    description?: string;
    quantity: number;
    length_in?: string;
    width_in?: string;
    height_in?: string;
    weight_lb?: string;
    unit_price?: string;
    nsn?: string;
    fsc?: string;
    niin?: string;
  }
): Promise<InventoryItem> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/inventory`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to add item");
  }
  return response.json();
}

/**
 * Upload CSV inventory data to a site
 * @param siteId - Site ID
 * @param csvContent - CSV content string
 */
export async function uploadInventoryCsv(siteId: number, csvContent: string): Promise<void> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/inventory/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ csv_content: csvContent }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to upload CSV");
  }
}

/**
 * Fetch all transfers
 * @returns Array of transfers
 */
export async function fetchTransfers(): Promise<Transfer[]> {
  const response = await fetch(`${API_BASE}/transfers`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to fetch transfers");
  return response.json();
}

/**
 * Create a new transfer order
 * @param data - Transfer creation data
 * @returns Created transfer
 */
export async function createTransfer(data: {
  source_site_id: number;
  destination_site_id: number;
  transport_mode: string;
  items: string;
  notes?: string;
}): Promise<Transfer> {
  const response = await fetch(`${API_BASE}/transfers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to create transfer");
  }
  return response.json();
}

/**
 * Run optimization analysis for a site
 * @param siteId - Site ID
 * @returns Optimization result
 */
export async function runOptimization(siteId: number): Promise<OptimizationResult> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/optimization`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to run optimization");
  return response.json();
}
