/**
 * Warehouse Management System API Service
 * Handles all API calls for warehouse endpoints
 */

import type { 
  WarehouseSite, 
  WarehouseBuilding,
  WarehouseZone,
  InventoryItem, 
  Transfer, 
  OptimizationResult, 
  FileUploadResult, 
  FileCommitResult,
  PaginatedInventoryResponse,
  InventoryQueryParams,
  CreateTransferPayload
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
 * Fetch buildings for a specific site
 * @param siteId - Site ID
 * @returns Array of buildings with capacity info
 */
export async function getSiteBuildings(siteId: number): Promise<WarehouseBuilding[]> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/buildings`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to fetch buildings");
  return response.json();
}

export async function createBuilding(siteId: number, data: {
  code: string;
  name: string;
  length_ft?: number;
  width_ft?: number;
  height_ft?: number;
  geometry_notes?: string;
  capacity_pallets?: number;
}): Promise<WarehouseBuilding> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/buildings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create building");
  }
  return response.json();
}

export async function updateBuilding(siteId: number, buildingId: number, data: {
  code?: string;
  name?: string;
  length_ft?: number;
  width_ft?: number;
  height_ft?: number;
  geometry_notes?: string;
  active?: boolean;
}): Promise<WarehouseBuilding> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/buildings/${buildingId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to update building");
  }
  return response.json();
}

export async function deleteBuilding(siteId: number, buildingId: number): Promise<void> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/buildings/${buildingId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete building");
  }
}

/**
 * Fetch zones for a specific site
 * @param siteId - Site ID
 * @returns Array of zones
 */
export async function fetchSiteZones(siteId: number): Promise<WarehouseZone[]> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/zones`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to fetch zones");
  return response.json();
}

/**
 * Create a new zone
 * @param data - Zone creation data
 * @returns Created zone
 */
export async function createZone(data: {
  site_id: number;
  code: string;
  name: string;
  is_outdoor?: boolean;
  usage_type?: string;
  location_pattern?: string;
  bulk_available?: number;
  rack_available?: number;
}): Promise<WarehouseZone> {
  const response = await fetch(`${API_BASE}/sites/${data.site_id}/zones`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create zone");
  }
  return response.json();
}

/**
 * Delete a zone
 * @param siteId - Site ID
 * @param zoneId - Zone ID to delete
 */
export async function deleteZone(siteId: number, zoneId: number): Promise<void> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/zones/${zoneId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete zone");
  }
}

/**
 * Seed default zones for a site (San Diego template)
 * @param siteId - Site ID
 * @returns Count of seeded zones
 */
export async function seedDefaultZones(siteId: number): Promise<{ count: number }> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/zones/seed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to seed zones");
  }
  return response.json();
}

/**
 * Create a new warehouse site
 * @param data - Site creation data with full address fields for Google Maps geocoding
 * @returns Created site
 */
