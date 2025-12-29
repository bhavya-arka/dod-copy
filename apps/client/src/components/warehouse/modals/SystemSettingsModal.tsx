import React, { useState, useEffect } from "react";
import { X, Settings, Loader2 } from "lucide-react";

interface SystemSettings {
  timezone: string;
  date_format: string;
  weight_unit: string;
  default_page_size: number;
}

interface SystemSettingsModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Singapore",
  "Australia/Sydney",
];

const DATE_FORMATS = [
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY (US)" },
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY (EU)" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (ISO)" },
];

const WEIGHT_UNITS = [
  { value: "lbs", label: "Pounds (lbs)" },
  { value: "kg", label: "Kilograms (kg)" },
];

const PAGE_SIZES = [10, 25, 50, 100];

export default function SystemSettingsModal({ onClose, onSuccess }: SystemSettingsModalProps) {
  const [settings, setSettings] = useState<SystemSettings>({
    timezone: "UTC",
    date_format: "MM/DD/YYYY",
    weight_unit: "lbs",
    default_page_size: 25,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/warehouse/settings", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setSettings({
          timezone: data.timezone || "UTC",
          date_format: data.date_format || "MM/DD/YYYY",
          weight_unit: data.weight_unit || "lbs",
          default_page_size: data.default_page_size || 25,
        });
      }
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/warehouse/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save settings");
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#004E89]/10">
              <Settings className="w-5 h-5 text-[#004E89]" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">System Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-[#004E89]" />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Default Timezone
                </label>
                <select
                  value={settings.timezone}
                  onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-muted text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Date Format
                </label>
                <select
                  value={settings.date_format}
                  onChange={(e) => setSettings({ ...settings, date_format: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-muted text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
                >
                  {DATE_FORMATS.map((fmt) => (
                    <option key={fmt.value} value={fmt.value}>{fmt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Weight Unit
                </label>
                <select
                  value={settings.weight_unit}
                  onChange={(e) => setSettings({ ...settings, weight_unit: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-muted text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
                >
                  {WEIGHT_UNITS.map((unit) => (
                    <option key={unit.value} value={unit.value}>{unit.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Default Page Size (Inventory)
                </label>
                <select
                  value={settings.default_page_size}
                  onChange={(e) => setSettings({ ...settings, default_page_size: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-muted text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>{size} items per page</option>
                  ))}
                </select>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  {error}
                </div>
              )}
            </>
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
            disabled={loading || saving}
            className="px-4 py-2 text-sm rounded-lg bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
