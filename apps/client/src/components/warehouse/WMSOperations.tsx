import React, { useState } from "react";
import { motion } from "framer-motion";
import { Plus, RefreshCw, ArrowRightLeft, Plane, Truck, Ship, Box, FileText, Loader2 } from "lucide-react";
import type { WarehouseSite, Transfer, ToastMessage } from "./types";
import { getStatusColor } from "./utils";
import TransferDetailsModal from "./modals/TransferDetailsModal";

interface WMSOperationsProps {
  sites: WarehouseSite[];
  transfers: Transfer[];
  loading: boolean;
  onOpenTransferForm: () => void;
  onRefresh: () => void;
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

function getTransportIcon(mode: string) {
  switch (mode?.toLowerCase()) {
    case "air":
      return <Plane className="w-4 h-4" />;
    case "sea":
      return <Ship className="w-4 h-4" />;
    default:
      return <Truck className="w-4 h-4" />;
  }
}

export default function WMSOperations({
  sites,
  transfers,
  loading,
  onOpenTransferForm,
  onRefresh,
  onShowToast,
}: WMSOperationsProps) {
  const [selectedTransfer, setSelectedTransfer] = useState<Transfer | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);

  const getSiteName = (siteId: number) => {
    const site = sites.find((s) => s.id === siteId);
    return site ? site.name : `Site #${siteId}`;
  };

  const handleTransferClick = (transfer: Transfer) => {
    setSelectedTransfer(transfer);
    setShowTransferModal(true);
  };

  const handleCloseModal = () => {
    setShowTransferModal(false);
    setSelectedTransfer(null);
  };

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Operations</h1>
            <p className="text-muted-foreground">Transfer orders and shipment preparation</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="text-sm px-3 py-2 rounded-lg border border-border bg-white hover:bg-muted transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button
              onClick={onOpenTransferForm}
              className="text-sm px-3 py-2 rounded-lg bg-[#2563EB] text-white hover:bg-[#1d4ed8] transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Transfer
            </button>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 rounded-2xl bg-white border border-border shadow-sm p-6"
        >
          <h2 className="text-lg font-semibold text-foreground mb-4">Transfer Orders</h2>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-[#2563EB]" />
            </div>
          ) : transfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <ArrowRightLeft className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg mb-2">No transfers</p>
              <p className="text-sm text-muted-foreground/70 mb-4">Create a transfer to move inventory between sites</p>
              <button
                onClick={onOpenTransferForm}
                className="text-sm px-4 py-2 rounded-lg bg-[#2563EB] text-white hover:bg-[#1d4ed8] transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Create First Transfer
              </button>
            </div>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {transfers.map((transfer) => (
                <div
                  key={transfer.id}
                  onClick={() => handleTransferClick(transfer)}
                  className="flex items-center justify-between p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-white border border-border">
                      {getTransportIcon(transfer.transport_mode)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-foreground">{getSiteName(transfer.source_site_id)}</span>
                        <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">{getSiteName(transfer.destination_site_id)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {transfer.transport_mode?.toUpperCase()} • {new Date(transfer.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(transfer.status)}`}>
                    {transfer.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl bg-white border border-border shadow-sm p-6"
        >
          <h2 className="text-lg font-semibold text-foreground mb-4">Shipment Prep</h2>
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-muted/50 border border-dashed border-border">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-white border border-border">
                  <FileText className="w-4 h-4 text-[#2563EB]" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Generate Manifest</p>
                  <p className="text-xs text-muted-foreground">Create shipping documents</p>
                </div>
              </div>
              <button
                onClick={() => onShowToast("Manifest generation coming soon!", "info")}
                className="w-full text-sm py-2 rounded-lg bg-[#2563EB] text-white hover:bg-[#1d4ed8] transition-colors"
              >
                Generate
              </button>
            </div>

            <div className="p-4 rounded-xl bg-muted/50 border border-dashed border-border">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-white border border-border">
                  <Box className="w-4 h-4 text-[#2563EB]" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Load Planning</p>
                  <p className="text-xs text-muted-foreground">Optimize cargo placement</p>
                </div>
              </div>
              <button
                onClick={() => onShowToast("Load planning coming soon!", "info")}
                className="w-full text-sm py-2 rounded-lg bg-[#2563EB] text-white hover:bg-[#1d4ed8] transition-colors"
              >
                Plan Load
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      {showTransferModal && selectedTransfer && (
        <TransferDetailsModal
          transfer={selectedTransfer}
          sites={sites}
          onClose={handleCloseModal}
          onRefresh={onRefresh}
          onShowToast={onShowToast}
        />
      )}
    </>
  );
}
