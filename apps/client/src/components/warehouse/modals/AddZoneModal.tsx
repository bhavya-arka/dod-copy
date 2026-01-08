import React, { useState } from "react";
import { X, Loader2, Grid3X3 } from "lucide-react";
import { createZone } from "../../../services/warehouseService";
import type { WarehouseZone, ToastMessage, ZoneUsageType } from "../types";

interface AddZoneModalProps {
  siteId: number;
  siteName: string;
  onClose: () => void;
  onSuccess: () => void;
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
  editZone?: WarehouseZone;
}

const USAGE_TYPES: { value: ZoneUsageType; label: string }[] = [
  { value: "general", label: "General" },
  { value: "small_material", label: "Small Material" },
  { value: "mixed_material", label: "Mixed Material" },
  { value: "large_material", label: "Large Material" },
  { value: "uncrated", label: "Uncrated" },
  { value: "crated", label: "Crated" },
  { value: "hazmat", label: "Hazmat" },
  { value: "long_pipes", label: "Long Pipes" },
];

export default function AddZoneModal({
  siteId,
  siteName,
  onClose,
  onSuccess,
  onShowToast,
  editZone,
}: AddZoneModalProps) {
  const isEdit = !!editZone;
  
  const [code, setCode] = useState(editZone?.code || "");
  const [name, setName] = useState(editZone?.name || "");
  const [isOutdoor, setIsOutdoor] = useState(editZone?.is_outdoor || false);
  const [usageType, setUsageType] = useState<string>(editZone?.usage_type || "general");
  const [locationPattern, setLocationPattern] = useState(editZone?.location_pattern || "");
  const [bulkAvailable, setBulkAvailable] = useState(editZone?.bulk_available?.toString() || "");
  const [rackAvailable, setRackAvailable] = useState(editZone?.rack_available?.toString() || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setError("Zone code and name are required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = {
        site_id: siteId,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        is_outdoor: isOutdoor,
        usage_type: usageType,
        location_pattern: locationPattern.trim() || undefined,
        bulk_available: bulkAvailable ? parseInt(bulkAvailable) : undefined,
        rack_available: rackAvailable ? parseInt(rackAvailable) : undefined,
      };

      await createZone(data);
      onShowToast(`Zone ${code} created successfully`, "success");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save zone");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10">
              <Grid3X3 className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {isEdit ? "Edit Zone" : "Add Zone"}
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
              <label className="block text-sm font-medium text-foreground mb-1">Zone Code *</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g., Z-A1"
                className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Zone Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Small Parts Area"
                className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/40"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Usage Type</label>
              <select
                value={usageType}
                onChange={(e) => setUsageType(e.target.value)}
                className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/40"
              >
                {USAGE_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-3 cursor-pointer p-2 rounded-xl hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={isOutdoor}
                  onChange={(e) => setIsOutdoor(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-purple-500 focus:ring-purple-500/40"
                />
                <span className="text-sm text-foreground">Outdoor Zone</span>
              </label>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-muted/50 border border-border">
            <p className="text-sm font-medium text-foreground mb-3">Capacity Settings</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Bulk Positions</label>
                <input
                  type="number"
                  value={bulkAvailable}
                  onChange={(e) => setBulkAvailable(e.target.value)}
                  placeholder="0"
                  min="0"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-border text-foreground text-sm focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Rack Positions</label>
                <input
                  type="number"
                  value={rackAvailable}
                  onChange={(e) => setRackAvailable(e.target.value)}
                  placeholder="0"
                  min="0"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-border text-foreground text-sm focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Location Pattern (optional)</label>
            <input
              type="text"
              value={locationPattern}
              onChange={(e) => setLocationPattern(e.target.value)}
              placeholder="e.g., A[A-Z]-\\d{3} (regex pattern)"
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/40"
            />
            <p className="text-xs text-muted-foreground mt-1">Regex pattern for location codes within this zone</p>
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
              className="flex-1 py-2.5 text-sm rounded-xl bg-purple-500 text-white hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? "Save Changes" : "Add Zone"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
