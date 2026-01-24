import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
  Clock,
  AlertCircle,
  ArrowUpDown,
  ChevronRight,
  X,
  Loader2,
  RefreshCw,
  Calendar,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import type { WarehouseSite } from "./types";
import {
  fetchBenchmarks,
  fetchBenchmarkLeaderboard,
  fetchSiteBenchmarkTrend,
  captureBenchmarkMetrics,
  type SiteBenchmark,
  type BenchmarkLeaderboard,
  type SiteBenchmarkTrend,
  type SiteBenchmarkTrendDay,
  type BenchmarkLeaderboardEntry,
} from "../../services/warehouseService";

interface SiteBenchmarksProps {
  sites: WarehouseSite[];
  onShowToast?: (message: string, type?: "info" | "success" | "warning" | "error") => void;
}

type SortField = "site_name" | "throughput" | "inbound_shipments" | "outbound_shipments" | "avg_processing_hours" | "utilization_percent" | "error_count";
type SortOrder = "asc" | "desc";

const TrendIcon = ({ trend }: { trend: string }) => {
  switch (trend) {
    case "improving":
      return <TrendingUp className="w-4 h-4 text-green-400" />;
    case "declining":
      return <TrendingDown className="w-4 h-4 text-red-400" />;
    default:
      return <Minus className="w-4 h-4 text-gray-400" />;
  }
};

