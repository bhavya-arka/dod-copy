import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Building2, ChevronRight, ChevronDown, Move, Zap, Loader2, Trash2 } from "lucide-react";
import type { WarehouseSite, ToastMessage } from "./types";
import { MOCK_BUILDINGS } from "./constants";
import { deleteSite } from "../../services/warehouseService";
import ConfirmDestructiveModal from "./modals/ConfirmDestructiveModal";
import MoveItemModal from "./modals/MoveItemModal";
import OptimizationWizardModal from "./modals/OptimizationWizardModal";

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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [siteToDelete, setSiteToDelete] = useState<WarehouseSite | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [moveModalSiteId, setMoveModalSiteId] = useState<number | null>(null);
  const [optimizeModalOpen, setOptimizeModalOpen] = useState(false);
  const [optimizeModalSite, setOptimizeModalSite] = useState<{ id: number; name: string } | null>(null);

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

  const handleDeleteClick = (e: React.MouseEvent, site: WarehouseSite) => {
    e.stopPropagation();
    setSiteToDelete(site);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!siteToDelete) return;
    
    setIsDeleting(true);
    try {
      await deleteSite(siteToDelete.id);
      onShowToast(`Site "${siteToDelete.name}" deleted successfully`, "success");
      setDeleteDialogOpen(false);
      setSiteToDelete(null);
      onRefresh();
    } catch (error) {
      onShowToast(
        error instanceof Error ? error.message : "Failed to delete site",
        "error"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCloseDeleteDialog = () => {
    if (!isDeleting) {
      setDeleteDialogOpen(false);
      setSiteToDelete(null);
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
            className="text-sm px-3 py-2 rounded-lg bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors flex items-center gap-2"
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
            <Loader2 className="w-8 h-8 animate-spin text-[#004E89]" />
          </div>
        ) : sites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Building2 className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg mb-2">No warehouse sites</p>
            <p className="text-sm text-muted-foreground/70 mb-4">Add your first site to manage storage</p>
            <button
              onClick={onAddSite}
              className="text-sm px-4 py-2 rounded-lg bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors flex items-center gap-2"
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
                      onClick={(e) => handleDeleteClick(e, site)}
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
                        {MOCK_BUILDINGS.map((building, i) => (
                          <div
                            key={building.code}
                            className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-muted-foreground">
                                {i === MOCK_BUILDINGS.length - 1 ? "└─" : "├─"}
                              </span>
                              <div>
                                <p className="font-medium text-foreground">
                                  {building.code} <span className="text-muted-foreground">({building.type})</span>
                                </p>
                                <p className="text-xs text-muted-foreground">{building.dimensions}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <div className="flex items-center gap-2">
                                  <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${
                                        building.capacity > 80
                                          ? "bg-[#DC2626]"
                                          : building.capacity > 60
                                            ? "bg-[#F59E0B]"
                                            : "bg-[#16A34A]"
                                      }`}
                                      style={{ width: `${building.capacity}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-medium text-foreground">{building.capacity}%</span>
                                </div>
                                <p className="text-xs text-muted-foreground">{building.pallets} pallets • ≤2,000 lbs/rack</p>
                              </div>
                              <div className="flex gap-1">
                                <button
                                  onClick={(e) => handleMoveClick(e, site.id)}
                                  className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                                  title="Move items"
                                >
                                  <Move className="w-4 h-4 text-muted-foreground" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOptimizeModalSite({ id: site.id, name: site.name });
                                    setOptimizeModalOpen(true);
                                  }}
                                  className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                                  title="Optimize"
                                >
                                  <Zap className="w-4 h-4 text-muted-foreground" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      <ConfirmDestructiveModal
        isOpen={deleteDialogOpen}
        onClose={handleCloseDeleteDialog}
        onConfirm={handleConfirmDelete}
        title="Delete Warehouse Site"
        description={
          <>
            Are you sure you want to delete <strong>{siteToDelete?.name}</strong>? This action cannot be undone and will permanently delete:
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>All inventory items ({siteToDelete?.item_count || 0} items)</li>
              <li>All buildings, zones, and locations</li>
              <li>All associated data</li>
            </ul>
          </>
        }
        confirmText="permanently delete"
        isLoading={isDeleting}
      />

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
    </>
  );
}
