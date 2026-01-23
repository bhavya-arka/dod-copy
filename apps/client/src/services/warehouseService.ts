/**
 * Warehouse Management System API Service
 * Handles all API calls for warehouse endpoints
 */

import { api, ApiError } from "../lib/queryClient";
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

export { ApiError };

/**
 * Fetch all warehouse sites
 * @returns Array of warehouse sites
 */
export async function fetchSites(): Promise<WarehouseSite[]> {
  return api.get<WarehouseSite[]>(`${API_BASE}/sites`);
}

/**
 * Fetch buildings for a specific site
 * @param siteId - Site ID
 * @returns Array of buildings with capacity info
 */
export async function getSiteBuildings(siteId: number): Promise<WarehouseBuilding[]> {
  return api.get<WarehouseBuilding[]>(`${API_BASE}/sites/${siteId}/buildings`);
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
  return api.post<WarehouseBuilding>(`${API_BASE}/sites/${siteId}/buildings`, data);
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
  return api.put<WarehouseBuilding>(`${API_BASE}/sites/${siteId}/buildings/${buildingId}`, data);
}

export async function deleteBuilding(siteId: number, buildingId: number): Promise<void> {
  return api.delete(`${API_BASE}/sites/${siteId}/buildings/${buildingId}`);
}

/**
 * Fetch zones for a specific site
 * @param siteId - Site ID
 * @returns Array of zones
 */
export async function fetchSiteZones(siteId: number): Promise<WarehouseZone[]> {
  return api.get<WarehouseZone[]>(`${API_BASE}/sites/${siteId}/zones`);
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
  return api.post<WarehouseZone>(`${API_BASE}/sites/${data.site_id}/zones`, data);
}

/**
 * Delete a zone
 * @param siteId - Site ID
 * @param zoneId - Zone ID to delete
 */
export async function deleteZone(siteId: number, zoneId: number): Promise<void> {
  return api.delete(`${API_BASE}/sites/${siteId}/zones/${zoneId}`);
}

/**
 * Seed default zones for a site (San Diego template)
 * @param siteId - Site ID
 * @returns Count of seeded zones
 */
export async function seedDefaultZones(siteId: number): Promise<{ count: number }> {
  return api.post<{ count: number }>(`${API_BASE}/sites/${siteId}/zones/seed`, {});
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
  return api.post<WarehouseSite>(`${API_BASE}/sites`, data);
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

  return api.get<PaginatedInventoryResponse>(url);
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
  return api.post<InventoryItem>(`${API_BASE}/sites/${siteId}/inventory`, data);
}

/**
 * Upload CSV inventory data to a site
 * @param siteId - Site ID
 * @param csvContent - CSV content string
 */
export async function uploadInventoryCsv(siteId: number, csvContent: string): Promise<void> {
  await api.post(`${API_BASE}/sites/${siteId}/inventory/upload`, { csv_content: csvContent });
}

/**
 * Fetch all transfers
 * @returns Array of transfers
 */
export async function fetchTransfers(): Promise<Transfer[]> {
  return api.get<Transfer[]>(`${API_BASE}/transfers`);
}

/**
 * Preview vehicle allocation for transfer items
 * @param itemIds - Array of inventory item IDs
 * @param siteId - Source site ID
 * @returns Vehicle allocation preview
 */
export async function previewTransferVehicles(itemIds: number[], siteId: number) {
  return api.post(`${API_BASE}/transfers/preview-vehicles`, { item_ids: itemIds, site_id: siteId });
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
  return api.post<MultiModalRoute>("/api/routing/plan-multi-modal", {
    sourceSiteId,
    destinationSiteId,
    cargoWeightLbs,
  });
}

/**
 * Create a new transfer order with item selection and optional air transport metadata
 * @param data - Transfer creation data
 * @returns Created transfer
 */
