/**
 * Warehouse Management System
 * Main orchestration component that coordinates all WMS modules
 */

import React, { useState, useCallback, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Warehouse,
  Package,
  AlertTriangle,
  ArrowRightLeft,
  LayoutDashboard,
  Building2,
  Brain,
  Settings,
} from "lucide-react";
import { User } from "../../hooks/useAuth";
import {
  WMSDashboard,
  WMSInventory,
  WMSOperations,
  WMSSitesStorage,
  WMSAiInsights,
  WMSAdmin,
  Toast,
  AddSiteModal,
  AddItemModal,
  CsvUploadModal,
  TransferModal,
} from "../warehouse";
import type { WMSTab, WarehouseSite, InventoryItem, Transfer, ToastMessage } from "../warehouse/types";
import * as warehouseService from "../../services/warehouseService";

interface WarehouseManagementProps {
  user: User;
  onBack: () => void;
  onLogout: () => void;
}

/**
 * Main Warehouse Management component
 * Coordinates all WMS modules and manages global state
 */
export default function WarehouseManagement({
  user,
  onBack,
  onLogout,
}: WarehouseManagementProps) {
  const [activeTab, setActiveTab] = useState<WMSTab>("dashboard");
  const [sites, setSites] = useState<WarehouseSite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [transfersLoading, setTransfersLoading] = useState(false);
  const [addSiteOpen, setAddSiteOpen] = useState(false);
  const [csvUploadOpen, setCsvUploadOpen] = useState(false);
  const [transferFormOpen, setTransferFormOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((message: string, type: ToastMessage["type"] = "info") => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

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

  const fetchTransfers = useCallback(async () => {
    setTransfersLoading(true);
    try {
      const data = await warehouseService.fetchTransfers();
      setTransfers(data);
    } catch (err) {
      console.error("Failed to fetch transfers:", err);
    } finally {
      setTransfersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSites();
    fetchTransfers();
  }, [fetchSites, fetchTransfers]);

  const fetchInventory = useCallback(async (siteId: number) => {
    setInventoryLoading(true);
    try {
      const data = await warehouseService.fetchInventory(siteId);
      setInventory(data);
    } catch (err) {
      console.error("Failed to fetch inventory:", err);
      setInventory([]);
    } finally {
      setInventoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSiteId) {
      fetchInventory(selectedSiteId);
    } else {
      setInventory([]);
    }
  }, [selectedSiteId, fetchInventory]);

  const tabs: { id: WMSTab; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: "inventory", label: "Inventory", icon: <Package className="w-4 h-4" /> },
    { id: "operations", label: "Operations", icon: <ArrowRightLeft className="w-4 h-4" /> },
    { id: "sites", label: "Sites & Storage", icon: <Building2 className="w-4 h-4" /> },
    { id: "ai-insights", label: "AI Insights", icon: <Brain className="w-4 h-4" /> },
    { id: "admin", label: "Admin", icon: <Settings className="w-4 h-4" /> },
  ];

  const totalItems = sites.reduce((acc, site) => acc + (site.item_count || 0), 0);
  const activeTransfers = transfers.filter((t) => t.status === "in_transit" || t.status === "pending").length;

  const handleOpenCsvUpload = useCallback(() => {
    if (sites.length > 0 && !selectedSiteId) {
      setSelectedSiteId(sites[0].id);
    }
    if (sites.length === 0) {
      showToast("Please add a warehouse site first", "warning");
      return;
    }
    setCsvUploadOpen(true);
  }, [sites, selectedSiteId, showToast]);

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#111827]">
      <header className="sticky top-0 z-50 bg-white border-b border-[#E5E7EB] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="flex items-center gap-2 text-sm text-[#6B7280] hover:text-[#111827] transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back to Hub</span>
              </button>
              <div className="h-6 w-px bg-[#E5E7EB]" />
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-purple-600">
                  <Warehouse className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-[#111827]">MSC Warehouse Optimization</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-[#6B7280] hidden sm:block">
                {user.username || user.email}
              </span>
              <button
                onClick={onLogout}
                className="text-sm text-[#6B7280] hover:text-[#111827] transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="border-b border-[#E5E7EB] bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1 overflow-x-auto py-2 hide-scrollbar">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? "bg-purple-600 text-white shadow-sm"
                    : "text-[#6B7280] hover:text-[#111827] hover:bg-[#FAFAFA]"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="mb-4 p-4 rounded-2xl bg-red-50 border border-red-200 text-[#DC2626] flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            {error}
          </div>
        )}

        {activeTab === "dashboard" && (
          <WMSDashboard
            sites={sites}
            loading={loading}
            totalItems={totalItems}
            activeTransfers={activeTransfers}
            transfers={transfers}
            onAddSite={() => setAddSiteOpen(true)}
            onRefresh={fetchSites}
            onTabChange={setActiveTab}
            onShowToast={showToast}
            onOpenCsvUpload={handleOpenCsvUpload}
          />
        )}

        {activeTab === "inventory" && (
          <WMSInventory
            sites={sites}
            selectedSiteId={selectedSiteId}
            onSelectSite={setSelectedSiteId}
            inventory={inventory}
            loading={inventoryLoading}
            onOpenCsvUpload={() => setCsvUploadOpen(true)}
            onOpenAddItem={() => setAddItemOpen(true)}
            onRefresh={() => selectedSiteId && fetchInventory(selectedSiteId)}
            onShowToast={showToast}
          />
        )}

        {activeTab === "operations" && (
          <WMSOperations
            sites={sites}
            transfers={transfers}
            loading={transfersLoading}
            onOpenTransferForm={() => setTransferFormOpen(true)}
            onRefresh={fetchTransfers}
            onShowToast={showToast}
          />
        )}

        {activeTab === "sites" && (
          <WMSSitesStorage
            sites={sites}
            loading={loading}
            onAddSite={() => setAddSiteOpen(true)}
            onRefresh={fetchSites}
            onShowToast={showToast}
          />
        )}

        {activeTab === "ai-insights" && (
          <WMSAiInsights
            sites={sites}
            selectedSiteId={selectedSiteId}
            onSelectSite={setSelectedSiteId}
            onShowToast={showToast}
          />
        )}

        {activeTab === "admin" && (
          <WMSAdmin
            sites={sites}
            selectedSiteId={selectedSiteId}
            onSelectSite={setSelectedSiteId}
            onOpenCsvUpload={() => setCsvUploadOpen(true)}
            onShowToast={showToast}
          />
        )}
      </main>

      {addSiteOpen && (
        <AddSiteModal
          onClose={() => setAddSiteOpen(false)}
          onSuccess={() => {
            setAddSiteOpen(false);
            fetchSites();
            showToast("Warehouse site created successfully!", "success");
          }}
        />
      )}

      {csvUploadOpen && selectedSiteId && (
        <CsvUploadModal
          siteId={selectedSiteId}
          onClose={() => setCsvUploadOpen(false)}
          onSuccess={() => {
            setCsvUploadOpen(false);
            fetchInventory(selectedSiteId);
            showToast("Inventory imported successfully!", "success");
          }}
        />
      )}

      {transferFormOpen && (
        <TransferModal
          sites={sites}
          onClose={() => setTransferFormOpen(false)}
          onSuccess={() => {
            setTransferFormOpen(false);
            fetchTransfers();
            showToast("Transfer created successfully!", "success");
          }}
        />
      )}

      {addItemOpen && (
        <AddItemModal
          siteId={selectedSiteId}
          sites={sites}
          onClose={() => setAddItemOpen(false)}
          onSuccess={() => {
            setAddItemOpen(false);
            if (selectedSiteId) {
              fetchInventory(selectedSiteId);
            }
            showToast("Inventory item added successfully!", "success");
          }}
          onSelectSite={setSelectedSiteId}
        />
      )}

      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <Toast
              key={toast.id}
              message={toast.message}
              type={toast.type}
              onDismiss={() => dismissToast(toast.id)}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
