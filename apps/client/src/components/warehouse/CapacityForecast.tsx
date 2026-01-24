import React, { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { AlertTriangle, RefreshCw, TrendingUp } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

import {
  fetchSites,
  fetchCapacityForecasts,
  generateCapacityForecasts,
  type CapacityForecast as ForecastType,
} from "@/services/warehouseService";
import type { WarehouseSite } from "./types";

const UTILIZATION_THRESHOLD = 80;

export default function CapacityForecast() {
  const [sites, setSites] = useState<WarehouseSite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [forecasts, setForecasts] = useState<ForecastType[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSites();
  }, []);

  useEffect(() => {
    if (selectedSiteId) {
      loadForecasts(selectedSiteId);
    }
  }, [selectedSiteId]);

  async function loadSites() {
    try {
      const data = await fetchSites();
      setSites(data);
      if (data.length > 0 && !selectedSiteId) {
        setSelectedSiteId(data[0].id);
      }
    } catch (err) {
      setError("Failed to load sites");
    }
  }

  async function loadForecasts(siteId: number) {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCapacityForecasts(siteId);
      setForecasts(data);
    } catch (err) {
      setError("Failed to load forecasts");
      setForecasts([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateForecasts() {
    if (!selectedSiteId) return;
    setGenerating(true);
    setError(null);
    try {
      await generateCapacityForecasts(selectedSiteId);
      await loadForecasts(selectedSiteId);
    } catch (err) {
      setError("Failed to generate forecasts");
    } finally {
      setGenerating(false);
    }
  }

  const chartData = forecasts.map((f) => ({
    date: format(new Date(f.forecast_date), "MMM dd"),
    fullDate: f.forecast_date,
    utilization: parseFloat(f.projected_utilization_percent),
    inbound: parseFloat(f.inbound_weight_lbs),
    outbound: parseFloat(f.outbound_weight_lbs),
    confidence: parseFloat(f.confidence_score) * 100,
  }));

  const overThresholdDays = chartData.filter(
    (d) => d.utilization > UTILIZATION_THRESHOLD
  );

  const highUtilizationStart = chartData.find(
    (d) => d.utilization > UTILIZATION_THRESHOLD
  );

  return (
    <div className="space-y-6 p-6 bg-slate-900 min-h-screen">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <TrendingUp className="h-6 w-6 text-cyan-400" />
          <h2 className="text-2xl font-bold text-white">Capacity Forecast</h2>
        </div>

        <div className="flex items-center gap-4">
          <Select
            value={selectedSiteId?.toString() || ""}
            onValueChange={(v) => setSelectedSiteId(parseInt(v))}
          >
            <SelectTrigger className="w-64 bg-slate-800 border-slate-700 text-white">
              <SelectValue placeholder="Select a site" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              {sites.map((site) => (
                <SelectItem
                  key={site.id}
                  value={site.id.toString()}
                  className="text-white hover:bg-slate-700"
                >
                  {site.name} ({site.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            onClick={handleGenerateForecasts}
            disabled={generating || !selectedSiteId}
            className="bg-cyan-600 hover:bg-cyan-700"
          >
            {generating ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Generate Forecasts
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="bg-red-900/50 border-red-700">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {overThresholdDays.length > 0 && (
        <Alert className="bg-amber-900/50 border-amber-700">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <AlertTitle className="text-amber-300">
            Capacity Warning
          </AlertTitle>
          <AlertDescription className="text-amber-200">
            {overThresholdDays.length} day(s) projected to exceed{" "}
            {UTILIZATION_THRESHOLD}% utilization threshold. Consider rebalancing
            inventory or arranging additional storage.
          </AlertDescription>
        </Alert>
      )}

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">
            30-Day Utilization Forecast
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-80 bg-slate-700" />
          ) : chartData.length === 0 ? (
            <div className="h-80 flex items-center justify-center text-slate-400">
              No forecast data available. Click "Generate Forecasts" to create
              projections.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="date"
                  stroke="#94a3b8"
                  tick={{ fill: "#94a3b8" }}
                />
                <YAxis
                  domain={[0, 100]}
                  stroke="#94a3b8"
                  tick={{ fill: "#94a3b8" }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "#e2e8f0" }}
                  itemStyle={{ color: "#e2e8f0" }}
                  formatter={(value: number, name: string) => {
                    if (name === "utilization") return [`${value.toFixed(1)}%`, "Utilization"];
                    if (name === "confidence") return [`${value.toFixed(0)}%`, "Confidence"];
                    return [value.toLocaleString(), name];
                  }}
                />
                <ReferenceLine
                  y={UTILIZATION_THRESHOLD}
                  stroke="#f59e0b"
                  strokeDasharray="5 5"
                  label={{
                    value: `${UTILIZATION_THRESHOLD}% Threshold`,
                    position: "right",
                    fill: "#f59e0b",
                    fontSize: 12,
                  }}
                />
                {highUtilizationStart && (
                  <ReferenceArea
                    y1={UTILIZATION_THRESHOLD}
                    y2={100}
                    fill="#ef4444"
                    fillOpacity={0.2}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="utilization"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  dot={{ fill: "#06b6d4", strokeWidth: 0, r: 4 }}
                  activeDot={{ fill: "#22d3ee", strokeWidth: 0, r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Forecast Details</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 bg-slate-700" />
              ))}
            </div>
          ) : chartData.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              No forecast data available
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-slate-700/50">
                    <TableHead className="text-slate-300">Date</TableHead>
                    <TableHead className="text-slate-300 text-right">
                      Projected Utilization
                    </TableHead>
                    <TableHead className="text-slate-300 text-right">
                      Inbound (lbs)
                    </TableHead>
                    <TableHead className="text-slate-300 text-right">
                      Outbound (lbs)
                    </TableHead>
                    <TableHead className="text-slate-300 text-right">
                      Confidence
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chartData.map((row, idx) => (
                    <TableRow
                      key={idx}
                      className={`border-slate-700 hover:bg-slate-700/50 ${
                        row.utilization > UTILIZATION_THRESHOLD
                          ? "bg-red-900/20"
                          : ""
                      }`}
                    >
                      <TableCell className="text-white font-medium">
                        {format(new Date(row.fullDate), "MMM dd, yyyy")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={
                            row.utilization > UTILIZATION_THRESHOLD
                              ? "destructive"
                              : row.utilization > 60
                              ? "secondary"
                              : "default"
                          }
                          className={
                            row.utilization > UTILIZATION_THRESHOLD
                              ? "bg-red-600"
                              : row.utilization > 60
                              ? "bg-amber-600"
                              : "bg-green-600"
                          }
                        >
                          {row.utilization.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-green-400">
                        +{row.inbound.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-red-400">
                        -{row.outbound.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-slate-300">
                        {row.confidence.toFixed(0)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
