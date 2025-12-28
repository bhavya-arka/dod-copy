import React, { useState } from "react";
import { X, Loader2 } from "lucide-react";
import type { WarehouseSite } from "../types";
import { parseNSN } from "../utils";
import { addInventoryItem } from "../../../services/warehouseService";

interface AddItemModalProps {
  siteId: number | null;
  sites: WarehouseSite[];
  onClose: () => void;
  onSuccess: () => void;
  onSelectSite: (id: number | null) => void;
}

/**
 * Modal for adding a single inventory item
 */
export default function AddItemModal({ siteId, sites, onClose, onSuccess, onSelectSite }: AddItemModalProps) {
  const [selectedSite, setSelectedSite] = useState<number | "">(siteId || "");
  const [requisitionNo, setRequisitionNo] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [nsn, setNsn] = useState("");
  const [nsnError, setNsnError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNsnChange = (value: string) => {
    setNsn(value);
    setNsnError(null);
    if (value.trim()) {
      const parsed = parseNSN(value);
      if (!parsed) {
        setNsnError("Invalid NSN format. Use XXXX-XX-XXX-XXXX (13 digits)");
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedSite) {
      setError("Please select a warehouse site");
      return;
    }

    if (!requisitionNo.trim()) {
      setError("Requisition number is required");
      return;
    }

    if (!quantity || parseInt(quantity) < 1) {
      setError("Quantity must be at least 1");
      return;
    }

    let nsnData: { nsn: string; fsc: string; niin: string } | null = null;
    if (nsn.trim()) {
      const parsed = parseNSN(nsn);
      if (!parsed) {
        setError("Invalid NSN format. Use XXXX-XX-XXX-XXXX (13 digits)");
        return;
      }
      const cleanedNsn = nsn.replace(/[-\s]/g, "");
      nsnData = { nsn: cleanedNsn, fsc: parsed.fsc, niin: parsed.niin };
    }

    setLoading(true);
    setError(null);

    try {
      await addInventoryItem(Number(selectedSite), {
        requisition_no: requisitionNo,
        description,
        quantity: parseInt(quantity),
        length_in: length || undefined,
        width_in: width || undefined,
        height_in: height || undefined,
        weight_lb: weight || undefined,
        unit_price: unitPrice || undefined,
        ...(nsnData || {}),
      });

      onSelectSite(Number(selectedSite));
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add item");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">Add Inventory Item</h2>
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
            <label className="block text-sm font-medium text-foreground mb-1">Warehouse Site *</label>
            <select
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value ? Number(e.target.value) : "")}
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
            >
              <option value="">Select a site...</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name} ({site.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Requisition Number *</label>
            <input
              type="text"
              value={requisitionNo}
              onChange={(e) => setRequisitionNo(e.target.value)}
              placeholder="e.g., REQ-2024-001"
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">NSN (Optional)</label>
            <input
              type="text"
              value={nsn}
              onChange={(e) => handleNsnChange(e.target.value)}
              placeholder="XXXX-XX-XXX-XXXX"
              className={`w-full px-4 py-2 rounded-xl bg-muted border ${nsnError ? "border-red-300" : "border-border"} text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40`}
            />
            {nsnError && <p className="text-xs text-[#DC2626] mt-1">{nsnError}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Item description"
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Quantity *</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="1"
                className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Unit Price</label>
              <input
                type="text"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Length (in)</label>
              <input
                type="text"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Width (in)</label>
              <input
                type="text"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Height (in)</label>
              <input
                type="text"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Weight (lb)</label>
              <input
                type="text"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89]"
              />
            </div>
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
              Add Item
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