export async function createTransfer(data: CreateTransferPayload): Promise<Transfer> {
  return api.post<Transfer>(`${API_BASE}/transfers`, data);
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
  return api.patch<{ message: string; transfer_id: number; status: string }>(
    `${API_BASE}/transfers/${transferId}/status`,
    { status }
  );
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
  return api.put<Transfer>(`${API_BASE}/transfers/${transferId}`, data);
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
  const data = await api.get<any>(`${API_BASE}/sites/${siteId}/optimization`);
  
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
  return api.post<FileCommitResult>(
    `${API_BASE}/sites/${siteId}/inventory/import/commit`,
    { uploadId }
  );
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
  return api.get(`${API_BASE}/sites/${siteId}/deletion-preview`);
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
  return api.put<{ success: boolean; message: string; item: InventoryItem }>(
    `${API_BASE}/sites/${siteId}/inventory/${itemId}/move`,
    data
  );
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
  return api.put<{ success: boolean; message: string; itemsMoved: number }>(
    `${API_BASE}/sites/${siteId}/inventory/bulk-move-zone`,
    {
      item_ids: itemIds,
      target_zone_id: targetZoneId,
      notes,
    }
  );
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
  return api.post<OptimizationWizardResult>(
    `${API_BASE}/sites/${siteId}/optimize`,
    { algorithm, params }
  );
}

/**
 * Get pending optimization actions for a site
 */
export async function getPendingOptimizationActions(siteId: number): Promise<OptimizationAction[]> {
  return api.get<OptimizationAction[]>(`${API_BASE}/sites/${siteId}/optimization/actions`);
}

/**
 * Mark an optimization action as complete
 */
export async function completeOptimizationAction(
  siteId: number,
  actionId: string
): Promise<{ success: boolean; message: string }> {
  return api.post<{ success: boolean; message: string }>(
    `${API_BASE}/sites/${siteId}/optimization/actions/${actionId}/complete`,
    {}
  );
}

/**
 * Skip an optimization action
 */
export async function skipOptimizationAction(
  siteId: number,
  actionId: string,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  return api.post<{ success: boolean; message: string }>(
    `${API_BASE}/sites/${siteId}/optimization/actions/${actionId}/skip`,
    { reason }
  );
}

/**
 * Get zone summary with item counts and capacity utilization
 */
export async function fetchZoneSummary(siteId: number): Promise<{
  zones: Array<{
    id: number;
    code: string;
    name: string;
    itemCount: number;
    totalWeight: number;
    bulkUsed: number;
    bulkAvailable: number;
    rackUsed: number;
    rackAvailable: number;
    utilizationPercent: number;
  }>;
}> {
  return api.get(`${API_BASE}/sites/${siteId}/zones/summary`);
}

/**
 * Update zone capacity settings
 */
export async function updateZoneCapacity(
  siteId: number,
  zoneId: number,
  data: {
    bulk_available?: number;
    rack_available?: number;
  }
): Promise<WarehouseZone> {
  return api.put<WarehouseZone>(
    `${API_BASE}/sites/${siteId}/zones/${zoneId}/capacity`,
    data
  );
}

/**
 * Get history log for a site
 */
export async function fetchSiteHistory(
  siteId: number,
  params?: { limit?: number; offset?: number }
): Promise<{
  logs: Array<{
    id: number;
    action: string;
    entity_type: string;
    entity_id: number;
    details: any;
    created_at: string;
    user_id?: number;
  }>;
  total: number;
}> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.offset) searchParams.set("offset", params.offset.toString());
  
  const queryString = searchParams.toString();
  const url = `${API_BASE}/sites/${siteId}/history${queryString ? `?${queryString}` : ""}`;
  
  return api.get(url);
}

/**
 * Get analytics data for a site
 */
export async function fetchSiteAnalytics(siteId: number): Promise<{
  inventory: {
    totalItems: number;
    totalValue: number;
    totalWeight: number;
    itemsByCategory: Record<string, number>;
    valueByCategory: Record<string, number>;
  };
  zones: {
    utilizationByZone: Array<{ zone: string; utilization: number }>;
    itemsByZone: Array<{ zone: string; count: number }>;
  };
  aging: {
    fresh: number;
    moderate: number;
    aging: number;
    critical: number;
  };
  trends: {
    inbound: number[];
    outbound: number[];
    dates: string[];
  };
}> {
  return api.get(`${API_BASE}/sites/${siteId}/analytics`);
}

