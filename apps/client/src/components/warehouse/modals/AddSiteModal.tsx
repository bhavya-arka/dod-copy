import React, { useState } from "react";
import { X, Loader2, MapPin } from "lucide-react";
import { createSite } from "../../../services/warehouseService";

interface AddSiteModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddSiteModal({ onClose, onSuccess }: AddSiteModalProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [country, setCountry] = useState("USA");
  const [aor, setAor] = useState("");
  const [dodaac, setDodaac] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name) {
      setError("Site Code and Site Name are required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await createSite({ 
        code, 
        name, 
        address_line_1: addressLine1 || undefined,
        address_line_2: addressLine2 || undefined,
        city: city || undefined, 
        state: state || undefined,
        zip_code: zipCode || undefined,
        country: country || undefined,
        aor: aor || undefined,
        dodaac: dodaac || undefined,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create site");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]/40";
  const labelClass = "block text-sm font-medium text-foreground mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#2563EB]" />
            <h2 className="text-lg font-semibold text-foreground">Add Warehouse Site</h2>
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
              <label className={labelClass}>Site Code *</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, "_"))}
                placeholder="e.g., SAN_DIEGO"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>DODAAC</label>
              <input
                type="text"
                value={dodaac}
                onChange={(e) => setDodaac(e.target.value.toUpperCase())}
                placeholder="e.g., W25G1U"
                maxLength={6}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Site Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., San Diego Naval Supply Center"
              className={inputClass}
            />
          </div>

          <div className="border-t border-border pt-4 mt-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Address (used for route planning)</h3>
          </div>

          <div>
            <label className={labelClass}>Street Address</label>
            <input
              type="text"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              placeholder="e.g., 3375 Norman Scott Rd"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Address Line 2</label>
            <input
              type="text"
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              placeholder="e.g., Building 3, Suite 100"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g., San Diego"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>State</label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value.toUpperCase())}
                placeholder="e.g., CA"
                maxLength={2}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>ZIP Code</label>
              <input
                type="text"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                placeholder="e.g., 92136"
                maxLength={10}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Country</label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g., USA"
                className={inputClass}
              />
            </div>
          </div>

          <div className="border-t border-border pt-4 mt-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Military Designations (optional)</h3>
          </div>

          <div>
            <label className={labelClass}>Area of Responsibility (AOR)</label>
            <select
              value={aor}
              onChange={(e) => setAor(e.target.value)}
              className={inputClass}
            >
              <option value="">Select AOR...</option>
              <option value="INDOPACOM">INDOPACOM - Indo-Pacific Command</option>
              <option value="EUCOM">EUCOM - European Command</option>
              <option value="CENTCOM">CENTCOM - Central Command</option>
              <option value="AFRICOM">AFRICOM - Africa Command</option>
              <option value="NORTHCOM">NORTHCOM - Northern Command</option>
              <option value="SOUTHCOM">SOUTHCOM - Southern Command</option>
              <option value="CONUS">CONUS - Continental US</option>
            </select>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-700">
            <strong>Note:</strong> Address will be automatically geocoded via Google Maps to get precise coordinates for route planning and distance calculations.
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
              className="flex-1 py-2.5 text-sm rounded-xl bg-[#2563EB] text-white hover:bg-[#1d4ed8] transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Site
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
