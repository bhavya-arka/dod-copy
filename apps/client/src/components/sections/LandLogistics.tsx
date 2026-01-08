import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  ChevronRight,
  Play,
  Pause,
  CheckCircle,
  AlertTriangle,
  Loader2,
  BarChart3,
  Map,
  List,
  Fuel,
  Weight,
  Box,
} from "lucide-react";
import { User } from "../../hooks/useAuth";

interface LandLogisticsProps {
  user: User;
  onBack: () => void;
  onLogout: () => void;
}

interface VehicleType {
  id: number;
  code: string;
  name: string;
  category: string;
  payload_lbs: number;
  max_speed_mph: number;
  range_miles: number;
  fuel_type: string;
  axle_config: string;
  pallet_capacity_463l: number;
  passenger_capacity: number;
  notes: string;
}

interface RouteType {
  id: number;
  name: string;
  origin: string;
  destination: string;
  distance_miles: number;
  estimated_time_hours: number;
  status: string;
}

interface Convoy {
  id: number;
  name: string;
  route_id?: number;
  origin: string;
  destination: string;
  status: string;
  vehicle_count: number;
  total_weight_lbs: number;
  departure_time?: string;
  arrival_time?: string;
}

interface Statistics {
  totalRoutes: number;
  activeRoutes: number;
  totalConvoys: number;
  activeConvoys: number;
  inTransit: number;
  pendingConvoys: number;
  completedToday: number;
  totalPayloadLbs: number;
}

type Tab = 'overview' | 'routes' | 'convoys' | 'vehicles' | 'planning';

