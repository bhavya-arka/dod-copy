import React, { useState } from "react";
import { X, Loader2, Package } from "lucide-react";
import type { WarehouseZone, ToastMessage } from "../types";
import { updateZoneCapacity } from "../../../services/warehouseService";

interface EditZoneCapacityModalProps {
  zone: WarehouseZone;
  onClose: () => void;
  onSuccess: () => void;
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

export default function EditZoneCapacityModal({
  zone,
  onClose,
  onSuccess,
  onShowToast,
}: EditZoneCapacityModalProps) {
  const [rackAvailable, setRackAvailable] = useState<number>(zone.rack_available || 0);
  const [bulkAvailable, setBulkAvailable] = useState<number>(zone.bulk_available || 0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (rackAvailable < 0 || bulkAvailable < 0) {
      onShowToast("Capacity values must be positive numbers", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      await updateZoneCapacity(zone.id, { rack_available: rackAvailable, bulk_available: bulkAvailable });
      onShowToast(`Zone "${zone.code}" capacity updated`, "success");
      onSuccess();
    } catch (error) {
      onShowToast(
        error instanceof Error ? error.message : "Failed to update capacity",
        "error"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const rackOccupied = (zone.rack_available || 0) - (zone.rack_open || 0);
  const bulkOccupied = (zone.bulk_available || 0) - (zone.bulk_open || 0);
  
  const projectedRackUtilization = rackAvailable > 0 ? Math.round((rackOccupied / rackAvailable) * 100) : 0;
  const projectedBulkUtilization = bulkAvailable > 0 ? Math.round((bulkOccupied / bulkAvailable) * 100) : 0;

  const getUtilizationColor = (utilization: number) => {
    if (utilization > 85) return "text-red-600";
    if (utilization > 60) return "text-amber-600";
    return "text-emerald-600";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100">
              <Package className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Edit Zone Capacity</h2>
              <p className="text-sm text-muted-foreground">{zone.code} - {zone.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="p-3 bg-muted/50 rounded-lg space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Current Rack Occupied</span>
              <span className="text-sm font-medium">{rackOccupied} positions</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Current Bulk Occupied</span>
              <span className="text-sm font-medium">{bulkOccupied} positions</span>
            </div>
            <div className="border-t border-border pt-2 mt-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Projected Rack Utilization</span>
                <span className={`text-sm font-medium ${getUtilizationColor(projectedRackUtilization)}`}>
                  {projectedRackUtilization}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Projected Bulk Utilization</span>
                <span className={`text-sm font-medium ${getUtilizationColor(projectedBulkUtilization)}`}>
                  {projectedBulkUtilization}%
                </span>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="rackAvailable" className="block text-sm font-medium text-foreground mb-1">
              Rack Positions (Available)
            </label>
            <input
              id="rackAvailable"
              type="number"
              min="0"
              value={rackAvailable}
              onChange={(e) => setRackAvailable(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Enter rack positions available"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Total rack pallet positions in this zone
            </p>
          </div>

          <div>
            <label htmlFor="bulkAvailable" className="block text-sm font-medium text-foreground mb-1">
              Bulk Positions (Available)
            </label>
            <input
              id="bulkAvailable"
              type="number"
              min="0"
              value={bulkAvailable}
              onChange={(e) => setBulkAvailable(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Enter bulk positions available"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Total bulk floor pallet positions in this zone
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-border rounded-lg text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