/**
 * Get AI-powered insights for a site
 */
export async function fetchAiInsights(siteId: number): Promise<{
  insights: Array<{
    id: string;
    type: 'optimization' | 'warning' | 'trend' | 'recommendation';
    title: string;
    description: string;
    impact: 'high' | 'medium' | 'low';
    actionable: boolean;
    suggestedAction?: string;
  }>;
  generatedAt: string;
}> {
  return api.get(`${API_BASE}/sites/${siteId}/ai-insights`);
}

/**
 * Get system settings for warehouse
 */
export async function getWarehouseSettings(): Promise<{
  agingThresholds: {
    fresh: number;
    moderate: number;
    aging: number;
  };
  vehiclePriorities: Array<{ code: string; priority: number }>;
  defaultZoneCapacity: {
    bulk: number;
    rack: number;
  };
}> {
  return api.get(`${API_BASE}/settings`);
}

/**
 * Update warehouse system settings
 */
export async function updateWarehouseSettings(settings: {
  agingThresholds?: {
    fresh: number;
    moderate: number;
    aging: number;
  };
  vehiclePriorities?: Array<{ code: string; priority: number }>;
  defaultZoneCapacity?: {
    bulk: number;
    rack: number;
  };
}): Promise<{ success: boolean }> {
  return api.put(`${API_BASE}/settings`, settings);
}

export async function runAllOptimizations(
  siteId: number,
  params: Record<string, any>
): Promise<OptimizationWizardResult> {
  return api.post<OptimizationWizardResult>(
    `${API_BASE}/sites/${siteId}/optimize/run-all`,
    { params }
  );
}

export async function applyOptimizationPlan(
  siteId: number,
  runId: number
): Promise<{ success: boolean; message: string; actionsApplied: number }> {
  return api.post<{ success: boolean; message: string; actionsApplied: number }>(
    `${API_BASE}/sites/${siteId}/optimize/${runId}/apply`,
    {}
  );
}

export interface InventoryColumnDefinition {
  key: string;
  label: string;
  sortable: boolean;
  align: "left" | "right" | "center";
  width?: string;
  defaultVisible: boolean;
  category: "identification" | "logistics" | "financial" | "tracking" | "metadata";
}

export async function fetchInventoryColumns(): Promise<{
  columns: InventoryColumnDefinition[];
  version: number;
}> {
  return api.get(`${API_BASE}/inventory-columns`);
}

export type WarehouseInsightType = 
  | 'warehouse_optimization' 
  | 'inventory_analysis' 
  | 'storage_efficiency'
  | 'mission_readiness';

export interface WarehouseAiInsight {
  id: number;
  type: WarehouseInsightType;
  content: string;
  summary?: string;
  recommendations?: string[];
  createdAt: string;
  cached: boolean;
}

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
  
  const insightContent = data.insight?.content || data.content;
  let contentString: string;
  let recommendations: string[] = [];
  let summary: string | undefined;
  
  if (typeof insightContent === 'object' && insightContent !== null) {
    summary = insightContent.summary || '';
    recommendations = insightContent.optimization_suggestions || insightContent.recommendations || [];
    
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
  return api.get<OptimizationPlan[]>(url);
}

export async function createOptimizationPlan(
  siteId: number,
  data: CreatePlanData
): Promise<OptimizationPlan> {
  return api.post<OptimizationPlan>(`${API_BASE}/sites/${siteId}/optimization-plans`, data);
}

export async function getOptimizationPlan(planId: number): Promise<OptimizationPlan> {
  return api.get<OptimizationPlan>(`${API_BASE}/optimization-plans/${planId}`);
}

export async function executeOptimizationPlan(planId: number): Promise<OptimizationPlan> {
  return api.post<OptimizationPlan>(`${API_BASE}/optimization-plans/${planId}/execute`, {});
}

