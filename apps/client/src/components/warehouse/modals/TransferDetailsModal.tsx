import React, { useState, useMemo } from "react";
import { 
  X, Loader2, Plane, Truck, Ship, ArrowRightLeft, Calendar, Package, 
  CheckCircle, XCircle, Clock, Timer, AlertTriangle, FileText, 
  Navigation, Anchor, Route, Trash2
} from "lucide-react";
import type { WarehouseSite, Transfer, TransferItemDetail, ToastMessage } from "../types";
import { updateTransferStatus, updateTransfer, deleteTransfer } from "../../../services/warehouseService";
import { 
  getStatusColor, getStatusBannerColor, getStatusLabel, 
  getAgeDays, getDaysBetween, isOverdue 
} from "../utils";

interface TransferDetailsModalProps {
  transfer: Transfer;
  sites: WarehouseSite[];
  onClose: () => void;
  onRefresh: () => void;
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

function getTransportIcon(mode: string, className: string = "w-5 h-5") {
  switch (mode?.toLowerCase()) {
    case "air":
      return <Plane className={className} />;
    case "sea":
      return <Ship className={className} />;
    default:
      return <Truck className={className} />;
  }
}

function SectionHeader({ title, icon }: { title: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pb-2 mb-3 border-b border-border">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">{title}</h3>
    </div>
  );
}

function SkeletonLoader() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 bg-muted rounded w-3/4"></div>
      <div className="h-4 bg-muted rounded w-1/2"></div>
      <div className="h-4 bg-muted rounded w-2/3"></div>
    </div>
  );
}