export async function createSite(data: {
  code: string;
  name: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  aor?: string;
  shipyard_code?: string;
  dodaac?: string;
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
  if (params.searchTerms && params.searchTerms.length > 0) {
    searchParams.set("searchTerms", JSON.stringify(params.searchTerms));
  }
  if (params.filters && params.filters.length > 0) {
    searchParams.set("filters", JSON.stringify(params.filters));
  }
  if (params.filterLogic) searchParams.set("filterLogic", params.filterLogic);
  if (params.zone_id !== undefined) searchParams.set("zone_id", params.zone_id.toString());

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
 * Preview vehicle allocation for transfer items
 * @param itemIds - Array of inventory item IDs
 * @param siteId - Source site ID
 * @returns Vehicle allocation preview
 */
export async function previewTransferVehicles(itemIds: number[], siteId: number) {
  const response = await fetch(`${API_BASE}/transfers/preview-vehicles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ item_ids: itemIds, site_id: siteId })
  });
  if (!response.ok) {
    throw new Error("Failed to preview vehicles");
  }
  return response.json();
}

export interface TransportLeg {
  legNumber: number;
  mode: "ground" | "air" | "sea";
  origin: {
    name: string;
    lat: number;
    lng: number;
    type: "warehouse" | "airport" | "seaport";
  };
  destination: {
    name: string;
    lat: number;
    lng: number;
    type: "warehouse" | "airport" | "seaport";
  };
  distanceMiles?: number;
  estimatedHours?: number;
  vehicleCount?: number;
}

export interface MultiModalRoute {
  feasible: boolean;
  requiresMultiModal: boolean;
  reason?: string;
  legs: TransportLeg[];
  totalDistanceMiles: number;
  totalEstimatedHours: number;
  suggestedMode: "ground" | "air" | "sea";
}

/**
 * Plan a multi-modal route between two warehouse sites
 * Uses Google Maps to check ground route viability
 * Auto-suggests air/sea legs for ocean crossings
 */
export async function planMultiModalRoute(
  sourceSiteId: number,
  destinationSiteId: number,
  cargoWeightLbs: number
): Promise<MultiModalRoute> {
  const response = await fetch("/api/routing/plan-multi-modal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ sourceSiteId, destinationSiteId, cargoWeightLbs })
  });
  if (!response.ok) {
    throw new Error("Failed to plan route");
  }
  return response.json();
}

/**
 * Create a new transfer order with item selection and optional air transport metadata
 * @param data - Transfer creation data
 * @returns Created transfer
 */
export async function createTransfer(data: CreateTransferPayload): Promise<Transfer> {
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
 * Update transfer status
 * @param transferId - Transfer ID
 * @param status - New status
 * @returns Update result
 */
export async function updateTransferStatus(
  transferId: number, 
  status: string
): Promise<{ message: string; transfer_id: number; status: string }> {
  const response = await fetch(`${API_BASE}/transfers/${transferId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ status }),
  });
  if (!response.ok) throw new Error('Failed to update transfer status');
  return response.json();
}

/**
 * Update transfer details (arrival date, notes)
 * @param transferId - Transfer ID
 * @param data - Update data
 * @returns Updated transfer
 */
export async function updateTransfer(
  transferId: number, 
  data: { scheduled_arrival_date?: string; notes?: string }
): Promise<Transfer> {
  const response = await fetch(`${API_BASE}/transfers/${transferId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to update transfer');
  return response.json();
}

/**
 * Delete a transfer
 * @param transferId - Transfer ID
 * @returns Success response
 */
export async function deleteTransfer(transferId: number): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE}/transfers/${transferId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to delete transfer' }));
    throw new Error(error.error || 'Failed to delete transfer');
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
  const data = await response.json();
  
  // Map backend response (uses 'summary') to frontend type (uses 'metrics')
  return {
    site_name: data.site_name,
    recommendations: data.recommendations || [],
    metrics: {
      total_items: data.summary?.total_items || 0,
      total_value: data.summary?.total_value || 0,
      aging_alerts: data.recommendations?.filter((r: any) => r.type?.toLowerCase().includes('aging')).length || 0,
    },
  };
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
 * Delete all inventory items for a site
 * @param siteId - Site ID
 * @returns Object with count of deleted items
 */
export async function deleteAllInventoryItems(siteId: number): Promise<{ success: boolean; message: string; deleted: number }> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/inventory/all`, {
    method: "DELETE",
    credentials: "include",
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to delete all items");
  }
  return response.json();
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

/**
 * Get a preview of what will be deleted when a warehouse site is removed
 * @param siteId - Site ID to preview deletion for
 * @returns Preview of data counts that will be deleted
 */
export async function getWarehouseDeletionPreview(siteId: number): Promise<{
  siteName: string;
  counts: {
    buildings: number;
    zones: number;
    locations: number;
    inventoryItems: number;
    optimizationPlans: number;
    optimizationActions: number;
  };
}> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/deletion-preview`, {
    credentials: "include",
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to get deletion preview");
  }
  return response.json();
}

/**
 * Move an inventory item to a new location or site
 * @param siteId - Current site ID
 * @param itemId - Item ID to move
 * @param data - Move destination data
 * @returns Updated inventory item
 */
export async function moveInventoryItem(
  siteId: number,
  itemId: number,
  data: {
    destination_site_id?: number;
    destination_location_id?: number | null;
    notes?: string;
  }
): Promise<{ success: boolean; message: string; item: InventoryItem }> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/inventory/${itemId}/move`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to move item");
  }
  return response.json();
}

