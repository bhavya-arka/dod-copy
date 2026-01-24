import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plane,
  Truck,
  Ship,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Loader2,
  Package,
  Calendar,
  List,
  Weight,
  Clock,
  AlertTriangle,
} from "lucide-react";
import type { WarehouseSite, ToastMessage } from "./types";
import {
  fetchInboundShipments,
  fetchInboundTimeline,
  InboundShipment,
  InboundTimelineDay,
} from "../../services/warehouseService";

interface InboundCargoFeedProps {
  sites: WarehouseSite[];
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

type ViewMode = "list" | "timeline";

const TRANSPORT_COLORS = {
  air: { bg: "bg-sky-100", text: "text-sky-700", border: "border-sky-300", iconBg: "bg-sky-500" },
  ground: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300", iconBg: "bg-amber-500" },
  land: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300", iconBg: "bg-amber-500" },
  sea: { bg: "bg-teal-100", text: "text-teal-700", border: "border-teal-300", iconBg: "bg-teal-500" },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  "in-transit": { bg: "bg-blue-100", text: "text-blue-700" },
  in_transit: { bg: "bg-blue-100", text: "text-blue-700" },
  scheduled: { bg: "bg-slate-100", text: "text-slate-700" },
  delayed: { bg: "bg-red-100", text: "text-red-700" },
  pending: { bg: "bg-yellow-100", text: "text-yellow-700" },
  completed: { bg: "bg-green-100", text: "text-green-700" },
};

function getTransportIcon(mode: string) {
  const lowerMode = mode?.toLowerCase();
  switch (lowerMode) {
    case "air":
      return <Plane className="w-4 h-4" />;
    case "sea":
      return <Ship className="w-4 h-4" />;
    default:
      return <Truck className="w-4 h-4" />;
  }
}

function getTransportColors(mode: string) {
  const lowerMode = mode?.toLowerCase();
  return TRANSPORT_COLORS[lowerMode as keyof typeof TRANSPORT_COLORS] || TRANSPORT_COLORS.ground;
}

function formatWeight(weight: number): string {
  if (weight >= 1000) {
    return `${(weight / 1000).toFixed(1)}k lbs`;
  }
  return `${weight.toLocaleString()} lbs`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDayOfWeek(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

const HEAVY_INBOUND_THRESHOLD = 10000;

export default function InboundCargoFeed({
  sites,
  onShowToast,
}: InboundCargoFeedProps) {
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [shipments, setShipments] = useState<InboundShipment[]>([]);
  const [timeline, setTimeline] = useState<InboundTimelineDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedShipments, setExpandedShipments] = useState<Set<number>>(new Set());
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!selectedSiteId) return;
    
    setLoading(true);
    try {
      if (viewMode === "list") {
        const data = await fetchInboundShipments(selectedSiteId);
        setShipments(data);
      } else {
        const data = await fetchInboundTimeline(selectedSiteId);
        setTimeline(data);
      }
    } catch (error) {
      console.error("Failed to load inbound data:", error);
      onShowToast("Failed to load inbound cargo data", "error");
    } finally {
      setLoading(false);
    }
  }, [selectedSiteId, viewMode, onShowToast]);

  useEffect(() => {
    if (sites.length > 0 && !selectedSiteId) {
      setSelectedSiteId(sites[0].id);
    }
  }, [sites, selectedSiteId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleShipmentExpand = (shipmentId: number) => {
    setExpandedShipments(prev => {
      const next = new Set(prev);
      if (next.has(shipmentId)) {
        next.delete(shipmentId);
      } else {
        next.add(shipmentId);
      }
      return next;
    });
  };

  const toggleDayExpand = (date: string) => {
    setExpandedDay(prev => prev === date ? null : date);
  };

  const next7DaysShipments = shipments.filter(s => {
    const eta = new Date(s.eta);
    const now = new Date();
    const diff = eta.getTime() - now.getTime();
    return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
  });

  const totalExpectedArrivals = next7DaysShipments.length;
  const totalExpectedWeight = next7DaysShipments.reduce((sum, s) => sum + (s.totalWeight || 0), 0);

  const arrivalsByDay = next7DaysShipments.reduce((acc, s) => {
    const day = formatDate(s.eta);
    acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const busiestDay = Object.entries(arrivalsByDay).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Inbound Cargo Feed</h1>
            <p className="text-muted-foreground">Track incoming shipments and arrivals</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedSiteId || ""}
              onChange={(e) => setSelectedSiteId(Number(e.target.value))}
              className="px-3 py-2 rounded-lg border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            >
              <option value="" disabled>Select site</option>
              {sites.map(site => (
                <option key={site.id} value={site.id}>{site.name}</option>
              ))}
            </select>
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setViewMode("list")}
                className={`px-3 py-2 text-sm flex items-center gap-1.5 transition-colors ${
                  viewMode === "list" 
                    ? "bg-[#2563EB] text-white" 
                    : "bg-white text-muted-foreground hover:bg-muted"
                }`}
              >
                <List className="w-4 h-4" />
                List
              </button>
              <button
                onClick={() => setViewMode("timeline")}
                className={`px-3 py-2 text-sm flex items-center gap-1.5 transition-colors ${
                  viewMode === "timeline" 
                    ? "bg-[#2563EB] text-white" 
                    : "bg-white text-muted-foreground hover:bg-muted"
                }`}
              >
                <Calendar className="w-4 h-4" />
                Timeline
              </button>
            </div>
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 rounded-lg border border-border bg-white hover:bg-muted transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="p-4 rounded-2xl bg-white border border-gray-200 shadow-sm"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center mb-3">
            <Package className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{totalExpectedArrivals}</p>
          <p className="text-xs text-gray-500 mt-1">Expected Arrivals (7 days)</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-4 rounded-2xl bg-white border border-gray-200 shadow-sm"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center mb-3">
            <Weight className="w-5 h-5 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatWeight(totalExpectedWeight)}</p>
          <p className="text-xs text-gray-500 mt-1">Total Expected Weight</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="p-4 rounded-2xl bg-white border border-gray-200 shadow-sm"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center mb-3">
            <Clock className="w-5 h-5 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{busiestDay ? busiestDay[0] : "—"}</p>
          <p className="text-xs text-gray-500 mt-1">
            Busiest Day {busiestDay ? `(${busiestDay[1]} arrivals)` : ""}
          </p>
        </motion.div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-[#2563EB]" />
        </div>
      ) : viewMode === "list" ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-3"
        >
          {shipments.length === 0 ? (
            <div className="rounded-2xl bg-white border border-gray-200 p-8 text-center">
              <Package className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p className="text-gray-500">No inbound shipments scheduled</p>
            </div>
          ) : (
            shipments.map((shipment, idx) => {
              const colors = getTransportColors(shipment.transportMode);
              const statusColors = STATUS_COLORS[shipment.status] || STATUS_COLORS.pending;
              const isExpanded = expandedShipments.has(shipment.id);

              return (
                <motion.div
                  key={shipment.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className="rounded-xl bg-white border border-gray-200 overflow-hidden"
                >
                  <div
                    onClick={() => toggleShipmentExpand(shipment.id)}
                    className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <div className={`w-10 h-10 rounded-lg ${colors.iconBg} flex items-center justify-center text-white`}>
                      {getTransportIcon(shipment.transportMode)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900 truncate">
                          From: {shipment.originSiteName}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors.bg} ${statusColors.text}`}>
                          {shipment.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>ETA: {formatDate(shipment.eta)}</span>
                        <span>{shipment.itemCount} items</span>
                        <span>{formatWeight(shipment.totalWeight)}</span>
                      </div>
                    </div>
                    <div className="flex items-center text-gray-500">
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5" />
                      ) : (
                        <ChevronRight className="w-5 h-5" />
                      )}
                    </div>
                  </div>
                  <AnimatePresence>
                    {isExpanded && shipment.items && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-gray-200 bg-gray-50"
                      >
                        <div className="p-4">
                          <h4 className="text-sm font-medium text-gray-600 mb-3">Shipment Items</h4>
                          <div className="space-y-2">
                            {shipment.items.map((item, itemIdx) => (
                              <div
                                key={itemIdx}
                                className="flex items-center justify-between text-sm p-2 rounded-lg bg-white"
                              >
                                <div className="flex-1">
                                  <span className="text-gray-700">{item.description || item.requisitionNo}</span>
                                  {item.nsn && (
                                    <span className="text-gray-400 ml-2 text-xs">NSN: {item.nsn}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-4 text-gray-500">
                                  <span>Qty: {item.quantity}</span>
                                  {item.weight && <span>{formatWeight(item.weight)}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })
          )}
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex gap-1 overflow-x-auto pb-2 mb-4">
            {timeline.map((day, idx) => {
              const isHeavy = day.totalWeight >= HEAVY_INBOUND_THRESHOLD;
              const isSelected = expandedDay === day.date;
              const isToday = new Date(day.date).toDateString() === new Date().toDateString();

              return (
                <button
                  key={day.date}
                  onClick={() => toggleDayExpand(day.date)}
                  className={`flex-shrink-0 p-3 rounded-xl text-center transition-all min-w-[80px] ${
                    isSelected
                      ? "bg-[#2563EB] text-white ring-2 ring-[#2563EB]/50"
                      : isHeavy
                      ? "bg-amber-50 border border-amber-300 text-amber-700"
                      : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <div className="text-xs mb-1 opacity-70">{formatDayOfWeek(day.date)}</div>
                  <div className={`text-lg font-bold ${isToday ? "underline" : ""}`}>
                    {formatDate(day.date)}
                  </div>
                  <div className="mt-2 flex flex-col gap-1">
                    <div className="flex items-center justify-center gap-1 text-xs">
                      <Package className="w-3 h-3" />
                      {day.arrivalCount}
                    </div>
                    {day.totalWeight > 0 && (
                      <div className="text-xs opacity-70">
                        {formatWeight(day.totalWeight)}
                      </div>
                    )}
                  </div>
                  {isHeavy && (
                    <div className="mt-1">
                      <AlertTriangle className="w-3 h-3 mx-auto text-amber-500" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            {expandedDay && (
              <motion.div
                key={expandedDay}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded-xl bg-white border border-gray-200 overflow-hidden"
              >
                <div className="p-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">
                    Arrivals for {formatDate(expandedDay)}
                  </h3>
                </div>
                <div className="p-4 space-y-3">
                  {timeline
                    .find(d => d.date === expandedDay)
                    ?.shipments.map((shipment, idx) => {
                      const colors = getTransportColors(shipment.transportMode);
                      const statusColors = STATUS_COLORS[shipment.status] || STATUS_COLORS.pending;

                      return (
                        <div
                          key={idx}
                          className="flex items-center gap-4 p-3 rounded-lg bg-gray-50"
                        >
                          <div className={`w-8 h-8 rounded-lg ${colors.iconBg} flex items-center justify-center text-white`}>
                            {getTransportIcon(shipment.transportMode)}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-700">
                                {shipment.originSiteName}
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors.bg} ${statusColors.text}`}>
                                {shipment.status.replace(/_/g, " ")}
                              </span>
                            </div>
                            <div className="text-sm text-gray-500 mt-0.5">
                              {shipment.itemCount} items • {formatWeight(shipment.totalWeight)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  {timeline.find(d => d.date === expandedDay)?.shipments.length === 0 && (
                    <p className="text-gray-500 text-center py-4">No arrivals scheduled</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