export default function LandLogistics({
  user,
  onBack,
  onLogout,
}: LandLogisticsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [routes, setRoutes] = useState<RouteType[]>([]);
  const [convoys, setConvoys] = useState<Convoy[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsRes, vehiclesRes, routesRes, convoysRes] = await Promise.all([
        fetch('/api/land/statistics', { credentials: 'include' }),
        fetch('/api/land/vehicle-types', { credentials: 'include' }),
        fetch('/api/land/routes', { credentials: 'include' }),
        fetch('/api/land/convoys', { credentials: 'include' }),
      ]);

      if (statsRes.ok) setStatistics(await statsRes.json());
      if (vehiclesRes.ok) setVehicleTypes(await vehiclesRes.json());
      if (routesRes.ok) setRoutes(await routesRes.json());
      if (convoysRes.ok) setConvoys(await convoysRes.json());
    } catch (error) {
      console.error('Error fetching land logistics data:', error);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'routes', label: 'Routes', icon: Route },
    { id: 'convoys', label: 'Convoys', icon: Truck },
    { id: 'vehicles', label: 'Vehicle Fleet', icon: Box },
    { id: 'planning', label: 'Convoy Planning', icon: Map },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_transit': return 'text-blue-500 bg-blue-500/10';
      case 'completed': return 'text-green-500 bg-green-500/10';
      case 'loading': return 'text-amber-500 bg-amber-500/10';
      case 'planned': return 'text-purple-500 bg-purple-500/10';
      default: return 'text-gray-500 bg-gray-500/10';
    }
  };

  const formatWeight = (lbs: number) => {
    if (lbs >= 2000) {
      return `${(lbs / 2000).toFixed(1)} tons`;
    }
    return `${lbs.toLocaleString()} lbs`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-amber-200/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="flex items-center gap-2 text-sm text-amber-700 hover:text-amber-900 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back to Hub</span>
              </button>
              <div className="h-6 w-px bg-amber-200" />
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500">
                  <Truck className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-amber-900">Land Logistics</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-amber-700 hidden sm:block">
                {user.username || user.email}
              </span>
              <button
                onClick={onLogout}
                className="text-sm text-amber-700 hover:text-amber-900 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-amber-200/50 bg-white/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1 -mb-px overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-amber-500 text-amber-700'
                    : 'border-transparent text-amber-600/70 hover:text-amber-700 hover:border-amber-300'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {activeTab === 'overview' && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                {/* Statistics Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  {[
                    { label: 'Active Convoys', value: statistics?.activeConvoys || 0, icon: Truck, color: 'amber' },
                    { label: 'In Transit', value: statistics?.inTransit || 0, icon: Route, color: 'blue' },
                    { label: 'Completed Today', value: statistics?.completedToday || 0, icon: CheckCircle, color: 'green' },
                    { label: 'Total Payload', value: formatWeight(statistics?.totalPayloadLbs || 0), icon: Weight, color: 'purple' },
                  ].map((stat, i) => (
                    <motion.div
                      key={stat.label}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="p-4 rounded-2xl bg-white border border-amber-200/50 shadow-sm"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <stat.icon className={`w-4 h-4 text-${stat.color}-500`} />
                        <span className="text-xs text-amber-700">{stat.label}</span>
                      </div>
                      <p className="text-2xl font-bold text-amber-900">{stat.value}</p>
                    </motion.div>
                  ))}
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <button className="p-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg hover:shadow-xl transition-shadow">
                    <div className="flex items-center gap-3">
                      <Plus className="w-5 h-5" />
                      <div className="text-left">
                        <div className="font-medium">New Convoy</div>
                        <div className="text-xs opacity-80">Create a new convoy mission</div>
                      </div>
                    </div>
                  </button>
                  <button className="p-4 rounded-2xl bg-white border border-amber-200 hover:border-amber-400 transition-colors">
                    <div className="flex items-center gap-3">
                      <Route className="w-5 h-5 text-amber-600" />
                      <div className="text-left">
                        <div className="font-medium text-amber-900">Plan Route</div>
                        <div className="text-xs text-amber-600">Design convoy route</div>
                      </div>
                    </div>
                  </button>
                  <button className="p-4 rounded-2xl bg-white border border-amber-200 hover:border-amber-400 transition-colors">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-amber-600" />
                      <div className="text-left">
                        <div className="font-medium text-amber-900">Load Manifest</div>
                        <div className="text-xs text-amber-600">Import cargo manifest</div>
                      </div>
                    </div>
                  </button>
                </div>

                {/* Recent Convoys */}
                <div className="rounded-2xl bg-white border border-amber-200/50 shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-amber-900 mb-4">Recent Convoys</h2>
                  {convoys.length === 0 ? (
                    <p className="text-amber-600 text-center py-8">No convoys yet. Create your first convoy to get started.</p>
                  ) : (
                    <div className="space-y-3">
                      {convoys.slice(0, 5).map((convoy) => (
                        <div key={convoy.id} className="flex items-center justify-between p-3 rounded-xl bg-amber-50 hover:bg-amber-100 transition-colors cursor-pointer">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-amber-200/50">
                              <Truck className="w-4 h-4 text-amber-700" />
                            </div>
                            <div>
                              <div className="font-medium text-amber-900">{convoy.name}</div>
                              <div className="text-sm text-amber-600">{convoy.origin} → {convoy.destination}</div>
                            </div>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(convoy.status)}`}>
                            {convoy.status.replace('_', ' ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'vehicles' && (
              <motion.div
                key="vehicles"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="mb-4">
                  <h2 className="text-xl font-semibold text-amber-900 mb-2">Military Vehicle Fleet</h2>
                  <p className="text-amber-600">Available vehicle types for convoy operations</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {vehicleTypes.map((vehicle) => (
                    <motion.div
                      key={vehicle.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="p-4 rounded-2xl bg-white border border-amber-200/50 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="font-bold text-amber-900">{vehicle.code}</div>
                          <div className="text-sm text-amber-600">{vehicle.name}</div>
                        </div>
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                          {vehicle.category.replace('_', ' ')}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center gap-1 text-amber-700">
                          <Weight className="w-3 h-3" />
                          <span>{formatWeight(vehicle.payload_lbs)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-amber-700">
                          <Route className="w-3 h-3" />
                          <span>{vehicle.range_miles} mi</span>
                        </div>
                        <div className="flex items-center gap-1 text-amber-700">
                          <Fuel className="w-3 h-3" />
                          <span>{vehicle.fuel_type}</span>
                        </div>
                        <div className="flex items-center gap-1 text-amber-700">
                          <Box className="w-3 h-3" />
                          <span>{vehicle.pallet_capacity_463l} 463L</span>
                        </div>
                      </div>
                      
                      <div className="mt-3 pt-3 border-t border-amber-100">
                        <div className="text-xs text-amber-600">{vehicle.axle_config} • {vehicle.max_speed_mph} mph max</div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'routes' && (
              <motion.div
                key="routes"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-amber-900">Transport Routes</h2>
                    <p className="text-amber-600">Manage convoy routes and waypoints</p>
                  </div>
                  <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600 transition-colors">
                    <Plus className="w-4 h-4" />
                    New Route
                  </button>
                </div>

                {routes.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-2xl border border-amber-200/50">
                    <Route className="w-12 h-12 text-amber-300 mx-auto mb-3" />
                    <p className="text-amber-700 font-medium">No routes defined</p>
                    <p className="text-amber-500 text-sm">Create your first route to plan convoy movements</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {routes.map((route) => (
                      <div key={route.id} className="p-4 rounded-2xl bg-white border border-amber-200/50 hover:border-amber-400 transition-colors cursor-pointer">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-amber-900">{route.name}</div>
                            <div className="text-sm text-amber-600">{route.origin} → {route.destination}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium text-amber-900">{route.distance_miles} miles</div>
                            <div className="text-xs text-amber-600">{route.estimated_time_hours}h estimated</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'convoys' && (
              <motion.div
                key="convoys"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-amber-900">Convoy Operations</h2>
                    <p className="text-amber-600">Active and scheduled convoy missions</p>
                  </div>
                  <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600 transition-colors">
                    <Plus className="w-4 h-4" />
                    New Convoy
                  </button>
                </div>

                {convoys.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-2xl border border-amber-200/50">
                    <Truck className="w-12 h-12 text-amber-300 mx-auto mb-3" />
                    <p className="text-amber-700 font-medium">No convoys yet</p>
                    <p className="text-amber-500 text-sm">Create a convoy to start moving cargo</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {convoys.map((convoy) => (
                      <div key={convoy.id} className="p-4 rounded-2xl bg-white border border-amber-200/50 hover:shadow-md transition-shadow cursor-pointer">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-amber-100">
                              <Truck className="w-6 h-6 text-amber-700" />
                            </div>
                            <div>
                              <div className="font-semibold text-amber-900">{convoy.name}</div>
                              <div className="text-sm text-amber-600">{convoy.origin} → {convoy.destination}</div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-amber-500">
                                <span>{convoy.vehicle_count || 0} vehicles</span>
                                <span>•</span>
                                <span>{formatWeight(convoy.total_weight_lbs || 0)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(convoy.status)}`}>
                              {convoy.status.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'planning' && (
              <motion.div
                key="planning"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-center py-12"
              >
                <Map className="w-16 h-16 text-amber-300 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-amber-900 mb-2">Convoy Planning</h2>
                <p className="text-amber-600 mb-6">Interactive 3D convoy visualization coming soon</p>
                <p className="text-sm text-amber-500">Plan routes, allocate vehicles, and visualize convoy formations</p>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>
    </div>
  );
}
