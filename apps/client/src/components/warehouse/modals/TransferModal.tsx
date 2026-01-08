import React, { useState, useEffect, useMemo } from "react";
import { X, Loader2, Truck, Plane, Ship, Search, Check, Package } from "lucide-react";
import type { WarehouseSite, InventoryItem, AirTransportMetadata, CreateTransferPayload } from "../types";
import { createTransfer, fetchInventory } from "../../../services/warehouseService";

interface TransferModalProps {
  sites: WarehouseSite[];
  onClose: () => void;
  onSuccess: () => void;
}

const AIRCRAFT_TYPES = [
  { value: "C-17", label: "C-17 Globemaster III" },
  { value: "C-130H", label: "C-130H Hercules" },
  { value: "C-130J", label: "C-130J Super Hercules" },
] as const;

const PRIORITY_LEVELS = [
  { value: "routine", label: "Routine", color: "bg-gray-100 text-gray-700" },
  { value: "priority", label: "Priority", color: "bg-yellow-100 text-yellow-700" },
  { value: "urgent", label: "Urgent", color: "bg-red-100 text-red-700" },
] as const;

export default function TransferModal({ sites, onClose, onSuccess }: TransferModalProps) {
  const [sourceSiteId, setSourceSiteId] = useState<number | "">("");
  const [destSiteId, setDestSiteId] = useState<number | "">("");
  const [transportMode, setTransportMode] = useState<"ground" | "air" | "sea">("ground");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  
  const [aircraftType, setAircraftType] = useState<"C-17" | "C-130H" | "C-130J">("C-17");
  const [missionId, setMissionId] = useState("");
  const [priority, setPriority] = useState<"routine" | "priority" | "urgent">("routine");

  useEffect(() => {
    if (sourceSiteId) {
      loadSourceInventory(Number(sourceSiteId));
    } else {
      setInventoryItems([]);
      setSelectedItemIds(new Set());
    }
  }, [sourceSiteId]);

  const loadSourceInventory = async (siteId: number) => {
    setLoadingInventory(true);
    try {
      const items = await fetchInventory(siteId);
      setInventoryItems(items);
    } catch (err) {
      console.error("Failed to load inventory:", err);
      setInventoryItems([]);
    } finally {
      setLoadingInventory(false);
    }
  };

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return inventoryItems;
    const query = searchQuery.toLowerCase();
    return inventoryItems.filter(item => 
      item.requisition_no?.toLowerCase().includes(query) ||
      item.description?.toLowerCase().includes(query) ||
      item.nsn?.toLowerCase().includes(query)
    );
  }, [inventoryItems, searchQuery]);

  const selectedItems = useMemo(() => {
    return inventoryItems.filter(item => selectedItemIds.has(item.id));
  }, [inventoryItems, selectedItemIds]);

  const summary = useMemo(() => {
    const items = selectedItems;
    const count = items.length;
    const totalWeight = items.reduce((sum, item) => {
      const weight = parseFloat(item.weight_lb || item.weight_lbs || "0") || 0;
      return sum + (weight * item.quantity);
    }, 0);
    const totalValue = items.reduce((sum, item) => {
      const price = parseFloat(item.unit_price || "0") || 0;
      return sum + (price * item.quantity);
    }, 0);
    return { count, totalWeight, totalValue };
  }, [selectedItems]);

  const toggleItem = (itemId: number) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedItemIds(new Set(filteredItems.map(item => item.id)));
  };

  const clearSelection = () => {
    setSelectedItemIds(new Set());
  };

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

    if (selectedItemIds.size === 0) {
      setError("Please select at least one item to transfer");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload: CreateTransferPayload = {
        source_site_id: Number(sourceSiteId),
        destination_site_id: Number(destSiteId),
        transport_mode: transportMode,
        item_ids: Array.from(selectedItemIds),
        notes: notes || undefined,
      };

      if (transportMode === "air") {
        payload.air_metadata = {
          aircraft_type: aircraftType,
          mission_id: missionId || undefined,
          priority,
        };
      }

      await createTransfer(payload);
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
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Source Site *</label>
              <select
                value={sourceSiteId}
                onChange={(e) => setSourceSiteId(e.target.value ? Number(e.target.value) : "")}
                className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]/40"
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
                className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]/40"
              >
                <option value="">Select destination...</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name} ({site.code})
                  </option>
                ))}
              </select>
            </div>
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
                      ? "bg-[#2563EB] text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  <mode.icon className="w-4 h-4" />
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {transportMode === "air" && (
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 space-y-4">
              <h3 className="text-sm font-semibold text-blue-900 flex items-center gap-2">
                <Plane className="w-4 h-4" />
                Air Transport Details
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-blue-900 mb-1">Aircraft Type</label>
                  <select
                    value={aircraftType}
                    onChange={(e) => setAircraftType(e.target.value as typeof aircraftType)}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-blue-300 text-sm focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]/40"
                  >
                    {AIRCRAFT_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-blue-900 mb-1">Mission ID (Optional)</label>
                  <input
                    type="text"
                    value={missionId}
                    onChange={(e) => setMissionId(e.target.value)}
                    placeholder="e.g., AMC-2024-001"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-blue-300 text-sm focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]/40"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-blue-900 mb-1">Priority Level</label>
                <div className="flex gap-2">
                  {PRIORITY_LEVELS.map((level) => (
                    <button
                      key={level.value}
                      type="button"
                      onClick={() => setPriority(level.value)}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        priority === level.value
                          ? level.color + " ring-2 ring-offset-1 ring-blue-500"
                          : "bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {level.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Select Items to Transfer *
            </label>
            
            {!sourceSiteId ? (
              <div className="p-8 text-center text-muted-foreground bg-muted rounded-xl">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Select a source site to view inventory</p>
              </div>
            ) : loadingInventory ? (
              <div className="p-8 text-center text-muted-foreground bg-muted rounded-xl">
                <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
                <p className="text-sm">Loading inventory...</p>
              </div>
            ) : inventoryItems.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground bg-muted rounded-xl">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No items available at this site</p>
              </div>
            ) : (
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="p-3 bg-muted border-b border-border flex items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search items..."
                      className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-white border border-border text-sm focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      onClick={selectAll}
                      className="px-2 py-1 rounded bg-white border border-border hover:bg-gray-50 transition-colors"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="px-2 py-1 rounded bg-white border border-border hover:bg-gray-50 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                
                <div className="max-h-48 overflow-y-auto">
                  {filteredItems.map((item) => (
                    <label
                      key={item.id}
                      className={`flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-border last:border-b-0 ${
                        selectedItemIds.has(item.id) ? "bg-blue-50" : ""
                      }`}
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        selectedItemIds.has(item.id)
                          ? "bg-[#2563EB] border-[#2563EB]"
                          : "border-gray-300"
                      }`}>
                        {selectedItemIds.has(item.id) && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <input
                        type="checkbox"
                        checked={selectedItemIds.has(item.id)}
                        onChange={() => toggleItem(item.id)}
                        className="sr-only"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">
                          {item.requisition_no}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {item.description || "No description"}
                        </div>
                      </div>
                      <div className="text-right text-xs">
                        <div className="text-foreground">Qty: {item.quantity}</div>
                        {(item.weight_lb || item.weight_lbs) && (
                          <div className="text-muted-foreground">
                            {item.weight_lb || item.weight_lbs} lbs
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {selectedItemIds.size > 0 && (
              <div className="mt-3 p-3 rounded-xl bg-green-50 border border-green-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-green-800">Selected Items Summary</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-xl font-bold text-green-700">{summary.count}</div>
                    <div className="text-xs text-green-600">Items</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-green-700">
                      {summary.totalWeight.toLocaleString()}
                    </div>
                    <div className="text-xs text-green-600">Total lbs</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-green-700">
                      ${summary.totalValue.toLocaleString()}
                    </div>
                    <div className="text-xs text-green-600">Total Value</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes..."
              rows={3}
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]/40 resize-none"
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
              disabled={loading || selectedItemIds.size === 0}
              className="flex-1 py-2.5 text-sm rounded-xl bg-[#2563EB] text-white hover:bg-[#1d4ed8] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
