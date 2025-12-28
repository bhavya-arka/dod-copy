import React from "react";
import { motion } from "framer-motion";
import {
  Warehouse,
  Box,
  Clock,
  AlertTriangle,
  Plus,
  Upload,
  Download,
  ArrowRightLeft,
  Loader2,
  Truck,
  Zap,
  FileText,
  ChevronRight,
} from "lucide-react";
import type { WarehouseSite, Transfer, ToastMessage, WMSTab } from "./types";
import { calculateCapacityUsage } from "./utils";
import { AGING_ALERTS } from "./constants";

interface WMSDashboardProps {
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

/**
 * Dashboard tab component - real-time warehouse operations and capacity monitoring
 */
export default function WMSDashboard({
  sites,
  loading,
  totalItems,
  activeTransfers,
  transfers,
  onAddSite,
  onRefresh,
  onTabChange,
  onShowToast,
  onOpenCsvUpload,
}: WMSDashboardProps) {
  const hasSites = sites.length > 0;
  const inTransitCount = transfers.filter((t) => t.status === "in_transit").length;
  const capacityUsed = calculateCapacityUsage(totalItems, sites.length);

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
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">Mission Dashboard</h1>
        <p className="text-muted-foreground">Real-time warehouse operations and capacity monitoring</p>
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
            {AGING_ALERTS.map((alert) => (
              <div key={alert.years} className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${alert.color}`} />
                  <div>
                    <p className="text-sm font-medium text-foreground">{alert.years}</p>
                    <p className="text-xs text-muted-foreground">{alert.label}</p>
                  </div>
                </div>
                <span className="text-xl font-bold text-foreground">0</span>
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
