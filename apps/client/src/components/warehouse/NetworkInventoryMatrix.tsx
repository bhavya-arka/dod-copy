import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Grid3X3,
  Search,
  Filter,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Package,
  MapPin,
} from "lucide-react";
import {
  fetchNetworkInventory,
  fetchNetworkShortages,
  fetchNetworkSurpluses,
  createRebalancingSuggestion,
  type NetworkInventoryItem,
  type NetworkInventoryResponse,
  type NetworkShortage,
  type NetworkSurplus,
} from "../../services/warehouseService";
import type { ToastMessage } from "./types";

interface NetworkInventoryMatrixProps {
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

type StatusFilter = "all" | "shortages" | "surpluses" | "ok";

function getStatusColor(status: string): string {
  switch (status) {
    case "ok":
      return "bg-green-500/20 text-green-400 border-green-500/30";
    case "low":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "critical":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    case "surplus":
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    default:
      return "bg-slate-600/20 text-slate-400 border-slate-500/30";
  }
}

function getStatusDot(status: string): string {
  switch (status) {
    case "ok":
      return "bg-green-500";
    case "low":
      return "bg-yellow-500";
    case "critical":
      return "bg-red-500";
    case "surplus":
      return "bg-blue-500";
    default:
      return "bg-slate-500";
  }
}

export default function NetworkInventoryMatrix({
  onShowToast,
}: NetworkInventoryMatrixProps) {
  const [loading, setLoading] = useState(true);
  const [networkData, setNetworkData] = useState<NetworkInventoryResponse | null>(null);
  const [shortages, setShortages] = useState<NetworkShortage[]>([]);
  const [surpluses, setSurpluses] = useState<NetworkSurplus[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedShortages, setExpandedShortages] = useState<Set<number>>(new Set());
  const [expandedSurpluses, setExpandedSurpluses] = useState<Set<number>>(new Set());
  const [creatingRebalance, setCreatingRebalance] = useState<number | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [inventoryData, shortagesData, surplusesData] = await Promise.all([
        fetchNetworkInventory(),
        fetchNetworkShortages(),
        fetchNetworkSurpluses(),
      ]);
      setNetworkData(inventoryData);
      setShortages(shortagesData);
      setSurpluses(surplusesData);
    } catch (error) {
      console.error("Failed to load network inventory:", error);
      onShowToast("Failed to load network inventory data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredItems = useMemo(() => {
    if (!networkData) return [];
    
    let items = networkData.items;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      items = items.filter(
        (item) =>
          item.nsn.toLowerCase().includes(term) ||
          item.description.toLowerCase().includes(term)
      );
    }

    if (statusFilter !== "all") {
      items = items.filter((item) => {
        const hasStatus = item.sites.some((s) => {
          if (statusFilter === "shortages") return s.status === "critical" || s.status === "low";
          if (statusFilter === "surpluses") return s.status === "surplus";
          if (statusFilter === "ok") return s.status === "ok";
          return true;
        });
        return hasStatus;
      });
    }

    return items;
  }, [networkData, searchTerm, statusFilter]);

  const toggleShortageExpand = (id: number) => {
    setExpandedShortages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSurplusExpand = (id: number) => {
    setExpandedSurpluses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCreateRebalance = async (
    shortageId: number,
    surplusId: number,
    quantity: number
  ) => {
    setCreatingRebalance(shortageId);
    try {
      await createRebalancingSuggestion({
        shortageId,
        surplusId,
        quantity,
      });
      onShowToast("Rebalancing suggestion created successfully", "success");
      await loadData();
    } catch (error) {
      console.error("Failed to create rebalancing suggestion:", error);
      onShowToast("Failed to create rebalancing suggestion", "error");
    } finally {
      setCreatingRebalance(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-3 text-slate-400">Loading network inventory...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Grid3X3 className="w-7 h-7 text-blue-500" />
            Network Inventory Matrix
          </h1>
          <p className="text-slate-400 mt-1">
            Cross-site inventory visibility and rebalancing
          </p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </motion.div>

      {networkData && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-4"
        >
          <div className="p-4 rounded-xl bg-slate-800 border border-slate-700">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
              <Package className="w-4 h-4" />
              Total Items
            </div>
            <p className="text-2xl font-bold text-white">
              {networkData.summary.totalItems}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-800 border border-slate-700">
            <div className="flex items-center gap-2 text-green-400 text-sm mb-1">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              Items OK
            </div>
            <p className="text-2xl font-bold text-white">
              {networkData.summary.itemsOk}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-800 border border-slate-700">
            <div className="flex items-center gap-2 text-red-400 text-sm mb-1">
              <TrendingDown className="w-4 h-4" />
              Shortages
            </div>
            <p className="text-2xl font-bold text-white">
              {networkData.summary.totalShortages}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-800 border border-slate-700">
            <div className="flex items-center gap-2 text-blue-400 text-sm mb-1">
              <TrendingUp className="w-4 h-4" />
              Surpluses
            </div>
            <p className="text-2xl font-bold text-white">
              {networkData.summary.totalSurpluses}
            </p>
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex flex-col sm:flex-row gap-4"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by NSN or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="shortages">Shortages Only</option>
            <option value="surpluses">Surpluses Only</option>
            <option value="ok">OK Only</option>
          </select>
        </div>
      </motion.div>

      {networkData && networkData.sites.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl bg-slate-800 border border-slate-700 overflow-hidden"
        >
          <div className="p-4 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-white">Inventory Matrix</h2>
            <p className="text-sm text-slate-400">
              Rows = NSN/Items, Columns = Sites
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-900/50">
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-300 border-b border-slate-700 sticky left-0 bg-slate-900/50 min-w-[200px]">
                    NSN / Description
                  </th>
                  {networkData.sites.map((site) => (
                    <th
                      key={site.id}
                      className="text-center px-4 py-3 text-sm font-medium text-slate-300 border-b border-slate-700 min-w-[120px]"
                    >
                      <div className="flex flex-col items-center">
                        <MapPin className="w-3 h-3 mb-1 text-slate-500" />
                        <span>{site.code}</span>
                      </div>
                    </th>
                  ))}
                  <th className="text-center px-4 py-3 text-sm font-medium text-slate-300 border-b border-slate-700 min-w-[100px]">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={networkData.sites.length + 2}
                      className="px-4 py-12 text-center text-slate-400"
                    >
                      No inventory items found matching your criteria
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item, idx) => (
                    <tr
                      key={item.nsn}
                      className={`${idx % 2 === 0 ? "bg-slate-800/50" : "bg-slate-800"} hover:bg-slate-700/50 transition-colors`}
                    >
                      <td className="px-4 py-3 border-b border-slate-700 sticky left-0 bg-inherit">
                        <div className="text-sm font-mono text-white">
                          {item.nsn}
                        </div>
                        <div className="text-xs text-slate-400 truncate max-w-[200px]">
                          {item.description}
                        </div>
                      </td>
                      {networkData.sites.map((site) => {
                        const siteData = item.sites.find(
                          (s) => s.siteId === site.id
                        );
                        if (!siteData) {
                          return (
                            <td
                              key={site.id}
                              className="px-4 py-3 text-center border-b border-slate-700"
                            >
                              <span className="text-slate-600">—</span>
                            </td>
                          );
                        }
                        return (
                          <td
                            key={site.id}
                            className="px-4 py-3 text-center border-b border-slate-700"
                          >
                            <div
                              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border ${getStatusColor(siteData.status)}`}
                            >
                              <div
                                className={`w-1.5 h-1.5 rounded-full ${getStatusDot(siteData.status)}`}
                              />
                              <span className="font-medium">
                                {siteData.quantity}
                              </span>
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-center border-b border-slate-700">
                        <span className="font-bold text-white">
                          {item.totalQuantity}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-xl bg-slate-800 border border-slate-700 overflow-hidden"
        >
          <div className="p-4 border-b border-slate-700 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h2 className="text-lg font-semibold text-white">Shortages</h2>
            <span className="ml-auto text-sm text-slate-400">
              {shortages.length} items below reorder point
            </span>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {shortages.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <TrendingDown className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No shortages detected</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-700">
                {shortages.map((shortage) => (
                  <div key={shortage.id} className="p-4">
                    <div
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => toggleShortageExpand(shortage.id)}
                    >
                      <div>
                        <div className="text-sm font-mono text-white">
                          {shortage.nsn}
                        </div>
                        <div className="text-xs text-slate-400">
                          {shortage.description}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-500">
                            {shortage.siteCode}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400">
                            -{shortage.shortfall} shortfall
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className="text-sm text-white">
                            {shortage.currentQuantity}
                          </div>
                          <div className="text-xs text-slate-400">
                            / {shortage.reorderPoint} reorder
                          </div>
                        </div>
                        {expandedShortages.has(shortage.id) ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </div>
                    {expandedShortages.has(shortage.id) &&
                      shortage.suggestedTransfers.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-700">
                          <div className="text-xs text-slate-400 mb-2">
                            Suggested Transfers:
                          </div>
                          <div className="space-y-2">
                            {shortage.suggestedTransfers.map((transfer, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between p-2 rounded-lg bg-slate-700/50"
                              >
                                <div className="flex items-center gap-2">
                                  <ArrowRightLeft className="w-4 h-4 text-blue-400" />
                                  <span className="text-sm text-white">
                                    {transfer.fromSiteCode}
                                  </span>
                                  <span className="text-xs text-slate-400">
                                    ({transfer.availableQuantity} avail)
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-green-400">
                                    +{transfer.suggestedQuantity}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const matchingSurplus = surpluses.find(
                                        (s) =>
                                          s.nsn === shortage.nsn &&
                                          s.siteId === transfer.fromSiteId
                                      );
                                      if (matchingSurplus) {
                                        handleCreateRebalance(
                                          shortage.id,
                                          matchingSurplus.id,
                                          transfer.suggestedQuantity
                                        );
                                      }
                                    }}
                                    disabled={creatingRebalance === shortage.id}
                                    className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50"
                                  >
                                    {creatingRebalance === shortage.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      "Rebalance"
                                    )}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="rounded-xl bg-slate-800 border border-slate-700 overflow-hidden"
        >
          <div className="p-4 border-b border-slate-700 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-white">Surpluses</h2>
            <span className="ml-auto text-sm text-slate-400">
              {surpluses.length} items above max threshold
            </span>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {surpluses.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No surpluses detected</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-700">
                {surpluses.map((surplus) => (
                  <div key={surplus.id} className="p-4">
                    <div
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => toggleSurplusExpand(surplus.id)}
                    >
                      <div>
                        <div className="text-sm font-mono text-white">
                          {surplus.nsn}
                        </div>
                        <div className="text-xs text-slate-400">
                          {surplus.description}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-500">
                            {surplus.siteCode}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
                            +{surplus.excess} excess
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className="text-sm text-white">
                            {surplus.currentQuantity}
                          </div>
                          <div className="text-xs text-slate-400">
                            / {surplus.maxThreshold} max
                          </div>
                        </div>
                        {expandedSurpluses.has(surplus.id) ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </div>
                    {expandedSurpluses.has(surplus.id) &&
                      surplus.suggestedTransfers.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-700">
                          <div className="text-xs text-slate-400 mb-2">
                            Can Transfer To:
                          </div>
                          <div className="space-y-2">
                            {surplus.suggestedTransfers.map((transfer, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between p-2 rounded-lg bg-slate-700/50"
                              >
                                <div className="flex items-center gap-2">
                                  <ArrowRightLeft className="w-4 h-4 text-green-400" />
                                  <span className="text-sm text-white">
                                    {transfer.toSiteCode}
                                  </span>
                                  <span className="text-xs text-slate-400">
                                    ({transfer.currentQuantity} current)
                                  </span>
                                </div>
                                <span className="text-sm text-blue-400">
                                  Send {transfer.suggestedQuantity}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
