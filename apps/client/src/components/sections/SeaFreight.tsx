import React, { useState, useEffect, useCallback, useMemo, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  X,
  Play,
  CheckCircle,
  Weight,
  Box,
  Calendar,
  ArrowRight,
  Sparkles,
  Route,
} from "lucide-react";
import { User } from "../../hooks/useAuth";
import * as seaService from "../../services/seaService";
import type {
  VesselType,
  Voyage,
  Container as ContainerType,
  SeaStatistics,
  PendingTransfer,
  PortScheduleEntry,
  VoyageProposal,
  VesselRecommendation,
} from "../../services/seaService";
import { StatusBadge, TransportAiInsights } from "../transport";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import SeaVisualization from "../3d/SeaVisualization";
import { TransportFlowmap, FlowmapRoute, ActiveTransport } from "../transport/TransportFlowmap";

interface SeaFreightProps {
  user: User;
  onBack: () => void;
  onLogout: () => void;
}

type Tab = 'overview' | 'voyages' | 'containers' | 'transfers' | 'schedule';

interface VoyageFormData {
  name: string;
  origin_port: string;
  destination_port: string;
  vessel_type_id?: number;
  vessel_name: string;
  vessel_imo: string;
  vessel_hull_number: string;
  vessel_class: string;
  scheduled_departure: string;
  scheduled_arrival: string;
}

const statusTransitions: Record<string, { nextStatus: string; buttonLabel: string }> = {
  draft: { nextStatus: 'planned', buttonLabel: 'Start Planning' },
  planned: { nextStatus: 'loading', buttonLabel: 'Begin Loading' },
  loading: { nextStatus: 'underway', buttonLabel: 'Dispatch Voyage' },
  underway: { nextStatus: 'completed', buttonLabel: 'Mark Complete' },
};

const formatWeight = (lbs: number): string => {
  return `${lbs.toLocaleString()} lbs`;
};

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

type TransportStatus = 'draft' | 'planned' | 'loading' | 'underway' | 'completed' | 'cancelled';

const mapContainerStatus = (status: string): TransportStatus => {
  const mapping: Record<string, TransportStatus> = {
    empty: 'draft',
    loading: 'loading',
    loaded: 'planned',
    unloading: 'underway',
    discharged: 'completed',
  };
  return mapping[status] || 'draft';
};

const containerStatusLabels: Record<string, { label: string; color: string }> = {
  empty: { label: 'Empty', color: 'bg-slate-100 text-slate-700' },
  loading: { label: 'Loading', color: 'bg-yellow-100 text-yellow-700' },
  loaded: { label: 'Loaded', color: 'bg-blue-100 text-blue-700' },
  unloading: { label: 'Unloading', color: 'bg-amber-100 text-amber-700' },
  discharged: { label: 'Discharged', color: 'bg-green-100 text-green-700' },
};

const PORT_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'San Diego': { lat: 32.7157, lng: -117.1611 },
  'Los Angeles': { lat: 33.7406, lng: -118.2729 },
  'Long Beach': { lat: 33.7701, lng: -118.1937 },
  'Oakland': { lat: 37.7952, lng: -122.2794 },
  'Seattle': { lat: 47.6062, lng: -122.3321 },
  'Tacoma': { lat: 47.2529, lng: -122.4443 },
  'Honolulu': { lat: 21.3099, lng: -157.8581 },
  'Pearl Harbor': { lat: 21.3544, lng: -157.9596 },
  'Guam': { lat: 13.4443, lng: 144.7937 },
  'Yokosuka': { lat: 35.2833, lng: 139.6667 },
  'Yokohama': { lat: 35.4437, lng: 139.6380 },
  'Sasebo': { lat: 33.1593, lng: 129.7228 },
  'Busan': { lat: 35.1028, lng: 129.0403 },
  'Singapore': { lat: 1.2655, lng: 103.8200 },
  'Diego Garcia': { lat: -7.3195, lng: 72.4229 },
  'Bahrain': { lat: 26.2285, lng: 50.5860 },
  'Jebel Ali': { lat: 25.0190, lng: 55.0640 },
  'Rota': { lat: 36.6233, lng: -6.3533 },
  'Naples': { lat: 40.8518, lng: 14.2681 },
  'Norfolk': { lat: 36.8466, lng: -76.2890 },
  'Charleston': { lat: 32.7765, lng: -79.9311 },
  'Savannah': { lat: 32.0809, lng: -81.0912 },
  'Jacksonville': { lat: 30.3322, lng: -81.6557 },
  'Houston': { lat: 29.7604, lng: -95.3698 },
  'New Orleans': { lat: 29.9511, lng: -90.0715 },
  'Miami': { lat: 25.7617, lng: -80.1918 },
};

const getPortCoordinates = (portName: string): { lat: number; lng: number } => {
  const normalized = portName.trim();
  if (PORT_COORDINATES[normalized]) {
    return PORT_COORDINATES[normalized];
  }
  for (const [key, coords] of Object.entries(PORT_COORDINATES)) {
    if (normalized.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(normalized.toLowerCase())) {
      return coords;
    }
  }
  return { lat: 32.7157 + Math.random() * 20 - 10, lng: -117.1611 + Math.random() * 40 - 20 };
};

