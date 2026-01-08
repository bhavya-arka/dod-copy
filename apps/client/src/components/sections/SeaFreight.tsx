import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Ship,
  Anchor,
  Container,
  Package,
  Clock,
  MapPin,
  FileText,
  Plus,
  Search,
  Filter,
  Waves,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { User } from "../../hooks/useAuth";
import * as transportService from "../../services/transportService";
import { StatusBadge } from "../transport/StatusBadge";

interface SeaFreightProps {
  user: User;
  onBack: () => void;
  onLogout: () => void;
}

export default function SeaFreight({
  user,
  onBack,
  onLogout,
}: SeaFreightProps) {
  const [loading, setLoading] = useState(true);
  const [voyages, setVoyages] = useState<transportService.TransportPlan[]>([]);
  const [statistics, setStatistics] = useState<transportService.TransportStatistics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [voyagesData, statsData] = await Promise.all([
        transportService.getTransportPlans('sea'),
        transportService.getModeStatistics('sea'),
      ]);
      setVoyages(voyagesData);
      setStatistics(statsData);
    } catch (err) {
      console.error('Error fetching sea freight data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const statsConfig = [
    { label: "Active Vessels", value: statistics?.activePlans ?? 0, icon: Ship, color: "text-teal-600" },
    { label: "In Transit", value: statistics?.underway ?? 0, icon: Waves, color: "text-blue-500" },
    { label: "At Port", value: statistics?.loading ?? 0, icon: Anchor, color: "text-green-600" },
    { label: "Total Voyages", value: statistics?.totalPlans ?? 0, icon: Container, color: "text-purple-600" },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#111827]">
      <header className="sticky top-0 z-50 bg-white border-b border-[#E5E7EB] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="flex items-center gap-2 text-sm text-[#6B7280] hover:text-[#111827] transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back to Hub</span>
              </button>
              <div className="h-6 w-px bg-[#E5E7EB]" />
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-teal-600">
                  <Ship className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-[#111827]">Sea Freight</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-[#6B7280] hidden sm:block">
                {user.username || user.email}
              </span>
              <button
                onClick={onLogout}
                className="text-sm text-[#6B7280] hover:text-[#111827] transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-2xl sm:text-3xl font-bold text-[#111827] mb-2">
            Sea Freight Dashboard
          </h1>
          <p className="text-[#6B7280]">
            Manage maritime operations, container planning, and port logistics
          </p>
        </motion.div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={fetchData}
              className="ml-auto text-sm text-red-600 hover:text-red-800 font-medium"
            >
              Retry
            </button>
          </motion.div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {statsConfig.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="p-4 rounded-2xl bg-white border border-[#E5E7EB] shadow-sm hover:shadow-md hover:border-[#2563EB]/30 transition-all"
            >
              <div className="flex items-center gap-2 mb-2">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
                <span className="text-xs text-[#6B7280]">{stat.label}</span>
              </div>
              {loading ? (
                <div className="flex items-center h-8">
                  <Loader2 className="w-5 h-5 animate-spin text-[#6B7280]" />
                </div>
              ) : (
                <p className="text-2xl font-bold text-[#111827]">{stat.value}</p>
              )}
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-2 rounded-2xl bg-white border border-[#E5E7EB] shadow-sm p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#111827]">Active Shipments</h2>
              <button className="bg-[#2563EB] text-white hover:bg-[#1D4ED8] text-sm px-3 py-1.5 rounded-xl flex items-center gap-2 transition-colors">
                <Plus className="w-4 h-4" />
                New Shipment
              </button>
            </div>
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
                <input
                  type="text"
                  placeholder="Search shipments..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl bg-white border border-[#E5E7EB] text-[#111827] placeholder:text-[#9CA3AF] text-sm focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]/30"
                />
              </div>
              <button className="bg-white border border-[#E5E7EB] text-[#111827] hover:bg-[#FAFAFA] text-sm px-3 py-2 rounded-xl flex items-center gap-2 transition-colors">
                <Filter className="w-4 h-4" />
                Filter
              </button>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-teal-600 mb-4" />
                <p className="text-[#6B7280]">Loading shipments...</p>
              </div>
            ) : voyages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-[#6B7280]">
                <Ship className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-center">No active shipments</p>
                <p className="text-sm text-[#9CA3AF]">
                  Create your first maritime shipment to get started
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {voyages.map((voyage) => (
                  <div
                    key={voyage.id}
                    className="p-4 rounded-xl border border-[#E5E7EB] hover:border-teal-200 hover:bg-teal-50/30 transition-all cursor-pointer"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-medium text-[#111827]">{voyage.name}</h3>
                        <p className="text-sm text-[#6B7280] flex items-center gap-2 mt-1">
                          <MapPin className="w-3 h-3" />
                          {voyage.origin} → {voyage.destination}
                        </p>
                      </div>
                      <StatusBadge status={voyage.status} size="sm" />
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-xs text-[#6B7280]">
                      <span className="flex items-center gap-1">
                        <Package className="w-3 h-3" />
                        {voyage.cargo_count} items
                      </span>
                      <span className="flex items-center gap-1">
                        <Container className="w-3 h-3" />
                        {voyage.total_weight_lbs.toLocaleString()} lbs
                      </span>
                      {voyage.departure_time && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(voyage.departure_time).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-2xl bg-white border border-[#E5E7EB] shadow-sm p-6"
          >
            <h2 className="text-lg font-semibold text-[#111827] mb-4">Quick Actions</h2>
            <div className="space-y-2">
              {[
                { icon: Ship, label: "Plan Voyage", desc: "Create shipping route" },
                { icon: Container, label: "Container Load", desc: "Manage containers" },
                { icon: MapPin, label: "Track Vessels", desc: "Live tracking" },
                { icon: FileText, label: "Generate BOL", desc: "Bill of Lading" },
              ].map((action) => (
                <button
                  key={action.label}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#FAFAFA] transition-colors text-left group"
                >
                  <div className="p-2 rounded-lg bg-[#FAFAFA] group-hover:bg-teal-50">
                    <action.icon className="w-4 h-4 text-[#6B7280] group-hover:text-teal-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#111827]">{action.label}</p>
                    <p className="text-xs text-[#6B7280]">{action.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-2xl bg-white border border-[#E5E7EB] shadow-sm p-6"
        >
          <h2 className="text-lg font-semibold text-[#111827] mb-4">
            Port Schedule
          </h2>
          <div className="flex flex-col items-center justify-center py-8 text-[#6B7280]">
            <Anchor className="w-10 h-10 mb-3 opacity-50" />
            <p>No scheduled arrivals or departures</p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
