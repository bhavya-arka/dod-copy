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
  const [totalCapacity, setTotalCapacity] = useState<number>(zone.total_capacity || 0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (totalCapacity < 0) {
      onShowToast("Capacity must be a positive number", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      await updateZoneCapacity(zone.id, totalCapacity);
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

  const currentUsed = zone.current_item_count || 0;
  const utilization = totalCapacity > 0 ? Math.round((currentUsed / totalCapacity) * 100) : 0;

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
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-muted-foreground">Current Usage</span>
              <span className="text-sm font-medium">{currentUsed} items</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Projected Utilization</span>
              <span className={`text-sm font-medium ${
                utilization > 85 ? "text-red-600" : 
                utilization > 60 ? "text-amber-600" : "text-emerald-600"
              }`}>
                {utilization}%
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="totalCapacity" className="block text-sm font-medium text-foreground mb-1">
              Total Capacity (items)
            </label>
            <input
              id="totalCapacity"
              type="number"
              min="0"
              value={totalCapacity}
              onChange={(e) => setTotalCapacity(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Enter total capacity"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              The maximum number of items this zone can hold
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
