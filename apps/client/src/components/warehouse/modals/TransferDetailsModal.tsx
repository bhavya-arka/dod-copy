import React, { useState } from "react";
import { X, Loader2, Plane, Truck, Ship, ArrowRightLeft, Calendar, Package, CheckCircle, XCircle, Clock } from "lucide-react";
import type { WarehouseSite, Transfer, TransferItemDetail, ToastMessage } from "../types";
import { updateTransferStatus, updateTransfer } from "../../../services/warehouseService";
import { getStatusColor } from "../utils";

interface TransferDetailsModalProps {
  transfer: Transfer;
  sites: WarehouseSite[];
  onClose: () => void;
  onRefresh: () => void;
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

function getTransportIcon(mode: string) {
  switch (mode?.toLowerCase()) {
    case "air":
      return <Plane className="w-5 h-5" />;
    case "sea":
      return <Ship className="w-5 h-5" />;
    default:
      return <Truck className="w-5 h-5" />;
  }
}

export default function TransferDetailsModal({
  transfer,
  sites,
  onClose,
  onRefresh,
  onShowToast,
}: TransferDetailsModalProps) {
  const [loading, setLoading] = useState(false);
  const [arrivalDate, setArrivalDate] = useState(
    transfer.scheduled_date 
      ? new Date(transfer.scheduled_date).toISOString().split('T')[0]
      : ""
  );
  const [notes, setNotes] = useState(transfer.notes || "");
  const [hasChanges, setHasChanges] = useState(false);

  const getSiteName = (siteId: number) => {
    const site = sites.find((s) => s.id === siteId);
    return site ? site.name : `Site #${siteId}`;
  };

  const handleStatusChange = async (newStatus: string) => {
    setLoading(true);
    try {
      await updateTransferStatus(transfer.id, newStatus);
      onShowToast(`Transfer marked as ${newStatus}`, "success");
      onRefresh();
      onClose();
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "Failed to update status", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDetails = async () => {
    setLoading(true);
    try {
      await updateTransfer(transfer.id, {
        scheduled_arrival_date: arrivalDate || undefined,
        notes: notes || undefined,
      });
      onShowToast("Transfer details updated", "success");
      setHasChanges(false);
      onRefresh();
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "Failed to update transfer", "error");
    } finally {
      setLoading(false);
    }
  };

  const transferItems = (transfer.transfer_items || []) as TransferItemDetail[];
  const totalWeight = transferItems.reduce((sum, item) => {
    const weight = parseFloat(item.weight_lb || "0") || 0;
    return sum + weight * item.quantity;
  }, 0);
  const totalValue = transferItems.reduce((sum, item) => {
    const price = parseFloat(item.unit_price || "0") || 0;
    return sum + price * item.quantity;
  }, 0);

  const canMarkInTransit = transfer.status === "pending" || transfer.status === "manifest_created" || transfer.status === "transport_assigned";
  const canMarkComplete = transfer.status === "in_transit";
  const canCancel = transfer.status !== "completed" && transfer.status !== "cancelled";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted border border-border">
              {getTransportIcon(transfer.transport_mode)}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Transfer Details</h2>
              <p className="text-sm text-muted-foreground">ID: {transfer.id}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">From</p>
                <p className="font-medium text-foreground">{getSiteName(transfer.source_site_id)}</p>
              </div>
              <ArrowRightLeft className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground mb-1">To</p>
                <p className="font-medium text-foreground">{getSiteName(transfer.destination_site_id)}</p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(transfer.status)}`}>
              {transfer.status}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-3 rounded-lg bg-muted/30 border border-border">
              <p className="text-xs text-muted-foreground mb-1">Mode</p>
              <p className="font-medium text-foreground capitalize">{transfer.transport_mode}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border border-border">
              <p className="text-xs text-muted-foreground mb-1">Items</p>
              <p className="font-medium text-foreground">{transferItems.length}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border border-border">
              <p className="text-xs text-muted-foreground mb-1">Total Weight</p>
              <p className="font-medium text-foreground">{totalWeight.toLocaleString()} lbs</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border border-border">
              <p className="text-xs text-muted-foreground mb-1">Total Value</p>
              <p className="font-medium text-foreground">${totalValue.toLocaleString()}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              <Calendar className="w-4 h-4 inline mr-2" />
              Expected Arrival Date
            </label>
            <input
              type="date"
              value={arrivalDate}
              onChange={(e) => {
                setArrivalDate(e.target.value);
                setHasChanges(true);
              }}
              className="w-full px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setHasChanges(true);
              }}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] resize-none"
              placeholder="Add notes about this transfer..."
            />
          </div>

          {hasChanges && (
            <button
              onClick={handleSaveDetails}
              disabled={loading}
              className="w-full py-2 rounded-lg bg-[#2563EB] text-white hover:bg-[#1d4ed8] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Save Changes
            </button>
          )}

          <div>
            <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
              <Package className="w-4 h-4" />
              Items ({transferItems.length})
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {transferItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No items in this transfer</p>
              ) : (
                transferItems.map((item, idx) => (
                  <div key={item.id || idx} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.requisition_no}</p>
                      <p className="text-xs text-muted-foreground">{item.description || "No description"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-foreground">Qty: {item.quantity}</p>
                      <p className="text-xs text-muted-foreground">{parseFloat(item.weight_lb || "0").toLocaleString()} lbs</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            <p>Created: {new Date(transfer.created_at).toLocaleString()}</p>
            {transfer.completed_date && (
              <p>Completed: {new Date(transfer.completed_date).toLocaleString()}</p>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-border bg-muted/20">
          <p className="text-sm font-medium text-foreground mb-3">Update Status</p>
          <div className="flex flex-wrap gap-2">
            {canMarkInTransit && (
              <button
                onClick={() => handleStatusChange("in_transit")}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-yellow-100 text-yellow-700 hover:bg-yellow-200 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
              >
                <Clock className="w-4 h-4" />
                Mark In Transit
              </button>
            )}
            {canMarkComplete && (
              <button
                onClick={() => handleStatusChange("completed")}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
              >
                <CheckCircle className="w-4 h-4" />
                Mark Complete
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => handleStatusChange("cancelled")}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
              >
                <XCircle className="w-4 h-4" />
                Cancel Transfer
              </button>
            )}
            {loading && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
          </div>
        </div>
      </div>
    </div>
  );
}
