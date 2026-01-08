import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Plane,
  Truck,
  Ship,
  Warehouse,
  AlertTriangle,
  TrendingUp,
  Package,
  Clock,
  Activity,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { User } from "../hooks/useAuth";

export type OperationMode = "air" | "land" | "sea" | "warehouse";

interface OperationsHubProps {
  user: User;
  onSelectModule: (module: OperationMode) => void;
  onLogout: () => void;
}

interface OperationsSummary {
  air: {
    total_plans: number;
    active_plans: number;
    draft_plans: number;
    total_aircraft: number;
    total_weight_lbs: number;
  };
  land: {
    total_convoys: number;
    active_convoys: number;
    pending_convoys: number;
    completed_convoys: number;
    total_weight_lbs: number;
  };
  sea: {
    total_voyages: number;
    active_voyages: number;
    planned_voyages: number;
    completed_voyages: number;
  };
  warehouse: {
    total_sites: number;
    total_items: number;
    total_quantity: number;
    sites_at_capacity: number;
    sites_warning: number;
    sites_healthy: number;
    average_utilization: number;
  };
  manifests: {
    total_manifests: number;
    draft_manifests: number;
    in_transit: number;
    delivered: number;
    by_mode: { air: number; land: number; sea: number; unassigned: number };
  };
  alerts: {
    aging_items: number;
    critical_sites: number;
    pending_assignments: number;
  };
}

