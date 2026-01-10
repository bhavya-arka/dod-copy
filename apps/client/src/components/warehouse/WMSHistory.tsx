import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  History,
  Calendar,
  Filter,
  Loader2,
  Play,
  CheckCircle2,
  SkipForward,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Zap,
  Target,
  FileText,
} from "lucide-react";
import type { WarehouseSite, ToastMessage } from "./types";
import {
  getOptimizationEvents,
  type OptimizationEvent,
  type OptimizationEventsFilters,
} from "../../services/warehouseService";

interface WMSHistoryProps {
  sites: WarehouseSite[];
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

const EVENT_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bgColor: string }> = {
  created: { label: "Plan Created", icon: FileText, color: "text-blue-600", bgColor: "bg-blue-50" },
  executed: { label: "Plan Executed", icon: Zap, color: "text-purple-600", bgColor: "bg-purple-50" },
  action_started: { label: "Action Started", icon: Play, color: "text-amber-600", bgColor: "bg-amber-50" },
  action_in_progress: { label: "In Progress", icon: Clock, color: "text-orange-600", bgColor: "bg-orange-50" },
  action_completed: { label: "Action Completed", icon: CheckCircle2, color: "text-green-600", bgColor: "bg-green-50" },
  action_skipped: { label: "Action Skipped", icon: SkipForward, color: "text-gray-600", bgColor: "bg-gray-100" },
  cancelled: { label: "Plan Cancelled", icon: XCircle, color: "text-red-600", bgColor: "bg-red-50" },
  target_date_set: { label: "Target Date Set", icon: Target, color: "text-indigo-600", bgColor: "bg-indigo-50" },
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDateKey(dateStr: string): string {
  return new Date(dateStr).toISOString().split("T")[0];
}

export default function WMSHistory({ sites, onShowToast }: WMSHistoryProps) {
  const [events, setEvents] = useState<OptimizationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  
  const [filters, setFilters] = useState<OptimizationEventsFilters>({
    limit: 100,
    offset: 0,
  });

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getOptimizationEvents(filters);
      setEvents(response.events);
      setTotal(response.total);
    } catch (error) {
      console.error("Failed to fetch optimization events:", error);
      onShowToast("Failed to load history", "error");
    } finally {
      setLoading(false);
    }
  }, [filters, onShowToast]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const summary = useMemo(() => {
    const counts = {
      total: events.length,
      started: 0,
      completed: 0,
      skipped: 0,
      cancelled: 0,
    };
    for (const event of events) {
      if (event.event_type === "action_started") counts.started++;
      else if (event.event_type === "action_completed") counts.completed++;
      else if (event.event_type === "action_skipped") counts.skipped++;
      else if (event.event_type === "cancelled") counts.cancelled++;
    }
    return counts;
  }, [events]);

  const groupedEvents = useMemo(() => {
    const groups: Record<string, OptimizationEvent[]> = {};
    for (const event of events) {
      const key = getDateKey(event.created_at);
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [events]);

  const handleFilterChange = (key: keyof OptimizationEventsFilters, value: any) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value || undefined,
      offset: 0,
    }));
  };

  const clearFilters = () => {
    setFilters({ limit: 100, offset: 0 });
  };

  const summaryCards = [
    { label: "Total Events", value: total, icon: History, color: "text-blue-600", bgColor: "bg-blue-50" },
    { label: "Actions Started", value: summary.started, icon: Play, color: "text-amber-600", bgColor: "bg-amber-50" },
    { label: "Completed", value: summary.completed, icon: CheckCircle2, color: "text-green-600", bgColor: "bg-green-50" },
    { label: "Skipped", value: summary.skipped, icon: SkipForward, color: "text-gray-600", bgColor: "bg-gray-100" },
  ];

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">Optimization History</h1>
        <p className="text-muted-foreground">Track all warehouse optimization events and actions</p>
      </motion.div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {summaryCards.map((stat, i) => (
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
        transition={{ delay: 0.1 }}
        className="rounded-2xl bg-white border border-border shadow-sm mb-6"
      >
        <div
          className="flex items-center justify-between p-4 cursor-pointer"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-muted-foreground" />
            <span className="font-medium text-foreground">Filters</span>
            {(filters.site_id || filters.event_type || filters.start_date || filters.end_date) && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">Active</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                fetchEvents();
              }}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
            </button>
            {filtersOpen ? (
              <ChevronUp className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
        </div>

        {filtersOpen && (
          <div className="px-4 pb-4 border-t border-border pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Site</label>
                <select
                  value={filters.site_id || ""}
                  onChange={(e) => handleFilterChange("site_id", e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Sites</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name} ({site.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Event Type</label>
                <select
                  value={filters.event_type || ""}
                  onChange={(e) => handleFilterChange("event_type", e.target.value || undefined)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Types</option>
                  {Object.entries(EVENT_TYPE_CONFIG).map(([type, config]) => (
                    <option key={type} value={type}>
                      {config.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Start Date</label>
                <input
                  type="date"
                  value={filters.start_date || ""}
                  onChange={(e) => handleFilterChange("start_date", e.target.value || undefined)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">End Date</label>
                <input
                  type="date"
                  value={filters.end_date || ""}
                  onChange={(e) => handleFilterChange("end_date", e.target.value || undefined)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <button
                onClick={clearFilters}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear Filters
              </button>
            </div>
          </div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-2xl bg-white border border-border shadow-sm"
      >
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Event Timeline</h2>
          <p className="text-sm text-muted-foreground">
            Showing {events.length} of {total} events
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <History className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-center mb-1">No optimization events found</p>
            <p className="text-sm text-center">Run an optimization to see events here</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {groupedEvents.map(([dateKey, dayEvents]) => (
              <div key={dateKey} className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">
                    {formatDate(dayEvents[0].created_at)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({dayEvents.length} events)
                  </span>
                </div>

                <div className="space-y-2 ml-6">
                  {dayEvents.map((event) => {
                    const config = EVENT_TYPE_CONFIG[event.event_type] || {
                      label: event.event_type,
                      icon: History,
                      color: "text-gray-600",
                      bgColor: "bg-gray-100",
                    };
                    const Icon = config.icon;

                    return (
                      <div
                        key={event.id}
                        className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className={`p-2 rounded-lg ${config.bgColor} flex-shrink-0`}>
                          <Icon className={`w-4 h-4 ${config.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm font-medium ${config.color}`}>
                              {config.label}
                            </span>
                            <span className="text-xs text-muted-foreground">•</span>
                            <span className="text-sm text-foreground truncate">
                              {event.plan_name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                            <span>{formatTime(event.created_at)}</span>
                            <span>•</span>
                            <span>{event.site_name} ({event.site_code})</span>
                            {event.user_email && (
                              <>
                                <span>•</span>
                                <span>{event.user_email}</span>
                              </>
                            )}
                          </div>
                          {event.payload && Object.keys(event.payload).length > 0 && (
                            <div className="mt-2 p-2 rounded-lg bg-muted/50 text-xs">
                              {event.payload.action_id && (
                                <p>
                                  <span className="text-muted-foreground">Action:</span>{" "}
                                  {event.payload.action || event.payload.action_id}
                                </p>
                              )}
                              {event.payload.from && event.payload.to && (
                                <p>
                                  <span className="text-muted-foreground">Move:</span>{" "}
                                  {event.payload.from} → {event.payload.to}
                                </p>
                              )}
                              {event.payload.item && (
                                <p>
                                  <span className="text-muted-foreground">Item:</span>{" "}
                                  {event.payload.item}
                                </p>
                              )}
                              {event.payload.reason && (
                                <p>
                                  <span className="text-muted-foreground">Reason:</span>{" "}
                                  {event.payload.reason}
                                </p>
                              )}
                              {event.payload.target_date && (
                                <p>
                                  <span className="text-muted-foreground">Target Date:</span>{" "}
                                  {new Date(event.payload.target_date).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {events.length > 0 && events.length < total && (
          <div className="p-4 border-t border-border flex justify-center">
            <button
              onClick={() => setFilters((prev) => ({ ...prev, limit: (prev.limit || 100) + 100 }))}
              className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
            >
              Load More
            </button>
          </div>
        )}
      </motion.div>
    </>
  );
}
