import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User } from "../hooks/useAuth";
import { Plane, CheckCircle, FileText, Check, Pencil } from "lucide-react";

interface FlightScheduleInfo {
  id: number;
  name: string;
  schedule_data: {
    callsign?: string;
    origin_icao?: string;
    destination_icao?: string;
    scheduled_departure?: string;
    scheduled_arrival?: string;
    is_modified?: boolean;
  };
}

interface FlightPlanSummary {
  id: number;
  name: string;
  status: "draft" | "complete" | "archived";
  created_at: string;
  updated_at: string;
  movement_items_count: number;
  total_weight_lb: number;
  aircraft_count: number;
  schedules?: FlightScheduleInfo[];
}

interface DashboardProps {
  user: User;
  onLogout: () => void;
  onStartNew: () => void;
  onLoadPlan: (planId: number) => void;
}

export default function Dashboard({
  user,
  onLogout,
  onStartNew,
  onLoadPlan,
}: DashboardProps) {
  const [plans, setPlans] = useState<FlightPlanSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "draft" | "complete">(
    "all",
  );

  const fetchPlans = useCallback(async () => {
    try {
      const response = await fetch("/api/flight-plans", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();

        const plansWithSchedules = await Promise.all(
          data.map(async (plan: FlightPlanSummary) => {
            try {
              const scheduleResponse = await fetch(
                `/api/flight-plans/${plan.id}/schedules`,
                {
                  credentials: "include",
                },
              );
              if (scheduleResponse.ok) {
                const schedules = await scheduleResponse.json();
                return { ...plan, schedules };
              }
            } catch (err) {
              console.error(
                `Failed to fetch schedules for plan ${plan.id}:`,
                err,
              );
            }
            return { ...plan, schedules: [] };
          }),
        );

        setPlans(plansWithSchedules);
      } else {
        setError("Failed to load your flight plans");
      }
    } catch (err) {
      console.error("Failed to fetch flight plans:", err);
      setError("Network error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this flight plan?")) return;

    try {
      const response = await fetch(`/api/flight-plans/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (response.ok) {
        setPlans(plans.filter((p) => p.id !== id));
        await fetchPlans();
      }
    } catch (err) {
      console.error("Failed to delete flight plan:", err);
      setError("Failed to delete flight plan");
    }
  };

  const handleMarkComplete = async (id: number) => {
    try {
      const response = await fetch(`/api/flight-plans/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "complete" }),
      });
      if (response.ok) {
        await fetchPlans();
      }
    } catch {
      setError("Failed to update plan status");
    }
  };

  const refreshPlans = useCallback(() => {
    fetchPlans();
  }, [fetchPlans]);

  const filteredPlans = plans.filter((p) => {
    if (activeTab === "all") return true;
    return p.status === activeTab;
  });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="h-screen bg-neutral-50 gradient-mesh flex flex-col">
      <div className="flex overflow-y-auto">
        <div className="container mx-auto px-4 max-w-7xl py-8">
          <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 sm:mb-8">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight">
                Arka Cargo Operations
              </h1>
              <p className="text-neutral-500 text-sm sm:text-base">
                Welcome back, {user.username}
              </p>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4">
              <span className="text-neutral-500 text-xs sm:text-sm truncate max-w-[150px] sm:max-w-none">
                {user.email}
              </span>
              <button
                onClick={onLogout}
                className="btn-secondary text-sm px-4 py-2 whitespace-nowrap"
              >
                Sign Out
              </button>
            </div>
          </header>

          <div className="w-full max-w-full">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
              <div className="flex space-x-1 bg-neutral-100 rounded-xl p-1 overflow-x-auto">
                <button
                  onClick={() => setActiveTab("all")}
                  className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm transition whitespace-nowrap ${
                    activeTab === "all"
                      ? "bg-white text-neutral-900 shadow-soft font-medium"
                      : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  All Plans ({plans.length})
                </button>
                <button
                  onClick={() => setActiveTab("draft")}
                  className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm transition whitespace-nowrap ${
                    activeTab === "draft"
                      ? "bg-white text-neutral-900 shadow-soft font-medium"
                      : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  Drafts ({plans.filter((p) => p.status === "draft").length})
                </button>
                <button
                  onClick={() => setActiveTab("complete")}
                  className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm transition whitespace-nowrap ${
                    activeTab === "complete"
                      ? "bg-white text-neutral-900 shadow-soft font-medium"
                      : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  Complete (
                  {plans.filter((p) => p.status === "complete").length})
                </button>
              </div>
              <button
                onClick={onStartNew}
                className="btn-primary flex items-center justify-center space-x-2 w-full sm:w-auto"
              >
                <span>+</span>
                <span>New Flight Plan</span>
              </button>
            </div>

            {isLoading ? (
              <div className="text-center py-12">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <div className="text-neutral-500">
                  Loading your flight plans...
                </div>
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <div className="text-red-600 mb-4">{error}</div>
                <button
                  onClick={fetchPlans}
                  className="text-primary hover:text-primary/80 font-medium transition"
                >
                  Try Again
                </button>
              </div>
            ) : filteredPlans.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card text-center py-16"
              >
                <div className="w-20 h-20 mx-auto mb-6 bg-neutral-100 rounded-2xl flex items-center justify-center">
                  <Plane className="w-10 h-10 text-neutral-400" />
                </div>
                <h2 className="text-2xl font-bold text-neutral-900 mb-2">
                  No Flight Plans Yet
                </h2>
                <p className="text-neutral-500 mb-6">
                  Start by uploading a movement list to create your first load
                  plan
                </p>
                <button onClick={onStartNew} className="btn-primary">
                  Create Your First Flight Plan
                </button>
              </motion.div>
            ) : (
              <div className="grid gap-4">
                <AnimatePresence>
                  {filteredPlans.map((plan) => (
                    <motion.div
                      key={plan.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className={`glass-card p-4 sm:p-6 card-hover ${
                        plan.status === "complete"
                          ? "border-l-4 border-l-green-500"
                          : plan.status === "draft"
                            ? "border-l-4 border-l-amber-400"
                            : ""
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                            <span className="text-lg">
                              {plan.status === "complete" ? <CheckCircle className="w-5 h-5 text-green-600" /> : <FileText className="w-5 h-5 text-amber-600" />}
                            </span>
                            <h3 className="text-lg sm:text-xl text-neutral-900 font-medium truncate">
                              {plan.name}
                            </h3>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                                plan.status === "complete"
                                  ? "bg-green-100 text-green-700"
                                  : plan.status === "draft"
                                    ? "bg-amber-100 text-amber-700"
                                    : "badge"
                              }`}
                            >
                              {plan.status.toUpperCase()}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-neutral-500">
                            <span className="badge">
                              {plan.movement_items_count} items
                            </span>
                            <span className="badge">
                              {(plan.total_weight_lb / 1000).toFixed(1)}K lbs
                            </span>
                            <span className="badge">
                              {plan.schedules && plan.schedules.length > 0
                                ? `${plan.schedules.length} flights`
                                : `${plan.aircraft_count} aircraft`}
                            </span>
                            <span className="text-neutral-400">
                              Updated {formatDate(plan.updated_at)}
                            </span>
                          </div>
                          {plan.schedules && plan.schedules.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-neutral-200/50">
                              {/* Itinerary Summary - Start to Finish Route */}
                              {(() => {
                                const schedules = plan.schedules || [];
                                const origins = new Set<string>();
                                const destinations = new Set<string>();
                                const allBases = new Set<string>();

                                schedules.forEach((s) => {
                                  const data = s.schedule_data || {};
                                  if (data.origin_icao) {
                                    origins.add(data.origin_icao);
                                    allBases.add(data.origin_icao);
                                  }
                                  if (data.destination_icao) {
                                    destinations.add(data.destination_icao);
                                    allBases.add(data.destination_icao);
                                  }
                                });

                                // Find start points (origins that are never destinations)
                                const startBases = [...origins].filter(
                                  (o) => !destinations.has(o),
                                );
                                // Find end points (destinations that are never origins)
                                const endBases = [...destinations].filter(
                                  (d) => !origins.has(d),
                                );
                                // Intermediate stops are both origin and destination
                                const intermediateBases = [...allBases].filter(
                                  (b) => origins.has(b) && destinations.has(b),
                                );

                                const routeChain = [
                                  ...startBases,
                                  ...intermediateBases.slice(0, 2),
                                  ...(intermediateBases.length > 2
                                    ? ["..."]
                                    : []),
                                  ...endBases,
                                ].filter(Boolean);

                                return (
                                  <div className="mb-3">
                                    <div className="text-xs text-neutral-500 mb-2 font-medium">
                                      Mission Itinerary:
                                    </div>
                                    <div className="flex items-center gap-1 flex-wrap bg-gradient-to-r from-blue-50 to-green-50 rounded-lg p-2">
                                      {routeChain.map((base, idx) => (
                                        <React.Fragment key={idx}>
                                          <span
                                            className={`px-2 py-1 rounded text-xs font-medium ${
                                              idx === 0
                                                ? "bg-blue-100 text-blue-700 border border-blue-200"
                                                : idx === routeChain.length - 1
                                                  ? "bg-green-100 text-green-700 border border-green-200"
                                                  : base === "..."
                                                    ? "text-neutral-400"
                                                    : "bg-neutral-100 text-neutral-600"
                                            }`}
                                          >
                                            {idx === 0 && "🛫 "}
                                            {idx === routeChain.length - 1 &&
                                              "🛬 "}
                                            {base}
                                          </span>
                                          {idx < routeChain.length - 1 && (
                                            <span className="text-neutral-300 text-sm">
                                              →
                                            </span>
                                          )}
                                        </React.Fragment>
                                      ))}
                                    </div>
                                    <div className="flex items-center gap-4 mt-2 text-xs text-neutral-500">
                                      <span>
                                        {schedules.length} flight legs
                                      </span>
                                      <span>{allBases.size} locations</span>
                                      {startBases.length > 0 && (
                                        <span>
                                          Origin: {startBases.join(", ")}
                                        </span>
                                      )}
                                      {endBases.length > 0 && (
                                        <span>
                                          Final: {endBases.join(", ")}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}

                              <div className="text-xs text-neutral-500 mb-2 font-medium">
                                Flight Details:
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {plan.schedules.slice(0, 4).map((schedule) => {
                                  const data = schedule.schedule_data || {};
                                  return (
                                    <div
                                      key={schedule.id}
                                      className={`px-2 py-1 rounded-lg text-xs ${
                                        data.is_modified
                                          ? "bg-amber-50 border border-amber-200 text-amber-700"
                                          : "bg-neutral-100 text-neutral-600"
                                      }`}
                                    >
                                      <span className="font-medium">
                                        {data.callsign || schedule.name}
                                      </span>
                                      {data.origin_icao &&
                                        data.destination_icao && (
                                          <span className="ml-1 text-neutral-400">
                                            {data.origin_icao}→
                                            {data.destination_icao}
                                          </span>
                                        )}
                                      {data.is_modified && (
                                        <Pencil className="w-3 h-3 ml-1 inline" />
                                      )}
                                    </div>
                                  );
                                })}
                                {plan.schedules.length > 4 && (
                                  <span className="px-2 py-1 text-xs text-neutral-400">
                                    +{plan.schedules.length - 4} more
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-2 shrink-0">
                          {plan.status === "draft" && (
                            <button
                              onClick={() => handleMarkComplete(plan.id)}
                              className="bg-green-50 hover:bg-green-100 text-green-600 px-3 py-2 rounded-xl transition text-xs sm:text-sm flex items-center space-x-1"
                            >
                              <Check className="w-4 h-4" />
                              <span className="hidden xs:inline">
                                Mark Complete
                              </span>
                              <span className="xs:hidden">Complete</span>
                            </button>
                          )}
                          <button
                            onClick={() => onLoadPlan(plan.id)}
                            className="btn-primary text-xs sm:text-sm px-4 py-2"
                          >
                            Open
                          </button>
                          <button
                            onClick={() => handleDelete(plan.id)}
                            className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-xl transition text-xs sm:text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
