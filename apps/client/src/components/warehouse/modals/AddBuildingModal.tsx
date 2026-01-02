import React, { useState } from "react";
import { X, Loader2, Building2 } from "lucide-react";
import { createBuilding, updateBuilding } from "../../../services/warehouseService";
import type { WarehouseBuilding, ToastMessage } from "../types";

interface AddBuildingModalProps {
  siteId: number;
  siteName: string;
  onClose: () => void;
  onSuccess: () => void;
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
  editBuilding?: WarehouseBuilding;
}

function parseDimensions(dimensions: string | undefined): { length: string; width: string; height: string } {
  if (!dimensions) return { length: "", width: "", height: "" };
  const match = dimensions.match(/(\d+)×(\d+)(?:×(\d+))?\s*ft/);
  if (match) {
    return { length: match[1] || "", width: match[2] || "", height: match[3] || "" };
  }
  return { length: "", width: "", height: "" };
}

export default function AddBuildingModal({
  siteId,
  siteName,
  onClose,
  onSuccess,
  onShowToast,
  editBuilding,
}: AddBuildingModalProps) {
  const isEdit = !!editBuilding;
  const parsedDimensions = parseDimensions(editBuilding?.dimensions);
  
  const [code, setCode] = useState(editBuilding?.code || "");
  const [name, setName] = useState(editBuilding?.name || "");
  const [lengthFt, setLengthFt] = useState(parsedDimensions.length);
  const [widthFt, setWidthFt] = useState(parsedDimensions.width);
  const [heightFt, setHeightFt] = useState(parsedDimensions.height);
  const [capacityPallets, setCapacityPallets] = useState(editBuilding?.pallet_count?.toString() || "");
  const [geometryNotes, setGeometryNotes] = useState(editBuilding?.geometry_notes || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setError("Building code and name are required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        length_ft: lengthFt ? parseFloat(lengthFt) : undefined,
        width_ft: widthFt ? parseFloat(widthFt) : undefined,
        height_ft: heightFt ? parseFloat(heightFt) : undefined,
        capacity_pallets: capacityPallets ? parseInt(capacityPallets) : undefined,
        geometry_notes: geometryNotes.trim() || undefined,
      };

      if (isEdit && editBuilding) {
        await updateBuilding(siteId, editBuilding.id, data);
        onShowToast(`Building ${code} updated successfully`, "success");
      } else {
        await createBuilding(siteId, data);
        onShowToast(`Building ${code} created successfully`, "success");
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save building");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#004E89]/10">
              <Building2 className="w-5 h-5 text-[#004E89]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {isEdit ? "Edit Building" : "Add Building"}
              </h2>
              <p className="text-xs text-muted-foreground">{siteName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-[#DC2626] text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Building Code *</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g., B-870"
                className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Building Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Main Warehouse"
                className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
              />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-muted/50 border border-border">
            <p className="text-sm font-medium text-foreground mb-3">Dimensions (feet)</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Length</label>
                <input
                  type="number"
                  value={lengthFt}
                  onChange={(e) => setLengthFt(e.target.value)}
                  placeholder="300"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89]"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Width</label>
                <input
                  type="number"
                  value={widthFt}
                  onChange={(e) => setWidthFt(e.target.value)}
                  placeholder="150"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89]"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Height</label>
                <input
                  type="number"
                  value={heightFt}
                  onChange={(e) => setHeightFt(e.target.value)}
                  placeholder="30"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89]"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Pallet Capacity</label>
            <input
              type="number"
              value={capacityPallets}
              onChange={(e) => setCapacityPallets(e.target.value)}
              placeholder="e.g., 500"
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
            />
            <p className="text-xs text-muted-foreground mt-1">Total pallet positions in this building</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
            <textarea
              value={geometryNotes}
              onChange={(e) => setGeometryNotes(e.target.value)}
              placeholder="Building layout notes, special requirements, etc."
              rows={2}
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-sm rounded-xl border border-border bg-white hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !code.trim() || !name.trim()}
              className="flex-1 py-2.5 text-sm rounded-xl bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? "Save Changes" : "Add Building"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
