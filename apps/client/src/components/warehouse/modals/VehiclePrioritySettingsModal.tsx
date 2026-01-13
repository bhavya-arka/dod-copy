import React, { useState, useEffect } from "react";
import { X, Truck, Loader2, Save, AlertCircle } from "lucide-react";
import {
  getVehicleTypes,
  getVehiclePrioritySettings,
  saveVehiclePrioritySettings,
  type VehicleType,
  type VehiclePrioritySetting,
} from "../../../services/warehouseService";

interface VehiclePrioritySettingsModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface VehiclePriorityRow {
  vehicleType: VehicleType;
  enabled: boolean;
  priority: number;
  payloadOverride: string;
}

export default function VehiclePrioritySettingsModal({
  onClose,
  onSuccess,
}: VehiclePrioritySettingsModalProps) {
  const [vehicleRows, setVehicleRows] = useState<VehiclePriorityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [vehicleTypes, prioritySettings] = await Promise.all([
        getVehicleTypes(),
        getVehiclePrioritySettings().catch(() => [] as VehiclePrioritySetting[]),
      ]);

      const settingsMap = new Map<number, VehiclePrioritySetting>();
      prioritySettings.forEach((s) => settingsMap.set(s.vehicle_type_id, s));

      const rows: VehiclePriorityRow[] = vehicleTypes.map((vt, index) => {
        const setting = settingsMap.get(vt.id);
        return {
          vehicleType: vt,
          enabled: setting?.enabled ?? true,
          priority: setting?.priority ?? index + 1,
          payloadOverride: setting?.payload_override_lbs?.toString() ?? "",
        };
      });

      rows.sort((a, b) => a.priority - b.priority);
      setVehicleRows(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleEnabledChange = (index: number, enabled: boolean) => {
    setVehicleRows((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], enabled };
      return updated;
    });
  };

  const handlePriorityChange = (index: number, value: string) => {
    const priority = parseInt(value, 10);
    if (isNaN(priority) || priority < 1) return;

    setVehicleRows((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], priority };
      return updated;
    });
  };

  const handlePayloadOverrideChange = (index: number, value: string) => {
    setVehicleRows((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], payloadOverride: value };
      return updated;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const settings: VehiclePrioritySetting[] = vehicleRows.map((row) => ({
        vehicle_type_id: row.vehicleType.id,
        enabled: row.enabled,
        priority: row.priority,
        payload_override_lbs: row.payloadOverride
          ? parseInt(row.payloadOverride, 10) || null
          : null,
      }));

      await saveVehiclePrioritySettings(settings);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const formatNumber = (num: number | null | undefined) => {
    return num?.toLocaleString() ?? '0';
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#2563EB]/10">
              <Truck className="w-5 h-5 text-[#2563EB]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Vehicle Priority Settings
              </h2>
              <p className="text-sm text-muted-foreground">
                Configure which vehicles are used first when calculating ground
                transport requirements. Lower priority numbers are used first.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#2563EB]" />
            </div>
          ) : error && vehicleRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
              <p className="text-red-600 font-medium">{error}</p>
              <button
                onClick={fetchData}
                className="mt-4 px-4 py-2 text-sm rounded-lg bg-[#2563EB] text-white hover:bg-[#1d4ed8] transition-colors"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b border-border">
                <div className="col-span-1">Enable</div>
                <div className="col-span-2">Priority</div>
                <div className="col-span-4">Vehicle</div>
                <div className="col-span-2 text-right">Capacity (lbs)</div>
                <div className="col-span-3">Override (lbs)</div>
              </div>

              {vehicleRows.map((row, index) => (
                <div
                  key={row.vehicleType.id}
                  className={`grid grid-cols-12 gap-2 px-3 py-3 rounded-lg border transition-colors ${
                    row.enabled
                      ? "bg-white border-border hover:border-[#2563EB]/30"
                      : "bg-muted/50 border-border/50"
                  }`}
                >
                  <div className="col-span-1 flex items-center">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={(e) =>
                        handleEnabledChange(index, e.target.checked)
                      }
                      className="w-4 h-4 rounded border-border text-[#2563EB] focus:ring-[#2563EB]/40"
                    />
                  </div>

                  <div className="col-span-2">
                    <input
                      type="number"
                      min="1"
                      value={row.priority}
                      onChange={(e) =>
                        handlePriorityChange(index, e.target.value)
                      }
                      disabled={!row.enabled}
                      className="w-full px-2 py-1.5 rounded-lg border border-border bg-white text-sm focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]/40 disabled:bg-muted disabled:text-muted-foreground"
                    />
                  </div>

                  <div className="col-span-4 flex flex-col justify-center">
                    <span
                      className={`font-medium text-sm ${
                        row.enabled ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {row.vehicleType.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {row.vehicleType.code}
                    </span>
                  </div>

                  <div className="col-span-2 flex items-center justify-end">
                    <span
                      className={`text-sm ${
                        row.enabled ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {formatNumber(row.vehicleType.payload_capacity_lbs)}
                    </span>
                  </div>

                  <div className="col-span-3">
                    <input
                      type="number"
                      min="0"
                      placeholder="Optional"
                      value={row.payloadOverride}
                      onChange={(e) =>
                        handlePayloadOverrideChange(index, e.target.value)
                      }
                      disabled={!row.enabled}
                      className="w-full px-2 py-1.5 rounded-lg border border-border bg-white text-sm focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]/40 disabled:bg-muted disabled:text-muted-foreground placeholder:text-muted-foreground/60"
                    />
                  </div>
                </div>
              ))}

              {vehicleRows.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No vehicle types found. Please configure vehicle types first.
                </div>
              )}
            </div>
          )}

          {error && vehicleRows.length > 0 && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading || saving || vehicleRows.length === 0}
            className="px-4 py-2 text-sm rounded-lg bg-[#2563EB] text-white hover:bg-[#1d4ed8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