export async function cancelOptimizationPlan(planId: number): Promise<OptimizationPlan> {
  return api.post<OptimizationPlan>(`${API_BASE}/optimization-plans/${planId}/cancel`, {});
}

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

export async function updateOptimizationAction(
  planId: number,
  actionId: number,
  data: { status: string; notes?: string }
): Promise<OptimizationPlanAction> {
  return api.patch<OptimizationPlanAction>(
    `${API_BASE}/optimization-plans/${planId}/actions/${actionId}`,
    data
  );
}

export async function setOptimizationPlanTargetDate(
  planId: number,
  targetDate: string | null
): Promise<OptimizationPlan> {
  return api.patch<OptimizationPlan>(
    `${API_BASE}/optimization-plans/${planId}/target-date`,
    { target_completion_date: targetDate }
  );
}

export interface StartAllResult {
  plan: OptimizationPlan;
  actions: OptimizationPlanAction[];
  started_count: number;
}

export async function startAllOptimizationActions(planId: number): Promise<StartAllResult> {
  return api.post<StartAllResult>(`${API_BASE}/optimization-plans/${planId}/start-all`, {});
}

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

export async function resyncZones(siteId: number): Promise<{ success: boolean; zonesUpdated: number }> {
  return api.post<{ success: boolean; zonesUpdated: number }>(
    `${API_BASE}/sites/${siteId}/zones/resync`,
    {}
  );
}

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
  return api.get<ZoneHistoryEntry[]>(url);
}

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

export interface OptimizationEventsResponse {
  events: OptimizationEvent[];
  total: number;
  limit: number;
  offset: number;
}

export interface OptimizationEventsFilters {
  site_id?: number;
  plan_id?: number;
  event_type?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

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
  return api.get<OptimizationEventsResponse>(url);
}

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

export interface TrendMetric {
  date: string;
  metricKey: string;
  value: number;
  zoneName?: string;
}

export async function getWarehouseAlerts(siteId: number): Promise<WarehouseAlert[]> {
  return api.get<WarehouseAlert[]>(`${API_BASE}/sites/${siteId}/alerts`);
}

export async function resolveWarehouseAlert(siteId: number, alertId: number): Promise<void> {
  await api.post(`${API_BASE}/sites/${siteId}/alerts/${alertId}/resolve`, {});
}

export async function runWarehouseAnalytics(siteId: number): Promise<void> {
  await api.post(`${API_BASE}/sites/${siteId}/analytics/run`, {});
}

export async function getWarehouseTrendMetrics(siteId: number): Promise<TrendMetric[]> {
  return api.get<TrendMetric[]>(`${API_BASE}/sites/${siteId}/analytics/trends`);
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

export async function getWarehouseVersions(siteId: number): Promise<WarehouseStateVersion[]> {
  const data = await api.get<{ versions: WarehouseStateVersion[] }>(`${API_BASE}/sites/${siteId}/versions`);
  return data.versions;
}

export async function getWarehouseVersionDetails(siteId: number, versionId: number): Promise<{
  version: WarehouseStateVersion;
  itemChanges: WarehouseItemVersion[];
}> {
  return api.get(`${API_BASE}/sites/${siteId}/versions/${versionId}`);
}

export async function revertWarehouseVersion(siteId: number, versionId: number): Promise<{
  success: boolean;
  message: string;
}> {
  return api.post(`${API_BASE}/sites/${siteId}/versions/${versionId}/revert`, {});
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
  return api.get<VehicleType[]>('/api/land/vehicle-types');
}

export async function getVehiclePrioritySettings(): Promise<VehiclePrioritySetting[]> {
  return api.get<VehiclePrioritySetting[]>('/api/admin/vehicle-priorities');
}

export async function saveVehiclePrioritySettings(settings: VehiclePrioritySetting[]): Promise<{ success: boolean; message: string }> {
  return api.post<{ success: boolean; message: string }>(
    '/api/admin/vehicle-priorities',
    { priorities: settings }
  );
}
