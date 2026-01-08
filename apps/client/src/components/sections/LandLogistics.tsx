import React, { useState, useEffect, useCallback, useMemo, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Truck,
  Route,
  FileText,
  Plus,
  Play,
  CheckCircle,
  Loader2,
  BarChart3,
  Map,
  Fuel,
  Weight,
  Box,
  Clock,
  Navigation,
} from "lucide-react";
import { User } from "../../hooks/useAuth";
import { StatusBadge, TransportTable, CapacityWidget, LocationAutocomplete, RouteMap, PlaceDetails } from '../transport';
import { ConvoyVisualization } from '../3d/ConvoyVisualization';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";

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

interface ConvoyVehicle {
  id: number;
  vehicleCode: string;
  position: number;
  lane: number;
}

interface Convoy {
  id: number;
  name: string;
  route_id?: number;
  origin: string;
  destination: string;
  status: 'draft' | 'planned' | 'loading' | 'underway' | 'completed' | 'cancelled';
  vehicle_count: number;
  total_weight_lbs: number;
  departure_time?: string;
  arrival_time?: string;
  vehicles?: ConvoyVehicle[];
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

interface LocationCoords {
  lat: number;
  lng: number;
  formattedAddress: string;
}

interface RouteInfo {
  distance_miles: number;
  duration_hours: number;
  polyline?: string;
}

interface ConvoyFormData {
  name: string;
  origin: string;
  destination: string;
  origin_coords?: LocationCoords;
  destination_coords?: LocationCoords;
  route_id?: number;
  departure_time: string;
}

type Tab = 'overview' | 'routes' | 'convoys' | 'vehicles' | 'planning';

const statusTransitions: Record<string, { nextStatus: string; buttonLabel: string }> = {
  draft: { nextStatus: 'planned', buttonLabel: 'Start Planning' },
  planned: { nextStatus: 'loading', buttonLabel: 'Begin Loading' },
  loading: { nextStatus: 'underway', buttonLabel: 'Dispatch Convoy' },
  underway: { nextStatus: 'completed', buttonLabel: 'Mark Complete' },
};

const VehicleCard = memo(({ vehicle, formatWeight }: { vehicle: VehicleType; formatWeight: (lbs: number) => string }) => (
  <motion.div
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
));

VehicleCard.displayName = 'VehicleCard';

function LandLogistics({
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
  
  const [selectedConvoy, setSelectedConvoy] = useState<Convoy | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showVehicleSelectModal, setShowVehicleSelectModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  
  const [formData, setFormData] = useState<ConvoyFormData>({
    name: '',
    origin: '',
    destination: '',
    departure_time: '',
  });
  
  const [convoyRouteInfo, setConvoyRouteInfo] = useState<RouteInfo | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  
  const [planOrigin, setPlanOrigin] = useState('');
  const [planOriginCoords, setPlanOriginCoords] = useState<LocationCoords | null>(null);
  const [planDestination, setPlanDestination] = useState('');
  const [planDestinationCoords, setPlanDestinationCoords] = useState<LocationCoords | null>(null);
  const [planRouteInfo, setPlanRouteInfo] = useState<RouteInfo | null>(null);
  const [isPlanningRoute, setIsPlanningRoute] = useState(false);

  const fetchData = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateConvoy = useCallback(async () => {
    if (!formData.name || !formData.origin || !formData.destination) return;
    
    setIsCreating(true);
    try {
      const res = await fetch('/api/land/convoys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...formData,
          status: 'draft',
          vehicle_count: 0,
          total_weight_lbs: 0,
        }),
      });
      
      if (res.ok) {
        await fetchData();
        setShowCreateModal(false);
        setFormData({ name: '', origin: '', destination: '', departure_time: '' });
        setConvoyRouteInfo(null);
      }
    } catch (error) {
      console.error('Error creating convoy:', error);
    } finally {
      setIsCreating(false);
    }
  }, [formData, fetchData]);

  const handleUpdateConvoyStatus = useCallback(async (convoyId: number, newStatus: string) => {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/land/convoys/${convoyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      
      if (res.ok) {
        setConvoys(prev => prev.map(c => c.id === convoyId ? { ...c, status: newStatus as Convoy['status'] } : c));
        if (selectedConvoy?.id === convoyId) {
          setSelectedConvoy(prev => prev ? { ...prev, status: newStatus as Convoy['status'] } : null);
        }
      }
    } catch (error) {
      console.error('Error updating convoy status:', error);
    } finally {
      setIsUpdating(false);
    }
  }, [selectedConvoy]);

  const handleAddVehicleToConvoy = useCallback(async (vehicleCode: string) => {
    if (!selectedConvoy) return;
    
    const newVehicle: ConvoyVehicle = {
      id: Date.now(),
      vehicleCode,
      position: (selectedConvoy.vehicles?.length || 0),
      lane: 1,
    };
    
    const updatedVehicles = [...(selectedConvoy.vehicles || []), newVehicle];
    
    try {
      const res = await fetch(`/api/land/convoys/${selectedConvoy.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          vehicles: updatedVehicles,
          vehicle_count: updatedVehicles.length,
        }),
      });
      
      if (res.ok) {
        setSelectedConvoy(prev => prev ? { 
          ...prev, 
          vehicles: updatedVehicles,
          vehicle_count: updatedVehicles.length,
        } : null);
        setConvoys(prev => prev.map(c => 
          c.id === selectedConvoy.id 
            ? { ...c, vehicles: updatedVehicles, vehicle_count: updatedVehicles.length }
            : c
        ));
      }
    } catch (error) {
      console.error('Error adding vehicle to convoy:', error);
    }
    
    setShowVehicleSelectModal(false);
  }, [selectedConvoy]);

  const calculateRoute = useCallback(async (
    originCoords: LocationCoords,
    destCoords: LocationCoords,
    setRouteInfo: (info: RouteInfo | null) => void,
    setLoading: (loading: boolean) => void
  ) => {
    setLoading(true);
    try {
      const res = await fetch('/api/land/routes/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          origin: { lat: originCoords.lat, lng: originCoords.lng },
          destination: { lat: destCoords.lat, lng: destCoords.lng },
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setRouteInfo({
          distance_miles: data.distance_miles || data.distanceMiles || 0,
          duration_hours: data.duration_hours || data.durationHours || 0,
          polyline: data.polyline || data.overview_polyline,
        });
      }
    } catch (error) {
      console.error('Error calculating route:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOriginChange = useCallback((value: string, placeDetails?: PlaceDetails) => {
    setFormData(prev => ({
      ...prev,
      origin: value,
      origin_coords: placeDetails ? {
        lat: placeDetails.lat,
        lng: placeDetails.lng,
        formattedAddress: placeDetails.formattedAddress,
      } : undefined,
    }));
    
    if (placeDetails && formData.destination_coords) {
      calculateRoute(
        { lat: placeDetails.lat, lng: placeDetails.lng, formattedAddress: placeDetails.formattedAddress },
        formData.destination_coords,
        setConvoyRouteInfo,
        setIsCalculatingRoute
      );
    }
  }, [formData.destination_coords, calculateRoute]);

  const handleDestinationChange = useCallback((value: string, placeDetails?: PlaceDetails) => {
    setFormData(prev => ({
      ...prev,
      destination: value,
      destination_coords: placeDetails ? {
        lat: placeDetails.lat,
        lng: placeDetails.lng,
        formattedAddress: placeDetails.formattedAddress,
      } : undefined,
    }));
    
    if (placeDetails && formData.origin_coords) {
      calculateRoute(
        formData.origin_coords,
        { lat: placeDetails.lat, lng: placeDetails.lng, formattedAddress: placeDetails.formattedAddress },
        setConvoyRouteInfo,
        setIsCalculatingRoute
      );
    }
  }, [formData.origin_coords, calculateRoute]);

  const handlePlanOriginChange = useCallback((value: string, placeDetails?: PlaceDetails) => {
    setPlanOrigin(value);
    if (placeDetails) {
      const coords = { lat: placeDetails.lat, lng: placeDetails.lng, formattedAddress: placeDetails.formattedAddress };
      setPlanOriginCoords(coords);
      
      if (planDestinationCoords) {
        calculateRoute(coords, planDestinationCoords, setPlanRouteInfo, setIsPlanningRoute);
      }
    } else {
      setPlanOriginCoords(null);
    }
  }, [planDestinationCoords, calculateRoute]);

  const handlePlanDestinationChange = useCallback((value: string, placeDetails?: PlaceDetails) => {
    setPlanDestination(value);
    if (placeDetails) {
      const coords = { lat: placeDetails.lat, lng: placeDetails.lng, formattedAddress: placeDetails.formattedAddress };
      setPlanDestinationCoords(coords);
      
      if (planOriginCoords) {
        calculateRoute(planOriginCoords, coords, setPlanRouteInfo, setIsPlanningRoute);
      }
    } else {
      setPlanDestinationCoords(null);
    }
  }, [planOriginCoords, calculateRoute]);

  const tabs = useMemo(() => [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'routes', label: 'Routes', icon: Route },
    { id: 'convoys', label: 'Convoys', icon: Truck },
    { id: 'vehicles', label: 'Vehicle Fleet', icon: Box },
    { id: 'planning', label: 'Convoy Planning', icon: Map },
  ], []);

  const formatWeight = useCallback((lbs: number) => {
    if (lbs >= 2000) {
      return `${(lbs / 2000).toFixed(1)} tons`;
    }
    return `${lbs.toLocaleString()} lbs`;
  }, []);

  const convoyColumns = useMemo(() => [
    { id: 'name', header: 'Name', accessorKey: 'name' as const, sortable: true },
    { id: 'route', header: 'Route', accessorFn: (row: Convoy) => `${row.origin} → ${row.destination}` },
    { id: 'vehicles', header: 'Vehicles', accessorKey: 'vehicle_count' as const, sortable: true },
    { id: 'weight', header: 'Weight', accessorFn: (row: Convoy) => formatWeight(row.total_weight_lbs || 0) },
    { 
      id: 'status', 
      header: 'Status', 
      accessorFn: (row: Convoy) => <StatusBadge status={row.status as any} size="sm" showIcon /> 
    },
  ], [formatWeight]);

  const convoyVehiclesForVisualization = useMemo(() => {
    if (!selectedConvoy?.vehicles) return [];
    return selectedConvoy.vehicles.map(v => ({
      id: v.id,
      vehicleCode: v.vehicleCode,
      position: v.position,
      lane: v.lane,
    }));
  }, [selectedConvoy]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50">
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <button 
                    onClick={() => setShowCreateModal(true)}
                    className="p-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg hover:shadow-xl transition-shadow"
                  >
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

                <div className="rounded-2xl bg-white border border-amber-200/50 shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-amber-900 mb-4">Recent Convoys</h2>
                  {convoys.length === 0 ? (
                    <p className="text-amber-600 text-center py-8">No convoys yet. Create your first convoy to get started.</p>
                  ) : (
                    <div className="space-y-3">
                      {convoys.slice(0, 5).map((convoy) => (
                        <div 
                          key={convoy.id} 
                          onClick={() => setSelectedConvoy(convoy)}
                          className="flex items-center justify-between p-3 rounded-xl bg-amber-50 hover:bg-amber-100 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-amber-200/50">
                              <Truck className="w-4 h-4 text-amber-700" />
                            </div>
                            <div>
                              <div className="font-medium text-amber-900">{convoy.name}</div>
                              <div className="text-sm text-amber-600">{convoy.origin} → {convoy.destination}</div>
                            </div>
                          </div>
                          <StatusBadge status={convoy.status as any} size="sm" showIcon />
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
                    <VehicleCard key={vehicle.id} vehicle={vehicle} formatWeight={formatWeight} />
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
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <div className="mb-4">
                      <h2 className="text-xl font-semibold text-amber-900">Plan Route</h2>
                      <p className="text-amber-600">Calculate route between locations</p>
                    </div>
                    
                    <div className="p-4 rounded-2xl bg-white border border-amber-200/50 space-y-4">
                      <LocationAutocomplete
                        value={planOrigin}
                        onChange={handlePlanOriginChange}
                        placeholder="Search for origin..."
                        label="Origin"
                      />
                      
                      <LocationAutocomplete
                        value={planDestination}
                        onChange={handlePlanDestinationChange}
                        placeholder="Search for destination..."
                        label="Destination"
                      />
                      
                      {isPlanningRoute && (
                        <div className="flex items-center justify-center gap-2 py-4 text-amber-600">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Calculating route...</span>
                        </div>
                      )}
                      
                      {planRouteInfo && !isPlanningRoute && (
                        <div className="p-4 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="text-center">
                              <div className="flex items-center justify-center gap-2 text-amber-600 mb-1">
                                <Navigation className="w-5 h-5" />
                                <span className="text-sm font-medium uppercase tracking-wide">Distance</span>
                              </div>
                              <div className="text-2xl font-bold text-amber-900">
                                {planRouteInfo.distance_miles.toFixed(1)} mi
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="flex items-center justify-center gap-2 text-amber-600 mb-1">
                                <Clock className="w-5 h-5" />
                                <span className="text-sm font-medium uppercase tracking-wide">Duration</span>
                              </div>
                              <div className="text-2xl font-bold text-amber-900">
                                {planRouteInfo.duration_hours.toFixed(1)} hrs
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-amber-900">Saved Routes</h3>
                        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors text-sm">
                          <Plus className="w-4 h-4" />
                          Save Current
                        </button>
                      </div>
                      
                      {routes.length === 0 ? (
                        <div className="text-center py-8 bg-white rounded-xl border border-amber-200/50">
                          <Route className="w-10 h-10 text-amber-300 mx-auto mb-2" />
                          <p className="text-amber-600 text-sm">No saved routes yet</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {routes.map((route) => (
                            <div key={route.id} className="p-3 rounded-xl bg-white border border-amber-200/50 hover:border-amber-400 transition-colors cursor-pointer">
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="font-medium text-amber-900">{route.name}</div>
                                  <div className="text-xs text-amber-600">{route.origin} → {route.destination}</div>
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-medium text-amber-900">{route.distance_miles} mi</div>
                                  <div className="text-xs text-amber-600">{route.estimated_time_hours}h</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <div className="mb-4">
                      <h2 className="text-xl font-semibold text-amber-900">Route Map</h2>
                      <p className="text-amber-600">Visual route preview</p>
                    </div>
                    
                    {planOriginCoords && planDestinationCoords ? (
                      <RouteMap
                        origin={{ lat: planOriginCoords.lat, lng: planOriginCoords.lng, label: planOriginCoords.formattedAddress }}
                        destination={{ lat: planDestinationCoords.lat, lng: planDestinationCoords.lng, label: planDestinationCoords.formattedAddress }}
                        polyline={planRouteInfo?.polyline}
                        height={500}
                        className="shadow-lg"
                      />
                    ) : (
                      <div className="flex items-center justify-center rounded-2xl bg-white border border-amber-200/50 shadow-sm" style={{ height: 500 }}>
                        <div className="text-center p-8">
                          <Map className="w-16 h-16 text-amber-300 mx-auto mb-4" />
                          <p className="text-amber-700 font-medium">No Route Selected</p>
                          <p className="text-amber-500 text-sm mt-1">Enter origin and destination to see route on map</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
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
                  <button 
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                  >
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
                  <TransportTable
                    data={convoys}
                    columns={convoyColumns}
                    mode="land"
                    onRowClick={(convoy) => setSelectedConvoy(convoy)}
                    searchable
                    searchPlaceholder="Search convoys..."
                    emptyMessage="No convoys match your search"
                  />
                )}
              </motion.div>
            )}

            {activeTab === 'planning' && (
              <motion.div
                key="planning"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="mb-4">
                  <h2 className="text-xl font-semibold text-amber-900">Convoy Planning</h2>
                  <p className="text-amber-600">Select a convoy to view 3D visualization</p>
                </div>
                
                {convoys.length > 0 ? (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium text-amber-700 uppercase tracking-wide">Select Convoy</h3>
                      {convoys.map((convoy) => (
                        <div
                          key={convoy.id}
                          onClick={() => setSelectedConvoy(convoy)}
                          className={`p-3 rounded-xl cursor-pointer transition-all ${
                            selectedConvoy?.id === convoy.id
                              ? 'bg-amber-500 text-white shadow-lg'
                              : 'bg-white border border-amber-200 hover:border-amber-400'
                          }`}
                        >
                          <div className="font-medium">{convoy.name}</div>
                          <div className={`text-sm ${selectedConvoy?.id === convoy.id ? 'text-amber-100' : 'text-amber-600'}`}>
                            {convoy.vehicle_count || 0} vehicles
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="lg:col-span-2">
                      {selectedConvoy ? (
                        <div className="rounded-2xl overflow-hidden border border-amber-200/50 bg-white">
                          <ConvoyVisualization
                            vehicles={convoyVehiclesForVisualization}
                            convoyStatus={selectedConvoy.status as any}
                            onVehicleClick={(id) => console.log('Vehicle clicked:', id)}
                            showGrid
                            autoRotate={selectedConvoy.status !== 'underway'}
                            height={400}
                          />
                          <div className="p-4 border-t border-amber-100">
                            <div className="flex items-center justify-between">
                              <div>
                                <h3 className="font-semibold text-amber-900">{selectedConvoy.name}</h3>
                                <p className="text-sm text-amber-600">{selectedConvoy.origin} → {selectedConvoy.destination}</p>
                              </div>
                              <StatusBadge status={selectedConvoy.status as any} size="md" showIcon />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-96 rounded-2xl bg-white border border-amber-200/50">
                          <div className="text-center">
                            <Map className="w-12 h-12 text-amber-300 mx-auto mb-3" />
                            <p className="text-amber-600">Select a convoy to view 3D visualization</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 bg-white rounded-2xl border border-amber-200/50">
                    <Map className="w-16 h-16 text-amber-300 mx-auto mb-4" />
                    <p className="text-amber-700 font-medium">No convoys to visualize</p>
                    <p className="text-amber-500 text-sm mb-4">Create a convoy first to see 3D visualization</p>
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="px-4 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                    >
                      Create Convoy
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>

      <Dialog open={showCreateModal} onOpenChange={(open) => {
          setShowCreateModal(open);
          if (!open) {
            setConvoyRouteInfo(null);
          }
        }}>
        <DialogContent className="bg-white border-amber-200 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-amber-900">Create New Convoy</DialogTitle>
            <DialogDescription className="text-amber-600">
              Fill in the details to create a new convoy mission
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-amber-700 mb-1">Convoy Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Alpha Convoy"
                className="w-full px-3 py-2 rounded-xl border border-amber-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
              />
            </div>
            
            <LocationAutocomplete
              value={formData.origin}
              onChange={handleOriginChange}
              placeholder="Search for origin location..."
              label="Origin"
              required
            />
            
            <LocationAutocomplete
              value={formData.destination}
              onChange={handleDestinationChange}
              placeholder="Search for destination location..."
              label="Destination"
              required
            />
            
            {(isCalculatingRoute || convoyRouteInfo) && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                {isCalculatingRoute ? (
                  <div className="flex items-center justify-center gap-2 text-amber-600">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Calculating route...</span>
                  </div>
                ) : convoyRouteInfo && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-amber-700">
                        <Navigation className="w-4 h-4" />
                        <span className="text-sm font-medium">{convoyRouteInfo.distance_miles.toFixed(1)} miles</span>
                      </div>
                      <div className="flex items-center gap-2 text-amber-700">
                        <Clock className="w-4 h-4" />
                        <span className="text-sm font-medium">{convoyRouteInfo.duration_hours.toFixed(1)} hours</span>
                      </div>
                    </div>
                    {formData.origin_coords && formData.destination_coords && (
                      <RouteMap
                        origin={{ lat: formData.origin_coords.lat, lng: formData.origin_coords.lng, label: 'Origin' }}
                        destination={{ lat: formData.destination_coords.lat, lng: formData.destination_coords.lng, label: 'Destination' }}
                        polyline={convoyRouteInfo.polyline}
                        height={150}
                      />
                    )}
                  </div>
                )}
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-amber-700 mb-1">Route (Optional)</label>
              <select
                value={formData.route_id || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, route_id: e.target.value ? Number(e.target.value) : undefined }))}
                className="w-full px-3 py-2 rounded-xl border border-amber-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
              >
                <option value="">Select a predefined route</option>
                {routes.map(route => (
                  <option key={route.id} value={route.id}>{route.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-amber-700 mb-1">Departure Time</label>
              <input
                type="datetime-local"
                value={formData.departure_time}
                onChange={(e) => setFormData(prev => ({ ...prev, departure_time: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-amber-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
              />
            </div>
          </div>
          
          <DialogFooter>
            <button
              onClick={() => setShowCreateModal(false)}
              className="px-4 py-2 rounded-xl border border-amber-200 text-amber-700 hover:bg-amber-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateConvoy}
              disabled={isCreating || !formData.name || !formData.origin || !formData.destination}
              className="px-4 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Convoy
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedConvoy && activeTab !== 'planning'} onOpenChange={(open) => !open && setSelectedConvoy(null)}>
        <DialogContent className="bg-white border-amber-200 max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-amber-900 flex items-center gap-3">
              <Truck className="w-5 h-5 text-amber-600" />
              {selectedConvoy?.name}
            </DialogTitle>
            <DialogDescription className="text-amber-600">
              {selectedConvoy?.origin} → {selectedConvoy?.destination}
            </DialogDescription>
          </DialogHeader>
          
          {selectedConvoy && (
            <div className="space-y-6 py-4">
              <div className="rounded-xl overflow-hidden border border-amber-200">
                <ConvoyVisualization
                  vehicles={convoyVehiclesForVisualization}
                  convoyStatus={selectedConvoy.status as any}
                  onVehicleClick={(id) => console.log('Vehicle clicked:', id)}
                  showGrid
                  height={300}
                />
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <CapacityWidget
                  current={selectedConvoy.vehicle_count || 0}
                  max={10}
                  label="Vehicles"
                  mode="land"
                  showPercentage={false}
                />
                <CapacityWidget
                  current={selectedConvoy.total_weight_lbs || 0}
                  max={100000}
                  label="Total Weight"
                  unit="lbs"
                  mode="land"
                />
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
                  <div className="text-xs text-amber-600 mb-1">Status</div>
                  <StatusBadge status={selectedConvoy.status as any} size="md" showIcon />
                </div>
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
                  <div className="text-xs text-amber-600 mb-1">ETA</div>
                  <div className="font-semibold text-amber-900">
                    {selectedConvoy.arrival_time 
                      ? new Date(selectedConvoy.arrival_time).toLocaleTimeString() 
                      : 'Not scheduled'}
                  </div>
                </div>
              </div>
              
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-amber-900">Assigned Vehicles ({selectedConvoy.vehicles?.length || 0})</h3>
                  <button
                    onClick={() => setShowVehicleSelectModal(true)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Add Vehicle
                  </button>
                </div>
                
                {selectedConvoy.vehicles && selectedConvoy.vehicles.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {selectedConvoy.vehicles.map((v) => (
                      <div key={v.id} className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                        <div className="font-medium text-amber-900">{v.vehicleCode}</div>
                        <div className="text-xs text-amber-600">Position {v.position + 1}, Lane {v.lane}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 bg-amber-50 rounded-xl border border-amber-200">
                    <Truck className="w-8 h-8 text-amber-300 mx-auto mb-2" />
                    <p className="text-sm text-amber-600">No vehicles assigned yet</p>
                  </div>
                )}
              </div>
              
              {statusTransitions[selectedConvoy.status] && (
                <div className="pt-4 border-t border-amber-100">
                  <button
                    onClick={() => handleUpdateConvoyStatus(
                      selectedConvoy.id, 
                      statusTransitions[selectedConvoy.status].nextStatus
                    )}
                    disabled={isUpdating}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    {isUpdating ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Play className="w-5 h-5" />
                    )}
                    {statusTransitions[selectedConvoy.status].buttonLabel}
                  </button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showVehicleSelectModal} onOpenChange={setShowVehicleSelectModal}>
        <DialogContent className="bg-white border-amber-200 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-amber-900">Add Vehicle to Convoy</DialogTitle>
            <DialogDescription className="text-amber-600">
              Select a vehicle type to add to this convoy
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-3 py-4 max-h-96 overflow-y-auto">
            {vehicleTypes.map((vehicle) => (
              <button
                key={vehicle.id}
                onClick={() => handleAddVehicleToConvoy(vehicle.code)}
                className="p-4 rounded-xl border border-amber-200 hover:border-amber-500 hover:bg-amber-50 text-left transition-all"
              >
                <div className="font-bold text-amber-900">{vehicle.code}</div>
                <div className="text-sm text-amber-600 truncate">{vehicle.name}</div>
                <div className="text-xs text-amber-500 mt-1">{formatWeight(vehicle.payload_lbs)}</div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default memo(LandLogistics);
