import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Warehouse,
  Package,
  MapPin,
  AlertTriangle,
  BarChart3,
  Plus,
  Search,
  Filter,
  Box,
  Layers,
  Clock,
  TrendingUp,
  Settings,
  Upload,
  Download,
  ArrowRightLeft,
  X,
  Loader2,
  Plane,
  Truck,
  Ship,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { User } from "../../hooks/useAuth";

interface WarehouseManagementProps {
  user: User;
  onBack: () => void;
  onLogout: () => void;
}

type WMSTab = "overview" | "inventory" | "locations" | "transfers" | "analytics";

interface WarehouseSite {
  id: number;
  code: string;
  name: string;
  address?: string;
  city?: string;
  country?: string;
  active: boolean;
  item_count?: number;
}

interface InventoryItem {
  id: number;
  requisition_no: string;
  description?: string;
  quantity: number;
  unit_price?: string;
  length_in?: string;
  width_in?: string;
  height_in?: string;
  weight_lb?: string;
}

interface Transfer {
  id: number;
  source_site_id: number;
  destination_site_id: number;
  status: string;
  transport_mode: string;
  items: string;
  notes?: string;
  created_at: string;
}

interface OptimizationResult {
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

export default function WarehouseManagement({
  user,
  onBack,
  onLogout,
}: WarehouseManagementProps) {
  const [activeTab, setActiveTab] = useState<WMSTab>("overview");
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
  const [error, setError] = useState<string | null>(null);

  const fetchSites = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/warehouse/sites", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch sites");
      const data = await response.json();
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
      const response = await fetch("/api/warehouse/transfers", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch transfers");
      const data = await response.json();
      setTransfers(data);
    } catch (err) {
      console.error("Failed to fetch transfers:", err);
    } finally {
      setTransfersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  useEffect(() => {
    if (activeTab === "transfers") {
      fetchTransfers();
    }
  }, [activeTab, fetchTransfers]);

  const fetchInventory = useCallback(async (siteId: number) => {
    setInventoryLoading(true);
    try {
      const response = await fetch(`/api/warehouse/sites/${siteId}/inventory`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch inventory");
      const data = await response.json();
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
    { id: "overview", label: "Overview", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "inventory", label: "Inventory", icon: <Package className="w-4 h-4" /> },
    { id: "locations", label: "Locations", icon: <MapPin className="w-4 h-4" /> },
    { id: "transfers", label: "Transfers", icon: <ArrowRightLeft className="w-4 h-4" /> },
    { id: "analytics", label: "Analytics", icon: <TrendingUp className="w-4 h-4" /> },
  ];

  const totalItems = sites.reduce((acc, site) => acc + (site.item_count || 0), 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-border shadow-subtle">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back to Hub</span>
              </button>
              <div className="h-6 w-px bg-border" />
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-accent">
                  <Warehouse className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-foreground">Warehouse Management</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground hidden sm:block">
                {user.username || user.email}
              </span>
              <button
                onClick={onLogout}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="border-b border-border bg-white/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1 overflow-x-auto py-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "bg-accent text-white"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            {error}
          </div>
        )}
        {activeTab === "overview" && (
          <OverviewTab
            sites={sites}
            loading={loading}
            totalItems={totalItems}
            onAddSite={() => setAddSiteOpen(true)}
            onRefresh={fetchSites}
          />
        )}
        {activeTab === "inventory" && (
          <InventoryTab
            sites={sites}
            selectedSiteId={selectedSiteId}
            onSelectSite={setSelectedSiteId}
            inventory={inventory}
            loading={inventoryLoading}
            onOpenCsvUpload={() => setCsvUploadOpen(true)}
            onRefresh={() => selectedSiteId && fetchInventory(selectedSiteId)}
          />
        )}
        {activeTab === "locations" && <LocationsTab />}
        {activeTab === "transfers" && (
          <TransfersTab
            sites={sites}
            transfers={transfers}
            loading={transfersLoading}
            onOpenTransferForm={() => setTransferFormOpen(true)}
            onRefresh={fetchTransfers}
          />
        )}
        {activeTab === "analytics" && (
          <AnalyticsTab
            sites={sites}
            selectedSiteId={selectedSiteId}
            onSelectSite={setSelectedSiteId}
          />
        )}
      </main>

      {addSiteOpen && (
        <AddSiteModal
          onClose={() => setAddSiteOpen(false)}
          onSuccess={() => {
            setAddSiteOpen(false);
            fetchSites();
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
          }}
        />
      )}

      {transferFormOpen && (
        <TransferFormModal
          sites={sites}
          onClose={() => setTransferFormOpen(false)}
          onSuccess={() => {
            setTransferFormOpen(false);
            fetchTransfers();
          }}
        />
      )}
    </div>
  );
}

interface OverviewTabProps {
  sites: WarehouseSite[];
  loading: boolean;
  totalItems: number;
  onAddSite: () => void;
  onRefresh: () => void;
}

function OverviewTab({ sites, loading, totalItems, onAddSite, onRefresh }: OverviewTabProps) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
          Warehouse Overview
        </h1>
        <p className="text-muted-foreground">
          Multi-site inventory management and capacity monitoring
        </p>
      </motion.div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Sites", value: sites.length.toString(), icon: Warehouse, color: "text-accent" },
          { label: "Total Items", value: totalItems.toString(), icon: Package, color: "text-blue-500" },
          { label: "Capacity Used", value: "0%", icon: Box, color: "text-green-500" },
          { label: "Aging Alerts", value: "0", icon: AlertTriangle, color: "text-amber-500" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="p-4 rounded-2xl bg-card border border-border shadow-subtle"
          >
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl bg-card border border-border shadow-subtle p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Sites</h2>
            <button
              onClick={onAddSite}
              className="btn-primary text-sm px-3 py-1.5 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Site
            </button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
            </div>
          ) : sites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Warehouse className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-center">No warehouse sites configured</p>
              <p className="text-sm text-muted-foreground/70">Add your first site to begin</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {sites.map((site) => (
                <div
                  key={site.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${site.active ? "bg-green-500" : "bg-gray-400"}`} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{site.name}</p>
                      <p className="text-xs text-muted-foreground">{site.code}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">{site.item_count || 0}</p>
                    <p className="text-xs text-muted-foreground">items</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl bg-card border border-border shadow-subtle p-6"
        >
          <h2 className="text-lg font-semibold text-foreground mb-4">Aging Alerts</h2>
          <div className="space-y-3">
            {[
              { years: "7+", label: "Critical", color: "bg-red-500", count: 0 },
              { years: "5-7", label: "Warning", color: "bg-amber-500", count: 0 },
              { years: "3-5", label: "Monitor", color: "bg-yellow-500", count: 0 },
            ].map((alert) => (
              <div
                key={alert.years}
                className="flex items-center justify-between p-3 rounded-xl bg-muted"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${alert.color}`} />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {alert.years} years old
                    </p>
                    <p className="text-xs text-muted-foreground">{alert.label}</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-foreground">{alert.count}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="rounded-2xl bg-card border border-border shadow-subtle p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Quick Actions</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: Upload, label: "Import Inventory", desc: "CSV upload" },
            { icon: Download, label: "Export Data", desc: "Generate reports" },
            { icon: Layers, label: "Optimize Placement", desc: "AI recommendations" },
            { icon: Settings, label: "Configure", desc: "Site settings" },
          ].map((action) => (
            <button
              key={action.label}
              className="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-muted transition-colors text-center group"
            >
              <div className="p-3 rounded-lg bg-muted group-hover:bg-accent-soft">
                <action.icon className="w-5 h-5 text-muted-foreground group-hover:text-accent" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{action.label}</p>
                <p className="text-xs text-muted-foreground">{action.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </motion.div>
    </>
  );
}

interface InventoryTabProps {
  sites: WarehouseSite[];
  selectedSiteId: number | null;
  onSelectSite: (id: number | null) => void;
  inventory: InventoryItem[];
  loading: boolean;
  onOpenCsvUpload: () => void;
  onRefresh: () => void;
}

function InventoryTab({
  sites,
  selectedSiteId,
  onSelectSite,
  inventory,
  loading,
  onOpenCsvUpload,
  onRefresh,
}: InventoryTabProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredInventory = inventory.filter((item) =>
    item.requisition_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Inventory</h1>
            <p className="text-muted-foreground">Track and manage warehouse inventory</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenCsvUpload}
              disabled={!selectedSiteId}
              className="btn-secondary text-sm px-3 py-2 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload className="w-4 h-4" />
              Import
            </button>
            <button className="btn-primary text-sm px-3 py-2 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add Item
            </button>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl bg-card border border-border shadow-subtle p-6"
      >
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <select
            value={selectedSiteId || ""}
            onChange={(e) => onSelectSite(e.target.value ? Number(e.target.value) : null)}
            className="px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40"
          >
            <option value="">Select warehouse site...</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name} ({site.code})
              </option>
            ))}
          </select>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search inventory..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-muted border border-border text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40"
            />
          </div>
          <button className="btn-secondary text-sm px-3 py-2 flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filter
          </button>
        </div>

