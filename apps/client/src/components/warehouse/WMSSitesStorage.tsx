import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Building2, ChevronRight, ChevronDown, Move, Zap, Loader2, Trash2, Pencil } from "lucide-react";
import type { WarehouseSite, WarehouseBuilding, ToastMessage } from "./types";
import { deleteSite, getSiteBuildings, deleteBuilding, getWarehouseDeletionPreview } from "../../services/warehouseService";
import ConfirmDestructiveModal from "./modals/ConfirmDestructiveModal";
import TextConfirmationDialog from "../ui/TextConfirmationDialog";
import MoveItemModal from "./modals/MoveItemModal";
import OptimizationWizardModal from "./modals/OptimizationWizardModal";
import AddBuildingModal from "./modals/AddBuildingModal";

interface WMSSitesStorageProps {
  sites: WarehouseSite[];
  loading: boolean;
  onAddSite: () => void;
  onRefresh: () => void;
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

export default function WMSSitesStorage({
  sites,
  loading,
  onAddSite,
  onRefresh,
  onShowToast,
}: WMSSitesStorageProps) {
  const [expandedSites, setExpandedSites] = useState<Set<number>>(new Set());
  const [siteBuildings, setSiteBuildings] = useState<Record<number, WarehouseBuilding[]>>({});
  const [loadingBuildings, setLoadingBuildings] = useState<Set<number>>(new Set());
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

  const fetchBuildingsForSite = useCallback(async (siteId: number) => {
    if (siteBuildings[siteId] || loadingBuildings.has(siteId)) {
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

  useEffect(() => {
    expandedSites.forEach(siteId => {
      if (!siteBuildings[siteId] && !loadingBuildings.has(siteId)) {
        fetchBuildingsForSite(siteId);
      }
    });
  }, [expandedSites, fetchBuildingsForSite, siteBuildings, loadingBuildings]);

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
    
    setIsDeletingBuilding(true);
    try {
      await deleteBuilding(buildingToDelete.siteId, buildingToDelete.building.id);
      onShowToast(`Building "${buildingToDelete.building.code}" deleted successfully`, "success");
      setSiteBuildings(prev => {
        const newBuildings = { ...prev };
        delete newBuildings[buildingToDelete.siteId];
        return newBuildings;
      });
      setDeleteBuildingDialogOpen(false);
      setBuildingToDelete(null);
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
    setAddBuildingModalOpen(false);
    setAddBuildingModalSite(null);
    setEditBuildingData(undefined);
    setSiteBuildings(prev => {
      if (addBuildingModalSite) {
        const newBuildings = { ...prev };
        delete newBuildings[addBuildingModalSite.id];
        return newBuildings;
      }
      return prev;
    });
    onRefresh();
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
                      <div className="p-4 pl-12 space-y-3">
                        {renderBuildingsWithAddButton(site)}
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
    </>
  );
}
