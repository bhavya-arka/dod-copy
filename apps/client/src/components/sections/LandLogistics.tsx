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
  Trash2,
} from "lucide-react";
import { User } from "../../hooks/useAuth";
import { StatusBadge, TransportTable, CapacityWidget, LocationAutocomplete, RouteMap, PlaceDetails, TransportAiInsights } from '../transport';
import * as warehouseService from '../../services/warehouseService';
import { ConvoyVisualization } from '../3d/ConvoyVisualization';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import * as landService from '../../services/landService';
import type {
  VehicleType,
  LandRoute,
  Convoy,
  ConvoyVehicle,
  LandStatistics,
  RouteInfo,
  PendingTransfer,
  ConvoyProposal,
} from '../../services/landService';

interface LandLogisticsProps {
  user: User;
  onBack: () => void;
  onLogout: () => void;
}

type RouteType = LandRoute;

type Statistics = LandStatistics;

interface LocationCoords {
  lat: number;
  lng: number;
  formattedAddress: string;
}

interface ConvoyFormData {
  name: string;
  origin: string;
  destination: string;
  origin_coords?: LocationCoords;
  destination_coords?: LocationCoords;
  origin_site_id?: number;
  destination_site_id?: number;
  route_id?: number;
  scheduled_departure: string;
  scheduled_arrival: string;
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
    className="p-4 rounded-2xl bg-white border border-[#E5E7EB] shadow-sm hover:shadow-md hover:border-[#2563EB]/30 transition-all"
  >
    <div className="flex items-start justify-between mb-3">
      <div>
        <div className="font-bold text-[#111827]">{vehicle.code}</div>
        <div className="text-sm text-[#6B7280]">{vehicle.name}</div>
      </div>
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
        {vehicle.category.replace('_', ' ')}
      </span>
    </div>
    
    <div className="grid grid-cols-2 gap-2 text-sm">
      <div className="flex items-center gap-1 text-[#6B7280]">
        <Weight className="w-3 h-3 text-amber-500" />
        <span>{formatWeight(vehicle.payload_lbs)}</span>
      </div>
      <div className="flex items-center gap-1 text-[#6B7280]">
        <Route className="w-3 h-3 text-amber-500" />
        <span>{vehicle.range_miles} mi</span>
      </div>
      <div className="flex items-center gap-1 text-[#6B7280]">
        <Fuel className="w-3 h-3 text-amber-500" />
        <span>{vehicle.fuel_type}</span>
      </div>
      <div className="flex items-center gap-1 text-[#6B7280]">
        <Box className="w-3 h-3 text-amber-500" />
        <span>{vehicle.pallet_capacity_463l} 463L</span>
      </div>
    </div>
    
