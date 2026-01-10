import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Building2, ChevronRight, ChevronDown, Move, Zap, Loader2, Trash2, Pencil, Grid3X3, Sprout, Sun, Home, RefreshCw, Filter, Package, Clock } from "lucide-react";
import type { WarehouseSite, WarehouseBuilding, WarehouseZone, ToastMessage } from "./types";
import { deleteSite, getSiteBuildings, deleteBuilding, getWarehouseDeletionPreview, fetchSiteZones, deleteZone, seedDefaultZones, fetchZoneSummary, resyncZones, ZoneSummary } from "../../services/warehouseService";
import ConfirmDestructiveModal from "./modals/ConfirmDestructiveModal";
import TextConfirmationDialog from "../ui/TextConfirmationDialog";
import MoveItemModal from "./modals/MoveItemModal";
import OptimizationWizardModal from "./modals/OptimizationWizardModal";
import AddBuildingModal from "./modals/AddBuildingModal";
import AddZoneModal from "./modals/AddZoneModal";
import EditZoneCapacityModal from "./modals/EditZoneCapacityModal";
import ZoneItemsModal from "./modals/ZoneItemsModal";

interface WMSSitesStorageProps {
  sites: WarehouseSite[];
  loading: boolean;
  onAddSite: () => void;
  onRefresh: () => void;
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

type SiteTab = "zones" | "buildings";
type ZoneTypeFilter = "all" | "indoor" | "outdoor";
type CapacityStatusFilter = "all" | "available" | "low" | "full";

const USAGE_TYPE_LABELS: Record<string, string> = {
  small_material: "Small Material",
  mixed_material: "Mixed Material",
  large_material: "Large Material",
  uncrated: "Uncrated",
  crated: "Crated",
  hazmat: "Hazmat",
  long_pipes: "Long Pipes",
  general: "General",
};

export default function WMSSitesStorage({
  sites,
  loading,
  onAddSite,
  onRefresh,
  onShowToast,
}: WMSSitesStorageProps) {
  const [expandedSites, setExpandedSites] = useState<Set<number>>(new Set());
  const [siteBuildings, setSiteBuildings] = useState<Record<number, WarehouseBuilding[]>>({});
  const [siteZones, setSiteZones] = useState<Record<number, WarehouseZone[]>>({});
  const [loadingBuildings, setLoadingBuildings] = useState<Set<number>>(new Set());
  const [loadingZones, setLoadingZones] = useState<Set<number>>(new Set());
  const [siteTabs, setSiteTabs] = useState<Record<number, SiteTab>>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [siteToDelete, setSiteToDelete] = useState<number | null>(null);
  const [deletePreview, setDeletePreview] = useState<{
    siteName: string;
    counts: {
      buildings: number;
      zones: number;
      locations: number;
      inventoryItems: number;
      optimizationPlans: number;
      optimizationActions: number;
    };
  } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [moveModalSiteId, setMoveModalSiteId] = useState<number | null>(null);
  const [optimizeModalOpen, setOptimizeModalOpen] = useState(false);
  const [optimizeModalSite, setOptimizeModalSite] = useState<{ id: number; name: string } | null>(null);
  const [addBuildingModalOpen, setAddBuildingModalOpen] = useState(false);
  const [addBuildingModalSite, setAddBuildingModalSite] = useState<{ id: number; name: string } | null>(null);
  const [editBuildingData, setEditBuildingData] = useState<WarehouseBuilding | undefined>(undefined);
  const [buildingToDelete, setBuildingToDelete] = useState<{ building: WarehouseBuilding; siteId: number } | null>(null);
  const [deleteBuildingDialogOpen, setDeleteBuildingDialogOpen] = useState(false);
  const [isDeletingBuilding, setIsDeletingBuilding] = useState(false);
  const [addZoneModalOpen, setAddZoneModalOpen] = useState(false);
  const [addZoneModalSite, setAddZoneModalSite] = useState<{ id: number; name: string } | null>(null);
  const [zoneToDelete, setZoneToDelete] = useState<{ zone: WarehouseZone; siteId: number } | null>(null);
  const [deleteZoneDialogOpen, setDeleteZoneDialogOpen] = useState(false);
  const [isDeletingZone, setIsDeletingZone] = useState(false);
  const [seedingZones, setSeedingZones] = useState<Set<number>>(new Set());
  const [zoneFilters, setZoneFilters] = useState<Record<number, { type: ZoneTypeFilter; usage: string; capacity: CapacityStatusFilter }>>({});
  const [zoneSummaries, setZoneSummaries] = useState<Record<number, ZoneSummary>>({});
  const [loadingSummaries, setLoadingSummaries] = useState<Set<number>>(new Set());
  const [resyncingSites, setResyncingSites] = useState<Set<number>>(new Set());
  const [editCapacityZone, setEditCapacityZone] = useState<WarehouseZone | null>(null);
  const [zoneItemsModalOpen, setZoneItemsModalOpen] = useState(false);
  const [selectedZoneForItems, setSelectedZoneForItems] = useState<{ id: number; code: string; name: string; site_id: number } | null>(null);

  const handleZoneCardClick = (zone: WarehouseZone) => {
    setSelectedZoneForItems({
      id: zone.id,
      code: zone.code,
      name: zone.name,
      site_id: zone.site_id,
    });
    setZoneItemsModalOpen(true);
  };

  const fetchBuildingsForSite = useCallback(async (siteId: number, force = false) => {
    if (!force && (siteBuildings[siteId] || loadingBuildings.has(siteId))) {
      return;
    }

    setLoadingBuildings(prev => new Set(prev).add(siteId));
    try {
      const buildings = await getSiteBuildings(siteId);
      setSiteBuildings(prev => ({ ...prev, [siteId]: buildings }));
    } catch (error) {
      console.error("Failed to fetch buildings:", error);
      setSiteBuildings(prev => ({ ...prev, [siteId]: [] }));
    } finally {
      setLoadingBuildings(prev => {
        const next = new Set(prev);
        next.delete(siteId);
        return next;
      });
    }
  }, [siteBuildings, loadingBuildings]);

  const fetchZonesForSite = useCallback(async (siteId: number, force = false) => {
    if (!force && (siteZones[siteId] || loadingZones.has(siteId))) {
      return;
    }

    setLoadingZones(prev => new Set(prev).add(siteId));
    try {
      const zones = await fetchSiteZones(siteId);
      setSiteZones(prev => ({ ...prev, [siteId]: zones }));
    } catch (error) {
      console.error("Failed to fetch zones:", error);
      setSiteZones(prev => ({ ...prev, [siteId]: [] }));
    } finally {
      setLoadingZones(prev => {
        const next = new Set(prev);
        next.delete(siteId);
        return next;
      });
    }
  }, [siteZones, loadingZones]);

  const fetchSummaryForSite = useCallback(async (siteId: number) => {
    if (loadingSummaries.has(siteId)) return;
    
    setLoadingSummaries(prev => new Set(prev).add(siteId));
    try {
      const summary = await fetchZoneSummary(siteId);
      setZoneSummaries(prev => ({ ...prev, [siteId]: summary }));
    } catch (error) {
      console.error("Failed to fetch zone summary:", error);
    } finally {
      setLoadingSummaries(prev => {
        const next = new Set(prev);
        next.delete(siteId);
        return next;
      });
    }
  }, [loadingSummaries]);

  const handleResyncZones = async (e: React.MouseEvent, siteId: number) => {
    e.stopPropagation();
    setResyncingSites(prev => new Set(prev).add(siteId));
    try {
      const result = await resyncZones(siteId);
      onShowToast(`Resynced ${result.zonesUpdated} zones`, "success");
      fetchZonesForSite(siteId, true);
      fetchSummaryForSite(siteId);
    } catch (error) {
      onShowToast(
        error instanceof Error ? error.message : "Failed to resync zones",
        "error"
      );
    } finally {
      setResyncingSites(prev => {
        const next = new Set(prev);
        next.delete(siteId);
        return next;
      });
    }
  };

  const getZonePalletMetrics = (zone: WarehouseZone) => {
    const rackAvailable = zone.rack_available || 0;
    const rackOpen = zone.rack_open || 0;
    const bulkAvailable = zone.bulk_available || 0;
    const bulkOpen = zone.bulk_open || 0;
    
    const rackOccupied = Math.max(0, rackAvailable - rackOpen);
    const bulkOccupied = Math.max(0, bulkAvailable - bulkOpen);
    
    const totalAvailable = rackAvailable + bulkAvailable;
    const totalOccupied = rackOccupied + bulkOccupied;
    
    const rackUtilization = rackAvailable > 0 ? Math.round((rackOccupied / rackAvailable) * 100) : 0;
    const bulkUtilization = bulkAvailable > 0 ? Math.round((bulkOccupied / bulkAvailable) * 100) : 0;
    const totalUtilization = totalAvailable > 0 ? Math.round((totalOccupied / totalAvailable) * 100) : 0;
    
    return {
      rackAvailable,
      rackOpen,
      rackOccupied,
      rackUtilization,
      bulkAvailable,
      bulkOpen,
      bulkOccupied,
      bulkUtilization,
      totalAvailable,
      totalOccupied,
      totalUtilization
    };
  };

  const getZoneUtilization = (zone: WarehouseZone): number => {
    const metrics = getZonePalletMetrics(zone);
    return metrics.totalUtilization;
  };

  const getUtilizationColor = (percent: number): string => {
    if (percent > 85) return "border-red-300 bg-red-50/30";
    if (percent > 60) return "border-amber-300 bg-amber-50/30";
    return "border-emerald-300 bg-emerald-50/30";
  };

  const formatSyncDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return "--";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const getFilteredZones = (zones: WarehouseZone[], siteId: number): WarehouseZone[] => {
    const filters = zoneFilters[siteId] || { type: "all", usage: "all", capacity: "all" };
    
    return zones.filter(zone => {
      if (filters.type !== "all") {
        if (filters.type === "indoor" && zone.is_outdoor) return false;
        if (filters.type === "outdoor" && !zone.is_outdoor) return false;
      }
      
      if (filters.usage !== "all" && zone.usage_type !== filters.usage) return false;
      
      if (filters.capacity !== "all") {
        const util = getZoneUtilization(zone);
        if (filters.capacity === "available" && util >= 60) return false;
        if (filters.capacity === "low" && (util < 60 || util > 85)) return false;
        if (filters.capacity === "full" && util <= 85) return false;
      }
      
      return true;
    });
  };

  const updateZoneFilter = (siteId: number, key: "type" | "usage" | "capacity", value: string) => {
    setZoneFilters(prev => ({
      ...prev,
      [siteId]: {
        ...prev[siteId] || { type: "all", usage: "all", capacity: "all" },
        [key]: value
      }
    }));
  };

  useEffect(() => {
    expandedSites.forEach(siteId => {
      if (!siteBuildings[siteId] && !loadingBuildings.has(siteId)) {
        fetchBuildingsForSite(siteId);
      }
      if (!siteZones[siteId] && !loadingZones.has(siteId)) {
        fetchZonesForSite(siteId);
      }
      if (!zoneSummaries[siteId] && !loadingSummaries.has(siteId)) {
        fetchSummaryForSite(siteId);
      }
    });
  }, [expandedSites, fetchBuildingsForSite, fetchZonesForSite, fetchSummaryForSite, siteBuildings, siteZones, zoneSummaries, loadingBuildings, loadingZones, loadingSummaries]);

  const handleMoveClick = (e: React.MouseEvent, siteId: number) => {
    e.stopPropagation();
    setMoveModalSiteId(siteId);
    setMoveModalOpen(true);
  };

  const handleMoveSuccess = () => {
    setMoveModalOpen(false);
    setMoveModalSiteId(null);
    onRefresh();
  };

  const handleCloseMoveModal = () => {
    setMoveModalOpen(false);
    setMoveModalSiteId(null);
  };

  const handleInitiateDelete = async (e: React.MouseEvent, siteId: number) => {
    e.stopPropagation();
    try {
      const preview = await getWarehouseDeletionPreview(siteId);
      setDeletePreview(preview);
      setSiteToDelete(siteId);
      setDeleteDialogOpen(true);
    } catch (err) {
      onShowToast("Failed to load deletion preview", "error");
    }
  };

  const handleConfirmDelete = async () => {
    if (!siteToDelete) return;
    
    setDeleteLoading(true);
    try {
      await deleteSite(siteToDelete);
      onShowToast("Warehouse site deleted successfully", "success");
      setDeleteDialogOpen(false);
      setSiteToDelete(null);
      setDeletePreview(null);
      onRefresh();
    } catch (error) {
      onShowToast(
        error instanceof Error ? error.message : "Failed to delete warehouse site",
        "error"
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  const toggleSite = (siteId: number) => {
    const newExpanded = new Set(expandedSites);
    if (newExpanded.has(siteId)) {
      newExpanded.delete(siteId);
    } else {
      newExpanded.add(siteId);
      if (!siteTabs[siteId]) {
        setSiteTabs(prev => ({ ...prev, [siteId]: "zones" }));
      }
    }
    setExpandedSites(newExpanded);
  };

  const handleAddBuildingClick = (e: React.MouseEvent, site: WarehouseSite) => {
    e.stopPropagation();
    setAddBuildingModalSite({ id: site.id, name: site.name });
    setEditBuildingData(undefined);
    setAddBuildingModalOpen(true);
  };

  const handleEditBuildingClick = (e: React.MouseEvent, building: WarehouseBuilding, siteId: number, siteName: string) => {
    e.stopPropagation();
    setAddBuildingModalSite({ id: siteId, name: siteName });
    setEditBuildingData(building);
    setAddBuildingModalOpen(true);
  };

  const handleDeleteBuildingClick = (e: React.MouseEvent, building: WarehouseBuilding, siteId: number) => {
    e.stopPropagation();
    setBuildingToDelete({ building, siteId });
    setDeleteBuildingDialogOpen(true);
  };

  const handleConfirmDeleteBuilding = async () => {
    if (!buildingToDelete) return;
    
    const siteId = buildingToDelete.siteId;
    setIsDeletingBuilding(true);
    try {
      await deleteBuilding(siteId, buildingToDelete.building.id);
      onShowToast(`Building "${buildingToDelete.building.code}" deleted successfully`, "success");
      setDeleteBuildingDialogOpen(false);
      setBuildingToDelete(null);
      fetchBuildingsForSite(siteId, true);
      onRefresh();
    } catch (error) {
      onShowToast(
        error instanceof Error ? error.message : "Failed to delete building",
        "error"
      );
    } finally {
      setIsDeletingBuilding(false);
    }
  };

  const handleBuildingModalSuccess = () => {
    const siteId = addBuildingModalSite?.id;
    setAddBuildingModalOpen(false);
    setAddBuildingModalSite(null);
    setEditBuildingData(undefined);
    if (siteId) {
      fetchBuildingsForSite(siteId, true);
    }
    onRefresh();
  };

  const handleAddZoneClick = (e: React.MouseEvent, site: WarehouseSite) => {
    e.stopPropagation();
    setAddZoneModalSite({ id: site.id, name: site.name });
    setAddZoneModalOpen(true);
  };

  const handleDeleteZoneClick = (e: React.MouseEvent, zone: WarehouseZone, siteId: number) => {
    e.stopPropagation();
    setZoneToDelete({ zone, siteId });
    setDeleteZoneDialogOpen(true);
  };

  const handleConfirmDeleteZone = async () => {
    if (!zoneToDelete) return;
    
    const siteId = zoneToDelete.siteId;
    setIsDeletingZone(true);
    try {
      await deleteZone(zoneToDelete.zone.id);
      onShowToast(`Zone "${zoneToDelete.zone.code}" deleted successfully`, "success");
      setDeleteZoneDialogOpen(false);
      setZoneToDelete(null);
      fetchZonesForSite(siteId, true);
      onRefresh();
    } catch (error) {
      onShowToast(
        error instanceof Error ? error.message : "Failed to delete zone",
        "error"
      );
    } finally {
      setIsDeletingZone(false);
    }
  };

  const handleZoneModalSuccess = () => {
    const siteId = addZoneModalSite?.id;
    setAddZoneModalOpen(false);
    setAddZoneModalSite(null);
    if (siteId) {
      fetchZonesForSite(siteId, true);
    }
    onRefresh();
  };

  const handleSeedZones = async (e: React.MouseEvent, siteId: number) => {
    e.stopPropagation();
    setSeedingZones(prev => new Set(prev).add(siteId));
    try {
      const result = await seedDefaultZones(siteId);
      onShowToast(`${result.count} default zones created`, "success");
      fetchZonesForSite(siteId, true);
    } catch (error) {
      onShowToast(
        error instanceof Error ? error.message : "Failed to seed zones",
        "error"
      );
    } finally {
      setSeedingZones(prev => {
        const next = new Set(prev);
        next.delete(siteId);
        return next;
      });
    }
  };

  const getCapacityPercent = (available: number, open: number): number => {
    if (available === 0) return 0;
    const used = available - open;
    return Math.round((used / available) * 100);
  };

  const renderZones = (siteId: number, site: WarehouseSite) => {
    const isLoading = loadingZones.has(siteId);
    const allZones = siteZones[siteId] || [];
    const isSeeding = seedingZones.has(siteId);
    const isResyncing = resyncingSites.has(siteId);
    const summary = zoneSummaries[siteId];
    const filters = zoneFilters[siteId] || { type: "all", usage: "all", capacity: "all" };
    const filteredZones = getFilteredZones(allZones, siteId);

    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
          <span className="ml-2 text-sm text-muted-foreground">Loading zones...</span>
        </div>
      );
    }

    if (allZones.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Grid3X3 className="w-10 h-10 mb-2 opacity-50" />
          <p className="text-sm mb-1">No zones configured</p>
          <p className="text-xs text-muted-foreground/70 mb-4">Zones are the primary organizational structure</p>
          <div className="flex gap-2">
            <button
              onClick={(e) => handleSeedZones(e, siteId)}
              disabled={isSeeding}
              className="text-sm px-3 py-2 rounded-lg border border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isSeeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sprout className="w-4 h-4" />}
              Seed Default Zones
            </button>
            <button
              onClick={(e) => handleAddZoneClick(e, site)}
              className="text-sm px-3 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Zone
            </button>
          </div>
        </div>
      );
    }

    const aggregatedMetrics = allZones.reduce((acc, zone) => {
      const metrics = getZonePalletMetrics(zone);
      return {
        totalRackAvailable: acc.totalRackAvailable + metrics.rackAvailable,
        totalRackOccupied: acc.totalRackOccupied + metrics.rackOccupied,
        totalBulkAvailable: acc.totalBulkAvailable + metrics.bulkAvailable,
        totalBulkOccupied: acc.totalBulkOccupied + metrics.bulkOccupied,
        indoorCount: acc.indoorCount + (zone.is_outdoor ? 0 : 1),
        outdoorCount: acc.outdoorCount + (zone.is_outdoor ? 1 : 0),
      };
    }, { totalRackAvailable: 0, totalRackOccupied: 0, totalBulkAvailable: 0, totalBulkOccupied: 0, indoorCount: 0, outdoorCount: 0 });

    const totalAvailable = aggregatedMetrics.totalRackAvailable + aggregatedMetrics.totalBulkAvailable;
    const totalOccupied = aggregatedMetrics.totalRackOccupied + aggregatedMetrics.totalBulkOccupied;
    const totalOpen = totalAvailable - totalOccupied;
    const overallUtilization = totalAvailable > 0 ? Math.round((totalOccupied / totalAvailable) * 100) : 0;

    return (
      <div className="space-y-4">
        {allZones.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg border border-border bg-white">
              <div className="flex items-center gap-2 mb-1">
                <Grid3X3 className="w-4 h-4 text-purple-500" />
                <span className="text-xs text-muted-foreground">Total Zones</span>
              </div>
              <p className="text-lg font-semibold text-foreground">{allZones.length}</p>
            </div>
            <div className="p-3 rounded-lg border border-border bg-white">
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-muted-foreground">Positions Used</span>
              </div>
              <p className="text-lg font-semibold text-foreground">
                {totalOccupied}/{totalAvailable}
                <span className={`ml-2 text-sm ${
                  overallUtilization > 85 ? "text-red-500" :
                  overallUtilization > 60 ? "text-amber-500" : "text-emerald-500"
                }`}>
                  ({overallUtilization}%)
                </span>
              </p>
            </div>
            <div className="p-3 rounded-lg border border-border bg-white">
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-4 h-4 text-emerald-500" />
                <span className="text-xs text-muted-foreground">Open Positions</span>
              </div>
              <p className="text-lg font-semibold text-foreground">{totalOpen}</p>
            </div>
            <div className="p-3 rounded-lg border border-border bg-white">
              <div className="flex items-center gap-2 mb-1">
                <Home className="w-4 h-4 text-gray-500" />
                <span className="text-xs text-muted-foreground">Indoor/Outdoor</span>
              </div>
              <p className="text-lg font-semibold text-foreground">
                {aggregatedMetrics.indoorCount}/{aggregatedMetrics.outdoorCount}
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Filter className="w-3.5 h-3.5" />
            <span>Filters:</span>
          </div>
          <select
            value={filters.type}
            onChange={(e) => updateZoneFilter(siteId, "type", e.target.value)}
            className="text-xs px-2 py-1 rounded border border-border bg-white focus:outline-none focus:ring-1 focus:ring-purple-400"
          >
            <option value="all">All Types</option>
            <option value="indoor">Indoor</option>
            <option value="outdoor">Outdoor</option>
          </select>
          <select
            value={filters.usage}
            onChange={(e) => updateZoneFilter(siteId, "usage", e.target.value)}
            className="text-xs px-2 py-1 rounded border border-border bg-white focus:outline-none focus:ring-1 focus:ring-purple-400"
          >
            <option value="all">All Usage</option>
            {Object.entries(USAGE_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select
            value={filters.capacity}
            onChange={(e) => updateZoneFilter(siteId, "capacity", e.target.value as CapacityStatusFilter)}
            className="text-xs px-2 py-1 rounded border border-border bg-white focus:outline-none focus:ring-1 focus:ring-purple-400"
          >
            <option value="all">All Status</option>
            <option value="available">Available (&lt;60%)</option>
            <option value="low">Low (60-85%)</option>
            <option value="full">Full (&gt;85%)</option>
          </select>
          <div className="ml-auto flex gap-2">
            <button
              onClick={(e) => handleResyncZones(e, siteId)}
              disabled={isResyncing}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors disabled:opacity-50"
              title="Resync zone capacities"
            >
              {isResyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Resync
            </button>
          </div>
        </div>

        {filteredZones.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            No zones match the current filters
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredZones.map((zone) => {
              const metrics = getZonePalletMetrics(zone);
              const utilization = metrics.totalUtilization;
              
              return (
                <div
                  key={zone.id}
                  onClick={() => handleZoneCardClick(zone)}
                  className={`p-4 rounded-xl border transition-colors cursor-pointer hover:shadow-md ${getUtilizationColor(utilization)}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-purple-100">
                        <Grid3X3 className="w-4 h-4 text-purple-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground text-sm">{zone.code}</p>
                        <p className="text-xs text-muted-foreground">{zone.name}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditCapacityZone(zone);
                        }}
                        className="p-1.5 rounded-lg hover:bg-purple-100 text-muted-foreground hover:text-purple-600 transition-colors"
                        title="Edit capacity"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteZoneClick(e, zone, siteId)}
                        className="p-1.5 rounded-lg hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-colors"
                        title="Delete zone"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2 mb-3">
                    {zone.is_outdoor ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                        <Sun className="w-3 h-3" />
                        Outdoor
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        <Home className="w-3 h-3" />
                        Indoor
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      {USAGE_TYPE_LABELS[zone.usage_type] || zone.usage_type}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {metrics.rackAvailable > 0 && (
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Rack</span>
                          <span className={`font-medium ${
                            metrics.rackUtilization > 85 ? "text-red-600" : 
                            metrics.rackUtilization > 60 ? "text-amber-600" : "text-emerald-600"
                          }`}>
                            {metrics.rackOccupied}/{metrics.rackAvailable} ({metrics.rackUtilization}%)
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              metrics.rackUtilization > 85 ? "bg-red-500" : metrics.rackUtilization > 60 ? "bg-amber-500" : "bg-emerald-500"
                            }`}
                            style={{ width: `${Math.min(metrics.rackUtilization, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {metrics.bulkAvailable > 0 && (
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Bulk</span>
                          <span className={`font-medium ${
                            metrics.bulkUtilization > 85 ? "text-red-600" : 
                            metrics.bulkUtilization > 60 ? "text-amber-600" : "text-emerald-600"
                          }`}>
                            {metrics.bulkOccupied}/{metrics.bulkAvailable} ({metrics.bulkUtilization}%)
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              metrics.bulkUtilization > 85 ? "bg-red-500" : metrics.bulkUtilization > 60 ? "bg-amber-500" : "bg-emerald-500"
                            }`}
                            style={{ width: `${Math.min(metrics.bulkUtilization, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {metrics.totalAvailable > 0 && (metrics.rackAvailable > 0 && metrics.bulkAvailable > 0) && (
                      <div className="pt-1 border-t border-gray-200">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground font-medium">Total</span>
                          <span className={`font-medium ${
                            utilization > 85 ? "text-red-600" : 
                            utilization > 60 ? "text-amber-600" : "text-emerald-600"
                          }`}>
                            {metrics.totalOccupied}/{metrics.totalAvailable} ({utilization}%)
                          </span>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              utilization > 85 ? "bg-red-500" : utilization > 60 ? "bg-amber-500" : "bg-emerald-500"
                            }`}
                            style={{ width: `${Math.min(utilization, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {metrics.totalAvailable === 0 && (
                      <div className="text-xs text-muted-foreground italic">
                        No capacity configured
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>Synced:</span>
                      </div>
                      <span className="text-muted-foreground">{formatSyncDate(zone.last_synced_at)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            onClick={(e) => handleSeedZones(e, siteId)}
            disabled={isSeeding}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed border-purple-300 hover:border-purple-400 hover:bg-purple-50 text-purple-600 transition-colors text-sm disabled:opacity-50"
          >
            {isSeeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sprout className="w-4 h-4" />}
            <span>Seed Default Zones</span>
          </button>
          <button
            onClick={(e) => handleAddZoneClick(e, site)}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl border-2 border-dashed border-border hover:border-purple-400 hover:bg-purple-50/50 text-muted-foreground hover:text-purple-600 transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Zone</span>
          </button>
        </div>
      </div>
    );
  };

  const renderBuildings = (siteId: number) => {
    const isLoading = loadingBuildings.has(siteId);
    const buildings = siteBuildings[siteId] || [];

    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-[#2563EB]" />
          <span className="ml-2 text-sm text-muted-foreground">Loading buildings...</span>
        </div>
      );
    }

    if (buildings.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Building2 className="w-10 h-10 mb-2 opacity-50" />
          <p className="text-sm mb-1">No buildings configured</p>
          <p className="text-xs text-muted-foreground/70">Add buildings to organize storage within this site</p>
        </div>
      );
    }

    return buildings.map((building, i) => (
      <div
        key={building.id}
        className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">
            {i === buildings.length - 1 ? "└─" : "├─"}
          </span>
          <div>
            <p className="font-medium text-foreground">
              {building.code} {building.name && building.name !== building.code && (
                <span className="text-muted-foreground">({building.name})</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {building.dimensions || "Dimensions not set"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="flex items-center gap-2">
              <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    building.capacity_percent > 80
                      ? "bg-[#DC2626]"
                      : building.capacity_percent > 60
                        ? "bg-[#F59E0B]"
                        : "bg-[#16A34A]"
                  }`}
                  style={{ width: `${Math.min(building.capacity_percent, 100)}%` }}
                />
              </div>
              <span className="text-xs font-medium text-foreground">{building.capacity_percent}%</span>
            </div>
            <p className="text-xs text-muted-foreground">{building.pallet_count} pallets • ≤2,000 lbs/rack</p>
          </div>
          <div className="flex gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                const site = sites.find(s => siteBuildings[s.id]?.includes(building));
                if (site) {
                  handleEditBuildingClick(e, building, site.id, site.name);
                }
              }}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              title="Edit building"
            >
              <Pencil className="w-4 h-4 text-muted-foreground" />
            </button>
            <button
              onClick={(e) => handleMoveClick(e, sites.find(s => siteBuildings[s.id]?.includes(building))?.id || 0)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              title="Move items"
            >
              <Move className="w-4 h-4 text-muted-foreground" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const site = sites.find(s => siteBuildings[s.id]?.includes(building));
                if (site) {
                  setOptimizeModalSite({ id: site.id, name: site.name });
                  setOptimizeModalOpen(true);
                }
              }}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              title="Optimize"
            >
              <Zap className="w-4 h-4 text-muted-foreground" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const site = sites.find(s => siteBuildings[s.id]?.includes(building));
                if (site) {
                  handleDeleteBuildingClick(e, building, site.id);
                }
              }}
              className="p-1.5 rounded-lg hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-colors"
              title="Delete building"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    ));
  };

  const renderBuildingsWithAddButton = (site: WarehouseSite) => {
    return (
      <>
        {renderBuildings(site.id)}
        <button
          onClick={(e) => handleAddBuildingClick(e, site)}
          className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-border hover:border-[#2563EB] hover:bg-[#2563EB]/5 text-muted-foreground hover:text-[#2563EB] transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="text-sm">Add Building</span>
        </button>
      </>
    );
  };

  const renderSiteContent = (site: WarehouseSite) => {
    const currentTab = siteTabs[site.id] || "zones";

    return (
      <div className="space-y-4">
        <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSiteTabs(prev => ({ ...prev, [site.id]: "zones" }));
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              currentTab === "zones"
                ? "bg-white text-purple-600 shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Grid3X3 className="w-4 h-4" />
            Zones
            {siteZones[site.id] && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700">
                {siteZones[site.id].length}
              </span>
            )}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSiteTabs(prev => ({ ...prev, [site.id]: "buildings" }));
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              currentTab === "buildings"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Building2 className="w-4 h-4" />
            Buildings
            {siteBuildings[site.id] && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                {siteBuildings[site.id].length}
              </span>
            )}
          </button>
        </div>

        {currentTab === "zones" ? renderZones(site.id, site) : renderBuildingsWithAddButton(site)}
      </div>
    );
  };

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Sites & Storage</h1>
            <p className="text-muted-foreground">Hierarchical warehouse structure and capacity</p>
          </div>
          <button
            onClick={onAddSite}
            className="text-sm px-3 py-2 rounded-lg bg-[#2563EB] text-white hover:bg-[#1d4ed8] transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Site
          </button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl bg-white border border-border shadow-sm p-6"
      >
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-[#2563EB]" />
          </div>
        ) : sites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Building2 className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg mb-2">No warehouse sites</p>
            <p className="text-sm text-muted-foreground/70 mb-4">Add your first site to manage storage</p>
            <button
              onClick={onAddSite}
              className="text-sm px-4 py-2 rounded-lg bg-[#2563EB] text-white hover:bg-[#1d4ed8] transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Site
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {sites.map((site) => (
              <div key={site.id} className="border border-border rounded-xl overflow-hidden">
                <div
                  onClick={() => toggleSite(site.id)}
                  className="w-full flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleSite(site.id);
                    }
                  }}
                >
                  <div className="flex items-center gap-3">
                    {expandedSites.has(site.id) ? (
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    )}
                    <div className={`w-3 h-3 rounded-full ${site.active ? "bg-[#16A34A]" : "bg-gray-400"}`} />
                    <div className="text-left">
                      <p className="font-semibold text-foreground">{site.name}</p>
                      <p className="text-xs text-muted-foreground">{site.city || site.code}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-medium text-foreground">{site.item_count || 0} items</p>
                      <p className="text-xs text-muted-foreground">Total inventory</p>
                    </div>
                    <button
                      onClick={(e) => handleInitiateDelete(e, site.id)}
                      className="p-2 rounded-lg hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-colors"
                      title="Delete site"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {expandedSites.has(site.id) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-border"
                    >
                      <div className="p-4 pl-8 space-y-3">
                        {renderSiteContent(site)}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      <TextConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) {
            setSiteToDelete(null);
            setDeletePreview(null);
          }
        }}
        title="Delete Warehouse Site"
        description={deletePreview ? `This will permanently delete "${deletePreview.siteName}" and all associated data.` : ""}
        confirmLabel="Delete Everything"
        expectedPhrase="permanently delete"
        onConfirm={handleConfirmDelete}
        isDestructive
        isLoading={deleteLoading}
      >
        {deletePreview && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm">
            <p className="font-medium text-red-600 mb-2">The following will be deleted:</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>{deletePreview.counts.buildings} buildings</li>
              <li>{deletePreview.counts.zones} zones</li>
              <li>{deletePreview.counts.locations} locations</li>
              <li>{deletePreview.counts.inventoryItems} inventory items</li>
              <li>{deletePreview.counts.optimizationPlans} optimization plans</li>
              <li>{deletePreview.counts.optimizationActions} optimization actions</li>
            </ul>
          </div>
        )}
      </TextConfirmationDialog>

      {moveModalOpen && moveModalSiteId !== null && (
        <MoveItemModal
          sites={sites}
          currentSiteId={moveModalSiteId}
          onClose={handleCloseMoveModal}
          onSuccess={handleMoveSuccess}
          onShowToast={onShowToast}
        />
      )}

      {optimizeModalOpen && optimizeModalSite !== null && (
        <OptimizationWizardModal
          siteId={optimizeModalSite.id}
          siteName={optimizeModalSite.name}
          onClose={() => {
            setOptimizeModalOpen(false);
            setOptimizeModalSite(null);
          }}
          onSuccess={() => {
            setOptimizeModalOpen(false);
            setOptimizeModalSite(null);
            onRefresh();
          }}
          onShowToast={onShowToast}
        />
      )}

      {addBuildingModalOpen && addBuildingModalSite !== null && (
        <AddBuildingModal
          siteId={addBuildingModalSite.id}
          siteName={addBuildingModalSite.name}
          onClose={() => {
            setAddBuildingModalOpen(false);
            setAddBuildingModalSite(null);
            setEditBuildingData(undefined);
          }}
          onSuccess={handleBuildingModalSuccess}
          onShowToast={onShowToast}
          editBuilding={editBuildingData}
        />
      )}

      {addZoneModalOpen && addZoneModalSite !== null && (
        <AddZoneModal
          siteId={addZoneModalSite.id}
          siteName={addZoneModalSite.name}
          onClose={() => {
            setAddZoneModalOpen(false);
            setAddZoneModalSite(null);
          }}
          onSuccess={handleZoneModalSuccess}
          onShowToast={onShowToast}
        />
      )}

      {editCapacityZone !== null && (
        <EditZoneCapacityModal
          zone={editCapacityZone}
          onClose={() => setEditCapacityZone(null)}
          onSuccess={() => {
            const siteId = editCapacityZone.site_id;
            setEditCapacityZone(null);
            fetchZonesForSite(siteId, true);
            fetchSummaryForSite(siteId);
          }}
          onShowToast={onShowToast}
        />
      )}

      <ConfirmDestructiveModal
        isOpen={deleteBuildingDialogOpen}
        onClose={() => {
          if (!isDeletingBuilding) {
            setDeleteBuildingDialogOpen(false);
            setBuildingToDelete(null);
          }
        }}
        onConfirm={handleConfirmDeleteBuilding}
        title="Delete Building"
        description={
          <>
            Are you sure you want to delete building <strong>{buildingToDelete?.building.code}</strong>? This action cannot be undone and will permanently delete all zones and locations within this building.
          </>
        }
        confirmText="delete building"
        isLoading={isDeletingBuilding}
      />

      <ConfirmDestructiveModal
        isOpen={deleteZoneDialogOpen}
        onClose={() => {
          if (!isDeletingZone) {
            setDeleteZoneDialogOpen(false);
            setZoneToDelete(null);
          }
        }}
        onConfirm={handleConfirmDeleteZone}
        title="Delete Zone"
        description={
          <>
            Are you sure you want to delete zone <strong>{zoneToDelete?.zone.code}</strong>? This action cannot be undone and will permanently delete all locations within this zone.
          </>
        }
        confirmText="delete zone"
        isLoading={isDeletingZone}
      />

      <ZoneItemsModal
        isOpen={zoneItemsModalOpen}
        onClose={() => {
          setZoneItemsModalOpen(false);
          setSelectedZoneForItems(null);
        }}
        zone={selectedZoneForItems}
        siteId={selectedZoneForItems?.site_id || 0}
      />
    </>
  );
}