/**
 * Bulk move inventory items to a different zone
 * @param siteId - Site ID
 * @param itemIds - Array of item IDs to move
 * @param targetZoneId - Target zone ID (or null to unassign zone)
 * @param notes - Optional notes for the move
 */
export async function bulkMoveItemsToZone(
  siteId: number,
  itemIds: number[],
  targetZoneId: number | null,
  notes?: string
): Promise<{ success: boolean; message: string; itemsMoved: number }> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/inventory/bulk-move-zone`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      item_ids: itemIds,
      target_zone_id: targetZoneId,
      notes,
    }),
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to move items to zone");
  }
  return response.json();
}

/** Optimization action from wizard */
export interface OptimizationAction {
  id: string;
  action: string;
  item: string;
  from: string;
  to: string;
  priority: 'high' | 'medium' | 'low';
  estimatedBenefit: string;
}

/** Optimization wizard result */
export interface OptimizationWizardResult {
  runId: number;
  algorithm: string;
  site: { id: number; name: string };
  summary: {
    slotsFreed: number;
    consolidationWins: string;
    zonesOptimized: number;
    pickEfficiencyGain: string;
    itemsAffected: number;
    actionsGenerated: number;
    phases?: Record<string, {
      actions: number;
      slotsFreed: number;
      consolidationWins: string;
      zonesOptimized: number;
    }>;
  };
  actions: OptimizationAction[];
  totalActions: number;
}

/**
 * Run optimization wizard with selected algorithm
 * @param siteId - Site ID
 * @param algorithm - Algorithm to use
 * @param params - Algorithm parameters
 * @returns Optimization result with action plan
 */
export async function runOptimizationWizard(
  siteId: number,
  algorithm: string,
  params: Record<string, any>
): Promise<OptimizationWizardResult> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/optimize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ algorithm, params }),
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to run optimization");
  }
  return response.json();
}

export async function runAllOptimizations(
  siteId: number,
  params: Record<string, any>
): Promise<OptimizationWizardResult> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/optimize/run-all`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ params }),
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to run all optimizations");
  }
  return response.json();
}

/**
 * Apply optimization plan
 * @param siteId - Site ID
 * @param runId - Optimization run ID
 * @returns Success result
 */
export async function applyOptimizationPlan(
  siteId: number,
  runId: number
): Promise<{ success: boolean; message: string; actionsApplied: number }> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/optimize/${runId}/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to apply optimization plan");
  }
  return response.json();
}

/**
 * Dynamic column definition from API
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
 * Fetch inventory column definitions dynamically from the server
 * This ensures columns are always in sync with the database schema
 * @returns Column definitions with version for cache invalidation
 */
export async function fetchInventoryColumns(): Promise<{
  columns: InventoryColumnDefinition[];
  version: number;
}> {
  const response = await fetch(`${API_BASE}/inventory-columns`, {
    credentials: "include",
  });
  
  if (!response.ok) {
    throw new Error("Failed to fetch inventory columns");
  }
  return response.json();
}

/** AI insight type for warehouse analysis */
export type WarehouseInsightType = 
  | 'warehouse_optimization' 
  | 'inventory_analysis' 
  | 'storage_efficiency'
  | 'mission_readiness';

/** AI-generated warehouse insight response */
export interface WarehouseAiInsight {
  id: number;
  type: WarehouseInsightType;
  content: string;
  summary?: string;
  recommendations?: string[];
  createdAt: string;
  cached: boolean;
}

/**
 * Generate AI insights for warehouse inventory
 * @param siteId - Site ID
 * @param type - Type of insight to generate
 * @param inventoryData - Optional inventory data to analyze
 * @param forceRegenerate - Force regeneration instead of using cache
 * @returns AI-generated insight
 */
