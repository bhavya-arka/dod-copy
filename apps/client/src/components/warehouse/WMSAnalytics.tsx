import React, { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Download, Target, Box, Clock, BarChart3, TrendingUp, RefreshCw, FileText } from "lucide-react";
import type { WarehouseSite, ToastMessage } from "./types";
import { AGING_SUMMARY } from "./constants";
import { generateWarehouseAnalyticsPDF } from "../../lib/warehouseAnalyticsPdfExport";

interface AgingBreakdown {
  lessThan1Year: number;
  oneToThreeYears: number;
  threeToFiveYears: number;
  moreThanFiveYears: number;
}

interface SiteAnalytics {
  siteId: number;
  siteCode: string;
  siteName: string;
  totalItems: number;
  totalQuantity: number;
  totalValue: number;
  capacityUtilization: number;
  agingBreakdown: AgingBreakdown;
  readinessScore: number;
}

interface OverallAnalytics {
  totalItems: number;
  totalValue: number;
  agingBreakdown: AgingBreakdown;
  readinessScore: number;
}

interface AnalyticsData {
  overall: OverallAnalytics;
  sites: SiteAnalytics[];
}

interface HistorySnapshot {
  id: number;
  snapshot_date: string;
  metrics: {
    totalItems: number;
    capacityUtilization: number;
    agingBreakdown: AgingBreakdown;
  };
}

