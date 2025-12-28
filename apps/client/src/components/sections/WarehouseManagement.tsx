import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Warehouse,
  Package,
  MapPin,
  AlertTriangle,
  BarChart3,
  Plus,
  Search,
  Filter,
  Box,
  Layers,
  Clock,
  TrendingUp,
  Settings,
  Upload,
  Download,
} from "lucide-react";
import { User } from "../../hooks/useAuth";

interface WarehouseManagementProps {
  user: User;
  onBack: () => void;
  onLogout: () => void;
}

type WMSTab = "overview" | "inventory" | "locations" | "analytics";

export default function WarehouseManagement({
  user,
  onBack,
  onLogout,
}: WarehouseManagementProps) {
  const [activeTab, setActiveTab] = useState<WMSTab>("overview");

  const tabs: { id: WMSTab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "inventory", label: "Inventory", icon: <Package className="w-4 h-4" /> },
    { id: "locations", label: "Locations", icon: <MapPin className="w-4 h-4" /> },
    { id: "analytics", label: "Analytics", icon: <TrendingUp className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/10 to-slate-900">
      <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-sm border-b border-slate-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back to Hub</span>
              </button>
              <div className="h-6 w-px bg-slate-700" />
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-purple-600 to-pink-500">
                  <Warehouse className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-white">Warehouse Management</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400 hidden sm:block">
                {user.username || user.email}
              </span>
              <button
                onClick={onLogout}
                className="text-sm text-slate-400 hover:text-white"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="border-b border-slate-700/50 bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1 overflow-x-auto py-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "bg-purple-600 text-white"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "inventory" && <InventoryTab />}
        {activeTab === "locations" && <LocationsTab />}
        {activeTab === "analytics" && <AnalyticsTab />}
      </main>
    </div>
  );
}

function OverviewTab() {
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
          Warehouse Overview
        </h1>
        <p className="text-slate-400">
          Multi-site inventory management and capacity monitoring
        </p>
      </motion.div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Sites", value: "0", icon: Warehouse, color: "purple" },
          { label: "Total Items", value: "0", icon: Package, color: "blue" },
          { label: "Capacity Used", value: "0%", icon: Box, color: "green" },
          { label: "Aging Alerts", value: "0", icon: AlertTriangle, color: "amber" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="p-4 rounded-xl bg-slate-800/50 border border-slate-700"
          >
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className={`w-4 h-4 text-${stat.color}-400`} />
              <span className="text-xs text-slate-400">{stat.label}</span>
            </div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl bg-slate-800/50 border border-slate-700 p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Sites</h2>
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm transition-colors">
              <Plus className="w-4 h-4" />
              Add Site
            </button>
          </div>
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <Warehouse className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-center">No warehouse sites configured</p>
            <p className="text-sm text-slate-600">Add your first site to begin</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl bg-slate-800/50 border border-slate-700 p-6"
        >
          <h2 className="text-lg font-semibold text-white mb-4">Aging Alerts</h2>
          <div className="space-y-3">
            {[
              { years: "7+", label: "Critical", color: "red", count: 0 },
              { years: "5-7", label: "Warning", color: "amber", count: 0 },
              { years: "3-5", label: "Monitor", color: "yellow", count: 0 },
            ].map((alert) => (
              <div
                key={alert.years}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-700/30"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-3 h-3 rounded-full bg-${alert.color}-500`}
                  />
                  <div>
                    <p className="text-sm font-medium text-white">
                      {alert.years} years old
                    </p>
                    <p className="text-xs text-slate-500">{alert.label}</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-white">{alert.count}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="rounded-xl bg-slate-800/50 border border-slate-700 p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Quick Actions</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: Upload, label: "Import Inventory", desc: "CSV upload" },
            { icon: Download, label: "Export Data", desc: "Generate reports" },
            { icon: Layers, label: "Optimize Placement", desc: "AI recommendations" },
            { icon: Settings, label: "Configure", desc: "Site settings" },
          ].map((action) => (
            <button
              key={action.label}
              className="flex flex-col items-center gap-2 p-4 rounded-lg hover:bg-slate-700/50 transition-colors text-center group"
            >
              <div className="p-3 rounded-lg bg-slate-700 group-hover:bg-purple-600/20">
                <action.icon className="w-5 h-5 text-slate-400 group-hover:text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">{action.label}</p>
                <p className="text-xs text-slate-500">{action.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </motion.div>
    </>
  );
}

function InventoryTab() {
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Inventory</h1>
            <p className="text-slate-400">Track and manage warehouse inventory</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 text-sm">
              <Upload className="w-4 h-4" />
              Import
            </button>
            <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm">
              <Plus className="w-4 h-4" />
              Add Item
            </button>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl bg-slate-800/50 border border-slate-700 p-6"
      >
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search inventory..."
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-purple-500"
            />
          </div>
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 text-sm">
            <Filter className="w-4 h-4" />
            Filter
          </button>
        </div>

        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <Package className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-lg mb-2">No inventory items</p>
          <p className="text-sm text-slate-600 text-center max-w-md">
            Import your inventory data via CSV or add items manually to start
            tracking warehouse contents.
          </p>
        </div>
      </motion.div>
    </>
  );
}

function LocationsTab() {
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Locations</h1>
            <p className="text-slate-400">
              Manage warehouse zones and pallet positions
            </p>
          </div>
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm">
            <Plus className="w-4 h-4" />
            Add Location
          </button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl bg-slate-800/50 border border-slate-700 p-6"
      >
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <MapPin className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-lg mb-2">No locations configured</p>
          <p className="text-sm text-slate-600 text-center max-w-md">
            Define warehouse buildings, zones, and pallet positions to enable
            location-based inventory tracking.
          </p>
        </div>
      </motion.div>
    </>
  );
}

function AnalyticsTab() {
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-2xl font-bold text-white mb-1">Analytics</h1>
        <p className="text-slate-400">
          Capacity utilization and inventory insights
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl bg-slate-800/50 border border-slate-700 p-6"
        >
          <h2 className="text-lg font-semibold text-white mb-4">
            Capacity Heatmap
          </h2>
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <BarChart3 className="w-12 h-12 mb-4 opacity-50" />
            <p>No data available</p>
            <p className="text-sm text-slate-600">
              Add sites and inventory to view capacity heatmap
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl bg-slate-800/50 border border-slate-700 p-6"
        >
          <h2 className="text-lg font-semibold text-white mb-4">
            Aging Distribution
          </h2>
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <Clock className="w-12 h-12 mb-4 opacity-50" />
            <p>No data available</p>
            <p className="text-sm text-slate-600">
              Import inventory with receipt dates to track aging
            </p>
          </div>
        </motion.div>
      </div>
    </>
  );
}
