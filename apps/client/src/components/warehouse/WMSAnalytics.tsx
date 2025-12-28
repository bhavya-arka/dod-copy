import React from "react";
import { motion } from "framer-motion";
import { Download, Target, Box, Clock, BarChart3, TrendingUp } from "lucide-react";
import type { WarehouseSite, ToastMessage } from "./types";
import { AGING_SUMMARY } from "./constants";

interface WMSAnalyticsProps {
  sites: WarehouseSite[];
  selectedSiteId: number | null;
  onSelectSite: (id: number | null) => void;
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

/**
 * Analytics tab component - Capacity trends and mission readiness
 */
export default function WMSAnalytics({
  sites,
  selectedSiteId,
  onSelectSite,
  onShowToast,
}: WMSAnalyticsProps) {
  const readinessScore = 87;

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
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
                  cx="50"
                  cy="50"
                  r="40"
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
              <p className="text-sm text-muted-foreground">
                Overall readiness score based on inventory completeness and aging status
              </p>
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
            {AGING_SUMMARY.map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${item.color}`} />
                  <span className="text-sm text-foreground">{item.label}</span>
                </div>
                <span className="text-sm font-medium text-foreground">0</span>
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