const VesselTypeCard = memo(({ vesselType }: { vesselType: VesselType }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="p-4 rounded-2xl bg-white border border-[#E5E7EB] shadow-sm hover:shadow-md hover:border-teal-200 transition-all"
  >
    <div className="flex items-start justify-between mb-3">
      <div>
        <div className="font-bold text-[#111827]">{vesselType.code}</div>
        <div className="text-sm text-[#6B7280]">{vesselType.name}</div>
      </div>
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-teal-50 text-teal-700">
        {vesselType.category}
      </span>
    </div>
    
    <div className="grid grid-cols-2 gap-2 text-sm">
      <div className="flex items-center gap-1 text-[#6B7280]">
        <Weight className="w-3 h-3 text-teal-500" />
        <span>{formatWeight(vesselType.cargo_capacity_lbs)}</span>
      </div>
      <div className="flex items-center gap-1 text-[#6B7280]">
        <Container className="w-3 h-3 text-teal-500" />
        <span>{vesselType.teu_capacity} TEU</span>
      </div>
      <div className="flex items-center gap-1 text-[#6B7280]">
        <Route className="w-3 h-3 text-teal-500" />
        <span>{vesselType.range_nm} nm</span>
      </div>
      <div className="flex items-center gap-1 text-[#6B7280]">
        <Ship className="w-3 h-3 text-teal-500" />
        <span>{vesselType.max_speed_knots} kts</span>
      </div>
    </div>
    
    <div className="mt-3 pt-3 border-t border-[#E5E7EB]">
      <div className="text-xs text-[#6B7280]">
        {vesselType.length_ft}' × {vesselType.beam_ft}' • Draft: {vesselType.draft_ft}'
      </div>
    </div>
  </motion.div>
));

VesselTypeCard.displayName = 'VesselTypeCard';

