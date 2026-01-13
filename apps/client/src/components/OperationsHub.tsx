import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Plane,
  Truck,
  Ship,
  Warehouse,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Package,
  Clock,
  Activity,
  Loader2,
  ChevronRight,
  Calendar,
  BarChart3,
  Weight,
  Box,
  CheckCircle,
} from "lucide-react";
import { User } from "../hooks/useAuth";

export type OperationMode = "air" | "land" | "sea" | "warehouse";

const MonthTrendBadge = ({ change }: { change: number }) => {
  if (change === 0) return <span className="text-xs text-[#6B7280]">-</span>;
  const isPositive = change > 0;
  return (
    <span className={`text-xs flex items-center gap-0.5 ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
      {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isPositive ? '+' : ''}{change}%
    </span>
  );
};

interface OperationsHubProps {
  user: User;
  onSelectModule: (module: OperationMode) => void;
  onLogout: () => void;
}

interface OperationsSummary {
  activeMissions: {
    air: number;
    land: number;
    sea: number;
    total: number;
  };
  cargoInTransport: {
    air_lbs: number;
    land_lbs: number;
    sea_lbs: number;
    total_lbs: number;
  };
  air: {
    active_sorties: number;
    total_missions: number;
    cargo_in_flight_lbs: number;
    total_aircraft_deployed: number;
    avg_load_lbs: number;
    this_month: number;
    last_month: number;
    month_change: number;
    total_weight_lbs: number;
  };
  land: {
    active_convoys: number;
    total_convoys: number;
    cargo_in_transit_lbs: number;
    pending_dispatch: number;
    completed_missions: number;
    avg_convoy_weight_lbs: number;
    this_month: number;
    last_month: number;
    month_change: number;
    total_weight_lbs: number;
  };
  sea: {
    active_voyages: number;
    total_voyages: number;
    containers_at_sea: number;
    total_teu: number;
    planned_departures: number;
    completed_voyages: number;
    est_cargo_at_sea_lbs: number;
    this_month: number;
    last_month: number;
    month_change: number;
  };
  warehouse: {
    total_sites: number;
    total_items: number;
    total_units: number;
    total_weight_lbs: number;
    sites_critical: number;
    sites_warning: number;
    sites_healthy: number;
    avg_utilization: number;
    pending_transfers: number;
    items_this_month: number;
    items_last_month: number;
    month_change: number;
  };
  manifests: {
    total_manifests: number;
    in_transit: number;
    awaiting_pickup: number;
    delivered: number;
    unassigned: number;
    by_mode: { air: number; land: number; sea: number };
  };
  alerts: {
    aging_items: number;
    critical_sites: number;
    pending_assignments: number;
    total: number;
  };
}

interface SiteForecast {
  siteId: number;
  siteName: string;
  currentUtilization: number;
  projectedUtilization90: number;
  totalPalletPositions: number;
  usedPalletPositions: number;
  openPalletPositions: number;
  totalCubicFeet: number;
  usedCubicFeet: number;
  totalWeightCapacityLbs: number;
  currentWeightLbs: number;
  weightUtilizationPercent: number;
  status: 'green' | 'yellow' | 'red';
  trend: 'increasing' | 'decreasing' | 'stable';
  daysUntilWarning: number | null;
  daysUntilCritical: number | null;
}

interface PredictiveForecast {
  generatedAt: string;
  forecastPeriodDays: number;
  scheduledActivities: {
    upcomingFlights: Array<{
      id: number;
      name: string;
      scheduledDeparture?: string;
      scheduledArrival?: string;
      status: string;
      weightLbs: number;
    }>;
    upcomingConvoys: Array<{
      id: number;
      name: string;
      scheduledDeparture?: string;
      scheduledArrival?: string;
      status: string;
      weightLbs: number;
    }>;
    upcomingVoyages: Array<{
      id: number;
      name: string;
      scheduledDeparture?: string;
      scheduledArrival?: string;
      status: string;
      origin: string;
      destination: string;
    }>;
  };
  summaries: {
    air: {
      expectedFlights: number;
      totalCargoLbs: number;
      totalCargoTons: number;
    };
    land: {
      expectedConvoys: number;
      totalCargoLbs: number;
    };
    sea: {
      expectedVoyages: number;
    };
    warehouse: {
      avgUtilization: number;
      sitesWithWarnings: number;
    };
  };
  siteForecasts: SiteForecast[];
}

export default function OperationsHub({ user, onSelectModule, onLogout }: OperationsHubProps) {
  const [summary, setSummary] = useState<OperationsSummary | null>(null);
  const [forecast, setForecast] = useState<PredictiveForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [selectedForecastDays, setSelectedForecastDays] = useState<30 | 60 | 90>(30);

  useEffect(() => {
    fetchSummary();
    fetchForecast();
  }, []);

  const fetchSummary = async () => {
    try {
      const res = await fetch('/api/operations/summary', { credentials: 'include' });
      if (res.ok) {
        setSummary(await res.json());
      }
    } catch (error) {
      console.error('Error fetching operations summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchForecast = async (days: number = 30) => {
    setForecastLoading(true);
    try {
      const res = await fetch(`/api/operations/predictive-forecast?days=${days}`, { credentials: 'include' });
      if (res.ok) {
        setForecast(await res.json());
      }
    } catch (error) {
      console.error('Error fetching predictive forecast:', error);
    } finally {
      setForecastLoading(false);
    }
  };

  const handleForecastPeriodChange = (days: 30 | 60 | 90) => {
    setSelectedForecastDays(days);
    fetchForecast(days);
  };

  const formatWeight = (lbs: number) => {
    return `${lbs.toLocaleString()} lbs`;
  };

  const getUtilizationColor = (utilization: number) => {
    if (utilization >= 85) return 'red';
    if (utilization >= 60) return 'yellow';
    return 'green';
  };

  const getUtilizationBg = (utilization: number) => {
    if (utilization >= 85) return 'bg-red-500';
    if (utilization >= 60) return 'bg-amber-500';
    return 'bg-green-500';
  };

  const getUtilizationBorder = (utilization: number) => {
    if (utilization >= 85) return 'border-red-300';
    if (utilization >= 60) return 'border-amber-300';
    return 'border-green-300';
  };

  const TrendIcon = ({ trend }: { trend: 'increasing' | 'decreasing' | 'stable' }) => {
    if (trend === 'increasing') return <TrendingUp className="w-4 h-4 text-red-500" />;
    if (trend === 'decreasing') return <TrendingDown className="w-4 h-4 text-green-500" />;
    return <Minus className="w-4 h-4 text-[#6B7280]" />;
  };

  const totalAlerts = summary ? summary.alerts.total : 0;

  const modules = [
    {
      id: 'air' as const,
      name: 'Air Operations',
      subtitle: 'PACAF Airlift',
      icon: Plane,
      accentColor: '#3B82F6',
      accentBg: 'bg-blue-50',
      stats: summary ? [
        { label: 'Active Sorties', value: summary.air.active_sorties, primary: true },
        { label: 'Cargo In-Flight', value: formatWeight(summary.air.cargo_in_flight_lbs) },
        { label: 'This Month', value: summary.air.this_month, trend: summary.air.month_change },
        { label: 'Total Missions', value: summary.air.total_missions },
      ] : [],
    },
    {
      id: 'land' as const,
      name: 'Land Logistics',
      subtitle: 'Ground Transport',
      icon: Truck,
      accentColor: '#F59E0B',
      accentBg: 'bg-amber-50',
      stats: summary ? [
        { label: 'Active Convoys', value: summary.land.active_convoys, primary: true },
        { label: 'Cargo In-Transit', value: formatWeight(summary.land.cargo_in_transit_lbs) },
        { label: 'This Month', value: summary.land.this_month, trend: summary.land.month_change },
        { label: 'Pending Dispatch', value: summary.land.pending_dispatch },
      ] : [],
    },
    {
      id: 'sea' as const,
      name: 'Sea Freight',
      subtitle: 'Maritime Operations',
      icon: Ship,
      accentColor: '#14B8A6',
      accentBg: 'bg-teal-50',
      stats: summary ? [
        { label: 'Voyages At Sea', value: summary.sea.active_voyages, primary: true },
        { label: 'Containers', value: `${summary.sea.containers_at_sea} TEU` },
        { label: 'This Month', value: summary.sea.this_month, trend: summary.sea.month_change },
        { label: 'Planned Departures', value: summary.sea.planned_departures },
      ] : [],
    },
    {
      id: 'warehouse' as const,
      name: 'Warehouse',
      subtitle: 'WMS Operations',
      icon: Warehouse,
      accentColor: '#8B5CF6',
      accentBg: 'bg-purple-50',
      stats: summary ? [
        { label: 'Total Sites', value: summary.warehouse.total_sites, primary: true },
        { label: 'Inventory Items', value: summary.warehouse.total_items.toLocaleString() },
        { label: 'Avg Utilization', value: `${summary.warehouse.avg_utilization}%` },
        { label: 'Pending Transfers', value: summary.warehouse.pending_transfers },
      ] : [],
    },
  ];

  const summaries = forecast?.summaries;

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <header className="border-b border-[#F3F4F6] bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#111827]">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-[#111827] tracking-tight">ARKA Operations</h1>
                <p className="text-xs text-[#9CA3AF]">Multi-Modal Cargo Hub</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {totalAlerts > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span className="text-sm font-medium text-red-600">{totalAlerts} alerts</span>
                </div>
              )}
              <span className="text-sm text-[#6B7280]">{user.username || user.email}</span>
              <button
                onClick={onLogout}
                className="text-sm text-[#9CA3AF] hover:text-[#111827] transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-[#2563EB] animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
              {[
                { label: 'Active Missions', value: summary?.activeMissions.total || 0, icon: Activity, color: '#3B82F6', subtext: `${summary?.activeMissions.air || 0} air, ${summary?.activeMissions.land || 0} land, ${summary?.activeMissions.sea || 0} sea` },
                { label: 'Cargo In Transit', value: formatWeight(summary?.cargoInTransport.total_lbs || 0), icon: Weight, color: '#10B981', subtext: 'Currently moving' },
                { label: 'Manifests In Transit', value: summary?.manifests.in_transit || 0, icon: Box, color: '#06B6D4', subtext: `${summary?.manifests.unassigned || 0} awaiting assignment` },
                { label: 'Warehouse Items', value: (summary?.warehouse.total_items || 0).toLocaleString(), icon: Package, color: '#8B5CF6', subtext: `${summary?.warehouse.avg_utilization || 0}% utilization` },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="p-5 rounded-2xl bg-white border border-[#F3F4F6] hover:border-[#E5E7EB] transition-colors"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <stat.icon className="w-4 h-4" style={{ color: stat.color }} />
                    <span className="text-xs font-medium text-[#6B7280] uppercase tracking-wide">{stat.label}</span>
                  </div>
                  <p className="text-3xl font-bold text-[#111827] mb-1">{stat.value}</p>
                  <p className="text-sm text-[#9CA3AF]">{stat.subtext}</p>
                </motion.div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
              {modules.map((module, i) => (
                <motion.button
                  key={module.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  onClick={() => onSelectModule(module.id)}
                  className="group p-8 rounded-2xl bg-white border border-[#E5E7EB] hover:border-[#D1D5DB] shadow-sm hover:shadow-lg text-left transition-all duration-300"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div 
                      className={`p-3 rounded-xl ${module.accentBg}`}
                      style={{ color: module.accentColor }}
                    >
                      <module.icon className="w-6 h-6" />
                    </div>
                    <ChevronRight className="w-5 h-5 text-[#D1D5DB] group-hover:text-[#6B7280] group-hover:translate-x-1 transition-all" />
                  </div>
                  
                  <h3 className="text-xl font-semibold text-[#111827] mb-1">{module.name}</h3>
                  <p className="text-sm text-[#9CA3AF] mb-6">{module.subtitle}</p>
                  
                  <div className="grid grid-cols-2 gap-4">
                    {module.stats.map((stat: { label: string; value: string | number; primary?: boolean; trend?: number }) => (
                      <div key={stat.label} className="space-y-1">
                        <div className="flex items-baseline gap-2">
                          <span 
                            className={`text-2xl font-bold ${stat.primary ? '' : 'text-[#374151]'}`}
                            style={stat.primary ? { color: module.accentColor } : undefined}
                          >
                            {stat.value}
                          </span>
                          {stat.trend !== undefined && <MonthTrendBadge change={stat.trend} />}
                        </div>
                        <div className="text-xs text-[#9CA3AF] font-medium uppercase tracking-wide">{stat.label}</div>
                      </div>
                    ))}
                  </div>
                </motion.button>
              ))}
            </div>

            {summary && totalAlerts > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-6 rounded-2xl bg-red-50 border border-red-200 mb-8"
              >
                <h3 className="text-lg font-semibold text-[#DC2626] mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Active Alerts
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {summary.alerts.aging_items > 0 && (
                    <div className="p-3 rounded-xl bg-red-100/50">
                      <div className="text-2xl font-bold text-[#DC2626]">{summary.alerts.aging_items}</div>
                      <div className="text-sm text-red-700/70">Aging items (&gt;7 years)</div>
                    </div>
                  )}
                  {summary.alerts.critical_sites > 0 && (
                    <div className="p-3 rounded-xl bg-red-100/50">
                      <div className="text-2xl font-bold text-[#DC2626]">{summary.alerts.critical_sites}</div>
                      <div className="text-sm text-red-700/70">Sites at critical capacity</div>
                    </div>
                  )}
                  {summary.alerts.pending_assignments > 0 && (
                    <div className="p-3 rounded-xl bg-amber-100/50">
                      <div className="text-2xl font-bold text-[#D97706]">{summary.alerts.pending_assignments}</div>
                      <div className="text-sm text-amber-700/70">Manifests awaiting transport</div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {forecast && forecast.siteForecasts.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="p-6 rounded-2xl bg-white border border-[#E5E7EB] shadow-sm mb-8"
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-[#111827] flex items-center gap-2">
                    <Warehouse className="w-5 h-5 text-purple-500" />
                    Capacity Overview
                  </h3>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                      <span className="text-[#6B7280]">&lt;60%</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <span className="text-[#6B7280]">60-85%</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                      <span className="text-[#6B7280]">&gt;85%</span>
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  {forecast.siteForecasts.map((site) => (
                    <div 
                      key={site.siteId} 
                      className={`p-4 rounded-xl bg-[#FAFAFA] border ${getUtilizationBorder(site.currentUtilization)}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-medium text-[#111827] flex items-center gap-2">
                            {site.siteName}
                            <TrendIcon trend={site.trend} />
                          </h4>
                          <p className="text-xs text-[#6B7280] mt-0.5">
                            {site.trend === 'increasing' && 'Capacity trending up'}
                            {site.trend === 'decreasing' && 'Capacity trending down'}
                            {site.trend === 'stable' && 'Capacity stable'}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className={`text-lg font-bold ${
                            getUtilizationColor(site.currentUtilization) === 'red' ? 'text-[#DC2626]' :
                            getUtilizationColor(site.currentUtilization) === 'yellow' ? 'text-[#D97706]' :
                            'text-[#16A34A]'
                          }`}>
                            {site.currentUtilization}%
                          </span>
                          <p className="text-xs text-[#6B7280]">utilization</p>
                        </div>
                      </div>

                      <div className="h-2 rounded-full bg-[#E5E7EB] overflow-hidden mb-3">
                        <div 
                          className={`h-full transition-all ${getUtilizationBg(site.currentUtilization)}`}
                          style={{ width: `${Math.min(100, site.currentUtilization)}%` }}
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="p-2 rounded-lg bg-white border border-[#E5E7EB]">
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <Box className="w-3.5 h-3.5 text-purple-500" />
                          </div>
                          <div className="text-sm font-medium text-[#111827]">
                            {site.usedPalletPositions}/{site.totalPalletPositions}
                          </div>
                          <div className="text-xs text-[#6B7280]">Pallet Positions</div>
                        </div>
                        <div className="p-2 rounded-lg bg-white border border-[#E5E7EB]">
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <Weight className="w-3.5 h-3.5 text-purple-500" />
                          </div>
                          <div className="text-sm font-medium text-[#111827]">
                            {site.weightUtilizationPercent}%
                          </div>
                          <div className="text-xs text-[#6B7280]">Weight Used</div>
                        </div>
                        <div className="p-2 rounded-lg bg-white border border-[#E5E7EB]">
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <BarChart3 className="w-3.5 h-3.5 text-purple-500" />
                          </div>
                          <div className="text-sm font-medium text-[#111827]">
                            {Math.round(site.usedCubicFeet).toLocaleString()}
                          </div>
                          <div className="text-xs text-[#6B7280]">Cu. Ft. Used</div>
                        </div>
                      </div>

                      {(site.daysUntilWarning || site.daysUntilCritical) && (
                        <div className="mt-3 pt-3 border-t border-[#E5E7EB]">
                          <div className="flex items-center gap-2 text-xs">
                            <AlertTriangle className="w-3.5 h-3.5 text-[#D97706]" />
                            {site.daysUntilCritical && (
                              <span className="text-[#D97706]">
                                Critical in ~{site.daysUntilCritical} days
                              </span>
                            )}
                            {!site.daysUntilCritical && site.daysUntilWarning && (
                              <span className="text-[#D97706]">
                                Warning threshold in ~{site.daysUntilWarning} days
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {!forecastLoading && forecast && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700 shadow-xl overflow-hidden"
              >
                <div className="p-6 border-b border-slate-700/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/20">
                        <Calendar className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">Transport Forecast</h3>
                        <p className="text-xs text-slate-400">Predictive operations outlook</p>
                      </div>
                    </div>
                    <div className="flex bg-slate-800 rounded-xl p-1 gap-1">
                      {([30, 60, 90] as const).map((days) => (
                        <button
                          key={days}
                          onClick={() => handleForecastPeriodChange(days)}
                          className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${
                            selectedForecastDays === days
                              ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg'
                              : 'text-slate-400 hover:text-white hover:bg-slate-700'
                          }`}
                        >
                          {days}D
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {summaries && (
                  <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <motion.div 
                        whileHover={{ scale: 1.02, y: -2 }}
                        className="relative p-5 rounded-xl bg-gradient-to-br from-blue-600/20 to-cyan-600/20 border border-blue-500/30 backdrop-blur-sm overflow-hidden group"
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="relative">
                          <div className="flex items-center justify-between mb-3">
                            <div className="p-2 rounded-lg bg-blue-500/20">
                              <Plane className="w-5 h-5 text-blue-400" />
                            </div>
                            <span className="text-xs font-medium text-blue-400 bg-blue-500/20 px-2 py-1 rounded-full">AIR</span>
                          </div>
                          <div className="text-3xl font-bold text-white mb-1">
                            {summaries.air.expectedFlights}
                          </div>
                          <div className="text-sm text-slate-400">Expected flights</div>
                          <div className="mt-2 text-xs text-blue-300 flex items-center gap-1">
                            <Box className="w-3 h-3" />
                            {formatWeight(summaries.air.totalCargoLbs)}
                          </div>
                        </div>
                      </motion.div>

                      <motion.div 
                        whileHover={{ scale: 1.02, y: -2 }}
                        className="relative p-5 rounded-xl bg-gradient-to-br from-amber-600/20 to-orange-600/20 border border-amber-500/30 backdrop-blur-sm overflow-hidden group"
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="relative">
                          <div className="flex items-center justify-between mb-3">
                            <div className="p-2 rounded-lg bg-amber-500/20">
                              <Truck className="w-5 h-5 text-amber-400" />
                            </div>
                            <span className="text-xs font-medium text-amber-400 bg-amber-500/20 px-2 py-1 rounded-full">LAND</span>
                          </div>
                          <div className="text-3xl font-bold text-white mb-1">
                            {summaries.land.expectedConvoys}
                          </div>
                          <div className="text-sm text-slate-400">Expected convoys</div>
                          <div className="mt-2 text-xs text-amber-300 flex items-center gap-1">
                            <Box className="w-3 h-3" />
                            {formatWeight(summaries.land.totalCargoLbs)}
                          </div>
                        </div>
                      </motion.div>

                      <motion.div 
                        whileHover={{ scale: 1.02, y: -2 }}
                        className="relative p-5 rounded-xl bg-gradient-to-br from-teal-600/20 to-emerald-600/20 border border-teal-500/30 backdrop-blur-sm overflow-hidden group"
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-teal-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="relative">
                          <div className="flex items-center justify-between mb-3">
                            <div className="p-2 rounded-lg bg-teal-500/20">
                              <Ship className="w-5 h-5 text-teal-400" />
                            </div>
                            <span className="text-xs font-medium text-teal-400 bg-teal-500/20 px-2 py-1 rounded-full">SEA</span>
                          </div>
                          <div className="text-3xl font-bold text-white mb-1">
                            {summaries.sea.expectedVoyages}
                          </div>
                          <div className="text-sm text-slate-400">Expected voyages</div>
                          <div className="mt-2 text-xs text-teal-300 flex items-center gap-1">
                            <Ship className="w-3 h-3" />
                            Maritime operations
                          </div>
                        </div>
                      </motion.div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-5 rounded-xl bg-slate-800/50 border border-slate-700">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-purple-500/20">
                              <Warehouse className="w-4 h-4 text-purple-400" />
                            </div>
                            <span className="text-sm font-medium text-white">Warehouse Utilization</span>
                          </div>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                            summaries.warehouse.avgUtilization >= 85 ? 'bg-red-500/20 text-red-400' :
                            summaries.warehouse.avgUtilization >= 60 ? 'bg-amber-500/20 text-amber-400' :
                            'bg-emerald-500/20 text-emerald-400'
                          }`}>
                            {summaries.warehouse.avgUtilization >= 85 ? 'HIGH' :
                             summaries.warehouse.avgUtilization >= 60 ? 'MODERATE' : 'OPTIMAL'}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-2 mb-3">
                          <span className={`text-4xl font-bold ${
                            summaries.warehouse.avgUtilization >= 85 ? 'text-red-400' :
                            summaries.warehouse.avgUtilization >= 60 ? 'text-amber-400' :
                            'text-emerald-400'
                          }`}>
                            {summaries.warehouse.avgUtilization}%
                          </span>
                          <span className="text-slate-400 text-sm">average capacity</span>
                        </div>
                        <div className="h-3 rounded-full bg-slate-700 overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, summaries.warehouse.avgUtilization)}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className={`h-full rounded-full ${
                              summaries.warehouse.avgUtilization >= 85 ? 'bg-gradient-to-r from-red-500 to-red-400' :
                              summaries.warehouse.avgUtilization >= 60 ? 'bg-gradient-to-r from-amber-500 to-amber-400' :
                              'bg-gradient-to-r from-emerald-500 to-emerald-400'
                            }`}
                          />
                        </div>
                      </div>

                      <div className="p-5 rounded-xl bg-slate-800/50 border border-slate-700">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div className={`p-2 rounded-lg ${
                              summaries.warehouse.sitesWithWarnings > 0 ? 'bg-amber-500/20' : 'bg-emerald-500/20'
                            }`}>
                              <AlertTriangle className={`w-4 h-4 ${
                                summaries.warehouse.sitesWithWarnings > 0 ? 'text-amber-400' : 'text-emerald-400'
                              }`} />
                            </div>
                            <span className="text-sm font-medium text-white">Capacity Alerts</span>
                          </div>
                          {summaries.warehouse.sitesWithWarnings === 0 && (
                            <span className="text-xs font-bold px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              ALL CLEAR
                            </span>
                          )}
                        </div>
                        <div className="flex items-baseline gap-2 mb-2">
                          <span className={`text-4xl font-bold ${
                            summaries.warehouse.sitesWithWarnings > 3 ? 'text-red-400' :
                            summaries.warehouse.sitesWithWarnings > 0 ? 'text-amber-400' :
                            'text-emerald-400'
                          }`}>
                            {summaries.warehouse.sitesWithWarnings}
                          </span>
                          <span className="text-slate-400 text-sm">sites flagged</span>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          {summaries.warehouse.sitesWithWarnings === 0 
                            ? 'No capacity issues projected for the forecast period. All warehouse sites operating within normal parameters.'
                            : `${summaries.warehouse.sitesWithWarnings} warehouse site${summaries.warehouse.sitesWithWarnings > 1 ? 's' : ''} may require capacity attention during this period.`
                          }
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-700/50">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span>Live {selectedForecastDays}-day projection</span>
                        </div>
                        <span>Updated {new Date(forecast.generatedAt).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {forecastLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-6 rounded-2xl bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center"
              >
                <Loader2 className="w-6 h-6 text-[#2563EB] animate-spin mr-3" />
                <span className="text-[#6B7280]">Loading forecast data...</span>
              </motion.div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
