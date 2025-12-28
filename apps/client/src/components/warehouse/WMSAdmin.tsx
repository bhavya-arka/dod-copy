import React, { useState } from "react";
import { motion } from "framer-motion";
import { Upload, Download, Settings, Calendar, Shield, FileText } from "lucide-react";
import type { WarehouseSite, ToastMessage } from "./types";
import InventoryFileImportModal from "./modals/InventoryFileImportModal";

interface WMSAdminProps {
  sites: WarehouseSite[];
  selectedSiteId: number | null;
  onSelectSite: (id: number | null) => void;
  onOpenCsvUpload: () => void;
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
  onRefreshInventory?: () => void;
}

/**
 * Admin tab component - Data imports and system configuration
 */
export default function WMSAdmin({
  sites,
  selectedSiteId,
  onSelectSite,
  onOpenCsvUpload,
  onShowToast,
  onRefreshInventory,
}: WMSAdminProps) {
  const [showFileImportModal, setShowFileImportModal] = useState(false);

  const handleImport = () => {
    if (!selectedSiteId) {
      onShowToast("Please select a warehouse site first", "warning");
      return;
    }
    onOpenCsvUpload();
  };

  const handleFileImport = () => {
    if (!selectedSiteId) {
      onShowToast("Please select a warehouse site first", "warning");
      return;
    }
    setShowFileImportModal(true);
  };

  const handleFileImportSuccess = () => {
    onShowToast("Inventory imported successfully!", "success");
    onRefreshInventory?.();
  };

  const selectedSite = sites.find(s => s.id === selectedSiteId);

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl font-bold text-foreground mb-1">Admin</h1>
        <p className="text-muted-foreground">Data imports and system configuration</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl bg-white border border-border shadow-sm p-6"
        >
          <h2 className="text-lg font-semibold text-foreground mb-4">Data Import</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Select Warehouse Site</label>
              <select
                value={selectedSiteId || ""}
                onChange={(e) => onSelectSite(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
              >
                <option value="">Select a site...</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name} ({site.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="p-4 rounded-xl bg-muted/50 border border-dashed border-border">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-white border border-border">
                  <Upload className="w-5 h-5 text-[#004E89]" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Import Inventory CSV</p>
                  <p className="text-xs text-muted-foreground">Upload warehouse manifest data</p>
                </div>
              </div>
              <button
                onClick={handleImport}
                disabled={!selectedSiteId}
                className="w-full text-sm py-2.5 rounded-lg bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Upload CSV
              </button>
            </div>

            <div className="p-4 rounded-xl bg-muted/50 border border-dashed border-border">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-white border border-border">
                  <FileText className="w-5 h-5 text-[#004E89]" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Import Inventory (PDF/CSV)</p>
                  <p className="text-xs text-muted-foreground">Upload with validation preview</p>
                </div>
              </div>
              <button
                onClick={handleFileImport}
                disabled={!selectedSiteId}
                className="w-full text-sm py-2.5 rounded-lg bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Import PDF/CSV
              </button>
            </div>

            <div className="p-4 rounded-xl bg-muted/50 border border-dashed border-border">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-white border border-border">
                  <Download className="w-5 h-5 text-[#004E89]" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Export Data</p>
                  <p className="text-xs text-muted-foreground">Download inventory reports</p>
                </div>
              </div>
              <button
                onClick={() => onShowToast("Export feature coming soon!", "info")}
                className="w-full text-sm py-2.5 rounded-lg border border-border bg-white hover:bg-muted transition-colors"
              >
                Export to CSV
              </button>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl bg-white border border-border shadow-sm p-6"
        >
          <h2 className="text-lg font-semibold text-foreground mb-4">Configuration</h2>
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-muted/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-foreground">System Settings</p>
                  <p className="text-xs text-muted-foreground">Configure preferences</p>
                </div>
              </div>
              <button
                onClick={() => onShowToast("Settings coming soon!", "info")}
                className="text-sm px-3 py-1.5 rounded-lg border border-border bg-white hover:bg-muted transition-colors"
              >
                Configure
              </button>
            </div>

            <div className="p-4 rounded-xl bg-muted/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-foreground">Aging Thresholds</p>
                  <p className="text-xs text-muted-foreground">Set alert triggers</p>
                </div>
              </div>
              <button
                onClick={() => onShowToast("Threshold config coming soon!", "info")}
                className="text-sm px-3 py-1.5 rounded-lg border border-border bg-white hover:bg-muted transition-colors"
              >
                Edit
              </button>
            </div>

            <div className="p-4 rounded-xl bg-muted/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-foreground">Access Control</p>
                  <p className="text-xs text-muted-foreground">Manage permissions</p>
                </div>
              </div>
              <button
                onClick={() => onShowToast("Access control coming soon!", "info")}
                className="text-sm px-3 py-1.5 rounded-lg border border-border bg-white hover:bg-muted transition-colors"
              >
                Manage
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      {showFileImportModal && selectedSiteId && selectedSite && (
        <InventoryFileImportModal
          siteId={selectedSiteId}
          siteName={selectedSite.name}
          onClose={() => setShowFileImportModal(false)}
          onSuccess={handleFileImportSuccess}
        />
      )}
    </>
  );
}