function UtilizationBar({ percent }: { percent: number }) {
  const clampedPercent = Math.min(Math.max(percent, 0), 100);
  const barColor = clampedPercent > 90 ? "bg-red-500" : clampedPercent > 70 ? "bg-yellow-500" : "bg-green-500";
  
  return (
    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
      <div 
        className={`h-full ${barColor} transition-all duration-300`} 
        style={{ width: `${clampedPercent}%` }}
      />
    </div>
  );
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

  const destinationSite = useMemo(() => {
    return sites.find((s) => s.id === transfer.destination_site_id);
  }, [sites, transfer.destination_site_id]);

  const destinationUtilization = useMemo(() => {
    if (!destinationSite) return 0;
    const maxCapacity = 500;
    const itemCount = destinationSite.item_count || 0;
    return Math.round((itemCount / maxCapacity) * 100);
  }, [destinationSite]);

  const ageDays = useMemo(() => getAgeDays(transfer.created_at), [transfer.created_at]);

  const daysInTransit = useMemo(() => {
    if (transfer.status !== "in_transit") return null;
    const startDate = transfer.in_transit_since || transfer.created_at;
    return getDaysBetween(startDate);
  }, [transfer.status, transfer.in_transit_since, transfer.created_at]);

  const etaCountdown = useMemo(() => {
    if (!transfer.scheduled_date) return null;
    const days = getDaysBetween(new Date(), transfer.scheduled_date);
    return days;
  }, [transfer.scheduled_date]);

  const transferOverdue = useMemo(() => {
    if (!transfer.scheduled_date) return false;
    if (transfer.status === "completed" || transfer.status === "cancelled") return false;
    return isOverdue(transfer.scheduled_date);
  }, [transfer.scheduled_date, transfer.status]);

  const overdueDays = useMemo(() => {
    if (!transferOverdue || !transfer.scheduled_date) return 0;
    return Math.abs(getDaysBetween(transfer.scheduled_date, new Date()));
  }, [transferOverdue, transfer.scheduled_date]);

  const hasTransportAssignment = transfer.assigned_convoy_id || 
    transfer.assigned_flight_plan_id || transfer.assigned_voyage_id;

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
  const canDelete = transfer.status !== "completed";

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this transfer? This action cannot be undone.")) {
      return;
    }
    
    setLoading(true);
    try {
      await deleteTransfer(transfer.id);
      onShowToast("Transfer deleted successfully", "success");
      onRefresh();
      onClose();
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "Failed to delete transfer", "error");
    } finally {
      setLoading(false);
    }
  };

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
          <button 
            onClick={onClose} 
            className="text-muted-foreground hover:text-foreground hover:bg-muted p-2 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className={`w-full px-6 py-3 border-b ${getStatusBannerColor(transfer.status)} flex items-center justify-between`}>
            <div className="flex items-center gap-2">
              {transfer.status === "completed" && <CheckCircle className="w-5 h-5" />}
              {transfer.status === "cancelled" && <XCircle className="w-5 h-5" />}
              {transfer.status === "in_transit" && <Truck className="w-5 h-5" />}
              {(transfer.status === "pending" || transfer.status === "manifest_created" || transfer.status === "transport_assigned") && <Clock className="w-5 h-5" />}
              <span className="font-semibold">{getStatusLabel(transfer.status)}</span>
            </div>
            {transferOverdue && (
              <span className="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 animate-pulse">
                <AlertTriangle className="w-3 h-3" />
                OVERDUE by {overdueDays} day{overdueDays !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="p-6 space-y-6">
            {loading && <SkeletonLoader />}

            <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl ${transferOverdue ? 'bg-red-50 border-red-200' : 'bg-muted/50'} border border-border gap-4`}>
              <div className="flex items-center gap-4 flex-wrap">
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

            <div>
              <SectionHeader title="Timeline" icon={<Timer className="w-4 h-4" />} />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-muted/30 border border-border hover:bg-muted/50 transition-colors">
                  <p className="text-xs text-muted-foreground mb-1">Age</p>
                  <p className="font-medium text-foreground">
                    {ageDays} day{ageDays !== 1 ? 's' : ''} ago
                  </p>
                </div>
                {daysInTransit !== null && (
                  <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200 hover:bg-yellow-100 transition-colors">
                    <p className="text-xs text-yellow-700 mb-1">Days In Transit</p>
                    <p className="font-medium text-yellow-800">
                      {daysInTransit} day{daysInTransit !== 1 ? 's' : ''}
                    </p>
                  </div>
                )}
                {etaCountdown !== null && etaCountdown >= 0 && !transferOverdue && (
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors">
                    <p className="text-xs text-blue-700 mb-1">ETA Countdown</p>
                    <p className="font-medium text-blue-800">
                      Arrives in {etaCountdown} day{etaCountdown !== 1 ? 's' : ''}
                    </p>
                  </div>
                )}
                {transferOverdue && (
                  <div className="p-3 rounded-lg bg-red-100 border border-red-300 animate-pulse">
                    <p className="text-xs text-red-700 mb-1">Overdue</p>
                    <p className="font-bold text-red-800">
                      {overdueDays} day{overdueDays !== 1 ? 's' : ''} late
                    </p>
                  </div>
                )}
              </div>
            </div>

            {hasTransportAssignment && (
              <div>
                <SectionHeader title="Transport Assignment" icon={<Route className="w-4 h-4" />} />
                <div className="p-4 rounded-lg bg-blue-50 border-2 border-blue-300">
                  <div className="flex items-center gap-3 flex-wrap">
                    {transfer.assigned_convoy_id && (
                      <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-blue-200">
                        <Truck className="w-4 h-4 text-blue-600" />
                        <div>
                          <p className="text-xs text-blue-600">Convoy</p>
                          <p className="font-medium text-blue-800">#{transfer.assigned_convoy_id}</p>
                        </div>
                      </div>
                    )}
                    {transfer.assigned_flight_plan_id && (
                      <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-blue-200">
                        <Navigation className="w-4 h-4 text-blue-600" />
                        <div>
                          <p className="text-xs text-blue-600">Flight Plan</p>
                          <p className="font-medium text-blue-800">#{transfer.assigned_flight_plan_id}</p>
                        </div>
                      </div>
                    )}
                    {transfer.assigned_voyage_id && (
                      <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-blue-200">
                        <Anchor className="w-4 h-4 text-blue-600" />
                        <div>
                          <p className="text-xs text-blue-600">Voyage</p>
                          <p className="font-medium text-blue-800">#{transfer.assigned_voyage_id}</p>
                        </div>
                      </div>
                    )}
                    {transfer.manifest_id && (
                      <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-blue-200">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <div>
                          <p className="text-xs text-blue-600">Manifest</p>
                          <p className="font-medium text-blue-800">{transfer.manifest_id}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {destinationSite && (
              <div>
                <SectionHeader title="Destination Utilization" icon={<Package className="w-4 h-4" />} />
                <div className="p-4 rounded-lg bg-muted/30 border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-foreground">{destinationSite.name}</span>
                    <span className={`text-sm font-medium ${
                      destinationUtilization > 90 ? 'text-red-600' : 
                      destinationUtilization > 70 ? 'text-yellow-600' : 'text-green-600'
                    }`}>
                      {destinationUtilization}% utilized
                    </span>
                  </div>
                  <UtilizationBar percent={destinationUtilization} />
                  {destinationUtilization > 90 && (
                    <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Destination site is near capacity
                    </p>
                  )}
                </div>
              </div>
            )}

            <div>
              <SectionHeader title="Shipment Details" icon={<Package className="w-4 h-4" />} />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-muted/30 border border-border hover:bg-muted/50 transition-colors">
                  <p className="text-xs text-muted-foreground mb-1">Mode</p>
                  <p className="font-medium text-foreground capitalize">{transfer.transport_mode}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border border-border hover:bg-muted/50 transition-colors">
                  <p className="text-xs text-muted-foreground mb-1">Items</p>
                  <p className="font-medium text-foreground">{transferItems.length}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border border-border hover:bg-muted/50 transition-colors">
                  <p className="text-xs text-muted-foreground mb-1">Total Weight</p>
                  <p className="font-medium text-foreground">{totalWeight.toLocaleString()} lbs</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border border-border hover:bg-muted/50 transition-colors">
                  <p className="text-xs text-muted-foreground mb-1">Total Value</p>
                  <p className="font-medium text-foreground">${totalValue.toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div>
              <SectionHeader title="Schedule & Notes" icon={<Calendar className="w-4 h-4" />} />
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Expected Arrival Date
                  </label>
                  <input
                    type="date"
                    value={arrivalDate}
                    onChange={(e) => {
                      setArrivalDate(e.target.value);
                      setHasChanges(true);
                    }}
                    className={`w-full px-3 py-2 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-colors ${
                      transferOverdue ? 'border-red-300 bg-red-50' : 'border-border'
                    }`}
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
                    className="w-full px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] resize-none transition-colors"
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
              </div>
            </div>

            <div>
              <SectionHeader title={`Items (${transferItems.length})`} icon={<Package className="w-4 h-4" />} />
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {transferItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No items in this transfer</p>
                ) : (
                  transferItems.map((item, idx) => (
                    <div 
                      key={item.id || idx} 
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border hover:bg-muted/50 transition-colors cursor-default"
                    >
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

            <div className="text-xs text-muted-foreground pt-2 border-t border-border">
              <p>Created: {new Date(transfer.created_at).toLocaleString()}</p>
              {transfer.completed_date && (
                <p>Completed: {new Date(transfer.completed_date).toLocaleString()}</p>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-border bg-muted/20">
          <p className="text-sm font-medium text-foreground mb-3">Update Status</p>
          <div className="flex flex-wrap gap-2">
            {canMarkInTransit && (
              <button
                onClick={() => handleStatusChange("in_transit")}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-yellow-100 text-yellow-700 hover:bg-yellow-200 active:bg-yellow-300 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
              >
                <Clock className="w-4 h-4" />
                Mark In Transit
              </button>
            )}
            {canMarkComplete && (
              <button
                onClick={() => handleStatusChange("completed")}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 active:bg-green-300 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
              >
                <CheckCircle className="w-4 h-4" />
                Mark Complete
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => handleStatusChange("cancelled")}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 active:bg-red-300 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
              >
                <XCircle className="w-4 h-4" />
                Cancel Transfer
              </button>
            )}
            {canDelete && (
              <button
                onClick={handleDelete}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 active:bg-red-800 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-medium ml-auto"
              >
                <Trash2 className="w-4 h-4" />
                Delete Transfer
              </button>
            )}
            {loading && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
          </div>
        </div>
      </div>
    </div>
  );
}
