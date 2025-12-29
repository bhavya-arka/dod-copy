/**
 * Warehouse Management System API Service
 * Handles all API calls for warehouse endpoints
 */

import type { 
  WarehouseSite, 
  InventoryItem, 
  Transfer, 
  OptimizationResult, 
  FileUploadResult, 
  FileCommitResult,
  PaginatedInventoryResponse,
  InventoryQueryParams
} from "../components/warehouse/types";

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
 * Fetch paginated inventory for a specific site
 * @param siteId - Site ID
 * @param params - Query parameters for pagination, sorting, and filtering
 * @returns Paginated inventory response
 */
export async function fetchInventoryPaginated(
  siteId: number, 
  params: InventoryQueryParams = {}
): Promise<PaginatedInventoryResponse> {
  const searchParams = new URLSearchParams();
  
  if (params.page) searchParams.set("page", params.page.toString());
  if (params.pageSize) searchParams.set("pageSize", params.pageSize.toString());
  if (params.sortBy) searchParams.set("sortBy", params.sortBy);
  if (params.sortOrder) searchParams.set("sortOrder", params.sortOrder);
  if (params.search) searchParams.set("search", params.search);
  if (params.filters && params.filters.length > 0) {
    searchParams.set("filters", JSON.stringify(params.filters));
  }
  if (params.filterLogic) searchParams.set("filterLogic", params.filterLogic);

  const queryString = searchParams.toString();
  const url = `${API_BASE}/sites/${siteId}/inventory${queryString ? `?${queryString}` : ""}`;

  const response = await fetch(url, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to fetch inventory");
  return response.json();
}

/**
 * Fetch inventory for a specific site (legacy - returns all items)
 * @param siteId - Site ID
 * @returns Array of inventory items
 * @deprecated Use fetchInventoryPaginated instead
 */
export async function fetchInventory(siteId: number): Promise<InventoryItem[]> {
  const response = await fetchInventoryPaginated(siteId, { page: 1, pageSize: 10000 });
  return response.items;
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

/**
 * Upload and parse inventory file (CSV or PDF)
 * @param siteId - Site ID
 * @param file - File to upload
 * @returns Parsed preview with validation
 */
export async function uploadInventoryFile(siteId: number, file: File): Promise<FileUploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch(`${API_BASE}/sites/${siteId}/inventory/import`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to parse file");
  }
  return response.json();
}

/**
 * Commit validated upload to database
 * @param siteId - Site ID
 * @param uploadId - Upload session ID
 * @returns Commit result
 */
export async function commitInventoryUpload(siteId: number, uploadId: string): Promise<FileCommitResult> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/inventory/import/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ uploadId }),
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to commit upload");
  }
  return response.json();
}

/**
 * Delete an inventory item
 * @param siteId - Site ID
 * @param itemId - Item ID to delete
 * @returns Success response
 */
export async function deleteInventoryItem(siteId: number, itemId: number): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/inventory/${itemId}`, {
    method: "DELETE",
    credentials: "include",
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to delete item");
  }
  return response.json();
}

/**
 * Delete multiple inventory items
 * @param siteId - Site ID
 * @param itemIds - Array of item IDs to delete
 * @returns Object with count of successfully deleted items
 */
export async function deleteInventoryItems(siteId: number, itemIds: number[]): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  
  for (const itemId of itemIds) {
    try {
      await deleteInventoryItem(siteId, itemId);
      deleted++;
    } catch {
      failed++;
    }
  }
  
  return { deleted, failed };
}

/**
 * Delete a warehouse site and all related data
 * @param siteId - Site ID to delete
 * @returns Success response
 */
export async function deleteSite(siteId: number): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE}/sites/${siteId}`, {
    method: "DELETE",
    credentials: "include",
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to delete site");
  }
  return response.json();
}