export async function generateWarehouseInsights(
  siteId: number,
  type: WarehouseInsightType = 'warehouse_optimization',
  inventoryData?: {
    totalItems?: number;
    totalValue?: number;
    agingAlerts?: number;
    siteCode?: string;
    siteName?: string;
  },
  forceRegenerate: boolean = false
): Promise<WarehouseAiInsight> {
  const response = await fetch('/api/insights/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      type: 'allocation_summary',
      inputData: {
        analysisType: type,
        siteId,
        warehouseContext: true,
        ...inventoryData
      },
      forceRegenerate
    }),
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to generate AI insights');
  }
  
  const data = await response.json();
  
  // The insight content may be an object with summary/recommendations or a string
  const insightContent = data.insight?.content || data.content;
  let contentString: string;
  let recommendations: string[] = [];
  let summary: string | undefined;
  
  if (typeof insightContent === 'object' && insightContent !== null) {
    // Extract structured data from the insight object
    summary = insightContent.summary || '';
    recommendations = insightContent.optimization_suggestions || insightContent.recommendations || [];
    
    // Build a formatted content string from the object
    const parts: string[] = [];
    if (insightContent.summary) {
      parts.push(insightContent.summary);
    }
    if (insightContent.key_metrics) {
      parts.push(`\nKey Metrics: ${JSON.stringify(insightContent.key_metrics)}`);
    }
    if (insightContent.risk_flags && insightContent.risk_flags.length > 0) {
      parts.push(`\nRisk Flags: ${insightContent.risk_flags.join(', ')}`);
    }
    if (insightContent.regulation_notes) {
      parts.push(`\nRegulation Notes: ${insightContent.regulation_notes}`);
    }
    contentString = parts.length > 0 ? parts.join('\n') : 'Analysis complete. Review recommendations below.';
  } else {
    contentString = insightContent || 'No insights available';
  }
  
  return {
    id: data.insight?.id || data.id || Date.now(),
    type,
    content: contentString,
    summary,
    recommendations: recommendations.length > 0 ? recommendations : data.recommendations,
    createdAt: data.insight?.generatedAt || data.createdAt || new Date().toISOString(),
    cached: data.fromCache || data.cached || false
  };
}

/** Summary metrics for optimization plan */
export interface OptimizationPlanSummary {
  slotsFreed: number;
  consolidationWins: string;
  zonesOptimized: number;
  pickEfficiencyGain: string;
  itemsAffected: number;
  actionsGenerated: number;
  total_items_moved?: number;
  positions_freed?: number;
  items_consolidated?: number;
}

/** Individual action within an optimization plan */
export interface OptimizationPlanAction {
  id: number;
  plan_id: number;
  item_id: number;
  action_type: string;
  from_location: string | null;
  to_location: string | null;
  quantity: number;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  completed_by: number | null;
  completed_at: string | null;
  movement_notes: string | null;
  sequence: number;
}

/** Full optimization plan with optional actions */
export interface OptimizationPlan {
  id: number;
  site_id: number;
  user_id: number;
  parent_plan_id: number | null;
  name: string;
  algorithm: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  version: number;
  diff_patch: any[];
  summary: OptimizationPlanSummary;
  total_actions: number;
  completed_actions: number;
  comparison_context: any;
  target_completion_date: string | null;
  executed_at: string | null;
  executed_by: number | null;
  cancelled_at: string | null;
  cancelled_by: number | null;
  created_at: string;
  updated_at: string;
  actions?: OptimizationPlanAction[];
}

/** Data for creating a new optimization plan */
export interface CreatePlanData {
  name: string;
  algorithm: string;
  diff_patch: any[];
  summary: OptimizationPlanSummary;
  actions: Array<{
    item_id: number;
    action_type: string;
    from_location: string | null;
    to_location: string | null;
    quantity: number;
    sequence: number;
  }>;
}

/**
 * Fetch optimization plans for a site
 * @param siteId - Site ID
 * @param statuses - Optional array of status filters
 * @returns Array of optimization plans
 */
