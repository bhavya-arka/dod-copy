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
  gradient: string;
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
    icon: <Plane className="w-12 h-12" />,
    gradient: "from-blue-600 to-cyan-500",
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
    icon: <Truck className="w-12 h-12" />,
    gradient: "from-amber-600 to-orange-500",
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
    icon: <Ship className="w-12 h-12" />,
    gradient: "from-teal-600 to-emerald-500",
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
    icon: <Warehouse className="w-12 h-12" />,
    gradient: "from-purple-600 to-pink-500",
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <header className="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Package className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">
                  Arka Cargo Operations
                </h1>
                <p className="text-xs text-slate-400">
                  Multi-Modal Logistics Platform
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700">
                <UserIcon className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-300">
                  {user.username || user.email}
                </span>
              </div>
              <button
                onClick={onLogout}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline text-sm">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Welcome back, {user.username || "Operator"}
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Select an operations module to begin planning and managing your
            cargo logistics across air, land, sea, and warehouse facilities.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {operationTiles.map((tile, index) => (
            <motion.button
              key={tile.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              onClick={() => tile.available && onSelectMode(tile.id)}
              disabled={!tile.available}
              className={`group relative overflow-hidden rounded-2xl p-6 text-left transition-all duration-300 ${
                tile.available
                  ? "hover:scale-[1.02] hover:shadow-2xl cursor-pointer"
                  : "opacity-50 cursor-not-allowed"
              }`}
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${tile.gradient} opacity-10 group-hover:opacity-20 transition-opacity`}
              />
              <div className="absolute inset-0 bg-slate-800/90 group-hover:bg-slate-800/80 transition-colors" />
              <div className="absolute inset-0 border border-slate-700 group-hover:border-slate-600 rounded-2xl transition-colors" />

              <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <div
                    className={`p-3 rounded-xl bg-gradient-to-br ${tile.gradient}`}
                  >
                    {tile.icon}
                  </div>
                  <ChevronRight className="w-6 h-6 text-slate-500 group-hover:text-white group-hover:translate-x-1 transition-all" />
                </div>

                <h3 className="text-xl font-bold text-white mb-1">
                  {tile.title}
                </h3>
                <p className="text-sm text-slate-400 mb-3">{tile.subtitle}</p>
                <p className="text-sm text-slate-500 mb-4">{tile.description}</p>

                {tile.stats && (
                  <div className="flex gap-4">
                    {tile.stats.map((stat, i) => (
                      <div
                        key={i}
                        className="px-3 py-1.5 rounded-lg bg-slate-700/50"
                      >
                        <span className="text-xs text-slate-400 block">
                          {stat.label}
                        </span>
                        <span className="text-sm font-semibold text-white">
                          {stat.value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {!tile.available && (
                  <div className="absolute top-4 right-4 px-2 py-1 rounded bg-slate-700 text-xs text-slate-400">
                    Coming Soon
                  </div>
                )}
              </div>
            </motion.button>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        >
          <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-800/50 border border-slate-700">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Activity className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Real-time Tracking</p>
              <p className="text-xs text-slate-400">Live cargo monitoring</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-800/50 border border-slate-700">
            <div className="p-2 rounded-lg bg-green-500/10">
              <MapPin className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Multi-Site Support</p>
              <p className="text-xs text-slate-400">Global operations</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-800/50 border border-slate-700">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <TrendingUp className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">AI Insights</p>
              <p className="text-xs text-slate-400">Optimization recommendations</p>
            </div>
          </div>
        </motion.div>
      </main>

      <footer className="border-t border-slate-700/50 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-slate-500">
              Arka Cargo Operations Platform
            </p>
            <p className="text-xs text-slate-600">
              Air | Land | Sea | Warehouse
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