interface WMSAnalyticsProps {
  sites: WarehouseSite[];
  selectedSiteId: number | null;
  onSelectSite: (id: number | null) => void;
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

export default function WMSAnalytics({
  sites,
  selectedSiteId,
  onSelectSite,
  onShowToast,
}: WMSAnalyticsProps) {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [snapshotting, setSnapshotting] = useState(false);

  const fetchAnalytics = useCallback(async () => {
    try {
      const response = await fetch("/api/warehouse/analytics", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
      }
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/warehouse/analytics/history?limit=30", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setHistory(data);
      }
    } catch (error) {
      console.error("Failed to fetch history:", error);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchAnalytics(), fetchHistory()]);
      setLoading(false);
    };
    loadData();
  }, [fetchAnalytics, fetchHistory]);

  const handleTakeSnapshot = async () => {
    setSnapshotting(true);
    try {
      const response = await fetch("/api/warehouse/analytics/snapshot", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (response.ok) {
        onShowToast("Snapshot saved successfully!", "success");
        await fetchHistory();
      } else {
        onShowToast("Failed to save snapshot", "error");
      }
    } catch (error) {
      console.error("Failed to take snapshot:", error);
      onShowToast("Failed to save snapshot", "error");
    } finally {
      setSnapshotting(false);
    }
  };

  const handleExportCSV = () => {
    if (!analytics) {
      onShowToast("No data to export", "warning");
      return;
    }

    const rows = [
      ["Site Code", "Site Name", "Total Items", "Total Quantity", "Total Value", "Capacity %", "Readiness %", "< 1 Year", "1-3 Years", "3-5 Years", "> 5 Years"],
      ...analytics.sites.map((site) => [
        site.siteCode,
        site.siteName,
        site.totalItems.toString(),
        site.totalQuantity.toString(),
        site.totalValue.toFixed(2),
        site.capacityUtilization.toString(),
        site.readinessScore.toString(),
        site.agingBreakdown.lessThan1Year.toString(),
        site.agingBreakdown.oneToThreeYears.toString(),
        site.agingBreakdown.threeToFiveYears.toString(),
        site.agingBreakdown.moreThanFiveYears.toString(),
      ]),
      [],
      ["OVERALL", "", analytics.overall.totalItems.toString(), "", analytics.overall.totalValue.toFixed(2), "", analytics.overall.readinessScore.toString(),
       analytics.overall.agingBreakdown.lessThan1Year.toString(),
       analytics.overall.agingBreakdown.oneToThreeYears.toString(),
       analytics.overall.agingBreakdown.threeToFiveYears.toString(),
       analytics.overall.agingBreakdown.moreThanFiveYears.toString()],
    ];

    const csvContent = rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `warehouse_analytics_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    onShowToast("CSV exported successfully!", "success");
  };

  const handleExportPDF = () => {
    if (!analytics) {
      onShowToast("No data to export", "warning");
      return;
    }

    try {
      generateWarehouseAnalyticsPDF(analytics);
      onShowToast("PDF exported successfully!", "success");
    } catch (error) {
      console.error("Failed to export PDF:", error);
      onShowToast(error instanceof Error ? error.message : "Failed to export PDF", "error");
    }
  };

  const readinessScore = analytics?.overall.readinessScore ?? 0;
  const agingData = analytics?.overall.agingBreakdown ?? {
    lessThan1Year: 0,
    oneToThreeYears: 0,
    threeToFiveYears: 0,
    moreThanFiveYears: 0,
  };

  const agingCounts = [
    agingData.lessThan1Year,
    agingData.oneToThreeYears,
    agingData.threeToFiveYears,
    agingData.moreThanFiveYears,
  ];

  const maxAgingCount = Math.max(...agingCounts, 1);

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Analytics</h1>
            <p className="text-muted-foreground">Capacity trends and mission readiness</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleTakeSnapshot}
              disabled={snapshotting}
              className="text-sm px-3 py-2 rounded-lg border border-border bg-white hover:bg-muted transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${snapshotting ? "animate-spin" : ""}`} />
              {snapshotting ? "Saving..." : "Take Snapshot"}
            </button>
            <button
              onClick={handleExportPDF}
              className="text-sm px-3 py-2 rounded-lg border border-border bg-white hover:bg-muted transition-colors flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Export PDF
            </button>
            <button
              onClick={handleExportCSV}
              className="text-sm px-3 py-2 rounded-lg border border-border bg-white hover:bg-muted transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>
      </motion.div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-4 border-[#004E89] border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
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
                  <p className="text-xs text-muted-foreground mt-1">
                    Total value: ${(analytics?.overall.totalValue ?? 0).toLocaleString()}
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
                {analytics?.sites.slice(0, 4).map((site) => (
                  <div key={site.siteId}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-foreground truncate mr-2">{site.siteName}</span>
                      <span className="text-muted-foreground">{site.capacityUtilization}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          site.capacityUtilization > 80
                            ? "bg-[#DC2626]"
                            : site.capacityUtilization > 60
                            ? "bg-[#F59E0B]"
                            : "bg-[#16A34A]"
                        }`}
                        style={{ width: `${site.capacityUtilization}%` }}
                      />
                    </div>
                  </div>
                ))}
                {(!analytics?.sites || analytics.sites.length === 0) && (
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
                {AGING_SUMMARY.map((item, index) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${item.color}`} />
                      <span className="text-sm text-foreground">{item.label}</span>
                    </div>
                    <span className="text-sm font-medium text-foreground">{agingCounts[index].toLocaleString()}</span>
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
              {history.length > 0 ? (
                <div className="h-48 flex items-end gap-1">
                  {history.slice(-20).map((snapshot, index) => {
                    const utilization = snapshot.metrics?.capacityUtilization ?? 0;
                    return (
                      <div
                        key={snapshot.id}
                        className="flex-1 flex flex-col items-center"
                        title={`${snapshot.snapshot_date}: ${utilization}%`}
                      >
                        <div
                          className={`w-full rounded-t transition-all ${
                            utilization > 80 ? "bg-[#DC2626]" : utilization > 60 ? "bg-[#F59E0B]" : "bg-[#16A34A]"
                          }`}
                          style={{ height: `${Math.max(utilization * 1.5, 5)}px` }}
                        />
                        {index % 5 === 0 && (
                          <span className="text-[10px] text-muted-foreground mt-1 rotate-45 origin-left">
                            {new Date(snapshot.snapshot_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
                  <BarChart3 className="w-12 h-12 mb-4 opacity-50" />
                  <p>No historical data yet</p>
                  <p className="text-sm text-muted-foreground/70">Take snapshots to track capacity over time</p>
                </div>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
              className="rounded-2xl bg-white border border-border shadow-sm p-6"
            >
              <h2 className="text-lg font-semibold text-foreground mb-4">Aging Curve</h2>
              {analytics?.overall.totalItems && analytics.overall.totalItems > 0 ? (
                <div className="h-48 flex items-end justify-around gap-4 px-4">
                  {AGING_SUMMARY.map((item, index) => {
                    const count = agingCounts[index];
                    const height = (count / maxAgingCount) * 100;
                    return (
                      <div key={item.label} className="flex flex-col items-center flex-1">
                        <span className="text-xs font-medium text-foreground mb-1">{count.toLocaleString()}</span>
                        <div
                          className={`w-full max-w-[60px] rounded-t transition-all ${item.color}`}
                          style={{ height: `${Math.max(height * 1.5, 10)}px` }}
                        />
                        <span className="text-xs text-muted-foreground mt-2 text-center">{item.label}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
                  <TrendingUp className="w-12 h-12 mb-4 opacity-50" />
                  <p>No inventory data</p>
                  <p className="text-sm text-muted-foreground/70">Import inventory to see aging distribution</p>
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </>
  );
}