export default function OperationsHub({ user, onSelectModule, onLogout }: OperationsHubProps) {
  const [summary, setSummary] = useState<OperationsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSummary();
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

  const formatWeight = (lbs: number) => {
    if (lbs >= 2000) {
      return `${(lbs / 2000).toFixed(1)} tons`;
    }
    return `${lbs.toLocaleString()} lbs`;
  };

  const totalAlerts = summary 
    ? summary.alerts.aging_items + summary.alerts.critical_sites + summary.alerts.pending_assignments
    : 0;

  const modules = [
    {
      id: 'air' as const,
      name: 'Air Operations',
      subtitle: 'PACAF Airlift',
      icon: Plane,
      gradient: 'from-blue-500 to-cyan-500',
      stats: summary ? [
        { label: 'Active Plans', value: summary.air.active_plans },
        { label: 'Total Aircraft', value: summary.air.total_aircraft },
        { label: 'Cargo Weight', value: formatWeight(summary.air.total_weight_lbs) },
      ] : [],
    },
    {
      id: 'land' as const,
      name: 'Land Logistics',
      subtitle: 'Ground Transport',
      icon: Truck,
      gradient: 'from-amber-500 to-orange-500',
      stats: summary ? [
        { label: 'Active Convoys', value: summary.land.active_convoys },
        { label: 'Pending', value: summary.land.pending_convoys },
        { label: 'Cargo Weight', value: formatWeight(summary.land.total_weight_lbs) },
      ] : [],
    },
    {
      id: 'sea' as const,
      name: 'Sea Freight',
      subtitle: 'Maritime Operations',
      icon: Ship,
      gradient: 'from-teal-500 to-emerald-500',
      stats: summary ? [
        { label: 'Active Voyages', value: summary.sea.active_voyages },
        { label: 'Planned', value: summary.sea.planned_voyages },
        { label: 'Total Voyages', value: summary.sea.total_voyages },
      ] : [],
    },
    {
      id: 'warehouse' as const,
      name: 'Warehouse',
      subtitle: 'WMS Operations',
      icon: Warehouse,
      gradient: 'from-purple-500 to-pink-500',
      stats: summary ? [
        { label: 'Sites', value: summary.warehouse.total_sites },
        { label: 'Items', value: summary.warehouse.total_items.toLocaleString() },
        { label: 'Utilization', value: `${summary.warehouse.average_utilization}%` },
      ] : [],
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">ARKA Operations Hub</h1>
                <p className="text-xs text-slate-400">Multi-Modal Cargo Operations</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {totalAlerts > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/20 border border-red-500/30">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <span className="text-sm text-red-400">{totalAlerts} alerts</span>
                </div>
              )}
              <span className="text-sm text-slate-400">{user.username || user.email}</span>
              <button
                onClick={onLogout}
                className="text-sm text-slate-400 hover:text-white transition-colors"
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
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { label: 'Active Missions', value: (summary?.air.active_plans || 0) + (summary?.land.active_convoys || 0) + (summary?.sea.active_voyages || 0), icon: Activity, color: 'blue' },
                { label: 'In Transit', value: summary?.manifests.in_transit || 0, icon: TrendingUp, color: 'green' },
                { label: 'Pending', value: summary?.manifests.by_mode.unassigned || 0, icon: Clock, color: 'amber' },
                { label: 'Total Inventory', value: (summary?.warehouse.total_items || 0).toLocaleString(), icon: Package, color: 'purple' },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <stat.icon className={`w-4 h-4 text-${stat.color}-400`} />
                    <span className="text-xs text-slate-400">{stat.label}</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{stat.value}</p>
                </motion.div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {modules.map((module, i) => (
                <motion.button
                  key={module.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.1 }}
                  onClick={() => onSelectModule(module.id)}
                  className="group p-6 rounded-3xl bg-white/5 border border-white/10 hover:border-white/20 backdrop-blur-sm text-left transition-all hover:scale-[1.02]"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 rounded-2xl bg-gradient-to-r ${module.gradient}`}>
                      <module.icon className="w-6 h-6 text-white" />
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-white group-hover:translate-x-1 transition-all" />
                  </div>
                  
                  <h3 className="text-lg font-semibold text-white mb-1">{module.name}</h3>
                  <p className="text-sm text-slate-400 mb-4">{module.subtitle}</p>
                  
                  <div className="grid grid-cols-3 gap-2">
                    {module.stats.map((stat) => (
                      <div key={stat.label} className="text-center">
                        <div className="text-lg font-bold text-white">{stat.value}</div>
                        <div className="text-xs text-slate-500">{stat.label}</div>
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
                className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20"
              >
                <h3 className="text-lg font-semibold text-red-400 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Active Alerts
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {summary.alerts.aging_items > 0 && (
                    <div className="p-3 rounded-xl bg-red-500/10">
                      <div className="text-2xl font-bold text-red-400">{summary.alerts.aging_items}</div>
                      <div className="text-sm text-red-300/70">Aging items (&gt;7 years)</div>
                    </div>
                  )}
                  {summary.alerts.critical_sites > 0 && (
                    <div className="p-3 rounded-xl bg-red-500/10">
                      <div className="text-2xl font-bold text-red-400">{summary.alerts.critical_sites}</div>
                      <div className="text-sm text-red-300/70">Sites at critical capacity</div>
                    </div>
                  )}
                  {summary.alerts.pending_assignments > 0 && (
                    <div className="p-3 rounded-xl bg-amber-500/10">
                      <div className="text-2xl font-bold text-amber-400">{summary.alerts.pending_assignments}</div>
                      <div className="text-sm text-amber-300/70">Manifests awaiting transport</div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {summary && summary.warehouse.total_sites > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mt-6 p-6 rounded-2xl bg-white/5 border border-white/10"
              >
                <h3 className="text-lg font-semibold text-white mb-4">Warehouse Capacity Status</h3>
                <div className="flex items-center gap-8">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="text-sm text-slate-400">{summary.warehouse.sites_healthy} Healthy</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <span className="text-sm text-slate-400">{summary.warehouse.sites_warning} Warning</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-sm text-slate-400">{summary.warehouse.sites_at_capacity} Critical</span>
                  </div>
                </div>
                <div className="mt-4 h-3 rounded-full bg-slate-700 overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-green-500 via-amber-500 to-red-500"
                    style={{ width: `${summary.warehouse.average_utilization}%` }}
                  />
                </div>
                <div className="mt-2 text-sm text-slate-400">
                  Average utilization: {summary.warehouse.average_utilization}%
                </div>
              </motion.div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
