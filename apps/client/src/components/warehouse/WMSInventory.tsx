import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Package, Search, Filter, Plus, Upload, Loader2, RefreshCw } from "lucide-react";
import type { WarehouseSite, InventoryItem, ToastMessage, InventoryFilter } from "./types";
import { formatNSN, getConditionColor } from "./utils";

interface WMSInventoryProps {
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

/**
 * Inventory tab component with table and filters
 */
export default function WMSInventory({
  sites,
  selectedSiteId,
  onSelectSite,
  inventory,
  loading,
  onOpenCsvUpload,
  onOpenAddItem,
  onRefresh,
  onShowToast,
}: WMSInventoryProps) {
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

  const activeFilterCount = Object.values(filter).filter((v) => v !== "all" && v !== "").length;

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
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
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
              className={`text-sm px-3 py-2 rounded-lg border flex items-center gap-2 transition-colors ${
                activeFilterCount > 0
                  ? "border-[#004E89] bg-[#004E89]/10 text-[#004E89]"
                  : "border-border bg-white hover:bg-muted text-foreground"
              }`}
            >
              <Filter className="w-4 h-4" />
              Filter
              {activeFilterCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-[#004E89] text-white text-xs">{activeFilterCount}</span>
              )}
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-border rounded-xl shadow-lg p-4 z-10">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Condition</label>
                    <select
                      value={filter.condition}
                      onChange={(e) => setFilter({ ...filter, condition: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg bg-muted border border-border text-foreground text-sm"
                    >
                      <option value="all">All conditions</option>
                      <option value="new">New</option>
                      <option value="serviceable">Serviceable</option>
                      <option value="used">Used</option>
                      <option value="damaged">Damaged</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Mission ID</label>
                    <input
                      type="text"
                      value={filter.missionId}
                      onChange={(e) => setFilter({ ...filter, missionId: e.target.value })}
                      placeholder="Filter by mission..."
                      className="w-full px-3 py-1.5 rounded-lg bg-muted border border-border text-foreground text-sm"
                    />
                  </div>
                  <button
                    onClick={() => setFilter({ site: "all", condition: "all", ageGroup: "all", storageType: "all", missionId: "" })}
                    className="w-full text-sm text-[#004E89] hover:underline"
                  >
                    Clear filters
                  </button>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={onRefresh}
            disabled={!selectedSiteId}
            className="text-sm px-3 py-2 rounded-lg border border-border bg-white hover:bg-muted transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
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
            <p className="text-sm text-muted-foreground/70 mb-4">
              {inventory.length === 0 ? "Import CSV or add items manually" : "No items match your filters"}
            </p>
            {inventory.length === 0 && (
              <button
                onClick={handleImport}
                className="text-sm px-4 py-2 rounded-lg bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Import Inventory
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground uppercase">Requisition</th>
                  <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground uppercase">NSN</th>
                  <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground uppercase">Description</th>
                  <th className="text-right py-3 px-2 text-xs font-medium text-muted-foreground uppercase">Qty</th>
                  <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground uppercase">Condition</th>
                  <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground uppercase">Mission</th>
                  <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground uppercase">Last Moved</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map((item) => (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-2 text-sm font-medium text-foreground">{item.requisition_no}</td>
                    <td className="py-3 px-2 text-sm font-mono text-muted-foreground">{item.nsn ? formatNSN(item.nsn) : "-"}</td>
                    <td className="py-3 px-2 text-sm text-foreground max-w-[200px] truncate">{item.description || "-"}</td>
                    <td className="py-3 px-2 text-sm text-right font-medium text-foreground">{item.quantity}</td>
                    <td className="py-3 px-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getConditionColor(item.condition || "")}`}>
                        {item.condition || "-"}
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
