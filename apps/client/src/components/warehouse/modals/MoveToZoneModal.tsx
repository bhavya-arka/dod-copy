import React, { useState, useEffect, useMemo } from "react";
import { X, Loader2, MapPin, Search, ArrowRight } from "lucide-react";
import type { WarehouseZone, ToastMessage } from "../types";
import { fetchSiteZones, bulkMoveItemsToZone } from "../../../services/warehouseService";

interface MoveToZoneModalProps {
  siteId: number;
  siteName: string;
  selectedItemIds: number[];
  onClose: () => void;
  onSuccess: () => void;
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

export default function MoveToZoneModal({
  siteId,
  siteName,
  selectedItemIds,
  onClose,
  onSuccess,
  onShowToast,
}: MoveToZoneModalProps) {
  const [zones, setZones] = useState<WarehouseZone[]>([]);
  const [loading, setLoading] = useState(false);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadZones();
  }, [siteId]);

  const loadZones = async () => {
    setZonesLoading(true);
    try {
      const fetchedZones = await fetchSiteZones(siteId);
      setZones(fetchedZones);
    } catch (err) {
      onShowToast("Failed to load zones", "error");
    } finally {
      setZonesLoading(false);
    }
  };

  const filteredZones = useMemo(() => {
    if (!searchTerm) return zones;
    const term = searchTerm.toLowerCase();
    return zones.filter(
      (zone) =>
        zone.name.toLowerCase().includes(term) ||
        zone.usage_type?.toLowerCase().includes(term)
    );
  }, [zones, searchTerm]);

  const selectedZone = useMemo(
    () => zones.find((z) => z.id === selectedZoneId),
    [zones, selectedZoneId]
  );

  const handleMove = async () => {
    if (selectedZoneId === null) {
      onShowToast("Please select a target zone", "warning");
      return;
    }

    setLoading(true);
    try {
      const result = await bulkMoveItemsToZone(siteId, selectedItemIds, selectedZoneId);
      onShowToast(`Successfully moved ${result.itemsMoved} item(s) to ${selectedZone?.name}`, "success");
      onSuccess();
      onClose();
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "Failed to move items", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col border border-border">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Move to Zone</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Move {selectedItemIds.length} selected item{selectedItemIds.length !== 1 ? "s" : ""} to a different zone
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search zones..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {zonesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredZones.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {searchTerm ? "No zones match your search" : "No zones available"}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredZones.map((zone) => (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => setSelectedZoneId(zone.id)}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-colors text-left ${
                    selectedZoneId === zone.id
                      ? "border-[#2563EB] bg-[#2563EB]/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    selectedZoneId === zone.id ? "bg-[#2563EB] text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground">{zone.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {zone.usage_type || "General"} {zone.capacity_pallets ? `• ${zone.capacity_pallets} pallets` : ""}
                    </div>
                  </div>
                  {selectedZoneId === zone.id && (
                    <ArrowRight className="w-5 h-5 text-[#2563EB]" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium rounded-xl border border-border text-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleMove}
            disabled={loading || selectedZoneId === null}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-[#2563EB] text-white hover:bg-[#1d4ed8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Moving...
              </>
            ) : (
              <>
                <MapPin className="w-4 h-4" />
                Move to Zone
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
