import React from "react";
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
} from "lucide-react";
import { User } from "../../hooks/useAuth";

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
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-border shadow-subtle">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back to Hub</span>
              </button>
              <div className="h-6 w-px bg-border" />
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-accent">
                  <Ship className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-foreground">Sea Freight</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground hidden sm:block">
                {user.username || user.email}
              </span>
              <button
                onClick={onLogout}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
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
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
            Sea Freight Dashboard
          </h1>
          <p className="text-muted-foreground">
            Manage maritime operations, container planning, and port logistics
          </p>
        </motion.div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Active Vessels", value: "0", icon: Ship, color: "text-accent" },
            { label: "In Transit", value: "0", icon: Waves, color: "text-blue-500" },
            { label: "At Port", value: "0", icon: Anchor, color: "text-green-500" },
            { label: "Containers", value: "0", icon: Container, color: "text-purple-500" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="p-4 rounded-2xl bg-card border border-border shadow-subtle"
            >
              <div className="flex items-center gap-2 mb-2">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-2 rounded-2xl bg-card border border-border shadow-subtle p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Active Shipments</h2>
              <button className="btn-primary text-sm px-3 py-1.5 flex items-center gap-2">
                <Plus className="w-4 h-4" />
                New Shipment
              </button>
            </div>
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search shipments..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl bg-muted border border-border text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40"
                />
              </div>
              <button className="btn-secondary text-sm px-3 py-2 flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Filter
              </button>
            </div>
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Ship className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-center">No active shipments</p>
              <p className="text-sm text-muted-foreground/70">
                Create your first maritime shipment to get started
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-2xl bg-card border border-border shadow-subtle p-6"
          >
            <h2 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h2>
            <div className="space-y-2">
              {[
                { icon: Ship, label: "Plan Voyage", desc: "Create shipping route" },
                { icon: Container, label: "Container Load", desc: "Manage containers" },
                { icon: MapPin, label: "Track Vessels", desc: "Live tracking" },
                { icon: FileText, label: "Generate BOL", desc: "Bill of Lading" },
              ].map((action) => (
                <button
                  key={action.label}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors text-left group"
                >
                  <div className="p-2 rounded-lg bg-muted group-hover:bg-accent-soft">
                    <action.icon className="w-4 h-4 text-muted-foreground group-hover:text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{action.label}</p>
                    <p className="text-xs text-muted-foreground">{action.desc}</p>
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
          className="rounded-2xl bg-card border border-border shadow-subtle p-6"
        >
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Port Schedule
          </h2>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Anchor className="w-10 h-10 mb-3 opacity-50" />
            <p>No scheduled arrivals or departures</p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