export default function SeaFreight({
  user,
  onBack,
  onLogout,
}: SeaFreightProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [voyages, setVoyages] = useState<Voyage[]>([]);
  const [vesselTypes, setVesselTypes] = useState<VesselType[]>([]);
  const [containers, setContainers] = useState<ContainerType[]>([]);
  const [pendingTransfers, setPendingTransfers] = useState<PendingTransfer[]>([]);
  const [portSchedule, setPortSchedule] = useState<PortScheduleEntry[]>([]);
  const [statistics, setStatistics] = useState<SeaStatistics | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedVoyage, setSelectedVoyage] = useState<Voyage | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showContainerModal, setShowContainerModal] = useState(false);
  const [showAssignVoyageModal, setShowAssignVoyageModal] = useState(false);
  const [showContainerAssignModal, setShowContainerAssignModal] = useState(false);
  const [selectedContainerForAssign, setSelectedContainerForAssign] = useState<ContainerType | null>(null);
  
  const [selectedTransferForAssignment, setSelectedTransferForAssignment] = useState<PendingTransfer | null>(null);
  const [voyageProposal, setVoyageProposal] = useState<VoyageProposal | null>(null);
  const [proposalWarning, setProposalWarning] = useState<string | null>(null);
  const [proposalInfo, setProposalInfo] = useState<string | null>(null);
  const [isLoadingProposal, setIsLoadingProposal] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isAutoCreating, setIsAutoCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<VoyageFormData>({
    name: '',
    origin_port: '',
    destination_port: '',
    vessel_type_id: undefined,
    vessel_name: '',
    vessel_imo: '',
    vessel_hull_number: '',
    vessel_class: '',
    scheduled_departure: '',
    scheduled_arrival: '',
  });
  
  const [containerFormData, setContainerFormData] = useState({
    container_number: '',
    container_type: '20ft',
    seal_number: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await seaService.fetchAllData();
      setVoyages(data.voyages);
      setVesselTypes(data.vesselTypes);
      setContainers(data.containers);
      setStatistics(data.statistics);
      setPendingTransfers(data.pendingTransfers);
      setPortSchedule(data.portSchedule);
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

  const handleVesselTypeChange = useCallback((vesselTypeId: number | undefined) => {
    const selectedType = vesselTypes.find(vt => vt.id === vesselTypeId);
    setFormData(prev => ({
      ...prev,
      vessel_type_id: vesselTypeId,
      vessel_class: selectedType?.name || '',
      vessel_hull_number: selectedType ? `${selectedType.hull_prefix}-` : '',
    }));
  }, [vesselTypes]);

  const handleCreateVoyage = useCallback(async () => {
    if (!formData.name || !formData.origin_port || !formData.destination_port) return;
    
    setIsCreating(true);
    setCreateError(null);
    try {
      await seaService.createVoyage({
        name: formData.name,
        origin_port: formData.origin_port,
        destination_port: formData.destination_port,
        vessel_type_id: formData.vessel_type_id,
        vessel_name: formData.vessel_name || undefined,
        vessel_imo: formData.vessel_imo || undefined,
        vessel_hull_number: formData.vessel_hull_number || undefined,
        vessel_class: formData.vessel_class || undefined,
        scheduled_departure: formData.scheduled_departure ? new Date(formData.scheduled_departure).toISOString() : undefined,
        scheduled_arrival: formData.scheduled_arrival ? new Date(formData.scheduled_arrival).toISOString() : undefined,
      });
      await fetchData();
      setShowCreateModal(false);
      setFormData({
        name: '',
        origin_port: '',
        destination_port: '',
        vessel_type_id: undefined,
        vessel_name: '',
        vessel_imo: '',
        vessel_hull_number: '',
        vessel_class: '',
        scheduled_departure: '',
        scheduled_arrival: '',
      });
    } catch (err) {
      console.error('Error creating voyage:', err);
      setCreateError(err instanceof Error ? err.message : 'Failed to create voyage');
    } finally {
      setIsCreating(false);
    }
  }, [formData, fetchData]);

  const handleUpdateVoyageStatus = useCallback(async (voyageId: number, newStatus: string) => {
    setIsUpdating(true);
    try {
      await seaService.updateVoyageStatus(voyageId, newStatus);
      setVoyages(prev => prev.map(v => v.id === voyageId ? { ...v, status: newStatus as Voyage['status'] } : v));
      if (selectedVoyage?.id === voyageId) {
        setSelectedVoyage(prev => prev ? { ...prev, status: newStatus as Voyage['status'] } : null);
      }
    } catch (error) {
      console.error('Error updating voyage status:', error);
    } finally {
      setIsUpdating(false);
    }
  }, [selectedVoyage]);

  const handleCreateContainer = useCallback(async () => {
    if (!containerFormData.container_number) return;
    
    setIsCreating(true);
    try {
      await seaService.createContainer({
        container_number: containerFormData.container_number,
        container_type: containerFormData.container_type,
        seal_number: containerFormData.seal_number || undefined,
      });
      await fetchData();
      setShowContainerModal(false);
      setContainerFormData({
        container_number: '',
        container_type: '20ft',
        seal_number: '',
      });
    } catch (err) {
      console.error('Error creating container:', err);
    } finally {
      setIsCreating(false);
    }
  }, [containerFormData, fetchData]);

  const handleAssignContainerToVoyage = useCallback(async (containerId: number, voyageId: number) => {
    setIsAssigning(true);
    try {
      await seaService.assignContainerToVoyage(containerId, voyageId);
      await fetchData();
      setShowContainerAssignModal(false);
      setSelectedContainerForAssign(null);
    } catch (error) {
      console.error('Error assigning container to voyage:', error);
    } finally {
      setIsAssigning(false);
    }
  }, [fetchData]);

  const openAssignVoyageModal = useCallback(async (transfer: PendingTransfer) => {
    setSelectedTransferForAssignment(transfer);
    setVoyageProposal(null);
    setProposalWarning(null);
    setProposalInfo(null);
    setShowAssignVoyageModal(true);
    setIsLoadingProposal(true);
    
    try {
      const response = await seaService.proposeVoyageForTransfer(transfer.id);
      setVoyageProposal(response.proposal);
      setProposalWarning(response.warning);
      setProposalInfo(response.info);
    } catch (error) {
      console.error('Error loading voyage proposal:', error);
      setProposalWarning('Could not calculate vessel requirements');
    } finally {
      setIsLoadingProposal(false);
    }
  }, []);

  const handleAssignVoyage = useCallback(async (voyageId: number) => {
    if (!selectedTransferForAssignment) return;
    
    setIsAssigning(true);
    try {
      await seaService.assignVoyageToTransfer(selectedTransferForAssignment.id, voyageId);
      await fetchData();
      setShowAssignVoyageModal(false);
      setSelectedTransferForAssignment(null);
    } catch (error) {
      console.error('Error assigning voyage to transfer:', error);
    } finally {
      setIsAssigning(false);
    }
  }, [selectedTransferForAssignment, fetchData]);

  const handleAutoCreateVoyage = useCallback(async () => {
    if (!selectedTransferForAssignment) return;
    
    setIsAutoCreating(true);
    try {
      await seaService.autoCreateVoyage(selectedTransferForAssignment.id);
      await fetchData();
      setShowAssignVoyageModal(false);
      setSelectedTransferForAssignment(null);
      setVoyageProposal(null);
    } catch (error) {
      console.error('Error auto-creating voyage:', error);
    } finally {
      setIsAutoCreating(false);
    }
  }, [selectedTransferForAssignment, fetchData]);

  const filteredVoyages = useMemo(() => voyages.filter(voyage => {
    const matchesSearch = !searchQuery || 
      voyage.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      voyage.origin_port?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      voyage.destination_port?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      voyage.vessel_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      voyage.vessel_hull_number?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = !statusFilter || voyage.status === statusFilter;
    return matchesSearch && matchesStatus;
  }), [voyages, searchQuery, statusFilter]);

  const containersByVoyage = useMemo(() => {
    const map = new Map<number, ContainerType[]>();
    containers.forEach(c => {
      if (c.voyage_id) {
        const existing = map.get(c.voyage_id) || [];
        existing.push(c);
        map.set(c.voyage_id, existing);
      }
    });
    return map;
  }, [containers]);

  const getVoyageCargoWeight = useCallback((voyageId: number): number => {
    const voyageContainers = containersByVoyage.get(voyageId) || [];
    return voyageContainers.reduce((total, c) => total + c.weight_lbs, 0);
  }, [containersByVoyage]);

  const vesselsForVisualization = useMemo(() => {
    return voyages.map(voyage => {
      const vesselType = vesselTypes.find(vt => vt.id === voyage.vessel_type_id);
      return {
        id: voyage.id,
        vesselCode: vesselType?.code || voyage.vessel_class || 'LMSR',
        status: voyage.status,
      };
    });
  }, [voyages, vesselTypes]);

  const flowmapRoutes = useMemo((): FlowmapRoute[] => {
    return voyages.map(voyage => {
      const originCoords = getPortCoordinates(voyage.origin_port);
      const destCoords = getPortCoordinates(voyage.destination_port);
      return {
        id: voyage.id,
        origin: { ...originCoords, name: voyage.origin_port },
        destination: { ...destCoords, name: voyage.destination_port },
        mode: 'sea' as const,
        status: voyage.status,
      };
    });
  }, [voyages]);

  const activeTransports = useMemo((): ActiveTransport[] => {
    return voyages
      .filter(v => v.status === 'underway')
      .map(voyage => {
        const originCoords = getPortCoordinates(voyage.origin_port);
        const destCoords = getPortCoordinates(voyage.destination_port);
        return {
          id: voyage.id,
          routeId: voyage.id,
          currentPosition: {
            lat: (originCoords.lat + destCoords.lat) / 2,
            lng: (originCoords.lng + destCoords.lng) / 2,
          },
          mode: 'sea' as const,
          name: voyage.vessel_name || voyage.name,
        };
      });
  }, [voyages]);

  const overallVoyageStatus = useMemo(() => {
    if (voyages.some(v => v.status === 'underway')) return 'underway';
    if (voyages.some(v => v.status === 'loading')) return 'loading';
    if (voyages.some(v => v.status === 'planned')) return 'planned';
    if (voyages.some(v => v.status === 'completed')) return 'completed';
    return 'draft';
  }, [voyages]);

  const statsConfig = [
    { label: "Active Voyages", value: statistics?.activeVoyages ?? 0, icon: Ship, color: "text-teal-600" },
    { label: "In Transit", value: statistics?.inTransit ?? 0, icon: Waves, color: "text-blue-500" },
    { label: "At Port", value: statistics?.atPort ?? 0, icon: Anchor, color: "text-green-600" },
    { label: "Total Containers", value: statistics?.totalContainers ?? 0, icon: Container, color: "text-purple-600" },
    { label: "Total Cargo", value: formatWeight(statistics?.totalCargoLbs ?? 0), icon: Weight, color: "text-amber-600" },
    { label: "Pending Transfers", value: statistics?.pendingTransfers ?? 0, icon: Package, color: "text-red-500" },
  ];

  const tabs = [
    { id: 'overview' as Tab, label: 'Overview', icon: Ship },
    { id: 'voyages' as Tab, label: 'Voyages', icon: Route },
    { id: 'containers' as Tab, label: 'Containers', icon: Container },
    { id: 'transfers' as Tab, label: 'Pending Transfers', icon: Package },
    { id: 'schedule' as Tab, label: 'Port Schedule', icon: Calendar },
  ];

  const renderOverviewTab = () => (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {statsConfig.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="p-4 rounded-2xl bg-white border border-[#E5E7EB] shadow-sm hover:shadow-md hover:border-teal-200 transition-all"
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
              <p className="text-xl font-bold text-[#111827]">{stat.value}</p>
            )}
          </motion.div>
        ))}
      </div>

      {/* 3D Sea Visualization - Fleet Overview */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden"
      >
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Ship className="w-5 h-5 text-teal-600" />
              <h2 className="text-lg font-semibold text-gray-900">Fleet Visualization</h2>
            </div>
            <span className="text-sm text-gray-500">
              {vesselsForVisualization.length} vessel{vesselsForVisualization.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <SeaVisualization
          vessels={vesselsForVisualization.length > 0 ? vesselsForVisualization : [{ id: 0, vesselCode: 'LMSR', status: 'draft' }]}
          voyageStatus={overallVoyageStatus}
          onVesselClick={(vesselId) => {
            const voyage = voyages.find(v => v.id === vesselId);
            if (voyage) setSelectedVoyage(voyage);
          }}
          showGrid={true}
          autoRotate={false}
          height={350}
        />
      </motion.div>

      {/* Transport Flowmap - Route Network */}
      {flowmapRoutes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8 rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden"
        >
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Route className="w-5 h-5 text-teal-600" />
                <h2 className="text-lg font-semibold text-gray-900">Voyage Routes</h2>
              </div>
              <span className="text-sm text-gray-500">
                {flowmapRoutes.length} route{flowmapRoutes.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <TransportFlowmap
            routes={flowmapRoutes}
            activeTransports={activeTransports}
            height={350}
            className="border-0"
          />
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-2 rounded-2xl bg-white border border-gray-200 shadow-sm p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Voyages</h2>
            <button 
              onClick={() => setActiveTab('voyages')}
              className="text-sm text-teal-600 hover:text-teal-800 transition-colors"
            >
              View All →
            </button>
          </div>
          
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-teal-600 mb-4" />
              <p className="text-[#6B7280]">Loading voyages...</p>
            </div>
          ) : voyages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[#6B7280]">
              <Ship className="w-12 h-12 mb-4 opacity-50" />
              <p>No voyages yet</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 text-sm text-teal-600 hover:text-teal-800"
              >
                Create your first voyage
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {voyages.slice(0, 5).map((voyage) => {
                const cargoWeight = getVoyageCargoWeight(voyage.id);
                return (
                  <div
                    key={voyage.id}
                    onClick={() => setSelectedVoyage(voyage)}
                    className="p-4 rounded-xl border border-gray-200 hover:border-teal-200 hover:bg-teal-50/30 transition-all cursor-pointer"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-medium text-gray-900">{voyage.name}</h3>
                        {voyage.vessel_name && (
                          <p className="text-sm text-gray-500">
                            {voyage.vessel_name} {voyage.vessel_hull_number && `(${voyage.vessel_hull_number})`}
                          </p>
                        )}
                        <p className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                          <MapPin className="w-3 h-3" />
                          {voyage.origin_port} → {voyage.destination_port}
                        </p>
                      </div>
                      <StatusBadge status={voyage.status} size="sm" />
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Container className="w-3 h-3" />
                        {voyage.container_count} containers
                      </span>
                      <span className="flex items-center gap-1">
                        <Weight className="w-3 h-3" />
                        {formatWeight(cargoWeight || voyage.total_weight_lbs)}
                      </span>
                      {voyage.scheduled_departure && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(voyage.scheduled_departure)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="rounded-2xl bg-white border border-gray-200 shadow-sm p-6"
        >
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="space-y-2">
            <button
              onClick={() => setShowCreateModal(true)}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left group"
            >
              <div className="p-2 rounded-lg bg-gray-50 group-hover:bg-teal-50">
                <Ship className="w-4 h-4 text-gray-500 group-hover:text-teal-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Plan Voyage</p>
                <p className="text-xs text-gray-500">Create shipping route</p>
              </div>
            </button>
            <button
              onClick={() => setShowContainerModal(true)}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left group"
            >
              <div className="p-2 rounded-lg bg-gray-50 group-hover:bg-teal-50">
                <Container className="w-4 h-4 text-gray-500 group-hover:text-teal-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Add Container</p>
                <p className="text-xs text-gray-500">Register new container</p>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('transfers')}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left group"
            >
              <div className="p-2 rounded-lg bg-gray-50 group-hover:bg-teal-50">
                <Package className="w-4 h-4 text-gray-500 group-hover:text-teal-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Pending Transfers</p>
                <p className="text-xs text-gray-500">{pendingTransfers.length} awaiting assignment</p>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('schedule')}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left group"
            >
              <div className="p-2 rounded-lg bg-gray-50 group-hover:bg-teal-50">
                <Calendar className="w-4 h-4 text-gray-500 group-hover:text-teal-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Port Schedule</p>
                <p className="text-xs text-gray-500">View arrivals & departures</p>
              </div>
            </button>
          </div>
        </motion.div>
      </div>

      {voyages.length > 0 && (
        <TransportAiInsights
          mode="sea"
          inputData={{
            statistics: {
              activeVessels: statistics?.activeVoyages ?? 0,
              inTransit: statistics?.inTransit ?? 0,
              atPort: statistics?.atPort ?? 0,
              totalVoyages: statistics?.totalVoyages ?? 0,
              totalContainers: statistics?.totalContainers ?? 0,
              totalCargoLbs: statistics?.totalCargoLbs ?? 0,
              pendingTransfers: statistics?.pendingTransfers ?? 0,
              completedThisMonth: statistics?.completedThisMonth ?? 0,
            },
            voyages: voyages.map(v => ({
              id: v.id,
              name: v.name,
              origin: v.origin_port,
              destination: v.destination_port,
              status: v.status,
              vesselName: v.vessel_name,
              vesselClass: v.vessel_class,
              containerCount: v.container_count,
              totalWeightLbs: v.total_weight_lbs,
              departureTime: v.scheduled_departure,
              arrivalTime: v.scheduled_arrival,
            })),
          }}
          className="mt-6"
        />
      )}
    </>
  );

  const renderVoyagesTab = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-white border border-[#E5E7EB] shadow-sm p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[#111827]">All Voyages</h2>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="bg-teal-600 text-white hover:bg-teal-700 text-sm px-3 py-1.5 rounded-xl flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Voyage
        </button>
      </div>
      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
          <input
            type="text"
            placeholder="Search voyages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-white border border-[#E5E7EB] text-[#111827] placeholder:text-[#9CA3AF] text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30"
          />
        </div>
        <div className="relative">
          <button 
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            className={`bg-white border text-[#111827] hover:bg-[#FAFAFA] text-sm px-3 py-2 rounded-xl flex items-center gap-2 transition-colors ${statusFilter ? 'border-teal-500 bg-teal-50' : 'border-[#E5E7EB]'}`}
          >
            <Filter className="w-4 h-4" />
            {statusFilter || 'Filter'}
          </button>
          {showFilterMenu && (
            <div className="absolute right-0 mt-2 w-40 bg-white border border-[#E5E7EB] rounded-xl shadow-lg z-10">
              <button onClick={() => { setStatusFilter(null); setShowFilterMenu(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-[#FAFAFA] rounded-t-xl">All</button>
              <button onClick={() => { setStatusFilter('draft'); setShowFilterMenu(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-[#FAFAFA]">Draft</button>
              <button onClick={() => { setStatusFilter('planned'); setShowFilterMenu(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-[#FAFAFA]">Planned</button>
              <button onClick={() => { setStatusFilter('loading'); setShowFilterMenu(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-[#FAFAFA]">Loading</button>
              <button onClick={() => { setStatusFilter('underway'); setShowFilterMenu(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-[#FAFAFA]">Underway</button>
              <button onClick={() => { setStatusFilter('completed'); setShowFilterMenu(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-[#FAFAFA] rounded-b-xl">Completed</button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600 mb-4" />
          <p className="text-[#6B7280]">Loading voyages...</p>
        </div>
      ) : filteredVoyages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-[#6B7280]">
          <Ship className="w-12 h-12 mb-4 opacity-50" />
          <p className="text-center">{voyages.length === 0 ? 'No voyages yet' : 'No voyages match your search'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredVoyages.map((voyage) => {
            const cargoWeight = getVoyageCargoWeight(voyage.id);
            const transition = statusTransitions[voyage.status];
            
            return (
              <div
                key={voyage.id}
                className="p-4 rounded-xl border border-[#E5E7EB] hover:border-teal-200 transition-all"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-[#111827]">{voyage.name}</h3>
                      <StatusBadge status={voyage.status} size="sm" />
                    </div>
                    {voyage.vessel_name && (
                      <p className="text-sm text-[#6B7280]">
                        <span className="font-medium">{voyage.vessel_name}</span>
                        {voyage.vessel_hull_number && ` (${voyage.vessel_hull_number})`}
                        {voyage.vessel_class && ` - ${voyage.vessel_class}`}
                      </p>
                    )}
                    <p className="text-sm text-[#6B7280] flex items-center gap-2 mt-1">
                      <MapPin className="w-3 h-3" />
                      {voyage.origin_port} → {voyage.destination_port}
                    </p>
                  </div>
                  {transition && voyage.status !== 'completed' && (
                    <button
                      onClick={() => handleUpdateVoyageStatus(voyage.id, transition.nextStatus)}
                      disabled={isUpdating}
                      className="flex items-center gap-2 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 disabled:opacity-50 transition-colors"
                    >
                      {isUpdating ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Play className="w-3 h-3" />
                      )}
                      {transition.buttonLabel}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-[#6B7280]">
                  <span className="flex items-center gap-1">
                    <Container className="w-3 h-3" />
                    {voyage.container_count} containers
                  </span>
                  <span className="flex items-center gap-1">
                    <Weight className="w-3 h-3" />
                    {formatWeight(cargoWeight || voyage.total_weight_lbs)}
                  </span>
                  {voyage.scheduled_departure && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Departs: {formatDate(voyage.scheduled_departure)}
                    </span>
                  )}
                  {voyage.scheduled_arrival && (
                    <span className="flex items-center gap-1">
                      <Anchor className="w-3 h-3" />
                      Arrives: {formatDate(voyage.scheduled_arrival)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );

  const renderContainersTab = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-white border border-[#E5E7EB] shadow-sm p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[#111827]">Containers ({containers.length})</h2>
        <button 
          onClick={() => setShowContainerModal(true)}
          className="bg-teal-600 text-white hover:bg-teal-700 text-sm px-3 py-1.5 rounded-xl flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Container
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600 mb-4" />
          <p className="text-[#6B7280]">Loading containers...</p>
        </div>
      ) : containers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-[#6B7280]">
          <Container className="w-12 h-12 mb-4 opacity-50" />
          <p>No containers registered</p>
          <button
            onClick={() => setShowContainerModal(true)}
            className="mt-4 text-sm text-teal-600 hover:text-teal-800"
          >
            Add your first container
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E5E7EB]">
                <th className="text-left py-3 px-4 text-sm font-medium text-[#6B7280]">Container #</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-[#6B7280]">Type</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-[#6B7280]">Status</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-[#6B7280]">Weight</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-[#6B7280]">Voyage</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-[#6B7280]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {containers.map((container) => {
                const assignedVoyage = voyages.find(v => v.id === container.voyage_id);
                return (
                  <tr key={container.id} className="border-b border-[#E5E7EB] hover:bg-[#FAFAFA]">
                    <td className="py-3 px-4 text-sm font-medium text-[#111827]">{container.container_number}</td>
                    <td className="py-3 px-4 text-sm text-[#6B7280]">{container.container_type}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${containerStatusLabels[container.status]?.color || 'bg-gray-100 text-gray-700'}`}>
                        {containerStatusLabels[container.status]?.label || container.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-[#6B7280]">{formatWeight(container.weight_lbs)}</td>
                    <td className="py-3 px-4 text-sm text-[#6B7280]">
                      {assignedVoyage ? assignedVoyage.name : '—'}
                    </td>
                    <td className="py-3 px-4">
                      {!container.voyage_id && (
                        <button
                          onClick={() => {
                            setSelectedContainerForAssign(container);
                            setShowContainerAssignModal(true);
                          }}
                          className="text-sm text-teal-600 hover:text-teal-800"
                        >
                          Assign to Voyage
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );

  const renderTransfersTab = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-white border border-[#E5E7EB] shadow-sm p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[#111827]">
          Pending Sea Transfers ({pendingTransfers.length})
        </h2>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600 mb-4" />
          <p className="text-[#6B7280]">Loading transfers...</p>
        </div>
      ) : pendingTransfers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-[#6B7280]">
          <Package className="w-12 h-12 mb-4 opacity-50" />
          <p>No pending sea transfers</p>
          <p className="text-sm text-[#9CA3AF]">Transfers requiring sea transport will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingTransfers.map((transfer) => (
            <div
              key={transfer.id}
              className="p-4 rounded-xl border border-[#E5E7EB] hover:border-teal-200 transition-all"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-medium text-[#111827]">Transfer #{transfer.id}</h3>
                  <p className="text-sm text-[#6B7280] flex items-center gap-2 mt-1">
                    <MapPin className="w-3 h-3" />
                    {transfer.sourceWarehouse} → {transfer.destinationWarehouse}
                  </p>
                </div>
                <button
                  onClick={() => openAssignVoyageModal(transfer)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 transition-colors"
                >
                  <Ship className="w-3 h-3" />
                  Assign Voyage
                </button>
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs text-[#6B7280]">
                <span className="flex items-center gap-1">
                  <Package className="w-3 h-3" />
                  {transfer.itemCount} items
                </span>
                <span className="flex items-center gap-1">
                  <Weight className="w-3 h-3" />
                  {formatWeight(transfer.totalWeightLbs)}
                </span>
                {transfer.scheduledDate && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDate(transfer.scheduledDate)}
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs">
                  {transfer.transportMode}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );

  const renderScheduleTab = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-white border border-[#E5E7EB] shadow-sm p-6"
    >
      <h2 className="text-lg font-semibold text-[#111827] mb-4">Port Schedule</h2>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600 mb-4" />
          <p className="text-[#6B7280]">Loading schedule...</p>
        </div>
      ) : portSchedule.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-[#6B7280]">
          <Anchor className="w-12 h-12 mb-4 opacity-50" />
          <p>No scheduled port calls</p>
          <p className="text-sm text-[#9CA3AF]">Create voyages with scheduled times to see them here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {portSchedule.map((entry, idx) => (
            <div
              key={`${entry.voyageId}-${entry.eventType}-${idx}`}
              className="p-4 rounded-xl border border-[#E5E7EB] hover:border-teal-200 transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${entry.eventType === 'arrival' ? 'bg-green-50' : 'bg-blue-50'}`}>
                    {entry.eventType === 'arrival' ? (
                      <Anchor className={`w-4 h-4 text-green-600`} />
                    ) : (
                      <Ship className={`w-4 h-4 text-blue-600`} />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-[#111827]">
                      {entry.voyageName}
                      {entry.vesselName && ` - ${entry.vesselName}`}
                      {entry.vesselHullNumber && ` (${entry.vesselHullNumber})`}
                    </p>
                    <p className="text-sm text-[#6B7280]">
                      {entry.eventType === 'arrival' ? 'Arriving at' : 'Departing from'} <span className="font-medium">{entry.port}</span>
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-[#111827]">
                    {formatDate(entry.scheduledTime)}
                  </p>
                  {entry.actualTime && (
                    <p className="text-xs text-green-600">
                      Actual: {formatDate(entry.actualTime)}
                    </p>
                  )}
                  <StatusBadge status={entry.status as TransportStatus} size="sm" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );

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
          className="mb-6"
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

        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-teal-600 text-white'
                  : 'bg-white border border-[#E5E7EB] text-[#6B7280] hover:bg-[#FAFAFA]'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'overview' && renderOverviewTab()}
          {activeTab === 'voyages' && renderVoyagesTab()}
          {activeTab === 'containers' && renderContainersTab()}
          {activeTab === 'transfers' && renderTransfersTab()}
          {activeTab === 'schedule' && renderScheduleTab()}
        </AnimatePresence>
      </main>

      <Dialog open={showCreateModal} onOpenChange={(open) => { setShowCreateModal(open); if (!open) setCreateError(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Voyage</DialogTitle>
            <DialogDescription>
              Plan a new maritime shipment route
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {createError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {createError}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-[#111827] mb-1">Voyage Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Pacific Run 2026-01"
                className="w-full px-3 py-2 rounded-lg border border-[#E5E7EB] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-[#111827] mb-1">Vessel Type</label>
              <select
                value={formData.vessel_type_id || ''}
                onChange={(e) => handleVesselTypeChange(e.target.value ? parseInt(e.target.value) : undefined)}
                className="w-full px-3 py-2 rounded-lg border border-[#E5E7EB] text-[#111827] focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30"
              >
                <option value="">Select vessel type...</option>
                {vesselTypes.map(vt => (
                  <option key={vt.id} value={vt.id}>
                    {vt.code} - {vt.name} ({formatWeight(vt.cargo_capacity_lbs)} capacity)
                  </option>
                ))}
              </select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#111827] mb-1">Vessel Name</label>
                <input
                  type="text"
                  value={formData.vessel_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, vessel_name: e.target.value }))}
                  placeholder="e.g., USNS Comfort"
                  className="w-full px-3 py-2 rounded-lg border border-[#E5E7EB] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#111827] mb-1">Vessel Class</label>
                <input
                  type="text"
                  value={formData.vessel_class}
                  onChange={(e) => setFormData(prev => ({ ...prev, vessel_class: e.target.value }))}
                  placeholder="Auto-populated from type"
                  className="w-full px-3 py-2 rounded-lg border border-[#E5E7EB] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 bg-gray-50"
                  readOnly={!!formData.vessel_type_id}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#111827] mb-1">IMO Number</label>
                <input
                  type="text"
                  value={formData.vessel_imo}
                  onChange={(e) => setFormData(prev => ({ ...prev, vessel_imo: e.target.value }))}
                  placeholder="e.g., IMO 9123456"
                  className="w-full px-3 py-2 rounded-lg border border-[#E5E7EB] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#111827] mb-1">Hull Number</label>
                <input
                  type="text"
                  value={formData.vessel_hull_number}
                  onChange={(e) => setFormData(prev => ({ ...prev, vessel_hull_number: e.target.value }))}
                  placeholder="e.g., T-AH-20"
                  className="w-full px-3 py-2 rounded-lg border border-[#E5E7EB] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#111827] mb-1">Origin Port *</label>
                <input
                  type="text"
                  value={formData.origin_port}
                  onChange={(e) => setFormData(prev => ({ ...prev, origin_port: e.target.value }))}
                  placeholder="e.g., San Diego, CA"
                  className="w-full px-3 py-2 rounded-lg border border-[#E5E7EB] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#111827] mb-1">Destination Port *</label>
                <input
                  type="text"
                  value={formData.destination_port}
                  onChange={(e) => setFormData(prev => ({ ...prev, destination_port: e.target.value }))}
                  placeholder="e.g., Yokohama, Japan"
                  className="w-full px-3 py-2 rounded-lg border border-[#E5E7EB] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#111827] mb-1">Scheduled Departure</label>
                <input
                  type="datetime-local"
                  value={formData.scheduled_departure}
                  onChange={(e) => setFormData(prev => ({ ...prev, scheduled_departure: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-[#E5E7EB] text-[#111827] focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#111827] mb-1">Scheduled Arrival</label>
                <input
                  type="datetime-local"
                  value={formData.scheduled_arrival}
                  onChange={(e) => setFormData(prev => ({ ...prev, scheduled_arrival: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-[#E5E7EB] text-[#111827] focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setShowCreateModal(false)}
              className="px-4 py-2 text-sm text-[#6B7280] hover:text-[#111827] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateVoyage}
              disabled={isCreating || !formData.name || !formData.origin_port || !formData.destination_port}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Voyage
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showContainerModal} onOpenChange={setShowContainerModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Container</DialogTitle>
            <DialogDescription>
              Register a new container for shipment
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-[#111827] mb-1">Container Number *</label>
              <input
                type="text"
                value={containerFormData.container_number}
                onChange={(e) => setContainerFormData(prev => ({ ...prev, container_number: e.target.value }))}
                placeholder="e.g., MSCU1234567"
                className="w-full px-3 py-2 rounded-lg border border-[#E5E7EB] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#111827] mb-1">Container Type</label>
              <select
                value={containerFormData.container_type}
                onChange={(e) => setContainerFormData(prev => ({ ...prev, container_type: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-[#E5E7EB] text-[#111827] focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30"
              >
                <option value="20ft">20ft Standard</option>
                <option value="40ft">40ft Standard</option>
                <option value="40ft-hc">40ft High Cube</option>
                <option value="20ft-reefer">20ft Refrigerated</option>
                <option value="40ft-reefer">40ft Refrigerated</option>
                <option value="flat-rack">Flat Rack</option>
                <option value="open-top">Open Top</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#111827] mb-1">Seal Number</label>
              <input
                type="text"
                value={containerFormData.seal_number}
                onChange={(e) => setContainerFormData(prev => ({ ...prev, seal_number: e.target.value }))}
                placeholder="e.g., SL123456"
                className="w-full px-3 py-2 rounded-lg border border-[#E5E7EB] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30"
              />
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setShowContainerModal(false)}
              className="px-4 py-2 text-sm text-[#6B7280] hover:text-[#111827] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateContainer}
              disabled={isCreating || !containerFormData.container_number}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
              Add Container
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showContainerAssignModal} onOpenChange={setShowContainerAssignModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Container to Voyage</DialogTitle>
            <DialogDescription>
              Select a voyage for container {selectedContainerForAssign?.container_number}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {voyages.filter(v => v.status !== 'completed' && v.status !== 'cancelled').length === 0 ? (
              <div className="text-center py-8 text-[#6B7280]">
                <Ship className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No active voyages available</p>
                <button
                  onClick={() => {
                    setShowContainerAssignModal(false);
                    setShowCreateModal(true);
                  }}
                  className="mt-4 text-sm text-teal-600 hover:text-teal-800"
                >
                  Create a new voyage
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {voyages.filter(v => v.status !== 'completed' && v.status !== 'cancelled').map((voyage) => (
                  <button
                    key={voyage.id}
                    onClick={() => selectedContainerForAssign && handleAssignContainerToVoyage(selectedContainerForAssign.id, voyage.id)}
                    disabled={isAssigning}
                    className="w-full p-3 rounded-lg border border-[#E5E7EB] hover:border-teal-200 hover:bg-teal-50/30 text-left transition-all disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-[#111827]">{voyage.name}</p>
                        <p className="text-sm text-[#6B7280]">
                          {voyage.origin_port} → {voyage.destination_port}
                        </p>
                      </div>
                      <StatusBadge status={voyage.status} size="sm" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <button
              onClick={() => setShowContainerAssignModal(false)}
              className="px-4 py-2 text-sm text-[#6B7280] hover:text-[#111827] transition-colors"
            >
              Cancel
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAssignVoyageModal} onOpenChange={setShowAssignVoyageModal}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign Voyage to Transfer</DialogTitle>
            <DialogDescription>
              {selectedTransferForAssignment && (
                <span>
                  Transfer from {selectedTransferForAssignment.sourceWarehouse} to {selectedTransferForAssignment.destinationWarehouse}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            {isLoadingProposal ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-teal-600 mb-4" />
                <p className="text-[#6B7280]">Calculating vessel requirements...</p>
              </div>
            ) : (
              <>
                {voyageProposal && (
                  <div className="p-4 rounded-xl bg-teal-50 border border-teal-200">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="w-5 h-5 text-teal-600" />
                      <h3 className="font-medium text-teal-800">Voyage Proposal</h3>
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-[#6B7280]">Suggested Name:</span>
                        <span className="font-medium text-[#111827]">{voyageProposal.voyageName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#6B7280]">Route:</span>
                        <span className="font-medium text-[#111827]">
                          {voyageProposal.originPort} → {voyageProposal.destinationPort}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#6B7280]">Total Weight:</span>
                        <span className="font-medium text-[#111827]">{formatWeight(voyageProposal.totalWeightLbs)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#6B7280]">Items:</span>
                        <span className="font-medium text-[#111827]">{voyageProposal.itemCount}</span>
                      </div>
                    </div>
                    
                    {voyageProposal.recommendedVesselTypes && voyageProposal.recommendedVesselTypes.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-teal-200">
                        <h4 className="text-sm font-medium text-teal-800 mb-2">Recommended Vessels</h4>
                        <div className="space-y-2">
                          {voyageProposal.recommendedVesselTypes.map((rec) => (
                            <div
                              key={rec.vesselTypeId}
                              className={`p-2 rounded-lg text-sm ${
                                rec.isRecommended ? 'bg-teal-100 border border-teal-300' : 'bg-white border border-[#E5E7EB]'
                              }`}
                            >
                              <div className="flex justify-between items-center">
                                <span className="font-medium">{rec.code} - {rec.name}</span>
                                {rec.isRecommended && (
                                  <span className="text-xs px-2 py-0.5 bg-teal-600 text-white rounded-full">Recommended</span>
                                )}
                              </div>
                              <div className="text-xs text-[#6B7280] mt-1">
                                Capacity: {formatWeight(rec.cargoCapacityLbs)} • Utilization: {rec.utilizationPercent.toFixed(0)}%
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <button
                      onClick={handleAutoCreateVoyage}
                      disabled={isAutoCreating}
                      className="w-full mt-4 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                      {isAutoCreating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      Auto-Create Voyage
                    </button>
                  </div>
                )}
                
                {proposalWarning && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {proposalWarning}
                  </div>
                )}
                
                {proposalInfo && (
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm">
                    {proposalInfo}
                  </div>
                )}
                
                <div>
                  <h3 className="text-sm font-medium text-[#111827] mb-2">Or assign to existing voyage:</h3>
                  {voyages.filter(v => v.status !== 'completed' && v.status !== 'cancelled').length === 0 ? (
                    <p className="text-sm text-[#6B7280]">No active voyages available</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {voyages.filter(v => v.status !== 'completed' && v.status !== 'cancelled').map((voyage) => (
                        <button
                          key={voyage.id}
                          onClick={() => handleAssignVoyage(voyage.id)}
                          disabled={isAssigning}
                          className="w-full p-3 rounded-lg border border-[#E5E7EB] hover:border-teal-200 hover:bg-teal-50/30 text-left transition-all disabled:opacity-50"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-[#111827]">{voyage.name}</p>
                              <p className="text-sm text-[#6B7280]">
                                {voyage.origin_port} → {voyage.destination_port}
                              </p>
                            </div>
                            <StatusBadge status={voyage.status} size="sm" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          
          <DialogFooter>
            <button
              onClick={() => setShowAssignVoyageModal(false)}
              className="px-4 py-2 text-sm text-[#6B7280] hover:text-[#111827] transition-colors"
            >
              Cancel
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
