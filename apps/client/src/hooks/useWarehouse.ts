/**
 * Custom hooks for Warehouse Management System state management
 */

import { useState, useEffect, useCallback } from "react";
import type { WarehouseSite, InventoryItem, Transfer, ToastMessage } from "../components/warehouse/types";
import * as warehouseService from "../services/warehouseService";

/**
 * Hook for managing warehouse sites data
 */
export function useWarehouseSites() {
  const [sites, setSites] = useState<WarehouseSite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSites = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await warehouseService.fetchSites();
      setSites(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch sites");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  return { sites, loading, error, refetch: fetchSites };
}

/**
 * Hook for managing inventory data for a specific site
 */
export function useWarehouseInventory(siteId: number | null) {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchInventory = useCallback(async (id: number) => {
    setLoading(true);
    try {
      const data = await warehouseService.fetchInventory(id);
      setInventory(data);
    } catch (err) {
      console.error("Failed to fetch inventory:", err);
      setInventory([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (siteId) {
      fetchInventory(siteId);
    } else {
      setInventory([]);
    }
  }, [siteId, fetchInventory]);

  const refetch = useCallback(() => {
    if (siteId) {
      fetchInventory(siteId);
    }
  }, [siteId, fetchInventory]);

  return { inventory, loading, refetch };
}

/**
 * Hook for managing transfers data
 */
export function useWarehouseTransfers() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTransfers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await warehouseService.fetchTransfers();
      setTransfers(data);
    } catch (err) {
      console.error("Failed to fetch transfers:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransfers();
  }, [fetchTransfers]);

  return { transfers, loading, refetch: fetchTransfers };
}

/**
 * Hook for managing toast notifications
 */
export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((message: string, type: ToastMessage["type"] = "info") => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, showToast, dismissToast };
}

/**
 * Combined hook for complete warehouse state management
 */
export function useWarehouse() {
  const { sites, loading: sitesLoading, error, refetch: refetchSites } = useWarehouseSites();
  const { transfers, loading: transfersLoading, refetch: refetchTransfers } = useWarehouseTransfers();
  const { toasts, showToast, dismissToast } = useToast();
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const { inventory, loading: inventoryLoading, refetch: refetchInventory } = useWarehouseInventory(selectedSiteId);

  const totalItems = sites.reduce((acc, site) => acc + (site.item_count || 0), 0);
  const activeTransfers = transfers.filter(
    (t) => t.status === "in_transit" || t.status === "pending"
  ).length;

  return {
    sites,
    sitesLoading,
    error,
    refetchSites,
    selectedSiteId,
    setSelectedSiteId,
    inventory,
    inventoryLoading,
    refetchInventory,
    transfers,
    transfersLoading,
    refetchTransfers,
    toasts,
    showToast,
    dismissToast,
    totalItems,
    activeTransfers,
  };
}