export async function getOptimizationPlans(
  siteId: number,
  statuses?: string[]
): Promise<OptimizationPlan[]> {
  const params = new URLSearchParams();
  if (statuses && statuses.length > 0) {
    params.set("status", statuses.join(","));
  }
  const queryString = params.toString();
  const url = `${API_BASE}/sites/${siteId}/optimization-plans${queryString ? `?${queryString}` : ""}`;
  
  const response = await fetch(url, {
    credentials: "include",
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to fetch optimization plans");
  }
  return response.json();
}

/**
 * Create a new optimization plan
 * @param siteId - Site ID
 * @param data - Plan creation data
 * @returns Created optimization plan
 */
export async function createOptimizationPlan(
  siteId: number,
  data: CreatePlanData
): Promise<OptimizationPlan> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/optimization-plans`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to create optimization plan");
  }
  return response.json();
}

/**
 * Fetch a single optimization plan by ID
 * @param planId - Plan ID
 * @returns Optimization plan with actions
 */
export async function getOptimizationPlan(planId: number): Promise<OptimizationPlan> {
  const response = await fetch(`${API_BASE}/optimization-plans/${planId}`, {
    credentials: "include",
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to fetch optimization plan");
  }
  return response.json();
}

/**
 * Execute an optimization plan
 * @param planId - Plan ID
 * @returns Updated optimization plan
 */
export async function executeOptimizationPlan(planId: number): Promise<OptimizationPlan> {
  const response = await fetch(`${API_BASE}/optimization-plans/${planId}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to execute optimization plan");
  }
  return response.json();
}

/**
 * Cancel an optimization plan
 * @param planId - Plan ID
 * @returns Updated optimization plan
 */
export async function cancelOptimizationPlan(planId: number): Promise<OptimizationPlan> {
  const response = await fetch(`${API_BASE}/optimization-plans/${planId}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to cancel optimization plan");
  }
  return response.json();
}

/**
 * Delete an optimization plan
 * @param planId - Plan ID
 * @returns Success response
 */
export async function deleteOptimizationPlan(planId: number): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE}/optimization-plans/${planId}`, {
    method: "DELETE",
    credentials: "include",
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to delete optimization plan");
  }
  return response.json();
}

/**
 * Update an optimization action status
 * @param planId - Plan ID
 * @param actionId - Action ID
 * @param data - Update data with status and optional notes
 * @returns Updated action
 */
export async function updateOptimizationAction(
  planId: number,
  actionId: number,
  data: { status: string; notes?: string }
): Promise<OptimizationPlanAction> {
  const response = await fetch(`${API_BASE}/optimization-plans/${planId}/actions/${actionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to update optimization action");
  }
  return response.json();
}

/**
 * Set target completion date for an optimization plan
 * @param planId - Plan ID
 * @param targetDate - Target completion date (ISO string) or null to clear
 * @returns Updated optimization plan
 */
export async function setOptimizationPlanTargetDate(
  planId: number,
  targetDate: string | null
): Promise<OptimizationPlan> {
  const response = await fetch(`${API_BASE}/optimization-plans/${planId}/target-date`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ target_completion_date: targetDate }),
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to set target completion date");
  }
  return response.json();
}

/** Result of starting all actions */
export interface StartAllResult {
  plan: OptimizationPlan;
  actions: OptimizationPlanAction[];
  started_count: number;
}

/**
 * Start all pending optimization actions at once
 * @param planId - Plan ID
 * @returns Updated plan with actions and count of started actions
 */
export async function startAllOptimizationActions(planId: number): Promise<StartAllResult> {
  const response = await fetch(`${API_BASE}/optimization-plans/${planId}/start-all`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to start all actions");
  }
  return response.json();
}

/** Zone capacity summary response */
export interface ZoneSummary {
  totalZones: number;
  totalCapacity: number;
  totalUsed: number;
  availableSpace: number;
  utilizationPercent: number;
  byType: {
    indoor: number;
    outdoor: number;
  };
  byUsage: Record<string, number>;
}

/** Zone capacity history entry */
export interface ZoneHistoryEntry {
  id: number;
  zone_id: number;
  site_id: number;
  item_count: number;
  total_weight_lbs: string;
  total_capacity: number;
  utilization_percent: string;
  snapshot_date: string;
  created_at: string;
}

/**
 * Fetch zone capacity summary for a site
 * @param siteId - Site ID
 * @returns Zone summary data
 */
export async function fetchZoneSummary(siteId: number): Promise<ZoneSummary> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/zones/summary`, {
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch zone summary");
  }
  return response.json();
}

/**
 * Trigger resync of zone capacities for a site
 * @param siteId - Site ID
 * @returns Resync result
 */
export async function resyncZones(siteId: number): Promise<{ success: boolean; zonesUpdated: number }> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/zones/resync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to resync zones");
  }
  return response.json();
}