    <div className="mt-3 pt-3 border-t border-[#E5E7EB]">
      <div className="text-xs text-[#6B7280]">{vehicle.axle_config} • {vehicle.max_speed_mph} mph max</div>
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
  const [pendingTransfers, setPendingTransfers] = useState<PendingTransfer[]>([]);
  const [warehouseSites, setWarehouseSites] = useState<{id: number; name: string; code: string; address?: string}[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedConvoy, setSelectedConvoy] = useState<Convoy | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showVehicleSelectModal, setShowVehicleSelectModal] = useState(false);
  const [showAssignConvoyModal, setShowAssignConvoyModal] = useState(false);
  const [selectedTransferForAssignment, setSelectedTransferForAssignment] = useState<PendingTransfer | null>(null);
  const [convoyProposal, setConvoyProposal] = useState<ConvoyProposal | null>(null);
  const [proposalWarning, setProposalWarning] = useState<string | null>(null);
  const [proposalInfo, setProposalInfo] = useState<string | null>(null);
  const [isLoadingProposal, setIsLoadingProposal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isAutoCreating, setIsAutoCreating] = useState(false);
  
  const [formData, setFormData] = useState<ConvoyFormData>({
    name: '',
    origin: '',
    destination: '',
    scheduled_departure: '',
    scheduled_arrival: '',
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
      const data = await landService.fetchAllData();
      setStatistics(data.statistics);
      setVehicleTypes(data.vehicleTypes);
      setRoutes(data.routes);
      setConvoys(data.convoys);
      setPendingTransfers(data.pendingTransfers);
    } catch (error) {
      console.error('Error fetching land logistics data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAssignConvoy = useCallback(async (convoyId: number) => {
    if (!selectedTransferForAssignment) return;
    
    setIsAssigning(true);
    try {
      await landService.assignConvoyToTransfer(selectedTransferForAssignment.id, convoyId);
      await fetchData();
      setShowAssignConvoyModal(false);
      setSelectedTransferForAssignment(null);
    } catch (error) {
      console.error('Error assigning convoy to transfer:', error);
    } finally {
      setIsAssigning(false);
    }
  }, [selectedTransferForAssignment, fetchData]);

  const openAssignConvoyModal = useCallback(async (transfer: PendingTransfer) => {
    setSelectedTransferForAssignment(transfer);
    setConvoyProposal(null);
    setProposalWarning(null);
    setProposalInfo(null);
    setShowAssignConvoyModal(true);
    setIsLoadingProposal(true);
    
    try {
      const response = await landService.proposeConvoyForTransfer(transfer.id);
      setConvoyProposal(response.proposal);
      setProposalWarning(response.warning);
      setProposalInfo(response.info);
    } catch (error) {
      console.error('Error loading convoy proposal:', error);
      setProposalWarning('Could not calculate vehicle requirements');
    } finally {
      setIsLoadingProposal(false);
    }
  }, []);

  const handleAutoCreateConvoy = useCallback(async () => {
    if (!selectedTransferForAssignment) return;
    
    setIsAutoCreating(true);
    try {
      await landService.autoCreateConvoyForTransfer(selectedTransferForAssignment.id);
      await fetchData();
      setShowAssignConvoyModal(false);
      setSelectedTransferForAssignment(null);
      setConvoyProposal(null);
    } catch (error) {
      console.error('Error auto-creating convoy:', error);
    } finally {
      setIsAutoCreating(false);
    }
  }, [selectedTransferForAssignment, fetchData]);

  useEffect(() => {
    fetchData();
    const fetchSites = async () => {
      try {
        const sites = await warehouseService.fetchSites();
        setWarehouseSites(sites);
      } catch (err) {
        console.error("Failed to fetch warehouse sites:", err);
      }
    };
    fetchSites();
  }, [fetchData]);

  const handleCreateConvoy = useCallback(async () => {
    if (!formData.name || !formData.origin || !formData.destination) return;
    
    setIsCreating(true);
    try {
      await landService.createConvoy({
        ...formData,
        scheduled_departure: formData.scheduled_departure ? new Date(formData.scheduled_departure).toISOString() : undefined,
        scheduled_arrival: formData.scheduled_arrival ? new Date(formData.scheduled_arrival).toISOString() : undefined,
      });
      await fetchData();
      setShowCreateModal(false);
      setFormData({ 
        name: '', 
        origin: '', 
        destination: '', 
        origin_site_id: undefined,
        destination_site_id: undefined,
        origin_coords: undefined,
        destination_coords: undefined,
        scheduled_departure: '', 
        scheduled_arrival: '' 
      });
      setConvoyRouteInfo(null);
    } catch (error) {
      console.error('Error creating convoy:', error);
    } finally {
      setIsCreating(false);
    }
  }, [formData, fetchData]);

  const handleUpdateConvoyStatus = useCallback(async (convoyId: number, newStatus: string) => {
    setIsUpdating(true);
    try {
      await landService.updateConvoyStatus(convoyId, newStatus);
      setConvoys(prev => prev.map(c => c.id === convoyId ? { ...c, status: newStatus as Convoy['status'] } : c));
      if (selectedConvoy?.id === convoyId) {
        setSelectedConvoy(prev => prev ? { ...prev, status: newStatus as Convoy['status'] } : null);
      }
    } catch (error) {
      console.error('Error updating convoy status:', error);
    } finally {
      setIsUpdating(false);
    }
  }, [selectedConvoy]);

  const handleAddVehicleToConvoy = useCallback(async (vehicleCode: string) => {
    if (!selectedConvoy) return;
    
    try {
      const updatedConvoy = await landService.addVehicleToConvoy(
        selectedConvoy.id, 
        selectedConvoy, 
        { vehicleCode }
      );
      
      setSelectedConvoy(updatedConvoy);
      setConvoys(prev => prev.map(c => 
        c.id === selectedConvoy.id ? updatedConvoy : c
      ));
    } catch (error) {
      console.error('Error adding vehicle to convoy:', error);
    }
    
    setShowVehicleSelectModal(false);
  }, [selectedConvoy]);

  const calculateRouteHandler = useCallback(async (
    originCoords: LocationCoords,
    destCoords: LocationCoords,
    setRouteInfo: (info: RouteInfo | null) => void,
    setLoadingState: (loading: boolean) => void
  ) => {
    setLoadingState(true);
    try {
      const routeInfo = await landService.calculateRoute(
        { lat: originCoords.lat, lng: originCoords.lng },
        { lat: destCoords.lat, lng: destCoords.lng }
      );
      setRouteInfo(routeInfo);
    } catch (error) {
      console.error('Error calculating route:', error);
    } finally {
      setLoadingState(false);
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
      calculateRouteHandler(
        { lat: placeDetails.lat, lng: placeDetails.lng, formattedAddress: placeDetails.formattedAddress },
        formData.destination_coords,
        setConvoyRouteInfo,
        setIsCalculatingRoute
      );
    }
  }, [formData.destination_coords, calculateRouteHandler]);

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
      calculateRouteHandler(
        formData.origin_coords,
        { lat: placeDetails.lat, lng: placeDetails.lng, formattedAddress: placeDetails.formattedAddress },
        setConvoyRouteInfo,
        setIsCalculatingRoute
      );
    }
  }, [formData.origin_coords, calculateRouteHandler]);

  const handlePlanOriginChange = useCallback((value: string, placeDetails?: PlaceDetails) => {
    setPlanOrigin(value);
    if (placeDetails) {
      const coords = { lat: placeDetails.lat, lng: placeDetails.lng, formattedAddress: placeDetails.formattedAddress };
      setPlanOriginCoords(coords);
      
      if (planDestinationCoords) {
        calculateRouteHandler(coords, planDestinationCoords, setPlanRouteInfo, setIsPlanningRoute);
      }
    } else {
      setPlanOriginCoords(null);
    }
  }, [planDestinationCoords, calculateRouteHandler]);

  const handlePlanDestinationChange = useCallback((value: string, placeDetails?: PlaceDetails) => {
    setPlanDestination(value);
    if (placeDetails) {
      const coords = { lat: placeDetails.lat, lng: placeDetails.lng, formattedAddress: placeDetails.formattedAddress };
      setPlanDestinationCoords(coords);
      
      if (planOriginCoords) {
        calculateRouteHandler(planOriginCoords, coords, setPlanRouteInfo, setIsPlanningRoute);
      }
    } else {
      setPlanDestinationCoords(null);
    }
  }, [planOriginCoords, calculateRouteHandler]);

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
    <div className="min-h-screen bg-[#FAFAFA]">
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
                <div className="p-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500">
                  <Truck className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-[#111827]">Land Logistics</span>
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

      <div className="border-b border-[#E5E7EB] bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1 -mb-px overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-[#2563EB] text-[#2563EB]'
                    : 'border-transparent text-[#6B7280] hover:text-[#111827] hover:border-[#E5E7EB]'
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
            <Loader2 className="w-8 h-8 text-[#2563EB] animate-spin" />
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
                      className="p-4 rounded-2xl bg-white border border-[#E5E7EB] shadow-sm"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <stat.icon className={`w-4 h-4 text-${stat.color}-500`} />
                        <span className="text-xs text-[#6B7280]">{stat.label}</span>
                      </div>
                      <p className="text-2xl font-bold text-[#111827]">{stat.value}</p>
                    </motion.div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <button 
                    onClick={() => setShowCreateModal(true)}
                    className="p-4 rounded-2xl bg-[#2563EB] text-white shadow-lg hover:bg-[#1D4ED8] hover:shadow-xl transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <Plus className="w-5 h-5" />
                      <div className="text-left">
                        <div className="font-medium">New Convoy</div>
                        <div className="text-xs opacity-80">Create a new convoy mission</div>
                      </div>
                    </div>
                  </button>
                  <button 
                    onClick={() => setActiveTab('routes')}
                    className="p-4 rounded-2xl bg-white border border-[#E5E7EB] hover:border-[#2563EB]/30 hover:shadow-md transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <Route className="w-5 h-5 text-amber-500" />
                      <div className="text-left">
                        <div className="font-medium text-[#111827]">Plan Route</div>
                        <div className="text-xs text-[#6B7280]">Design convoy route</div>
                      </div>
                    </div>
                  </button>
                  <button 
                    onClick={() => setActiveTab('planning')}
                    className="p-4 rounded-2xl bg-white border border-[#E5E7EB] hover:border-[#2563EB]/30 hover:shadow-md transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-amber-500" />
                      <div className="text-left">
                        <div className="font-medium text-[#111827]">Load Manifest</div>
                        <div className="text-xs text-[#6B7280]">Import cargo manifest</div>
                      </div>
                    </div>
                  </button>
                </div>

                <div className="rounded-2xl bg-white border border-[#E5E7EB] shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-[#111827] mb-4">Recent Convoys</h2>
                  {convoys.length === 0 ? (
                    <p className="text-[#6B7280] text-center py-8">No convoys yet. Create your first convoy to get started.</p>
                  ) : (
                    <div className="space-y-3">
                      {convoys.slice(0, 5).map((convoy) => (
                        <div 
                          key={convoy.id} 
                          className="flex items-center justify-between p-3 rounded-xl bg-[#FAFAFA] hover:bg-white hover:shadow-sm border border-transparent hover:border-[#E5E7EB] transition-all cursor-pointer"
                        >
                          <div 
                            className="flex items-center gap-3 flex-1"
                            onClick={() => setSelectedConvoy(convoy)}
                          >
                            <div className="p-2 rounded-lg bg-amber-50">
                              <Truck className="w-4 h-4 text-amber-500" />
                            </div>
                            <div>
                              <div className="font-medium text-[#111827]">{convoy.name}</div>
                              <div className="text-sm text-[#6B7280]">{convoy.origin} → {convoy.destination}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusBadge status={convoy.status as any} size="sm" showIcon />
                            {convoy.status !== 'completed' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (window.confirm(`Are you sure you want to delete convoy "${convoy.name}"? This action cannot be undone.`)) {
                                    landService.deleteConvoy(convoy.id).then(() => fetchData());
                                  }
                                }}
                                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                                title="Delete convoy"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl bg-white border border-[#E5E7EB] shadow-sm p-6 mt-6"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <Box className="w-5 h-5 text-amber-500" />
                    <h2 className="text-lg font-semibold text-[#111827]">Pending Warehouse Transfers</h2>
                  </div>
                  {pendingTransfers.length === 0 ? (
                    <p className="text-[#6B7280] text-center py-8">No pending transfers awaiting convoy assignment.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {pendingTransfers.map((transfer) => (
                        <motion.div
                          key={transfer.id}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="p-4 rounded-xl bg-[#FAFAFA] border border-[#E5E7EB] hover:border-amber-300 transition-all"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="text-xs text-[#6B7280] mb-1">Transfer #{transfer.id}</div>
                              <div className="font-medium text-[#111827]">
                                {transfer.source_site_name} → {transfer.destination_site_name}
                              </div>
                            </div>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              transfer.status === 'pending' 
                                ? 'bg-amber-50 text-amber-700' 
                                : 'bg-blue-50 text-blue-700'
                            }`}>
                              {transfer.status === 'manifest_created' ? 'Manifest Created' : 'Pending'}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                            <div className="flex items-center gap-1 text-[#6B7280]">
                              <Weight className="w-3 h-3 text-amber-500" />
                              <span>{formatWeight(transfer.total_weight_lbs || 0)}</span>
                            </div>
                            <div className="flex items-center gap-1 text-[#6B7280]">
                              <Box className="w-3 h-3 text-amber-500" />
                              <span>{transfer.transfer_items?.length || 0} items</span>
                            </div>
                          </div>
                          
                          <button
                            onClick={() => openAssignConvoyModal(transfer)}
                            className="w-full py-2 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors flex items-center justify-center gap-2"
                          >
                            <Truck className="w-4 h-4" />
                            Assign Convoy
                          </button>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </motion.div>

                {convoys.length > 0 && (
                  <TransportAiInsights
                    mode="land"
                    inputData={{
                      statistics: {
                        activeConvoys: statistics?.activeConvoys || 0,
                        inTransit: statistics?.inTransit || 0,
                        completedToday: statistics?.completedToday || 0,
                        totalPayloadLbs: statistics?.totalPayloadLbs || 0,
                      },
                      convoys: convoys.map(c => ({
                        id: c.id,
                        name: c.name,
                        origin: c.origin,
                        destination: c.destination,
                        status: c.status,
                        vehicleCount: c.vehicle_count,
                        totalWeightLbs: c.total_weight_lbs,
                      })),
                      vehicleTypesCount: vehicleTypes.length,
                      routesCount: routes.length,
                    }}
                    className="mt-6"
                  />
                )}
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
                  <h2 className="text-xl font-semibold text-[#111827] mb-2">Military Vehicle Fleet</h2>
                  <p className="text-[#6B7280]">Available vehicle types for convoy operations</p>
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
                      <h2 className="text-xl font-semibold text-[#111827]">Plan Route</h2>
                      <p className="text-[#6B7280]">Calculate route between locations</p>
                    </div>
                    
                    <div className="p-4 rounded-2xl bg-white border border-[#E5E7EB] space-y-4">
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
                        <div className="flex items-center justify-center gap-2 py-4 text-[#6B7280]">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Calculating route...</span>
                        </div>
                      )}
                      
                      {planRouteInfo && !isPlanningRoute && (
                        <div className="p-4 rounded-xl bg-[#FAFAFA] border border-[#E5E7EB]">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="text-center">
                              <div className="flex items-center justify-center gap-2 text-[#6B7280] mb-1">
                                <Navigation className="w-5 h-5 text-amber-500" />
                                <span className="text-sm font-medium uppercase tracking-wide">Distance</span>
                              </div>
                              <div className="text-2xl font-bold text-[#111827]">
                                {planRouteInfo.distance_miles.toFixed(1)} mi
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="flex items-center justify-center gap-2 text-[#6B7280] mb-1">
                                <Clock className="w-5 h-5 text-amber-500" />
                                <span className="text-sm font-medium uppercase tracking-wide">Duration</span>
                              </div>
                              <div className="text-2xl font-bold text-[#111827]">
                                {planRouteInfo.duration_hours.toFixed(1)} hrs
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-[#111827]">Saved Routes</h3>
                        <button 
                          onClick={() => planRouteInfo && alert('Route saved successfully!')}
                          disabled={!planRouteInfo}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#FAFAFA] border border-[#E5E7EB] text-[#6B7280] hover:text-[#111827] hover:bg-white transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Plus className="w-4 h-4" />
                          Save Current
                        </button>
                      </div>
                      
                      {routes.length === 0 ? (
                        <div className="text-center py-8 bg-white rounded-xl border border-[#E5E7EB]">
                          <Route className="w-10 h-10 text-[#E5E7EB] mx-auto mb-2" />
                          <p className="text-[#6B7280] text-sm">No saved routes yet</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {routes.map((route) => (
                            <div key={route.id} className="p-3 rounded-xl bg-white border border-[#E5E7EB] hover:border-[#2563EB]/30 hover:shadow-sm transition-all cursor-pointer">
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="font-medium text-[#111827]">{route.name}</div>
                                  <div className="text-xs text-[#6B7280]">{route.origin} → {route.destination}</div>
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-medium text-[#111827]">{route.distance_miles} mi</div>
                                  <div className="text-xs text-[#6B7280]">{route.estimated_time_hours}h</div>
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
                      <h2 className="text-xl font-semibold text-[#111827]">Route Map</h2>
                      <p className="text-[#6B7280]">Visual route preview</p>
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
                      <div className="flex items-center justify-center rounded-2xl bg-white border border-[#E5E7EB] shadow-sm" style={{ height: 500 }}>
                        <div className="text-center p-8">
                          <Map className="w-16 h-16 text-[#E5E7EB] mx-auto mb-4" />
                          <p className="text-[#111827] font-medium">No Route Selected</p>
                          <p className="text-[#6B7280] text-sm mt-1">Enter origin and destination to see route on map</p>
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
                    <h2 className="text-xl font-semibold text-[#111827]">Convoy Operations</h2>
                    <p className="text-[#6B7280]">Active and scheduled convoy missions</p>
                  </div>
                  <button 
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2563EB] text-white hover:bg-[#1D4ED8] transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    New Convoy
                  </button>
                </div>

                {convoys.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-2xl border border-[#E5E7EB]">
                    <Truck className="w-12 h-12 text-[#E5E7EB] mx-auto mb-3" />
                    <p className="text-[#111827] font-medium">No convoys yet</p>
                    <p className="text-[#6B7280] text-sm">Create a convoy to start moving cargo</p>
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
                  <h2 className="text-xl font-semibold text-[#111827]">Convoy Planning</h2>
                  <p className="text-[#6B7280]">Select a convoy to view 3D visualization</p>
                </div>
                
                {convoys.length > 0 ? (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium text-[#6B7280] uppercase tracking-wide">Select Convoy</h3>
                      {convoys.map((convoy) => (
                        <div
                          key={convoy.id}
                          onClick={() => setSelectedConvoy(convoy)}
                          className={`p-3 rounded-xl cursor-pointer transition-all ${
                            selectedConvoy?.id === convoy.id
                              ? 'bg-[#2563EB] text-white shadow-lg'
                              : 'bg-white border border-[#E5E7EB] hover:border-[#2563EB]/30 hover:shadow-sm'
                          }`}
                        >
                          <div className="font-medium">{convoy.name}</div>
                          <div className={`text-sm ${selectedConvoy?.id === convoy.id ? 'text-blue-100' : 'text-[#6B7280]'}`}>
                            {convoy.vehicle_count || 0} vehicles
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="lg:col-span-2">
                      {selectedConvoy ? (
                        <div className="rounded-2xl overflow-hidden border border-[#E5E7EB] bg-white">
                          <ConvoyVisualization
                            vehicles={convoyVehiclesForVisualization}
                            convoyStatus={selectedConvoy.status as any}
                            onVehicleClick={(id) => console.log('Vehicle clicked:', id)}
                            showGrid
                            autoRotate={selectedConvoy.status !== 'underway'}
                            height={400}
                          />
                          <div className="p-4 border-t border-[#E5E7EB]">
                            <div className="flex items-center justify-between">
                              <div>
                                <h3 className="font-semibold text-[#111827]">{selectedConvoy.name}</h3>
                                <p className="text-sm text-[#6B7280]">{selectedConvoy.origin} → {selectedConvoy.destination}</p>
                              </div>
                              <StatusBadge status={selectedConvoy.status as any} size="md" showIcon />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-96 rounded-2xl bg-white border border-[#E5E7EB]">
                          <div className="text-center">
                            <Map className="w-12 h-12 text-[#E5E7EB] mx-auto mb-3" />
                            <p className="text-[#6B7280]">Select a convoy to view 3D visualization</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 bg-white rounded-2xl border border-[#E5E7EB]">
                    <Map className="w-16 h-16 text-[#E5E7EB] mx-auto mb-4" />
                    <p className="text-[#111827] font-medium">No convoys to visualize</p>
                    <p className="text-[#6B7280] text-sm mb-4">Create a convoy first to see 3D visualization</p>
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="px-4 py-2 rounded-xl bg-[#2563EB] text-white hover:bg-[#1D4ED8] transition-colors"
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
        <DialogContent className="bg-white border-[#E5E7EB] max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#111827]">Create New Convoy</DialogTitle>
            <DialogDescription className="text-[#6B7280]">
              Fill in the details to create a new convoy mission
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-[#111827] mb-1">Convoy Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Alpha Convoy"
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#E5E7EB] text-[#111827] placeholder:text-[#9CA3AF] focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]/30 outline-none transition-all"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-[#111827] mb-1">
                Origin Site <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.origin_site_id || ''}
                onChange={(e) => {
                  const siteId = Number(e.target.value);
                  const site = warehouseSites.find(s => s.id === siteId);
                  setFormData(prev => ({
                    ...prev,
                    origin_site_id: siteId || undefined,
                    origin: site?.name || '',
                    origin_coords: site?.address ? { lat: 0, lng: 0, formattedAddress: site.address } : undefined
                  }));
                }}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#E5E7EB] text-[#111827] focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]/30 outline-none transition-all"
              >
                <option value="">Select origin warehouse...</option>
                {warehouseSites.map(site => (
                  <option key={site.id} value={site.id}>
                    {site.name} ({site.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#111827] mb-1">
                Destination Site <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.destination_site_id || ''}
                onChange={(e) => {
                  const siteId = Number(e.target.value);
                  const site = warehouseSites.find(s => s.id === siteId);
                  setFormData(prev => ({
                    ...prev,
                    destination_site_id: siteId || undefined,
                    destination: site?.name || '',
                    destination_coords: site?.address ? { lat: 0, lng: 0, formattedAddress: site.address } : undefined
                  }));
                }}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#E5E7EB] text-[#111827] focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]/30 outline-none transition-all"
              >
                <option value="">Select destination warehouse...</option>
                {warehouseSites.filter(s => s.id !== formData.origin_site_id).map(site => (
                  <option key={site.id} value={site.id}>
                    {site.name} ({site.code})
                  </option>
                ))}
              </select>
            </div>
            
            {(isCalculatingRoute || convoyRouteInfo) && (
              <div className="p-3 rounded-xl bg-[#FAFAFA] border border-[#E5E7EB]">
                {isCalculatingRoute ? (
                  <div className="flex items-center justify-center gap-2 text-[#6B7280]">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Calculating route...</span>
                  </div>
                ) : convoyRouteInfo && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[#6B7280]">
                        <Navigation className="w-4 h-4 text-amber-500" />
                        <span className="text-sm font-medium">{convoyRouteInfo.distance_miles.toFixed(1)} miles</span>
                      </div>
                      <div className="flex items-center gap-2 text-[#6B7280]">
                        <Clock className="w-4 h-4 text-amber-500" />
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
              <label className="block text-sm font-medium text-[#111827] mb-1">Route (Optional)</label>
              <select
                value={formData.route_id || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, route_id: e.target.value ? Number(e.target.value) : undefined }))}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#E5E7EB] text-[#111827] focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]/30 outline-none transition-all"
              >
                <option value="">Select a predefined route</option>
                {routes.map(route => (
                  <option key={route.id} value={route.id}>{route.name}</option>
                ))}
              </select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#111827] mb-1">Scheduled Departure</label>
                <input
                  type="datetime-local"
                  value={formData.scheduled_departure}
                  onChange={(e) => setFormData(prev => ({ ...prev, scheduled_departure: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#E5E7EB] text-[#111827] focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]/30 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#111827] mb-1">Scheduled Arrival</label>
                <input
                  type="datetime-local"
                  value={formData.scheduled_arrival}
                  onChange={(e) => setFormData(prev => ({ ...prev, scheduled_arrival: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#E5E7EB] text-[#111827] focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]/30 outline-none transition-all"
                />
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <button
              onClick={() => setShowCreateModal(false)}
              className="px-4 py-2 rounded-xl bg-white border border-[#E5E7EB] text-[#111827] hover:bg-[#FAFAFA] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateConvoy}
              disabled={isCreating || !formData.name || !formData.origin || !formData.destination}
              className="px-4 py-2 rounded-xl bg-[#2563EB] text-white hover:bg-[#1D4ED8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Convoy
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedConvoy && activeTab !== 'planning'} onOpenChange={(open) => !open && setSelectedConvoy(null)}>
        <DialogContent className="bg-white border-[#E5E7EB] max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-[#111827] flex items-center gap-3">
              <Truck className="w-5 h-5 text-amber-500" />
              {selectedConvoy?.name}
            </DialogTitle>
            <DialogDescription className="text-[#6B7280]">
              {selectedConvoy?.origin} → {selectedConvoy?.destination}
            </DialogDescription>
          </DialogHeader>
          
          {selectedConvoy && (
            <div className="space-y-6 py-4">
              <div className="rounded-xl overflow-hidden border border-[#E5E7EB]">
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
                <div className="p-4 rounded-2xl bg-[#FAFAFA] border border-[#E5E7EB]">
                  <div className="text-xs text-[#6B7280] mb-1">Status</div>
                  <StatusBadge status={selectedConvoy.status as any} size="md" showIcon />
                </div>
                <div className="p-4 rounded-2xl bg-[#FAFAFA] border border-[#E5E7EB]">
                  <div className="text-xs text-[#6B7280] mb-1">ETA</div>
                  <div className="font-semibold text-[#111827]">
                    {selectedConvoy.arrival_time 
                      ? new Date(selectedConvoy.arrival_time).toLocaleTimeString() 
                      : 'Not scheduled'}
                  </div>
                </div>
              </div>
              
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-[#111827]">Assigned Vehicles ({selectedConvoy.vehicles?.length || 0})</h3>
                  <button
                    onClick={() => setShowVehicleSelectModal(true)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#FAFAFA] border border-[#E5E7EB] text-[#6B7280] hover:text-[#111827] hover:bg-white transition-colors text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Add Vehicle
                  </button>
                </div>
                
                {selectedConvoy.vehicles && selectedConvoy.vehicles.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {selectedConvoy.vehicles.map((v) => (
                      <div key={v.id} className="p-3 rounded-xl bg-[#FAFAFA] border border-[#E5E7EB]">
                        <div className="font-medium text-[#111827]">{v.vehicleCode}</div>
                        <div className="text-xs text-[#6B7280]">Position {v.position + 1}, Lane {v.lane}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 bg-[#FAFAFA] rounded-xl border border-[#E5E7EB]">
                    <Truck className="w-8 h-8 text-[#E5E7EB] mx-auto mb-2" />
                    <p className="text-sm text-[#6B7280]">No vehicles assigned yet</p>
                  </div>
                )}
              </div>
              
              {statusTransitions[selectedConvoy.status] && (
                <div className="pt-4 border-t border-[#E5E7EB]">
                  <button
                    onClick={() => handleUpdateConvoyStatus(
                      selectedConvoy.id, 
                      statusTransitions[selectedConvoy.status].nextStatus
                    )}
                    disabled={isUpdating}
                    className="w-full py-3 rounded-xl bg-[#2563EB] text-white font-medium hover:bg-[#1D4ED8] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
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
        <DialogContent className="bg-white border-[#E5E7EB] max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#111827]">Add Vehicle to Convoy</DialogTitle>
            <DialogDescription className="text-[#6B7280]">
              Select a vehicle type to add to this convoy
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-3 py-4 max-h-96 overflow-y-auto">
            {vehicleTypes.map((vehicle) => (
              <button
                key={vehicle.id}
                onClick={() => handleAddVehicleToConvoy(vehicle.code)}
                className="p-4 rounded-xl bg-white border border-[#E5E7EB] hover:border-[#2563EB]/30 hover:shadow-sm text-left transition-all"
              >
                <div className="font-bold text-[#111827]">{vehicle.code}</div>
                <div className="text-sm text-[#6B7280] truncate">{vehicle.name}</div>
                <div className="text-xs text-[#6B7280] mt-1">{formatWeight(vehicle.payload_lbs)}</div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAssignConvoyModal} onOpenChange={(open) => {
        if (!open) {
          setShowAssignConvoyModal(false);
          setSelectedTransferForAssignment(null);
          setConvoyProposal(null);
          setProposalWarning(null);
        }
      }}>
        <DialogContent className="bg-white border-[#E5E7EB] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#111827] flex items-center gap-2">
              <Truck className="w-5 h-5 text-amber-500" />
              Assign Convoy to Transfer
            </DialogTitle>
            <DialogDescription className="text-[#6B7280]">
              {selectedTransferForAssignment && (
                <>Transfer #{selectedTransferForAssignment.id}: {selectedTransferForAssignment.source_site_name} → {selectedTransferForAssignment.destination_site_name}</>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            {isLoadingProposal ? (
              <div className="flex items-center justify-center gap-2 py-8 bg-[#FAFAFA] rounded-xl border border-[#E5E7EB]">
                <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                <span className="text-[#6B7280]">Calculating vehicle requirements...</span>
              </div>
            ) : convoyProposal ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 rounded-lg bg-amber-100">
                    <Truck className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <div className="font-semibold text-[#111827]">Proposed Convoy</div>
                    <div className="text-sm text-[#6B7280]">{convoyProposal.origin} → {convoyProposal.destination}</div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 rounded-lg bg-white/70">
                    <div className="text-xs text-[#6B7280] mb-1">Total Weight {convoyProposal.hasEstimatedWeights && <span className="text-amber-600">(estimated)</span>}</div>
                    <div className="font-semibold text-[#111827]">{formatWeight(convoyProposal.totalWeightLbs)}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-white/70">
                    <div className="text-xs text-[#6B7280] mb-1">Items</div>
                    <div className="font-semibold text-[#111827]">{convoyProposal.itemCount} items</div>
                  </div>
                </div>
                
                {proposalInfo && (
                  <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <p className="text-xs text-blue-700">{proposalInfo}</p>
                  </div>
                )}
                
                {convoyProposal.vehicleAllocations.length > 0 ? (
                  <>
                    <div className="text-sm font-medium text-[#111827] mb-2">Calculated Vehicles</div>
                    <div className="space-y-2 mb-4">
                      {convoyProposal.vehicleAllocations.map((alloc, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-white/70">
                          <div>
                            <div className="font-medium text-[#111827]">{alloc.vehicleCode}</div>
                            <div className="text-xs text-[#6B7280]">{alloc.vehicleName}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-amber-600">{alloc.vehicleCount}x</div>
                            <div className="text-xs text-[#6B7280]">{formatWeight(alloc.payloadLbs)} each</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="flex items-center justify-between text-sm mb-4 p-2 rounded-lg bg-white/70">
                      <span className="text-[#6B7280]">Capacity Utilization</span>
                      <span className="font-semibold text-amber-600">{convoyProposal.utilizationPercent}%</span>
                    </div>
                    
                    <button
                      onClick={handleAutoCreateConvoy}
                      disabled={isAutoCreating}
                      className="w-full py-3 rounded-xl bg-amber-500 text-white font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isAutoCreating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Creating Convoy...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          Create Convoy & Assign
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <div className="text-center py-4 bg-white/70 rounded-lg">
                    <p className="text-[#6B7280] text-sm">{proposalWarning || 'No vehicle priority settings configured'}</p>
                  </div>
                )}
              </motion.div>
            ) : proposalWarning ? (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-center">
                <p className="text-amber-700">{proposalWarning}</p>
              </div>
            ) : null}
            
            {convoys.filter(c => c.status === 'draft' || c.status === 'planned').length > 0 && (
              <>
                <div className="flex items-center gap-2 text-sm text-[#6B7280]">
                  <div className="flex-1 h-px bg-[#E5E7EB]"></div>
                  <span>Or select existing convoy</span>
                  <div className="flex-1 h-px bg-[#E5E7EB]"></div>
                </div>
                
                <div className="space-y-3 max-h-48 overflow-y-auto">
                  {convoys.filter(c => c.status === 'draft' || c.status === 'planned').map((convoy) => (
                    <motion.button
                      key={convoy.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => handleAssignConvoy(convoy.id)}
                      disabled={isAssigning}
                      className="w-full p-4 rounded-xl bg-white border border-[#E5E7EB] hover:border-amber-300 hover:shadow-md text-left transition-all disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-semibold text-[#111827]">{convoy.name}</div>
                        <StatusBadge status={convoy.status as any} size="sm" showIcon />
                      </div>
                      <div className="text-sm text-[#6B7280] mb-2">{convoy.origin} → {convoy.destination}</div>
                      <div className="flex items-center gap-4 text-xs text-[#6B7280]">
                        <span className="flex items-center gap-1">
                          <Truck className="w-3 h-3" />
                          {convoy.vehicle_count || 0} vehicles
                        </span>
                        <span className="flex items-center gap-1">
                          <Weight className="w-3 h-3" />
                          {formatWeight(convoy.total_weight_lbs || 0)}
                        </span>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </>
            )}
          </div>
          
          <DialogFooter>
            <button
              onClick={() => {
                setShowAssignConvoyModal(false);
                setSelectedTransferForAssignment(null);
                setConvoyProposal(null);
                setProposalWarning(null);
              }}
              className="px-4 py-2 rounded-xl bg-white border border-[#E5E7EB] text-[#111827] hover:bg-[#FAFAFA] transition-colors"
            >
              Cancel
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default memo(LandLogistics);