        {!selectedSiteId ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Warehouse className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg mb-2">Select a warehouse site</p>
            <p className="text-sm text-muted-foreground/70 text-center max-w-md">
              Choose a warehouse site from the dropdown above to view its inventory.
            </p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
          </div>
        ) : filteredInventory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Package className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg mb-2">No inventory items</p>
            <p className="text-sm text-muted-foreground/70 text-center max-w-md">
              Import your inventory data via CSV or add items manually to start
              tracking warehouse contents.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Requisition No</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Description</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Dimensions (L×W×H)</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Qty</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Unit Price</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map((item) => (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-muted/50">
                    <td className="py-3 px-4 font-medium text-foreground">{item.requisition_no}</td>
                    <td className="py-3 px-4 text-muted-foreground">{item.description || "-"}</td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {item.length_in && item.width_in && item.height_in
                        ? `${item.length_in}×${item.width_in}×${item.height_in}"`
                        : "-"}
                    </td>
                    <td className="py-3 px-4 text-right text-foreground">{item.quantity}</td>
                    <td className="py-3 px-4 text-right text-foreground">
                      {item.unit_price ? `$${parseFloat(item.unit_price).toFixed(2)}` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </>
  );
}

function LocationsTab() {
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Locations</h1>
            <p className="text-muted-foreground">
              Manage warehouse zones and pallet positions
            </p>
          </div>
          <button className="btn-primary text-sm px-3 py-2 flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Location
          </button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl bg-card border border-border shadow-subtle p-6"
      >
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <MapPin className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-lg mb-2">No locations configured</p>
          <p className="text-sm text-muted-foreground/70 text-center max-w-md">
            Define warehouse buildings, zones, and pallet positions to enable
            location-based inventory tracking.
          </p>
        </div>
      </motion.div>
    </>
  );
}

interface TransfersTabProps {
  sites: WarehouseSite[];
  transfers: Transfer[];
  loading: boolean;
  onOpenTransferForm: () => void;
  onRefresh: () => void;
}

function TransfersTab({ sites, transfers, loading, onOpenTransferForm, onRefresh }: TransfersTabProps) {
  const getSiteName = (siteId: number) => {
    const site = sites.find((s) => s.id === siteId);
    return site ? site.name : `Site #${siteId}`;
  };

  const getTransportIcon = (mode: string) => {
    switch (mode?.toLowerCase()) {
      case "air":
        return <Plane className="w-4 h-4" />;
      case "sea":
        return <Ship className="w-4 h-4" />;
      default:
        return <Truck className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "completed":
        return "bg-green-100 text-green-700";
      case "in_transit":
        return "bg-blue-100 text-blue-700";
      case "pending":
        return "bg-yellow-100 text-yellow-700";
      case "cancelled":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Transfers</h1>
            <p className="text-muted-foreground">
              Inter-warehouse transfer management
            </p>
          </div>
          <button
            onClick={onOpenTransferForm}
            className="btn-primary text-sm px-3 py-2 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Transfer
          </button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl bg-card border border-border shadow-subtle p-6"
      >
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
          </div>
        ) : transfers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <ArrowRightLeft className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg mb-2">No transfers</p>
            <p className="text-sm text-muted-foreground/70 text-center max-w-md">
              Create a new transfer to move inventory between warehouse sites.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {transfers.map((transfer) => (
              <div
                key={transfer.id}
                className="flex items-center justify-between p-4 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-white">
                    {getTransportIcon(transfer.transport_mode)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-foreground">
                        {getSiteName(transfer.source_site_id)}
                      </span>
                      <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-foreground">
                        {getSiteName(transfer.destination_site_id)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {transfer.transport_mode?.toUpperCase()} • {new Date(transfer.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(transfer.status)}`}>
                  {transfer.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </>
  );
}

interface AnalyticsTabProps {
  sites: WarehouseSite[];
  selectedSiteId: number | null;
  onSelectSite: (id: number | null) => void;
}

function AnalyticsTab({ sites, selectedSiteId, onSelectSite }: AnalyticsTabProps) {
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
  const [optimizationLoading, setOptimizationLoading] = useState(false);
  const [optimizationError, setOptimizationError] = useState<string | null>(null);

  const runOptimization = async () => {
    if (!selectedSiteId) return;
    setOptimizationLoading(true);
    setOptimizationError(null);
    try {
      const response = await fetch(`/api/warehouse/sites/${selectedSiteId}/optimization`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to run optimization");
      const data = await response.json();
      setOptimization(data);
    } catch (err) {
      setOptimizationError(err instanceof Error ? err.message : "Failed to run optimization");
    } finally {
      setOptimizationLoading(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-2xl font-bold text-foreground mb-1">Analytics</h1>
        <p className="text-muted-foreground">
          Capacity utilization and inventory insights
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-6 rounded-2xl bg-card border border-border shadow-subtle p-6"
      >
        <h2 className="text-lg font-semibold text-foreground mb-4">Optimization</h2>
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <select
            value={selectedSiteId || ""}
            onChange={(e) => {
              onSelectSite(e.target.value ? Number(e.target.value) : null);
              setOptimization(null);
            }}
            className="flex-1 px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40"
          >
            <option value="">Select warehouse site...</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name} ({site.code})
              </option>
            ))}
          </select>
          <button
            onClick={runOptimization}
            disabled={!selectedSiteId || optimizationLoading}
            className="btn-primary text-sm px-4 py-2 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {optimizationLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <TrendingUp className="w-4 h-4" />
            )}
            Run Optimization
          </button>
        </div>

        {optimizationError && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-center gap-2">
            <XCircle className="w-5 h-5" />
            {optimizationError}
          </div>
        )}

        {optimization && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-muted">
                <p className="text-xs text-muted-foreground mb-1">Total Items</p>
                <p className="text-xl font-bold text-foreground">{optimization.metrics.total_items}</p>
              </div>
              <div className="p-4 rounded-xl bg-muted">
                <p className="text-xs text-muted-foreground mb-1">Total Value</p>
                <p className="text-xl font-bold text-foreground">
                  ${optimization.metrics.total_value.toLocaleString()}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-muted">
                <p className="text-xs text-muted-foreground mb-1">Aging Alerts</p>
                <p className="text-xl font-bold text-foreground">{optimization.metrics.aging_alerts}</p>
              </div>
            </div>

            {optimization.recommendations.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-foreground mb-3">Recommendations</h3>
                <div className="space-y-2">
                  {optimization.recommendations.map((rec, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-xl flex items-start gap-3 ${
                        rec.priority === "high"
                          ? "bg-red-50 border border-red-200"
                          : rec.priority === "medium"
                          ? "bg-yellow-50 border border-yellow-200"
                          : "bg-blue-50 border border-blue-200"
                      }`}
                    >
                      <CheckCircle className={`w-4 h-4 mt-0.5 ${
                        rec.priority === "high"
                          ? "text-red-500"
                          : rec.priority === "medium"
                          ? "text-yellow-500"
                          : "text-blue-500"
                      }`} />
                      <div>
                        <p className="text-sm font-medium text-foreground">{rec.type}</p>
                        <p className="text-sm text-muted-foreground">{rec.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl bg-card border border-border shadow-subtle p-6"
        >
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Capacity Heatmap
          </h2>
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <BarChart3 className="w-12 h-12 mb-4 opacity-50" />
            <p>No data available</p>
            <p className="text-sm text-muted-foreground/70">
              Add sites and inventory to view capacity heatmap
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl bg-card border border-border shadow-subtle p-6"
        >
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Aging Distribution
          </h2>
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Clock className="w-12 h-12 mb-4 opacity-50" />
            <p>No data available</p>
            <p className="text-sm text-muted-foreground/70">
              Import inventory with receipt dates to track aging
            </p>
          </div>
        </motion.div>
      </div>
    </>
  );
}

interface AddSiteModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

function AddSiteModal({ onClose, onSuccess }: AddSiteModalProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name) {
      setError("Code and name are required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/warehouse/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code, name, city, country }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create site");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create site");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">Add Warehouse Site</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Site Code *
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g., SAN_DIEGO"
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Site Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., San Diego Warehouse"
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              City
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g., San Diego"
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Country
            </label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="e.g., USA"
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 btn-secondary py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 btn-primary py-2 text-sm flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Site
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface CsvUploadModalProps {
  siteId: number;
  onClose: () => void;
  onSuccess: () => void;
}

function CsvUploadModal({ siteId, onClose, onSuccess }: CsvUploadModalProps) {
  const [csvContent, setCsvContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCsvContent(event.target?.result as string);
      };
      reader.readAsText(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvContent.trim()) {
      setError("CSV content is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/warehouse/sites/${siteId}/inventory/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ csv_content: csvContent }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to upload CSV");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload CSV");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">Import Inventory CSV</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Upload CSV File
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-accent file:text-white hover:file:bg-accent/90"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Or paste CSV content
            </label>
            <textarea
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              placeholder="requisition_no,description,quantity,length_in,width_in,height_in,weight_lb,unit_price..."
              rows={8}
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm font-mono focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 btn-secondary py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !csvContent.trim()}
              className="flex-1 btn-primary py-2 text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Upload
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface TransferFormModalProps {
  sites: WarehouseSite[];
  onClose: () => void;
  onSuccess: () => void;
}

function TransferFormModal({ sites, onClose, onSuccess }: TransferFormModalProps) {
  const [sourceSiteId, setSourceSiteId] = useState<number | "">("");
  const [destinationSiteId, setDestinationSiteId] = useState<number | "">("");
  const [transportMode, setTransportMode] = useState<string>("land");
  const [items, setItems] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceSiteId || !destinationSiteId) {
      setError("Source and destination sites are required");
      return;
    }
    if (sourceSiteId === destinationSiteId) {
      setError("Source and destination must be different");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/warehouse/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          source_site_id: sourceSiteId,
          destination_site_id: destinationSiteId,
          transport_mode: transportMode,
          items,
          notes,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create transfer");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create transfer");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">New Transfer</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Source Site *
            </label>
            <select
              value={sourceSiteId}
              onChange={(e) => setSourceSiteId(e.target.value ? Number(e.target.value) : "")}
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40"
            >
              <option value="">Select source site...</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name} ({site.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Destination Site *
            </label>
            <select
              value={destinationSiteId}
              onChange={(e) => setDestinationSiteId(e.target.value ? Number(e.target.value) : "")}
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40"
            >
              <option value="">Select destination site...</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name} ({site.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Transport Mode
            </label>
            <select
              value={transportMode}
              onChange={(e) => setTransportMode(e.target.value)}
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40"
            >
              <option value="land">Land (Truck)</option>
              <option value="air">Air</option>
              <option value="sea">Sea</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Items to Transfer
            </label>
            <textarea
              value={items}
              onChange={(e) => setItems(e.target.value)}
              placeholder="List items to transfer..."
              rows={3}
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes..."
              rows={2}
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 btn-secondary py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 btn-primary py-2 text-sm flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Transfer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
