import React, { useState, useEffect, useMemo } from "react";
import { X, Loader2, Move, Building2, MapPin, ChevronRight, Package } from "lucide-react";
import type { WarehouseSite, InventoryItem } from "../types";
import { moveInventoryItem, fetchInventoryPaginated } from "../../../services/warehouseService";

interface MoveItemModalProps {
  sites: WarehouseSite[];
  currentSiteId: number;
  onClose: () => void;
  onSuccess: () => void;
  onShowToast: (message: string, type?: "info" | "success" | "warning" | "error") => void;
}

export default function MoveItemModal({
  sites,
  currentSiteId,
  onClose,
  onSuccess,
  onShowToast,
}: MoveItemModalProps) {
  const [loading, setLoading] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"select" | "destination" | "preview">("select");
  const [availableItems, setAvailableItems] = useState<InventoryItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [destinationSiteId, setDestinationSiteId] = useState<number>(currentSiteId);
  const [notes, setNotes] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const currentSite = useMemo(
    () => sites.find((s) => s.id === currentSiteId),
    [sites, currentSiteId]
  );

  const destinationSite = useMemo(
    () => sites.find((s) => s.id === destinationSiteId),
    [sites, destinationSiteId]
  );

  useEffect(() => {
    loadItems();
  }, [currentSiteId]);

  const loadItems = async () => {
    setItemsLoading(true);
    try {
      const response = await fetchInventoryPaginated(currentSiteId, {
        page: 1,
        pageSize: 500,
      });
      setAvailableItems(response.items);
    } catch (err) {
      setError("Failed to load inventory items");
    } finally {
      setItemsLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    if (!searchTerm) return availableItems;
    const term = searchTerm.toLowerCase();
    return availableItems.filter(
      (item) =>
        item.requisition_no?.toLowerCase().includes(term) ||
        item.description?.toLowerCase().includes(term) ||
        item.nsn?.toLowerCase().includes(term)
    );
  }, [availableItems, searchTerm]);

  const selectedItemsList = useMemo(
    () => availableItems.filter((item) => selectedItems.has(item.id)),
    [availableItems, selectedItems]
  );

  const toggleItem = (id: number) => {
    const newSet = new Set(selectedItems);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedItems(newSet);
  };

  const selectAll = () => {
    setSelectedItems(new Set(filteredItems.map((item) => item.id)));
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
  };

  const handleMove = async () => {
    if (selectedItems.size === 0) {
      setError("Please select at least one item to move");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let successCount = 0;
      let failCount = 0;

      for (const itemId of selectedItems) {
        try {
          await moveInventoryItem(currentSiteId, itemId, {
            destination_site_id: destinationSiteId !== currentSiteId ? destinationSiteId : undefined,
            notes: notes || undefined,
          });
          successCount++;
        } catch {
          failCount++;
        }
      }

      if (failCount > 0) {
        onShowToast(
          `Moved ${successCount} items, ${failCount} failed`,
          successCount > 0 ? "warning" : "error"
        );
      } else {
        onShowToast(`Successfully moved ${successCount} item(s)`, "success");
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to move items");
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case "select":
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-foreground">Select Items to Move</h3>
                <p className="text-sm text-muted-foreground">
                  From: {currentSite?.name || "Unknown"}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80 text-muted-foreground"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80 text-muted-foreground"
                >
                  Clear
                </button>
              </div>
            </div>

            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search items..."
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
            />

            <div className="max-h-64 overflow-y-auto border border-border rounded-xl">
              {itemsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-[#004E89]" />
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Package className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">No items found</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredItems.map((item) => (
                    <label
                      key={item.id}
                      className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                        selectedItems.has(item.id) ? "bg-[#004E89]/10" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedItems.has(item.id)}
                        onChange={() => toggleItem(item.id)}
                        className="w-4 h-4 rounded border-border text-[#004E89] focus:ring-[#004E89]/40"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground text-sm truncate">
                          {item.requisition_no || `Item #${item.id}`}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {item.description || "No description"} • Qty: {item.quantity}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="text-sm text-muted-foreground">
              {selectedItems.size} item(s) selected
            </div>
          </div>
        );

      case "destination":
        return (
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-foreground">Select Destination</h3>
              <p className="text-sm text-muted-foreground">
                Moving {selectedItems.size} item(s) from {currentSite?.name}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                <Building2 className="w-4 h-4 inline mr-1" />
                Destination Site
              </label>
              <select
                value={destinationSiteId}
                onChange={(e) => setDestinationSiteId(Number(e.target.value))}
                className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
              >
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name} ({site.code})
                    {site.id === currentSiteId ? " - Current" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                <MapPin className="w-4 h-4 inline mr-1" />
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Reason for move, special handling instructions..."
                rows={3}
                className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40 resize-none"
              />
            </div>

            {destinationSiteId === currentSiteId && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                Same site selected. This will update the last moved timestamp without changing location.
              </div>
            )}
          </div>
        );

      case "preview":
        return (
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-foreground">Confirm Move</h3>
              <p className="text-sm text-muted-foreground">Review the move details below</p>
            </div>

            <div className="p-4 rounded-xl bg-muted/50 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{currentSite?.name}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium text-[#004E89]">{destinationSite?.name}</span>
              </div>

              <div className="border-t border-border pt-3">
                <p className="text-sm font-medium text-foreground mb-2">
                  Items to move ({selectedItems.size}):
                </p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {selectedItemsList.map((item) => (
                    <div key={item.id} className="text-xs text-muted-foreground">
                      • {item.requisition_no || `Item #${item.id}`} -{" "}
                      {item.description?.substring(0, 40) || "No description"}
                      {item.description && item.description.length > 40 ? "..." : ""}
                    </div>
                  ))}
                </div>
              </div>

              {notes && (
                <div className="border-t border-border pt-3">
                  <p className="text-sm font-medium text-foreground mb-1">Notes:</p>
                  <p className="text-xs text-muted-foreground">{notes}</p>
                </div>
              )}
            </div>

            {destinationSiteId !== currentSiteId && (
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-sm">
                This is a cross-site move. Items will be transferred to{" "}
                <strong>{destinationSite?.name}</strong>.
              </div>
            )}
          </div>
        );
    }
  };

  const canProceed = () => {
    switch (step) {
      case "select":
        return selectedItems.size > 0;
      case "destination":
        return true;
      case "preview":
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (step === "select") setStep("destination");
    else if (step === "destination") setStep("preview");
    else handleMove();
  };

  const handleBack = () => {
    if (step === "destination") setStep("select");
    else if (step === "preview") setStep("destination");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Move className="w-5 h-5 text-[#004E89]" />
            <h2 className="text-lg font-semibold text-foreground">Move Items</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center justify-center mb-6">
          {["select", "destination", "preview"].map((s, i) => (
            <React.Fragment key={s}>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step === s
                    ? "bg-[#004E89] text-white"
                    : ["select", "destination", "preview"].indexOf(step) > i
                    ? "bg-[#16A34A] text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {i + 1}
              </div>
              {i < 2 && (
                <div
                  className={`w-12 h-1 ${
                    ["select", "destination", "preview"].indexOf(step) > i
                      ? "bg-[#16A34A]"
                      : "bg-muted"
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-[#DC2626] text-sm">
            {error}
          </div>
        )}

        {renderStep()}

        <div className="flex gap-3 pt-6">
          {step !== "select" && (
            <button
              type="button"
              onClick={handleBack}
              disabled={loading}
              className="flex-1 py-2.5 text-sm rounded-xl border border-border bg-white hover:bg-muted transition-colors"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={step === "select" ? onClose : handleBack}
            disabled={loading}
            className={`${step === "select" ? "flex-1" : ""} py-2.5 px-4 text-sm rounded-xl border border-border bg-white hover:bg-muted transition-colors`}
            style={{ display: step !== "select" ? "none" : undefined }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={loading || !canProceed()}
            className="flex-1 py-2.5 text-sm rounded-xl bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {step === "preview" ? "Confirm Move" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
