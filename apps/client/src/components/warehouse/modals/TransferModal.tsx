import React, { useState } from "react";
import { X, Loader2, Truck, Plane, Ship } from "lucide-react";
import type { WarehouseSite } from "../types";
import { createTransfer } from "../../../services/warehouseService";

interface TransferModalProps {
  sites: WarehouseSite[];
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Modal for creating a new transfer order
 */
export default function TransferModal({ sites, onClose, onSuccess }: TransferModalProps) {
  const [sourceSiteId, setSourceSiteId] = useState<number | "">("");
  const [destSiteId, setDestSiteId] = useState<number | "">("");
  const [transportMode, setTransportMode] = useState<"ground" | "air" | "sea">("ground");
  const [items, setItems] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!sourceSiteId || !destSiteId) {
      setError("Source and destination sites are required");
      return;
    }

    if (sourceSiteId === destSiteId) {
      setError("Source and destination must be different");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await createTransfer({
        source_site_id: Number(sourceSiteId),
        destination_site_id: Number(destSiteId),
        transport_mode: transportMode,
        items,
        notes,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create transfer");
    } finally {
      setLoading(false);
    }
  };

  const transportModes = [
    { value: "ground", icon: Truck, label: "Ground" },
    { value: "air", icon: Plane, label: "Air" },
    { value: "sea", icon: Ship, label: "Sea" },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">New Transfer</h2>
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
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Source Site *</label>
            <select
              value={sourceSiteId}
              onChange={(e) => setSourceSiteId(e.target.value ? Number(e.target.value) : "")}
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
            >
              <option value="">Select source...</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name} ({site.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Destination Site *</label>
            <select
              value={destSiteId}
              onChange={(e) => setDestSiteId(e.target.value ? Number(e.target.value) : "")}
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
            >
              <option value="">Select destination...</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name} ({site.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Transport Mode</label>
            <div className="flex gap-2">
              {transportModes.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setTransportMode(mode.value)}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${
                    transportMode === mode.value
                      ? "bg-[#004E89] text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  <mode.icon className="w-4 h-4" />
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Items</label>
            <input
              type="text"
              value={items}
              onChange={(e) => setItems(e.target.value)}
              placeholder="e.g., 50 pallets of equipment"
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes..."
              rows={3}
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
              disabled={loading}
              className="flex-1 py-2.5 text-sm rounded-xl bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Transfer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
