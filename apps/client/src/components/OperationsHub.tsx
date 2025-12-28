import React from "react";
import { motion } from "framer-motion";
import {
  Plane,
  Truck,
  Ship,
  Warehouse,
  LogOut,
  User as UserIcon,
  ChevronRight,
  Activity,
  Package,
  MapPin,
  TrendingUp,
} from "lucide-react";
import { User } from "../hooks/useAuth";

export type OperationMode = "air" | "land" | "sea" | "warehouse";

interface OperationTile {
  id: OperationMode;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  stats?: { label: string; value: string }[];
  available: boolean;
}

interface OperationsHubProps {
  user: User;
  onLogout: () => void;
  onSelectMode: (mode: OperationMode) => void;
}

const operationTiles: OperationTile[] = [
  {
    id: "air",
    title: "Air Operations",
    subtitle: "PACAF Airlift System",
    description:
      "C-17/C-130 load planning, 463L palletization, route optimization, and cargo visualization",
    icon: <Plane className="w-8 h-8 text-white" />,
    iconBg: "bg-blue-500",
    stats: [
      { label: "Active Plans", value: "--" },
      { label: "Aircraft", value: "C-17/C-130" },
    ],
    available: true,
  },
  {
    id: "land",
    title: "Land Logistics",
    subtitle: "Ground Transport",
    description:
      "Convoy planning, truck routing, ground cargo manifests, and overland transport coordination",
    icon: <Truck className="w-8 h-8 text-white" />,
    iconBg: "bg-amber-500",
    stats: [
      { label: "Routes", value: "--" },
      { label: "Vehicles", value: "--" },
    ],
    available: true,
  },
  {
    id: "sea",
    title: "Sea Freight",
    subtitle: "Maritime Operations",
    description:
      "Container planning, vessel manifests, port logistics, and maritime cargo coordination",
    icon: <Ship className="w-8 h-8 text-white" />,
    iconBg: "bg-teal-500",
    stats: [
      { label: "Shipments", value: "--" },
      { label: "Containers", value: "--" },
    ],
    available: true,
  },
  {
    id: "warehouse",
    title: "Warehouse Management",
    subtitle: "Inventory & Storage",
    description:
      "Multi-site inventory tracking, pallet positioning, aging alerts, and capacity optimization",
    icon: <Warehouse className="w-8 h-8 text-white" />,
    iconBg: "bg-purple-500",
    stats: [
      { label: "Sites", value: "--" },
      { label: "Items", value: "--" },
    ],
    available: true,
  },
];

export default function OperationsHub({
  user,
  onLogout,
  onSelectMode,
}: OperationsHubProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <nav className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-border z-50 px-4 py-3 shadow-subtle">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-accent flex items-center justify-center">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                Arka Cargo Operations
              </h1>
              <p className="text-xs text-muted-foreground">
                Multi-Modal Logistics Platform
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted border border-border">
              <UserIcon className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-foreground">
                {user.username || user.email}
              </span>
            </div>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline text-sm">Logout</span>
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1 overflow-y-auto p-6 space-y-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10"
          >
            <h2 className="text-3xl font-semibold text-foreground mb-3">
              Welcome back, {user.username || "Operator"}
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Select an operations module to begin planning and managing your
              cargo logistics across air, land, sea, and warehouse facilities.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
            {operationTiles.map((tile, index) => (
              <motion.button
                key={tile.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                onClick={() => tile.available && onSelectMode(tile.id)}
                disabled={!tile.available}
                className={`group relative bg-card border border-border rounded-2xl p-6 text-left transition-all duration-300 shadow-subtle ${
                  tile.available
                    ? "hover:shadow-soft hover:-translate-y-1 cursor-pointer"
                    : "opacity-50 cursor-not-allowed"
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div
                    className={`p-3 rounded-xl ${tile.iconBg}`}
                  >
                    {tile.icon}
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-accent group-hover:translate-x-1 transition-all" />
                </div>

                <h3 className="text-lg font-semibold text-foreground mb-1">
                  {tile.title}
                </h3>
                <p className="text-sm text-muted-foreground mb-2">{tile.subtitle}</p>
                <p className="text-sm text-foreground/70 mb-4">{tile.description}</p>

                {tile.stats && (
                  <div className="flex gap-3">
                    {tile.stats.map((stat, i) => (
                      <div
                        key={i}
                        className="px-3 py-1.5 rounded-xl bg-muted"
                      >
                        <span className="text-xs text-muted-foreground block">
                          {stat.label}
                        </span>
                        <span className="text-sm font-medium text-foreground">
                          {stat.value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {!tile.available && (
                  <div className="absolute top-4 right-4 px-2 py-1 rounded-xl bg-muted text-xs text-muted-foreground">
                    Coming Soon
                  </div>
                )}
              </motion.button>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
          >
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border shadow-subtle">
              <div className="p-2 rounded-xl bg-blue-100">
                <Activity className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Real-time Tracking</p>
                <p className="text-xs text-muted-foreground">Live cargo monitoring</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border shadow-subtle">
              <div className="p-2 rounded-xl bg-green-100">
                <MapPin className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Multi-Site Support</p>
                <p className="text-xs text-muted-foreground">Global operations</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border shadow-subtle">
              <div className="p-2 rounded-xl bg-purple-100">
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">AI Insights</p>
                <p className="text-xs text-muted-foreground">Optimization recommendations</p>
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      <footer className="border-t border-border bg-white/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Arka Cargo Operations Platform
            </p>
            <p className="text-xs text-muted-foreground">
              Air | Land | Sea | Warehouse
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