export default function SiteBenchmarks({ sites, onShowToast }: SiteBenchmarksProps) {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);

  const [benchmarks, setBenchmarks] = useState<SiteBenchmark[]>([]);
  const [leaderboard, setLeaderboard] = useState<BenchmarkLeaderboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [siteTrend, setSiteTrend] = useState<SiteBenchmarkTrend | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);

  const [sortField, setSortField] = useState<SortField>("throughput");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [benchmarksData, leaderboardData] = await Promise.all([
        fetchBenchmarks({ start_date: startDate, end_date: endDate }),
        fetchBenchmarkLeaderboard({ start_date: startDate, end_date: endDate }),
      ]);
      setBenchmarks(benchmarksData);
      setLeaderboard(leaderboardData);
    } catch (error) {
      onShowToast?.("Failed to load benchmarks", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [startDate, endDate]);

  const handleSiteClick = async (siteId: number) => {
    if (selectedSiteId === siteId) {
      setSelectedSiteId(null);
      setSiteTrend(null);
      return;
    }

    setSelectedSiteId(siteId);
    setTrendLoading(true);
    try {
      const trendData = await fetchSiteBenchmarkTrend(siteId, { start_date: startDate, end_date: endDate });
      setSiteTrend(trendData);
    } catch (error) {
      onShowToast?.("Failed to load site trend", "error");
    } finally {
      setTrendLoading(false);
    }
  };

  const handleCaptureMetrics = async () => {
    setCapturing(true);
    try {
      await captureBenchmarkMetrics();
      onShowToast?.("Metrics captured successfully", "success");
      fetchData();
    } catch (error) {
      onShowToast?.("Failed to capture metrics", "error");
    } finally {
      setCapturing(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const sortedBenchmarks = useMemo(() => {
    return [...benchmarks].sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      switch (sortField) {
        case "site_name":
          aVal = a.site_name || "";
          bVal = b.site_name || "";
          break;
        case "throughput":
          aVal = a.throughput || 0;
          bVal = b.throughput || 0;
          break;
        case "inbound_shipments":
          aVal = a.inbound_shipments || 0;
          bVal = b.inbound_shipments || 0;
          break;
        case "outbound_shipments":
          aVal = a.outbound_shipments || 0;
          bVal = b.outbound_shipments || 0;
          break;
        case "avg_processing_hours":
          aVal = parseFloat(a.avg_processing_hours || "0");
          bVal = parseFloat(b.avg_processing_hours || "0");
          break;
        case "utilization_percent":
          aVal = parseFloat(a.utilization_percent || "0");
          bVal = parseFloat(b.utilization_percent || "0");
          break;
        case "error_count":
          aVal = a.error_count || 0;
          bVal = b.error_count || 0;
          break;
        default:
          return 0;
      }

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortOrder === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      return sortOrder === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [benchmarks, sortField, sortOrder]);

  const SortableHeader = ({ field, label }: { field: SortField; label: string }) => (
    <TableHead
      className="text-gray-500 cursor-pointer hover:text-gray-900 transition-colors"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={`w-3 h-3 ${sortField === field ? "text-blue-400" : ""}`} />
      </div>
    </TableHead>
  );

  const maxThroughput = Math.max(...(siteTrend?.daily_data.map((d: SiteBenchmarkTrendDay) => d.throughput) || [1]));

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-400" />
            Site Benchmarks
          </h2>
          <p className="text-gray-500 mt-1">Compare performance across warehouse sites</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-gray-500 text-sm">From</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-white border-gray-200 text-gray-900 w-36"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-gray-500 text-sm">To</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-white border-gray-200 text-gray-900 w-36"
            />
          </div>
          <Button
            onClick={handleCaptureMetrics}
            disabled={capturing}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {capturing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Capture Metrics
          </Button>
        </div>
      </motion.div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        </div>
      ) : (
        <>
          {leaderboard && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-4"
            >
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Trophy className="w-5 h-5 text-yellow-400" />
                  <h3 className="text-lg font-semibold text-gray-900">Top Throughput</h3>
                </div>
                <div className="space-y-2">
                  {leaderboard.top_throughput.map((item: BenchmarkLeaderboardEntry, idx: number) => (
                    <div
                      key={item.site_id}
                      className="flex items-center justify-between p-2 rounded-lg bg-white"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${idx === 0 ? "text-yellow-400" : idx === 1 ? "text-gray-400" : idx === 2 ? "text-orange-400" : "text-gray-500"}`}>
                          #{idx + 1}
                        </span>
                        <span className="text-gray-900 text-sm">{item.site_name}</span>
                      </div>
                      <span className="text-blue-400 font-medium">{item.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-5 h-5 text-green-400" />
                  <h3 className="text-lg font-semibold text-gray-900">Fastest Processing</h3>
                </div>
                <div className="space-y-2">
                  {leaderboard.fastest_processing.map((item: BenchmarkLeaderboardEntry, idx: number) => (
                    <div
                      key={item.site_id}
                      className="flex items-center justify-between p-2 rounded-lg bg-white"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${idx === 0 ? "text-yellow-400" : idx === 1 ? "text-gray-400" : idx === 2 ? "text-orange-400" : "text-gray-500"}`}>
                          #{idx + 1}
                        </span>
                        <span className="text-gray-900 text-sm">{item.site_name}</span>
                      </div>
                      <span className="text-green-400 font-medium">{item.value.toFixed(1)}h</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-4">
                  <AlertCircle className="w-5 h-5 text-red-400" />
                  <h3 className="text-lg font-semibold text-gray-900">Lowest Error Rate</h3>
                </div>
                <div className="space-y-2">
                  {leaderboard.lowest_error_rate.map((item: BenchmarkLeaderboardEntry, idx: number) => (
                    <div
                      key={item.site_id}
                      className="flex items-center justify-between p-2 rounded-lg bg-white"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${idx === 0 ? "text-yellow-400" : idx === 1 ? "text-gray-400" : idx === 2 ? "text-orange-400" : "text-gray-500"}`}>
                          #{idx + 1}
                        </span>
                        <span className="text-gray-900 text-sm">{item.site_name}</span>
                      </div>
                      <span className="text-red-400 font-medium">{item.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          <div className="flex flex-col lg:flex-row gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl overflow-hidden"
            >
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-200 hover:bg-gray-100">
                    <SortableHeader field="site_name" label="Site" />
                    <SortableHeader field="throughput" label="Throughput" />
                    <SortableHeader field="inbound_shipments" label="Inbound" />
                    <SortableHeader field="outbound_shipments" label="Outbound" />
                    <SortableHeader field="avg_processing_hours" label="Avg Process (h)" />
                    <SortableHeader field="utilization_percent" label="Utilization" />
                    <SortableHeader field="error_count" label="Errors" />
                    <TableHead className="text-gray-500 w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedBenchmarks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-gray-500 py-8">
                        No benchmark data available
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedBenchmarks.map((bm) => (
                      <TableRow
                        key={bm.site_id}
                        className={`border-gray-200 cursor-pointer transition-colors ${
                          selectedSiteId === bm.site_id ? "bg-blue-50" : "hover:bg-gray-100"
                        }`}
                        onClick={() => handleSiteClick(bm.site_id)}
                      >
                        <TableCell className="text-gray-900 font-medium">{bm.site_name}</TableCell>
                        <TableCell className="text-blue-400">{bm.throughput?.toLocaleString() || 0}</TableCell>
                        <TableCell className="text-gray-600">{bm.inbound_shipments || 0}</TableCell>
                        <TableCell className="text-gray-600">{bm.outbound_shipments || 0}</TableCell>
                        <TableCell className="text-gray-600">
                          {parseFloat(bm.avg_processing_hours || "0").toFixed(1)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{ width: `${Math.min(parseFloat(bm.utilization_percent || "0"), 100)}%` }}
                              />
                            </div>
                            <span className="text-gray-600 text-sm">
                              {parseFloat(bm.utilization_percent || "0").toFixed(0)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className={bm.error_count && bm.error_count > 0 ? "text-red-400" : "text-gray-600"}>
                          {bm.error_count || 0}
                        </TableCell>
                        <TableCell>
                          <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform ${selectedSiteId === bm.site_id ? "rotate-90" : ""}`} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </motion.div>

            <AnimatePresence>
              {selectedSiteId && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="w-full lg:w-96 bg-gray-50 border border-gray-200 rounded-xl p-4"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {sites.find((s) => s.id === selectedSiteId)?.name || "Site"} Trend
                    </h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedSiteId(null);
                        setSiteTrend(null);
                      }}
                      className="text-gray-500 hover:text-gray-900"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  {trendLoading ? (
                    <div className="flex items-center justify-center h-48">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                    </div>
                  ) : siteTrend ? (
                    <>
                      <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-white">
                        <TrendIcon trend={siteTrend.trend_direction} />
                        <span className="text-gray-900 capitalize">{siteTrend.trend_direction}</span>
                        {siteTrend.trend_change_percent && (
                          <span className={`text-sm ${siteTrend.trend_direction === "improving" ? "text-green-400" : siteTrend.trend_direction === "declining" ? "text-red-400" : "text-gray-500"}`}>
                            ({siteTrend.trend_change_percent > 0 ? "+" : ""}{siteTrend.trend_change_percent.toFixed(1)}%)
                          </span>
                        )}
                      </div>

                      <div className="mb-4">
                        <h4 className="text-sm text-gray-500 mb-2">Daily Throughput</h4>
                        <div className="h-32 flex items-end gap-1">
                          {siteTrend.daily_data.map((day: SiteBenchmarkTrendDay, idx: number) => (
                            <div
                              key={idx}
                              className="flex-1 flex flex-col items-center"
                              title={`${day.date}: ${day.throughput}`}
                            >
                              <div
                                className="w-full bg-blue-500 rounded-t transition-all hover:bg-blue-400"
                                style={{
                                  height: `${(day.throughput / maxThroughput) * 100}%`,
                                  minHeight: "4px",
                                }}
                              />
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>{siteTrend.daily_data[0]?.date?.split("-").slice(1).join("/")}</span>
                          <span>{siteTrend.daily_data[siteTrend.daily_data.length - 1]?.date?.split("-").slice(1).join("/")}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-white">
                          <div className="text-xs text-gray-500">Avg Throughput</div>
                          <div className="text-lg font-semibold text-gray-900">
                            {siteTrend.avg_throughput?.toLocaleString() || 0}
                          </div>
                        </div>
                        <div className="p-3 rounded-lg bg-white">
                          <div className="text-xs text-gray-500">Avg Processing</div>
                          <div className="text-lg font-semibold text-gray-900">
                            {siteTrend.avg_processing_hours?.toFixed(1) || 0}h
                          </div>
                        </div>
                        <div className="p-3 rounded-lg bg-white">
                          <div className="text-xs text-gray-500">Total Inbound</div>
                          <div className="text-lg font-semibold text-gray-900">
                            {siteTrend.total_inbound?.toLocaleString() || 0}
                          </div>
                        </div>
                        <div className="p-3 rounded-lg bg-white">
                          <div className="text-xs text-gray-500">Total Outbound</div>
                          <div className="text-lg font-semibold text-gray-900">
                            {siteTrend.total_outbound?.toLocaleString() || 0}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-gray-500 text-center py-8">No trend data available</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
}