/**
 * Update zone pallet position capacity
 * @param zoneId - Zone ID
 * @param capacity - Object with rack_available and bulk_available values
 * @returns Updated zone
 */
export async function updateZoneCapacity(
  zoneId: number,
  capacity: { rack_available: number; bulk_available: number }
): Promise<WarehouseZone> {
  const response = await fetch(`${API_BASE}/zones/${zoneId}/capacity`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(capacity),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to update zone capacity");
  }
  return response.json();
}

/**
 * Fetch capacity history for a zone
 * @param zoneId - Zone ID
 * @param startDate - Optional start date filter
 * @param endDate - Optional end date filter
 * @returns Array of history entries
 */
export async function fetchZoneHistory(
  zoneId: number,
  startDate?: string,
  endDate?: string
): Promise<ZoneHistoryEntry[]> {
  const params = new URLSearchParams();
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);
  const queryString = params.toString();
  const url = `${API_BASE}/zones/${zoneId}/history${queryString ? `?${queryString}` : ""}`;
  
  const response = await fetch(url, {
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch zone history");
  }
  return response.json();
}

/** Optimization event from API */
export interface OptimizationEvent {
  id: number;
  plan_id: number;
  user_id: number;
  event_type: string;
  payload: Record<string, any>;
  created_at: string;
  plan_name: string;
  plan_status: string;
  site_id: number;
  site_name: string;
  site_code: string;
  user_email: string | null;
}

/** Optimization events response */
export interface OptimizationEventsResponse {
  events: OptimizationEvent[];
  total: number;
  limit: number;
  offset: number;
}

