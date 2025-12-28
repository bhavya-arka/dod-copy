import React from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Truck,
  MapPin,
  Route,
  Package,
  Clock,
  Users,
  FileText,
  Settings,
  Plus,
  Search,
  Filter,
} from "lucide-react";
import { User } from "../../hooks/useAuth";

interface LandLogisticsProps {
  user: User;
  onBack: () => void;
  onLogout: () => void;
}

export default function LandLogistics({
  user,
  onBack,
  onLogout,
}: LandLogisticsProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-amber-900/10 to-slate-900">
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
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-600 to-orange-500">
                  <Truck className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-white">Land Logistics</span>
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            Land Logistics Dashboard
          </h1>
          <p className="text-slate-400">
            Manage ground transport operations, convoy planning, and overland cargo
          </p>
        </motion.div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Active Convoys", value: "0", icon: Truck, color: "amber" },
            { label: "In Transit", value: "0", icon: Route, color: "blue" },
            { label: "Delivered Today", value: "0", icon: Package, color: "green" },
            { label: "Pending", value: "0", icon: Clock, color: "purple" },
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-2 rounded-xl bg-slate-800/50 border border-slate-700 p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Active Routes</h2>
              <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm transition-colors">
                <Plus className="w-4 h-4" />
                New Route
              </button>
            </div>
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search routes..."
                  className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
              <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 text-sm">
                <Filter className="w-4 h-4" />
                Filter
              </button>
            </div>
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Truck className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-center">No active routes</p>
              <p className="text-sm text-slate-600">
                Create your first ground transport route to get started
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-xl bg-slate-800/50 border border-slate-700 p-6"
          >
            <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
            <div className="space-y-2">
              {[
                { icon: Route, label: "Plan New Convoy", desc: "Create route plan" },
                { icon: Package, label: "Manage Cargo", desc: "View manifests" },
                { icon: MapPin, label: "Track Vehicles", desc: "Live location" },
                { icon: FileText, label: "Generate Reports", desc: "Export data" },
              ].map((action) => (
                <button
                  key={action.label}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/50 transition-colors text-left group"
                >
                  <div className="p-2 rounded-lg bg-slate-700 group-hover:bg-amber-600/20">
                    <action.icon className="w-4 h-4 text-slate-400 group-hover:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{action.label}</p>
                    <p className="text-xs text-slate-500">{action.desc}</p>
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
          className="rounded-xl bg-slate-800/50 border border-slate-700 p-6"
        >
          <h2 className="text-lg font-semibold text-white mb-4">
            Recent Activity
          </h2>
          <div className="flex flex-col items-center justify-center py-8 text-slate-500">
            <Clock className="w-10 h-10 mb-3 opacity-50" />
            <p>No recent activity</p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
