import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Loader2,
  ArrowRightLeft,
  TrendingUp,
  Zap,
  MapPin,
  Package,
  RefreshCw,
  Calendar,
  ArrowUp,
  ArrowDown,
  Minus,
  AlertTriangle,
  Database,
} from "lucide-react";
import type { ToastMessage } from "./types";

interface WMSAnalyticsDashboardProps {
  siteId: number;
  siteName: string;
  onClose: () => void;
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

interface MovementAnalytics {
  mostMovingItems: Array<{
    itemId: number;
    description: string;
    nsn: string | null;
    moveCount: number;
    totalQuantityMoved: number;
  }>;
  recentlyMoved: Array<{
    id: number;
    itemDescription: string;
    fromZone: string | null;
    toZone: string | null;
    fromLocation: string | null;
    toLocation: string | null;
    quantityMoved: number;
    movedAt: string;
    movementType: string;
  }>;
  movementsByZone: Array<{
    zoneName: string;
    inbound: number;
    outbound: number;
    net: number;
  }>;
  totalMovements: number;
  periodDays: number;
}

interface GrowthInsights {
  capacityTrends: Array<{
    date: string;
    utilizationPercent: number;
    totalItems: number;
    inboundCount: number;
    outboundCount: number;
  }>;
  growthRate: {
    percentChange: number;
    direction: "up" | "down" | "stable";
    periodDays: number;
  };
  projectedCapacity: {
    daysUntilFull: number | null;
    projectedUtilization30Days: number;
    projectedUtilization90Days: number;
  };
  peakUtilization: {
    date: string;
    value: number;
  } | null;
}

interface VelocityAnalytics {
  fastMovers: Array<{
    itemId: number;
    description: string;
    nsn: string | null;
    moveCount: number;
    avgDaysInLocation: number;
    velocity: "high" | "medium" | "low";
  }>;
  slowMovers: Array<{
    itemId: number;
    description: string;
    nsn: string | null;
    daysStatic: number;
    lastMoved: string | null;
  }>;
  throughputMetrics: {
    dailyAverage: number;
    weeklyAverage: number;
    monthlyTotal: number;
  };
}

interface ZoneHeatmapData {
  zones: Array<{
    zoneId: number;
    zoneName: string;
    movementIntensity: number;
    totalMovements: number;
    utilizationPercent: number;
  }>;
  maxIntensity: number;
}

type TabId = "movements" | "growth" | "velocity" | "heatmap";

export default function WMSAnalyticsDashboard({
  siteId,
  siteName,
  onClose,
  onShowToast,
}: WMSAnalyticsDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>("movements");
  const [loading, setLoading] = useState(false);
  const [daysFilter, setDaysFilter] = useState(30);
  
  const [movementData, setMovementData] = useState<MovementAnalytics | null>(null);
  const [growthData, setGrowthData] = useState<GrowthInsights | null>(null);
  const [velocityData, setVelocityData] = useState<VelocityAnalytics | null>(null);
  const [heatmapData, setHeatmapData] = useState<ZoneHeatmapData | null>(null);

  const fetchAnalytics = useCallback(async (tab: TabId) => {
    setLoading(true);
    try {
      const endpoint = `/api/warehouse/sites/${siteId}/analytics/${tab === "heatmap" ? "heatmap" : tab}`;
      const params = tab !== "heatmap" ? `?days=${daysFilter}` : "";
      const response = await fetch(endpoint + params, { credentials: "include" });
      
      if (!response.ok) {
        throw new Error("Failed to fetch analytics");
      }
      
      const data = await response.json();
      
      switch (tab) {
        case "movements":
          setMovementData(data);
          break;
        case "growth":
          setGrowthData(data);
          break;
        case "velocity":
          setVelocityData(data);
          break;
        case "heatmap":
          setHeatmapData(data);
          break;
      }
    } catch (err) {
      console.error(`Failed to fetch ${tab} analytics:`, err);
      onShowToast(`Failed to load ${tab} analytics`, "error");
    } finally {
      setLoading(false);
    }
  }, [siteId, daysFilter, onShowToast]);

  useEffect(() => {
    fetchAnalytics(activeTab);
  }, [activeTab, fetchAnalytics]);

  const handleGenerateDemoData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/warehouse/sites/${siteId}/analytics/generate-demo-data`, {
        method: "POST",
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Failed to generate demo data");
      }
      
      const result = await response.json();
      onShowToast(`Generated ${result.movementsCreated} movement records and ${result.snapshotsCreated} capacity snapshots`, "success");
      fetchAnalytics(activeTab);
    } catch (err) {
      onShowToast("Failed to generate demo data", "error");
    } finally {
      setLoading(false);
    }
  };

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "movements", label: "Movement Analytics", icon: <ArrowRightLeft className="w-4 h-4" /> },
    { id: "growth", label: "Growth Insights", icon: <TrendingUp className="w-4 h-4" /> },
    { id: "velocity", label: "Velocity Analysis", icon: <Zap className="w-4 h-4" /> },
    { id: "heatmap", label: "Zone Heatmap", icon: <MapPin className="w-4 h-4" /> },
  ];

  const renderMovementsTab = () => {
    if (!movementData) {
      return (
        <div className="text-center py-12">
          <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No movement data available</p>
          <button
            onClick={handleGenerateDemoData}
            className="mt-4 px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto"
          >
            <Database className="w-4 h-4" />
            Generate Demo Data
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 mb-2">
              <ArrowRightLeft className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-400">Total Movements</span>
            </div>
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{(movementData.totalMovements || 0).toLocaleString()}</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">Last {movementData.periodDays || 30} days</p>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-5 h-5 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Most Active Items</span>
            </div>
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{(movementData.mostMovingItems || []).length}</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">Tracked items</p>
          </div>

          <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-5 h-5 text-purple-600" />
              <span className="text-sm font-medium text-purple-700 dark:text-purple-400">Active Zones</span>
            </div>
            <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{(movementData.movementsByZone || []).length}</p>
            <p className="text-xs text-purple-600 dark:text-purple-400">With activity</p>
          </div>
        </div>

        {(movementData.mostMovingItems || []).length > 0 && (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="p-3 bg-slate-800/80 border-b border-border">
              <h3 className="font-medium text-white">Most Moving Items</h3>
            </div>
            <div className="divide-y divide-border max-h-64 overflow-y-auto">
              {(movementData.mostMovingItems || []).slice(0, 10).map((item, idx) => (
                <div key={item.itemId} className="flex items-center justify-between p-3 hover:bg-muted/30">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-medium flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.description}</p>
                      {item.nsn && <p className="text-xs text-muted-foreground">NSN: {item.nsn}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-foreground">{item.moveCount} moves</p>
                    <p className="text-xs text-muted-foreground">{item.totalQuantityMoved} units</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(movementData.recentlyMoved || []).length > 0 && (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="p-3 bg-slate-800/80 border-b border-border">
              <h3 className="font-medium text-white">Recent Movements</h3>
            </div>
            <div className="divide-y divide-border max-h-64 overflow-y-auto">
              {(movementData.recentlyMoved || []).slice(0, 10).map((movement) => (
                <div key={movement.id} className="p-3 hover:bg-muted/30">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-foreground">{movement.itemDescription}</p>
                    <span className="text-xs text-muted-foreground">
                      {new Date(movement.movedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{movement.fromZone || movement.fromLocation || "—"}</span>
                    <ArrowRightLeft className="w-3 h-3" />
                    <span>{movement.toZone || movement.toLocation || "—"}</span>
                    <span className="ml-auto px-2 py-0.5 rounded bg-muted">{movement.movementType}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderGrowthTab = () => {
    if (!growthData) {
      return (
        <div className="text-center py-12">
          <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No growth data available</p>
          <button
            onClick={handleGenerateDemoData}
            className="mt-4 px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto"
          >
            <Database className="w-4 h-4" />
            Generate Demo Data
          </button>
        </div>
      );
    }

    const growthRate = growthData.growthRate || { direction: "stable", percentChange: 0, periodDays: 30 };
    const projectedCapacity = growthData.projectedCapacity || { projectedUtilization30Days: 0, projectedUtilization90Days: 0, daysUntilFull: null };
    const capacityTrends = growthData.capacityTrends || [];
    
    const trendIcon = growthRate.direction === "up" 
      ? <ArrowUp className="w-4 h-4" />
      : growthRate.direction === "down"
      ? <ArrowDown className="w-4 h-4" />
      : <Minus className="w-4 h-4" />;
    
    const trendColor = growthRate.direction === "up"
      ? "text-amber-600 bg-amber-50 border-amber-200"
      : growthRate.direction === "down"
      ? "text-emerald-600 bg-emerald-50 border-emerald-200"
      : "text-slate-600 bg-slate-50 border-slate-200";

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className={`p-4 rounded-xl border ${trendColor}`}>
            <div className="flex items-center gap-2 mb-2">
              {trendIcon}
              <span className="text-sm font-medium">Growth Rate</span>
            </div>
            <p className="text-2xl font-bold">
              {growthRate.direction === "up" ? "+" : ""}
              {(growthRate.percentChange || 0).toFixed(1)}%
            </p>
            <p className="text-xs opacity-80">Last {growthRate.periodDays || 30} days</p>
          </div>

          <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-400">30-Day Projection</span>
            </div>
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
              {(projectedCapacity.projectedUtilization30Days || 0).toFixed(1)}%
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400">Projected utilization</p>
          </div>

          <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-medium text-purple-700 dark:text-purple-400">90-Day Projection</span>
            </div>
            <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">
              {(projectedCapacity.projectedUtilization90Days || 0).toFixed(1)}%
            </p>
            <p className="text-xs text-purple-600 dark:text-purple-400">Projected utilization</p>
          </div>

          {projectedCapacity.daysUntilFull !== null && (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span className="text-sm font-medium text-red-700 dark:text-red-400">Days Until Full</span>
              </div>
              <p className="text-2xl font-bold text-red-700 dark:text-red-300">
                {projectedCapacity.daysUntilFull}
              </p>
              <p className="text-xs text-red-600 dark:text-red-400">At current rate</p>
            </div>
          )}
        </div>

        {capacityTrends.length > 0 && (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="p-3 bg-slate-800/80 border-b border-border">
              <h3 className="font-medium text-white">Capacity Trends</h3>
            </div>
            <div className="p-4">
              <div className="h-48 flex items-end gap-1">
                {capacityTrends.slice(-30).map((trend, idx) => {
                  const height = Math.max(4, (trend.utilizationPercent / 100) * 100);
                  const barColor = trend.utilizationPercent > 80 
                    ? "bg-red-500" 
                    : trend.utilizationPercent > 60 
                    ? "bg-amber-500" 
                    : "bg-emerald-500";
                  
                  return (
                    <div 
                      key={idx} 
                      className="flex-1 flex flex-col items-center gap-1"
                      title={`${new Date(trend.date).toLocaleDateString()}: ${trend.utilizationPercent.toFixed(1)}%`}
                    >
                      <div 
                        className={`w-full ${barColor} rounded-t transition-all hover:opacity-80`}
                        style={{ height: `${height}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span>{capacityTrends.length > 0 && new Date(capacityTrends[0].date).toLocaleDateString()}</span>
                <span>Today</span>
              </div>
            </div>
          </div>
        )}

        {growthData.peakUtilization && (
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <span className="font-medium text-amber-700 dark:text-amber-400">Peak Utilization</span>
            </div>
            <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
              Reached {growthData.peakUtilization.value.toFixed(1)}% utilization on{" "}
              {new Date(growthData.peakUtilization.date).toLocaleDateString()}
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderVelocityTab = () => {
    if (!velocityData) {
      return (
        <div className="text-center py-12">
          <Zap className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No velocity data available</p>
          <button
            onClick={handleGenerateDemoData}
            className="mt-4 px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto"
          >
            <Database className="w-4 h-4" />
            Generate Demo Data
          </button>
        </div>
      );
    }

    const throughputMetrics = velocityData.throughputMetrics || { dailyAverage: 0, weeklyAverage: 0, monthlyTotal: 0 };
    const fastMovers = velocityData.fastMovers || [];
    const slowMovers = velocityData.slowMovers || [];

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-400">Daily Average</span>
            </div>
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
              {(throughputMetrics.dailyAverage || 0).toFixed(1)}
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400">Movements per day</p>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Weekly Average</span>
            </div>
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
              {(throughputMetrics.weeklyAverage || 0).toFixed(1)}
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">Movements per week</p>
          </div>

          <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
            <div className="flex items-center gap-2 mb-2">
              <ArrowRightLeft className="w-5 h-5 text-purple-600" />
              <span className="text-sm font-medium text-purple-700 dark:text-purple-400">Monthly Total</span>
            </div>
            <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">
              {(throughputMetrics.monthlyTotal || 0).toLocaleString()}
            </p>
            <p className="text-xs text-purple-600 dark:text-purple-400">Total movements</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fastMovers.length > 0 && (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="p-3 bg-emerald-600 border-b border-border">
                <h3 className="font-medium text-white flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Fast Movers
                </h3>
              </div>
              <div className="divide-y divide-border max-h-64 overflow-y-auto">
                {fastMovers.slice(0, 8).map((item) => (
                  <div key={item.itemId} className="flex items-center justify-between p-3 hover:bg-muted/30">
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.description}</p>
                      {item.nsn && <p className="text-xs text-muted-foreground">NSN: {item.nsn}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-600">{item.moveCount} moves</p>
                      <p className="text-xs text-muted-foreground">~{item.avgDaysInLocation.toFixed(0)} days avg</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {slowMovers.length > 0 && (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="p-3 bg-amber-600 border-b border-border">
                <h3 className="font-medium text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Slow Movers (Stale Inventory)
                </h3>
              </div>
              <div className="divide-y divide-border max-h-64 overflow-y-auto">
                {slowMovers.slice(0, 8).map((item) => (
                  <div key={item.itemId} className="flex items-center justify-between p-3 hover:bg-muted/30">
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.description}</p>
                      {item.nsn && <p className="text-xs text-muted-foreground">NSN: {item.nsn}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-amber-600">{item.daysStatic} days static</p>
                      {item.lastMoved && (
                        <p className="text-xs text-muted-foreground">
                          Last: {new Date(item.lastMoved).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderHeatmapTab = () => {
    if (!heatmapData || heatmapData.zones.length === 0) {
      return (
        <div className="text-center py-12">
          <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No zone heatmap data available</p>
          <button
            onClick={handleGenerateDemoData}
            className="mt-4 px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto"
          >
            <Database className="w-4 h-4" />
            Generate Demo Data
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="p-4 rounded-xl bg-muted/30 border border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-foreground">Zone Activity Heatmap</h3>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Activity Level:</span>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded bg-emerald-200" />
                <span>Low</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded bg-amber-400" />
                <span>Medium</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded bg-red-500" />
                <span>High</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {heatmapData.zones.map((zone) => {
              const intensity = heatmapData.maxIntensity > 0 
                ? zone.movementIntensity / heatmapData.maxIntensity 
                : 0;
              
              let bgColor = "bg-emerald-100 border-emerald-200";
              let textColor = "text-emerald-700";
              
              if (intensity > 0.7) {
                bgColor = "bg-red-100 border-red-200";
                textColor = "text-red-700";
              } else if (intensity > 0.4) {
                bgColor = "bg-amber-100 border-amber-200";
                textColor = "text-amber-700";
              }

              return (
                <div
                  key={zone.zoneId}
                  className={`p-4 rounded-xl border ${bgColor} transition-all hover:shadow-md cursor-default`}
                  title={`${zone.totalMovements} total movements`}
                >
                  <p className={`font-bold ${textColor}`}>{zone.zoneName}</p>
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Movements</span>
                      <span className={`font-medium ${textColor}`}>{zone.totalMovements}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Utilization</span>
                      <span className={`font-medium ${textColor}`}>{zone.utilizationPercent.toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col border border-border"
      >
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Analytics Dashboard</h2>
            <p className="text-sm text-muted-foreground">{siteName}</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={daysFilter}
              onChange={(e) => setDaysFilter(parseInt(e.target.value))}
              className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={60}>Last 60 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button
              onClick={() => fetchAnalytics(activeTab)}
              disabled={loading}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
            >
              <RefreshCw className={`w-5 h-5 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="border-b border-border">
          <div className="flex gap-1 p-2 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "bg-blue-600 text-white"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === "movements" && renderMovementsTab()}
                {activeTab === "growth" && renderGrowthTab()}
                {activeTab === "velocity" && renderVelocityTab()}
                {activeTab === "heatmap" && renderHeatmapTab()}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </motion.div>
    </div>
  );
}
