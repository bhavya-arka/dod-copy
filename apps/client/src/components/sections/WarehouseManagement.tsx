import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  Info,
  LayoutDashboard,
  Building2,
  Brain,
  FileText,
  Zap,
  ChevronRight,
  ChevronDown,
  Move,
  Calendar,
  Target,
  RefreshCw,
  Shield,
  Activity,
} from "lucide-react";
import { User } from "../../hooks/useAuth";

interface WarehouseManagementProps {
  user: User;
  onBack: () => void;
  onLogout: () => void;
}

type WMSTab = "dashboard" | "inventory" | "operations" | "sites" | "analytics" | "ai-insights" | "admin";

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

function parseNSN(nsn: string): { fsc: string; niin: string } | null {
  const cleaned = nsn.replace(/[-\s]/g, '');
  if (!/^\d{13}$/.test(cleaned)) return null;
  return {
    fsc: cleaned.substring(0, 4),
    niin: cleaned.substring(4)
  };
}

function formatNSN(nsn: string): string {
  const cleaned = nsn.replace(/[-\s]/g, '');
  if (cleaned.length !== 13) return nsn;
  return `${cleaned.slice(0,4)}-${cleaned.slice(4,6)}-${cleaned.slice(6,9)}-${cleaned.slice(9,13)}`;
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

interface ToastMessage {
  id: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
}

function Toast({ message, type, onDismiss }: { message: string; type: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const bgColor = type === "success" ? "bg-[#16A34A]" : type === "error" ? "bg-[#DC2626]" : type === "warning" ? "bg-[#F59E0B]" : "bg-[#004E89]";

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 50, scale: 0.9 }}
      className={`${bgColor} text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 min-w-[300px]`}
    >
      <Info className="w-5 h-5 flex-shrink-0" />
      <span className="text-sm flex-1">{message}</span>
      <button onClick={onDismiss} className="hover:opacity-80">
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

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
    fetchTransfers();
  }, [fetchSites, fetchTransfers]);

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
    { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: "inventory", label: "Inventory", icon: <Package className="w-4 h-4" /> },
    { id: "operations", label: "Operations", icon: <ArrowRightLeft className="w-4 h-4" /> },
    { id: "sites", label: "Sites & Storage", icon: <Building2 className="w-4 h-4" /> },
    { id: "analytics", label: "Analytics", icon: <TrendingUp className="w-4 h-4" /> },
    { id: "ai-insights", label: "AI Insights", icon: <Brain className="w-4 h-4" /> },
    { id: "admin", label: "Admin", icon: <Settings className="w-4 h-4" /> },
  ];

  const totalItems = sites.reduce((acc, site) => acc + (site.item_count || 0), 0);
  const activeTransfers = transfers.filter(t => t.status === "in_transit" || t.status === "pending").length;

  return (
    <div className="min-h-screen wms-theme bg-[#F9FAFB] text-foreground">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-border shadow-sm">
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
                <div className="p-1.5 rounded-lg bg-[#004E89]">
                  <Warehouse className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-foreground">MSC Warehouse Optimization</span>
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

      <div className="border-b border-border bg-white/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1 overflow-x-auto py-2 hide-scrollbar">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? "bg-[#004E89] text-white shadow-sm"
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="mb-4 p-4 rounded-2xl bg-red-50 border border-red-200 text-[#DC2626] flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            {error}
          </div>
        )}
        
        {activeTab === "dashboard" && (
          <DashboardTab
            sites={sites}
            loading={loading}
            totalItems={totalItems}
            activeTransfers={activeTransfers}
            transfers={transfers}
            onAddSite={() => setAddSiteOpen(true)}
            onRefresh={fetchSites}
            onTabChange={setActiveTab}
            onShowToast={showToast}
            onOpenCsvUpload={() => {
              if (sites.length > 0) {
                setSelectedSiteId(sites[0].id);
                setCsvUploadOpen(true);
              } else {
                showToast("Please add a warehouse site first", "warning");
              }
            }}
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
            onOpenAddItem={() => setAddItemOpen(true)}
            onRefresh={() => selectedSiteId && fetchInventory(selectedSiteId)}
            onShowToast={showToast}
          />
        )}
        
        {activeTab === "operations" && (
          <OperationsTab
            sites={sites}
            transfers={transfers}
            loading={transfersLoading}
            onOpenTransferForm={() => setTransferFormOpen(true)}
            onRefresh={fetchTransfers}
            onShowToast={showToast}
          />
        )}
        
        {activeTab === "sites" && (
          <SitesStorageTab
            sites={sites}
            loading={loading}
            onAddSite={() => setAddSiteOpen(true)}
            onRefresh={fetchSites}
            onShowToast={showToast}
          />
        )}
        
        {activeTab === "analytics" && (
          <AnalyticsTab
            sites={sites}
            selectedSiteId={selectedSiteId}
            onSelectSite={setSelectedSiteId}
            onShowToast={showToast}
          />
        )}
        
        {activeTab === "ai-insights" && (
          <AIInsightsTab
            sites={sites}
            selectedSiteId={selectedSiteId}
            onSelectSite={setSelectedSiteId}
            onShowToast={showToast}
          />
        )}
        
        {activeTab === "admin" && (
          <AdminTab
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
        <TransferFormModal
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

interface DashboardTabProps {
  sites: WarehouseSite[];
  loading: boolean;
  totalItems: number;
  activeTransfers: number;
  transfers: Transfer[];
  onAddSite: () => void;
  onRefresh: () => void;
  onTabChange: (tab: WMSTab) => void;
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
  onOpenCsvUpload: () => void;
}

function DashboardTab({ 
  sites, 
  loading, 
  totalItems, 
  activeTransfers, 
  transfers,
  onAddSite, 
  onRefresh, 
  onTabChange, 
  onShowToast,
  onOpenCsvUpload 
}: DashboardTabProps) {
  const hasSites = sites.length > 0;
  const inTransitCount = transfers.filter(t => t.status === "in_transit").length;
  const capacityUsed = hasSites ? Math.min(Math.round((totalItems / (sites.length * 500)) * 100), 100) : 0;

  const metrics = [
    { label: "Total Sites", value: sites.length.toString(), icon: Warehouse, color: "text-[#004E89]", bgColor: "bg-blue-50" },
    { label: "Active Shipments", value: activeTransfers.toString(), icon: ArrowRightLeft, color: "text-[#16A34A]", bgColor: "bg-green-50" },
    { label: "Items in Transit", value: inTransitCount.toString(), icon: Truck, color: "text-purple-600", bgColor: "bg-purple-50" },
    { label: "Capacity Used", value: `${capacityUsed}%`, icon: Box, color: "text-[#F59E0B]", bgColor: "bg-amber-50" },
    { label: "Aging Items (>5yr)", value: "0", icon: Clock, color: "text-orange-600", bgColor: "bg-orange-50" },
    { label: "Critical Alerts", value: "0", icon: AlertTriangle, color: "text-[#DC2626]", bgColor: "bg-red-50" },
  ];

  const quickActions = [
    { icon: Upload, label: "Import Manifest", desc: "Upload CSV", action: () => onOpenCsvUpload() },
    { icon: Zap, label: "Run Optimization", desc: "AI-powered", action: () => onTabChange("ai-insights") },
    { icon: FileText, label: "Generate Load Plan", desc: "Create plan", action: () => onShowToast("Load plan generation coming soon!", "info") },
    { icon: Download, label: "Export Report", desc: "Download data", action: () => onShowToast("Export feature coming soon!", "info") },
  ];

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">
          Mission Dashboard
        </h1>
        <p className="text-muted-foreground">
          Real-time warehouse operations and capacity monitoring
        </p>
      </motion.div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {metrics.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="p-4 rounded-2xl bg-white border border-border shadow-sm hover:shadow-md transition-shadow"
          >
            <div className={`w-10 h-10 rounded-xl ${stat.bgColor} flex items-center justify-center mb-3`}>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-2xl bg-white border border-border shadow-sm p-4 mb-6"
      >
        <h2 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={action.action}
              className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 hover:bg-[#004E89]/10 transition-colors text-left group"
            >
              <div className="p-2 rounded-lg bg-white border border-border group-hover:border-[#004E89]/30">
                <action.icon className="w-4 h-4 text-[#004E89]" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{action.label}</p>
                <p className="text-xs text-muted-foreground">{action.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl bg-white border border-border shadow-sm p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Warehouse Sites</h2>
            <button
              onClick={onAddSite}
              className="text-sm px-3 py-1.5 rounded-lg bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              Add Site
            </button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#004E89]" />
            </div>
          ) : sites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Warehouse className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-center mb-2">No warehouse sites configured</p>
              <button
                onClick={onAddSite}
                className="text-sm px-4 py-2 rounded-lg bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Your First Site
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto">
              {sites.map((site) => (
                <div
                  key={site.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${site.active ? "bg-[#16A34A]" : "bg-gray-400"}`} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{site.name}</p>
                      <p className="text-xs text-muted-foreground">{site.code}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{site.item_count || 0}</p>
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
          transition={{ delay: 0.4 }}
          className="rounded-2xl bg-white border border-border shadow-sm p-6"
        >
          <h2 className="text-lg font-semibold text-foreground mb-4">Aging Alerts</h2>
          <div className="space-y-3">
            {[
              { years: "7+ years", label: "Critical", color: "bg-[#DC2626]", count: 0 },
              { years: "5-7 years", label: "Warning", color: "bg-[#F59E0B]", count: 0 },
              { years: "3-5 years", label: "Monitor", color: "bg-yellow-400", count: 0 },
            ].map((alert) => (
              <div
                key={alert.years}
                className="flex items-center justify-between p-3 rounded-xl bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${alert.color}`} />
                  <div>
                    <p className="text-sm font-medium text-foreground">{alert.years}</p>
                    <p className="text-xs text-muted-foreground">{alert.label}</p>
                  </div>
                </div>
                <span className="text-xl font-bold text-foreground">{alert.count}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => onTabChange("inventory")}
            className="w-full mt-4 text-sm text-[#004E89] hover:underline flex items-center justify-center gap-1"
          >
            View all inventory
            <ChevronRight className="w-4 h-4" />
          </button>
        </motion.div>
      </div>
    </>
  );
}

interface InventoryFilter {
  site: number | "all";
  condition: string;
  ageGroup: string;
  storageType: string;
  missionId: string;
}

interface InventoryTabProps {
  sites: WarehouseSite[];
  selectedSiteId: number | null;
  onSelectSite: (id: number | null) => void;
  inventory: InventoryItem[];
  loading: boolean;
  onOpenCsvUpload: () => void;
  onOpenAddItem: () => void;
  onRefresh: () => void;
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

function InventoryTab({
  sites,
  selectedSiteId,
  onSelectSite,
  inventory,
  loading,
  onOpenCsvUpload,
  onOpenAddItem,
  onRefresh,
  onShowToast,
}: InventoryTabProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState<InventoryFilter>({
    site: "all",
    condition: "all",
    ageGroup: "all",
    storageType: "all",
    missionId: "",
  });

  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      const matchesSearch =
        item.requisition_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.nsn?.includes(searchTerm);

      const matchesCondition = filter.condition === "all" || item.condition === filter.condition;
      const matchesMission = !filter.missionId || item.mission_id?.includes(filter.missionId);

      return matchesSearch && matchesCondition && matchesMission;
    });
  }, [inventory, searchTerm, filter]);

  const activeFilterCount = Object.values(filter).filter(v => v !== "all" && v !== "").length;

  const handleAddItem = () => {
    if (!selectedSiteId) {
      onShowToast("Please select a warehouse site first", "warning");
      return;
    }
    onOpenAddItem();
  };

  const handleImport = () => {
    if (!selectedSiteId) {
      onShowToast("Please select a warehouse site first", "warning");
      return;
    }
    onOpenCsvUpload();
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
            <h1 className="text-2xl font-bold text-foreground mb-1">Inventory</h1>
            <p className="text-muted-foreground">Enhanced item tracking and drill-down</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleImport}
              className="text-sm px-3 py-2 rounded-lg border border-border bg-white hover:bg-muted transition-colors flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Import
            </button>
            <button 
              onClick={handleAddItem}
              className="text-sm px-3 py-2 rounded-lg bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors flex items-center gap-2"
            >
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
        className="rounded-2xl bg-white border border-border shadow-sm p-6"
      >
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <select
            value={selectedSiteId || ""}
            onChange={(e) => onSelectSite(e.target.value ? Number(e.target.value) : null)}
            className="px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
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
              placeholder="Search by NSN, requisition, or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-muted border border-border text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
            />
          </div>
          <div className="relative">
            <button 
              onClick={() => setFilterOpen(!filterOpen)}
              className={`text-sm px-3 py-2 rounded-lg border border-border bg-white hover:bg-muted transition-colors flex items-center gap-2 ${activeFilterCount > 0 ? "ring-2 ring-[#004E89]" : ""}`}
            >
              <Filter className="w-4 h-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="px-1.5 py-0.5 bg-[#004E89] text-white text-xs rounded-full">
                  {activeFilterCount}
                </span>
              )}
            </button>
            
            <AnimatePresence>
              {filterOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute right-0 mt-2 w-72 bg-white rounded-xl border border-border shadow-lg z-20 p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-foreground">Filters</h3>
                    <button 
                      onClick={() => setFilter({ site: "all", condition: "all", ageGroup: "all", storageType: "all", missionId: "" })}
                      className="text-xs text-[#004E89] hover:underline"
                    >
                      Reset all
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-2">Condition</label>
                      <select
                        value={filter.condition}
                        onChange={(e) => setFilter({ ...filter, condition: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg bg-muted border border-border text-foreground text-sm"
                      >
                        <option value="all">All conditions</option>
                        <option value="new">New</option>
                        <option value="serviceable">Serviceable</option>
                        <option value="unserviceable">Unserviceable</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-2">Age Group</label>
                      <select
                        value={filter.ageGroup}
                        onChange={(e) => setFilter({ ...filter, ageGroup: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg bg-muted border border-border text-foreground text-sm"
                      >
                        <option value="all">All ages</option>
                        <option value="0-1">0-1 years</option>
                        <option value="1-3">1-3 years</option>
                        <option value="3-5">3-5 years</option>
                        <option value="5+">5+ years</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-2">Storage Type</label>
                      <select
                        value={filter.storageType}
                        onChange={(e) => setFilter({ ...filter, storageType: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg bg-muted border border-border text-foreground text-sm"
                      >
                        <option value="all">All types</option>
                        <option value="pallet">Pallet</option>
                        <option value="rack">Rack</option>
                        <option value="container">Container</option>
                        <option value="floor">Floor</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-2">Mission ID</label>
                      <input
                        type="text"
                        value={filter.missionId}
                        onChange={(e) => setFilter({ ...filter, missionId: e.target.value })}
                        placeholder="e.g., OPLAN-2025"
                        className="w-full px-3 py-1.5 rounded-lg bg-muted border border-border text-foreground text-sm"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {!selectedSiteId ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Package className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg mb-2">Select a warehouse site</p>
            <p className="text-sm text-muted-foreground/70">Choose a site to view its inventory</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-[#004E89]" />
          </div>
        ) : filteredInventory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Package className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg mb-2">No inventory items</p>
            <p className="text-sm text-muted-foreground/70 mb-4">Add items or import from CSV</p>
            <div className="flex gap-2">
              <button
                onClick={handleImport}
                className="text-sm px-4 py-2 rounded-lg border border-border bg-white hover:bg-muted transition-colors flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Import CSV
              </button>
              <button
                onClick={handleAddItem}
                className="text-sm px-4 py-2 rounded-lg bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Item
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-2 font-medium text-muted-foreground">NSN/PN</th>
                  <th className="text-left py-3 px-2 font-medium text-muted-foreground">Description</th>
                  <th className="text-left py-3 px-2 font-medium text-muted-foreground">Location</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Qty</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Weight</th>
                  <th className="text-left py-3 px-2 font-medium text-muted-foreground">Condition</th>
                  <th className="text-left py-3 px-2 font-medium text-muted-foreground">Mission</th>
                  <th className="text-left py-3 px-2 font-medium text-muted-foreground">Last Moved</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map((item) => (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-3 px-2 font-mono text-xs">
                      {item.nsn ? formatNSN(item.nsn) : item.requisition_no}
                    </td>
                    <td className="py-3 px-2 max-w-[200px] truncate">{item.description || "-"}</td>
                    <td className="py-3 px-2 text-xs">
                      {item.rack_location || item.container_id || "-"}
                    </td>
                    <td className="py-3 px-2 text-right font-medium">{item.quantity}</td>
                    <td className="py-3 px-2 text-right text-muted-foreground">
                      {item.weight_lb ? `${item.weight_lb} lb` : "-"}
                    </td>
                    <td className="py-3 px-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        item.condition === "new" ? "bg-green-100 text-green-700" :
                        item.condition === "serviceable" ? "bg-blue-100 text-blue-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>
                        {item.condition || "N/A"}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-xs text-muted-foreground">{item.mission_id || "-"}</td>
                    <td className="py-3 px-2 text-xs text-muted-foreground">{item.last_moved || "-"}</td>
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

interface OperationsTabProps {
  sites: WarehouseSite[];
  transfers: Transfer[];
  loading: boolean;
  onOpenTransferForm: () => void;
  onRefresh: () => void;
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

function OperationsTab({ sites, transfers, loading, onOpenTransferForm, onRefresh, onShowToast }: OperationsTabProps) {
  const getSiteName = (siteId: number) => {
    const site = sites.find((s) => s.id === siteId);
    return site ? site.name : `Site #${siteId}`;
  };

  const getTransportIcon = (mode: string) => {
    switch (mode?.toLowerCase()) {
      case "air": return <Plane className="w-4 h-4" />;
      case "sea": return <Ship className="w-4 h-4" />;
      default: return <Truck className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "completed": return "bg-green-100 text-[#16A34A]";
      case "in_transit": return "bg-blue-100 text-blue-700";
      case "pending": return "bg-amber-100 text-[#F59E0B]";
      case "cancelled": return "bg-red-100 text-[#DC2626]";
      default: return "bg-gray-100 text-gray-700";
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
            <h1 className="text-2xl font-bold text-foreground mb-1">Operations</h1>
            <p className="text-muted-foreground">Transfer orders and shipment preparation</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="text-sm px-3 py-2 rounded-lg border border-border bg-white hover:bg-muted transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button
              onClick={onOpenTransferForm}
              className="text-sm px-3 py-2 rounded-lg bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Transfer
            </button>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 rounded-2xl bg-white border border-border shadow-sm p-6"
        >
          <h2 className="text-lg font-semibold text-foreground mb-4">Transfer Orders</h2>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-[#004E89]" />
            </div>
          ) : transfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <ArrowRightLeft className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg mb-2">No transfers</p>
              <p className="text-sm text-muted-foreground/70 mb-4">Create a transfer to move inventory between sites</p>
              <button
                onClick={onOpenTransferForm}
                className="text-sm px-4 py-2 rounded-lg bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Create First Transfer
              </button>
            </div>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {transfers.map((transfer) => (
                <div
                  key={transfer.id}
                  className="flex items-center justify-between p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-white border border-border">
                      {getTransportIcon(transfer.transport_mode)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-foreground">{getSiteName(transfer.source_site_id)}</span>
                        <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">{getSiteName(transfer.destination_site_id)}</span>
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

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl bg-white border border-border shadow-sm p-6"
        >
          <h2 className="text-lg font-semibold text-foreground mb-4">Shipment Prep</h2>
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-muted/50 border border-dashed border-border">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-white border border-border">
                  <FileText className="w-4 h-4 text-[#004E89]" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Generate Manifest</p>
                  <p className="text-xs text-muted-foreground">Create shipping documents</p>
                </div>
              </div>
              <button
                onClick={() => onShowToast("Manifest generation coming soon!", "info")}
                className="w-full text-sm py-2 rounded-lg bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors"
              >
                Generate
              </button>
            </div>
            
            <div className="p-4 rounded-xl bg-muted/50 border border-dashed border-border">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-white border border-border">
                  <Box className="w-4 h-4 text-[#004E89]" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Load Planning</p>
                  <p className="text-xs text-muted-foreground">Optimize cargo placement</p>
                </div>
              </div>
              <button
                onClick={() => onShowToast("Load planning coming soon!", "info")}
                className="w-full text-sm py-2 rounded-lg bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors"
              >
                Plan Load
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}

interface SitesStorageTabProps {
  sites: WarehouseSite[];
  loading: boolean;
  onAddSite: () => void;
  onRefresh: () => void;
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

function SitesStorageTab({ sites, loading, onAddSite, onRefresh, onShowToast }: SitesStorageTabProps) {
  const [expandedSites, setExpandedSites] = useState<Set<number>>(new Set());

  const toggleSite = (siteId: number) => {
    const newExpanded = new Set(expandedSites);
    if (newExpanded.has(siteId)) {
      newExpanded.delete(siteId);
    } else {
      newExpanded.add(siteId);
    }
    setExpandedSites(newExpanded);
  };

  const mockBuildings = [
    { code: "B-870", type: "Sprung", dimensions: "90×81×17 ft", capacity: 85, pallets: 120 },
    { code: "B-872", type: "Legacy", dimensions: "90×80×20 ft", capacity: 62, pallets: 150 },
    { code: "B-871", type: "GFM", dimensions: "98×28×30 ft", capacity: 45, pallets: 80 },
  ];

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Sites & Storage</h1>
            <p className="text-muted-foreground">Hierarchical warehouse structure and capacity</p>
          </div>
          <button
            onClick={onAddSite}
            className="text-sm px-3 py-2 rounded-lg bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Site
          </button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl bg-white border border-border shadow-sm p-6"
      >
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-[#004E89]" />
          </div>
        ) : sites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Building2 className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg mb-2">No warehouse sites</p>
            <p className="text-sm text-muted-foreground/70 mb-4">Add your first site to manage storage</p>
            <button
              onClick={onAddSite}
              className="text-sm px-4 py-2 rounded-lg bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Site
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {sites.map((site) => (
              <div key={site.id} className="border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleSite(site.id)}
                  className="w-full flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {expandedSites.has(site.id) ? (
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    )}
                    <div className={`w-3 h-3 rounded-full ${site.active ? "bg-[#16A34A]" : "bg-gray-400"}`} />
                    <div className="text-left">
                      <p className="font-semibold text-foreground">{site.name}</p>
                      <p className="text-xs text-muted-foreground">{site.city || site.code}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-medium text-foreground">{site.item_count || 0} items</p>
                      <p className="text-xs text-muted-foreground">Total inventory</p>
                    </div>
                  </div>
                </button>
                
                <AnimatePresence>
                  {expandedSites.has(site.id) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-border"
                    >
                      <div className="p-4 pl-12 space-y-3">
                        {mockBuildings.map((building, i) => (
                          <div
                            key={building.code}
                            className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-muted-foreground">
                                {i === mockBuildings.length - 1 ? "└─" : "├─"}
                              </span>
                              <div>
                                <p className="font-medium text-foreground">
                                  {building.code} <span className="text-muted-foreground">({building.type})</span>
                                </p>
                                <p className="text-xs text-muted-foreground">{building.dimensions}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <div className="flex items-center gap-2">
                                  <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${
                                        building.capacity > 80 ? "bg-[#DC2626]" :
                                        building.capacity > 60 ? "bg-[#F59E0B]" :
                                        "bg-[#16A34A]"
                                      }`}
                                      style={{ width: `${building.capacity}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-medium text-foreground">{building.capacity}%</span>
                                </div>
                                <p className="text-xs text-muted-foreground">{building.pallets} pallets • ≤2,000 lbs/rack</p>
                              </div>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => onShowToast("Move functionality coming soon!", "info")}
                                  className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                                  title="Move"
                                >
                                  <Move className="w-4 h-4 text-muted-foreground" />
                                </button>
                                <button
                                  onClick={() => onShowToast("Optimize functionality coming soon!", "info")}
                                  className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                                  title="Optimize"
                                >
                                  <Zap className="w-4 h-4 text-muted-foreground" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
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
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

function AnalyticsTab({ sites, selectedSiteId, onSelectSite, onShowToast }: AnalyticsTabProps) {
  const readinessScore = 87;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Analytics</h1>
            <p className="text-muted-foreground">Capacity trends and mission readiness</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onShowToast("Export coming soon!", "info")}
              className="text-sm px-3 py-2 rounded-lg border border-border bg-white hover:bg-muted transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export PDF
            </button>
            <button
              onClick={() => onShowToast("Export coming soon!", "info")}
              className="text-sm px-3 py-2 rounded-lg border border-border bg-white hover:bg-muted transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl bg-white border border-border shadow-sm p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Mission Readiness</h3>
            <Target className="w-5 h-5 text-[#004E89]" />
          </div>
          <div className="flex items-center gap-4">
            <div className="relative w-24 h-24">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="40"
                  fill="none"
                  stroke={readinessScore >= 80 ? "#16A34A" : readinessScore >= 60 ? "#F59E0B" : "#DC2626"}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${readinessScore * 2.51} 251`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-foreground">{readinessScore}%</span>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Overall readiness score based on inventory completeness and aging status</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl bg-white border border-border shadow-sm p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Capacity Utilization</h3>
            <Box className="w-5 h-5 text-[#004E89]" />
          </div>
          <div className="space-y-3">
            {sites.slice(0, 3).map((site) => {
              const usage = Math.min(Math.round(((site.item_count || 0) / 500) * 100), 100);
              return (
                <div key={site.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-foreground">{site.name}</span>
                    <span className="text-muted-foreground">{usage}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        usage > 80 ? "bg-[#DC2626]" : usage > 60 ? "bg-[#F59E0B]" : "bg-[#16A34A]"
                      }`}
                      style={{ width: `${usage}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {sites.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No sites available</p>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl bg-white border border-border shadow-sm p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Aging Summary</h3>
            <Clock className="w-5 h-5 text-[#004E89]" />
          </div>
          <div className="space-y-2">
            {[
              { label: "< 1 year", count: 0, color: "bg-[#16A34A]" },
              { label: "1-3 years", count: 0, color: "bg-blue-500" },
              { label: "3-5 years", count: 0, color: "bg-[#F59E0B]" },
              { label: "> 5 years", count: 0, color: "bg-[#DC2626]" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${item.color}`} />
                  <span className="text-sm text-foreground">{item.label}</span>
                </div>
                <span className="text-sm font-medium text-foreground">{item.count}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl bg-white border border-border shadow-sm p-6"
        >
          <h2 className="text-lg font-semibold text-foreground mb-4">Capacity Trendline</h2>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
            <BarChart3 className="w-12 h-12 mb-4 opacity-50" />
            <p>Capacity trend visualization</p>
            <p className="text-sm text-muted-foreground/70">Historical data will appear here</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-2xl bg-white border border-border shadow-sm p-6"
        >
          <h2 className="text-lg font-semibold text-foreground mb-4">Aging Curve</h2>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
            <TrendingUp className="w-12 h-12 mb-4 opacity-50" />
            <p>Aging distribution curve</p>
            <p className="text-sm text-muted-foreground/70">Import inventory with dates to track</p>
          </div>
        </motion.div>
      </div>
    </>
  );
}

interface AIInsightsTabProps {
  sites: WarehouseSite[];
  selectedSiteId: number | null;
  onSelectSite: (id: number | null) => void;
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

function AIInsightsTab({ sites, selectedSiteId, onSelectSite, onShowToast }: AIInsightsTabProps) {
  const [optimizationLoading, setOptimizationLoading] = useState(false);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);

  const runOptimization = async () => {
    if (!selectedSiteId) {
      onShowToast("Please select a warehouse site first", "warning");
      return;
    }
    setOptimizationLoading(true);
    try {
      const response = await fetch(`/api/warehouse/sites/${selectedSiteId}/optimization`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to run optimization");
      const data = await response.json();
      setOptimization(data);
      onShowToast("Optimization analysis complete!", "success");
    } catch (err) {
      onShowToast("Failed to run optimization", "error");
    } finally {
      setOptimizationLoading(false);
    }
  };

  const insightCards = [
    {
      title: "Placement Optimization",
      description: "AI-powered recommendations for optimal item placement based on access frequency and weight distribution",
      icon: Layers,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Predictive Load Balancing",
      description: "Forecast capacity needs and balance inventory across sites to prevent bottlenecks",
      icon: Activity,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      title: "Aging Alerts",
      description: "Proactive notifications for items approaching shelf life limits or requiring rotation",
      icon: AlertTriangle,
      color: "text-amber-600",
      bgColor: "bg-amber-50",
    },
    {
      title: "Mission Readiness Score",
      description: "Real-time assessment of inventory completeness for active and planned missions",
      icon: Shield,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
  ];

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-2xl font-bold text-foreground mb-1">AI Insights</h1>
        <p className="text-muted-foreground">Intelligent optimization and predictive analytics</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {insightCards.map((card, i) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="rounded-2xl bg-white border border-border shadow-sm p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl ${card.bgColor}`}>
                <card.icon className={`w-6 h-6 ${card.color}`} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground mb-1">{card.title}</h3>
                <p className="text-sm text-muted-foreground">{card.description}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="rounded-2xl bg-white border border-border shadow-sm p-6"
      >
        <h2 className="text-lg font-semibold text-foreground mb-4">Run Optimization Analysis</h2>
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <select
            value={selectedSiteId || ""}
            onChange={(e) => {
              onSelectSite(e.target.value ? Number(e.target.value) : null);
              setOptimization(null);
            }}
            className="flex-1 px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
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
            className="px-4 py-2 rounded-lg bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {optimizationLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Brain className="w-4 h-4" />
            )}
            Run Analysis
          </button>
        </div>

        {optimization && (
          <div className="space-y-4 mt-6 border-t border-border pt-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">Total Items</p>
                <p className="text-xl font-bold text-foreground">{optimization.metrics.total_items}</p>
              </div>
              <div className="p-4 rounded-xl bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">Total Value</p>
                <p className="text-xl font-bold text-foreground">${optimization.metrics.total_value.toLocaleString()}</p>
              </div>
              <div className="p-4 rounded-xl bg-muted/50">
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
                        rec.priority === "high" ? "bg-red-50 border border-red-200" :
                        rec.priority === "medium" ? "bg-amber-50 border border-amber-200" :
                        "bg-blue-50 border border-blue-200"
                      }`}
                    >
                      <CheckCircle className={`w-4 h-4 mt-0.5 ${
                        rec.priority === "high" ? "text-[#DC2626]" :
                        rec.priority === "medium" ? "text-[#F59E0B]" :
                        "text-[#004E89]"
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
    </>
  );
}

interface AdminTabProps {
  sites: WarehouseSite[];
  selectedSiteId: number | null;
  onSelectSite: (id: number | null) => void;
  onOpenCsvUpload: () => void;
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

function AdminTab({ sites, selectedSiteId, onSelectSite, onOpenCsvUpload, onShowToast }: AdminTabProps) {
  const handleImport = () => {
    if (!selectedSiteId) {
      onShowToast("Please select a warehouse site first", "warning");
      return;
    }
    onOpenCsvUpload();
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-2xl font-bold text-foreground mb-1">Admin</h1>
        <p className="text-muted-foreground">Data imports and system configuration</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl bg-white border border-border shadow-sm p-6"
        >
          <h2 className="text-lg font-semibold text-foreground mb-4">Data Import</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Select Warehouse Site</label>
              <select
                value={selectedSiteId || ""}
                onChange={(e) => onSelectSite(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
              >
                <option value="">Select a site...</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name} ({site.code})
                  </option>
                ))}
              </select>
            </div>
            
            <div className="p-4 rounded-xl bg-muted/50 border border-dashed border-border">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-white border border-border">
                  <Upload className="w-5 h-5 text-[#004E89]" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Import Inventory CSV</p>
                  <p className="text-xs text-muted-foreground">Upload warehouse manifest data</p>
                </div>
              </div>
              <button
                onClick={handleImport}
                disabled={!selectedSiteId}
                className="w-full text-sm py-2.5 rounded-lg bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Upload CSV
              </button>
            </div>

            <div className="p-4 rounded-xl bg-muted/50 border border-dashed border-border">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-white border border-border">
                  <Download className="w-5 h-5 text-[#004E89]" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Export Data</p>
                  <p className="text-xs text-muted-foreground">Download inventory reports</p>
                </div>
              </div>
              <button
                onClick={() => onShowToast("Export feature coming soon!", "info")}
                className="w-full text-sm py-2.5 rounded-lg border border-border bg-white hover:bg-muted transition-colors"
              >
                Export to CSV
              </button>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl bg-white border border-border shadow-sm p-6"
        >
          <h2 className="text-lg font-semibold text-foreground mb-4">Configuration</h2>
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-muted/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-foreground">System Settings</p>
                  <p className="text-xs text-muted-foreground">Configure preferences</p>
                </div>
              </div>
              <button
                onClick={() => onShowToast("Settings coming soon!", "info")}
                className="text-sm px-3 py-1.5 rounded-lg border border-border bg-white hover:bg-muted transition-colors"
              >
                Configure
              </button>
            </div>
            
            <div className="p-4 rounded-xl bg-muted/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-foreground">Aging Thresholds</p>
                  <p className="text-xs text-muted-foreground">Set alert triggers</p>
                </div>
              </div>
              <button
                onClick={() => onShowToast("Threshold config coming soon!", "info")}
                className="text-sm px-3 py-1.5 rounded-lg border border-border bg-white hover:bg-muted transition-colors"
              >
                Edit
              </button>
            </div>
            
            <div className="p-4 rounded-xl bg-muted/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-foreground">Access Control</p>
                  <p className="text-xs text-muted-foreground">Manage permissions</p>
                </div>
              </div>
              <button
                onClick={() => onShowToast("Access control coming soon!", "info")}
                className="text-sm px-3 py-1.5 rounded-lg border border-border bg-white hover:bg-muted transition-colors"
              >
                Manage
              </button>
            </div>
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
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-[#DC2626] text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Site Code *</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g., SAN_DIEGO"
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Site Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., San Diego Warehouse"
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g., San Diego"
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Country</label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="e.g., USA"
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-sm rounded-xl border border-border bg-white hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 text-sm rounded-xl bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors flex items-center justify-center gap-2"
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
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-[#DC2626] text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Upload CSV File</label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#004E89] file:text-white hover:file:bg-[#003d6d]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Or paste CSV content</label>
            <textarea
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              placeholder="requisition_no,description,quantity,length_in,width_in,height_in,weight_lb,unit_price..."
              rows={8}
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm font-mono focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-sm rounded-xl border border-border bg-white hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 text-sm rounded-xl bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Import
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface AddItemModalProps {
  siteId: number | null;
  sites: WarehouseSite[];
  onClose: () => void;
  onSuccess: () => void;
  onSelectSite: (id: number | null) => void;
}

function AddItemModal({ siteId, sites, onClose, onSuccess, onSelectSite }: AddItemModalProps) {
  const [selectedSite, setSelectedSite] = useState<number | "">(siteId || "");
  const [requisitionNo, setRequisitionNo] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [nsn, setNsn] = useState("");
  const [nsnError, setNsnError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNsnChange = (value: string) => {
    setNsn(value);
    setNsnError(null);
    if (value.trim()) {
      const parsed = parseNSN(value);
      if (!parsed) {
        setNsnError("Invalid NSN format. Use XXXX-XX-XXX-XXXX (13 digits)");
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedSite) {
      setError("Please select a warehouse site");
      return;
    }
    
    if (!requisitionNo.trim()) {
      setError("Requisition number is required");
      return;
    }

    if (!quantity || parseInt(quantity) < 1) {
      setError("Quantity must be at least 1");
      return;
    }

    let nsnData: { nsn: string; fsc: string; niin: string } | null = null;
    if (nsn.trim()) {
      const parsed = parseNSN(nsn);
      if (!parsed) {
        setError("Invalid NSN format. Use XXXX-XX-XXX-XXXX (13 digits)");
        return;
      }
      const cleanedNsn = nsn.replace(/[-\s]/g, '');
      nsnData = { nsn: cleanedNsn, fsc: parsed.fsc, niin: parsed.niin };
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/warehouse/sites/${selectedSite}/inventory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          requisition_no: requisitionNo,
          description,
          quantity: parseInt(quantity),
          length_in: length || undefined,
          width_in: width || undefined,
          height_in: height || undefined,
          weight_lb: weight || undefined,
          unit_price: unitPrice || undefined,
          ...(nsnData || {}),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to add item");
      }

      onSelectSite(Number(selectedSite));
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add item");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">Add Inventory Item</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-[#DC2626] text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Warehouse Site *</label>
            <select
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value ? Number(e.target.value) : "")}
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
            >
              <option value="">Select a site...</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name} ({site.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Requisition Number *</label>
            <input
              type="text"
              value={requisitionNo}
              onChange={(e) => setRequisitionNo(e.target.value)}
              placeholder="e.g., REQ-2024-001"
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">NSN (Optional)</label>
            <input
              type="text"
              value={nsn}
              onChange={(e) => handleNsnChange(e.target.value)}
              placeholder="XXXX-XX-XXX-XXXX"
              className={`w-full px-4 py-2 rounded-xl bg-muted border ${nsnError ? 'border-red-300' : 'border-border'} text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40`}
            />
            {nsnError && <p className="text-xs text-[#DC2626] mt-1">{nsnError}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Item description"
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Quantity *</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="1"
                className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Unit Price</label>
              <input
                type="text"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Length (in)</label>
              <input
                type="text"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Width (in)</label>
              <input
                type="text"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Height (in)</label>
              <input
                type="text"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Weight (lb)</label>
              <input
                type="text"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89]"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-sm rounded-xl border border-border bg-white hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 text-sm rounded-xl bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Add Item
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
  const [destSiteId, setDestSiteId] = useState<number | "">("");
  const [transportMode, setTransportMode] = useState<"ground" | "air" | "sea">("ground");
  const [items, setItems] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!sourceSiteId || !destSiteId) {
      setError("Source and destination sites are required");
      return;
    }

    if (sourceSiteId === destSiteId) {
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
          destination_site_id: destSiteId,
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
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-[#DC2626] text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Source Site *</label>
            <select
              value={sourceSiteId}
              onChange={(e) => setSourceSiteId(e.target.value ? Number(e.target.value) : "")}
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
            >
              <option value="">Select source...</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name} ({site.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Destination Site *</label>
            <select
              value={destSiteId}
              onChange={(e) => setDestSiteId(e.target.value ? Number(e.target.value) : "")}
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
            >
              <option value="">Select destination...</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name} ({site.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Transport Mode</label>
            <div className="flex gap-2">
              {[
                { value: "ground", icon: Truck, label: "Ground" },
                { value: "air", icon: Plane, label: "Air" },
                { value: "sea", icon: Ship, label: "Sea" },
              ].map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setTransportMode(mode.value as "ground" | "air" | "sea")}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${
                    transportMode === mode.value
                      ? "bg-[#004E89] text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  <mode.icon className="w-4 h-4" />
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Items</label>
            <input
              type="text"
              value={items}
              onChange={(e) => setItems(e.target.value)}
              placeholder="e.g., 50 pallets of equipment"
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes..."
              rows={3}
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-sm rounded-xl border border-border bg-white hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 text-sm rounded-xl bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors flex items-center justify-center gap-2"
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