/** Optimization events query filters */
export interface OptimizationEventsFilters {
  site_id?: number;
  plan_id?: number;
  event_type?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

/**
 * Fetch optimization events with optional filters
 * @param filters - Query filters
 * @returns Paginated optimization events
 */
export async function getOptimizationEvents(
  filters: OptimizationEventsFilters = {}
): Promise<OptimizationEventsResponse> {
  const params = new URLSearchParams();
  
  if (filters.site_id) params.set("site_id", filters.site_id.toString());
  if (filters.plan_id) params.set("plan_id", filters.plan_id.toString());
  if (filters.event_type) params.set("event_type", filters.event_type);
  if (filters.start_date) params.set("start_date", filters.start_date);
  if (filters.end_date) params.set("end_date", filters.end_date);
  if (filters.limit) params.set("limit", filters.limit.toString());
  if (filters.offset) params.set("offset", filters.offset.toString());
  
  const queryString = params.toString();
  const url = `${API_BASE}/optimization-events${queryString ? `?${queryString}` : ""}`;
  
  const response = await fetch(url, {
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch optimization events");
  }
  return response.json();
}

/** Warehouse alert from analytics */
export interface WarehouseAlert {
  id: number;
  site_id: number;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical';
  entity_type: string | null;
  entity_id: number | null;
  entity_name: string | null;
  message: string;
  metric_value: string | null;
  threshold_value: string | null;
  trend_change_percent: string | null;
  is_resolved: boolean;
  created_at: string;
}

/** Trend metric from analytics */
export interface TrendMetric {
  date: string;
  metricKey: string;
  value: number;
  zoneName?: string;
}

/**
 * Get alerts for a warehouse site
 * @param siteId - Site ID
 * @returns Array of warehouse alerts
 */
export async function getWarehouseAlerts(siteId: number): Promise<WarehouseAlert[]> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/alerts`, {
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch alerts");
  }
  return response.json();
}

/**
 * Resolve (dismiss) a warehouse alert
 * @param siteId - Site ID
 * @param alertId - Alert ID to resolve
 */
export async function resolveWarehouseAlert(siteId: number, alertId: number): Promise<void> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/alerts/${alertId}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to resolve alert");
  }
}

/**
 * Run warehouse analytics to generate alerts
 * @param siteId - Site ID
 */
export async function runWarehouseAnalytics(siteId: number): Promise<void> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/analytics/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to run analytics");
  }
}

/**
 * Get trend metrics for a warehouse site
 * @param siteId - Site ID
 * @returns Array of trend metrics
 */
export async function getWarehouseTrendMetrics(siteId: number): Promise<TrendMetric[]> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/analytics/trends`, {
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch trend metrics");
  }
  return response.json();
}

export interface WarehouseStateVersion {
  id: number;
  site_id: number;
  user_id: number;
  name: string;
  description: string | null;
  source_type: string;
  source_id: number | null;
  parent_version_id: number | null;
  items_affected: number;
  status: string;
  reverted_at: string | null;
  reverted_by: number | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface WarehouseItemVersion {
  id: number;
  version_id: number;
  item_id: number;
  requisition_no: string | null;
  from_location: string | null;
  to_location: string | null;
  from_zone_id: number | null;
  to_zone_id: number | null;
  raw_row_snapshot: any;
  created_at: string;
}

/**
 * Get version history for a warehouse site
 * @param siteId - Site ID
 * @returns Array of state versions
 */
export async function getWarehouseVersions(siteId: number): Promise<WarehouseStateVersion[]> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/versions`, {
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch version history");
  }
  const data = await response.json();
  return data.versions;
}

/**
 * Get version details with item changes
 * @param siteId - Site ID
 * @param versionId - Version ID
 * @returns Version with item changes
 */
export async function getWarehouseVersionDetails(siteId: number, versionId: number): Promise<{
  version: WarehouseStateVersion;
  itemChanges: WarehouseItemVersion[];
}> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/versions/${versionId}`, {
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch version details");
  }
  return response.json();
}

/**
 * Revert a warehouse version
 * @param siteId - Site ID
 * @param versionId - Version ID to revert
 * @returns Revert result
 */
export async function revertWarehouseVersion(siteId: number, versionId: number): Promise<{
  success: boolean;
  message: string;
  itemsReverted: number;
  totalItems: number;
  errors?: string[];
}> {
  const response = await fetch(`${API_BASE}/sites/${siteId}/versions/${versionId}/revert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to revert version");
  }
  return response.json();
}

export interface VehicleType {
  id: number;
  code: string;
  name: string;
  payload_capacity_lbs: number;
  max_volume_cuft?: number;
  category?: string;
}

export interface VehiclePrioritySetting {
  vehicle_type_id: number;
  enabled: boolean;
  priority: number;
  payload_override_lbs?: number | null;
}

export async function getVehicleTypes(): Promise<VehicleType[]> {
  const response = await fetch('/api/land/vehicle-types', { credentials: "include" });
  if (!response.ok) throw new Error("Failed to fetch vehicle types");
  return response.json();
}

export async function getVehiclePrioritySettings(): Promise<VehiclePrioritySetting[]> {
  const response = await fetch('/api/admin/vehicle-priorities', { credentials: "include" });
  if (!response.ok) throw new Error("Failed to fetch vehicle priorities");
  return response.json();
}

export async function saveVehiclePrioritySettings(settings: VehiclePrioritySetting[]): Promise<{ success: boolean; message: string }> {
  const response = await fetch('/api/admin/vehicle-priorities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: "include",
    body: JSON.stringify({ priorities: settings })
  });
  if (!response.ok) throw new Error("Failed to save vehicle priorities");
  return response.json();
}
