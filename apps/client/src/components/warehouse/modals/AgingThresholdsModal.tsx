import React, { useState, useEffect } from "react";
import { X, Calendar, Plus, Trash2, Edit2, Check, Loader2 } from "lucide-react";

interface AgingThreshold {
  id: number;
  name: string;
  days: number;
  color: string;
}

interface AgingThresholdsModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const COLOR_OPTIONS = [
  { value: "#22c55e", label: "Green" },
  { value: "#fbbf24", label: "Yellow" },
  { value: "#f97316", label: "Orange" },
  { value: "#ef4444", label: "Red" },
  { value: "#8b5cf6", label: "Purple" },
  { value: "#3b82f6", label: "Blue" },
];

export default function AgingThresholdsModal({ onClose, onSuccess }: AgingThresholdsModalProps) {
  const [thresholds, setThresholds] = useState<AgingThreshold[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", days: "", color: "#fbbf24" });
  const [showAddForm, setShowAddForm] = useState(false);
  const [newThreshold, setNewThreshold] = useState({ name: "", days: "", color: "#fbbf24" });

  useEffect(() => {
    fetchThresholds();
  }, []);

  const fetchThresholds = async () => {
    try {
      const response = await fetch("/api/warehouse/aging-thresholds", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setThresholds(data);
      }
    } catch (err) {
      console.error("Failed to fetch thresholds:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newThreshold.name || !newThreshold.days) {
      setError("Name and days are required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/warehouse/aging-thresholds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: newThreshold.name,
          days: parseInt(newThreshold.days),
          color: newThreshold.color,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create threshold");
      }

      const created = await response.json();
      setThresholds([...thresholds, created].sort((a, b) => a.days - b.days));
      setNewThreshold({ name: "", days: "", color: "#fbbf24" });
      setShowAddForm(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create threshold");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (threshold: AgingThreshold) => {
    setEditingId(threshold.id);
    setEditForm({
      name: threshold.name,
      days: threshold.days.toString(),
      color: threshold.color,
    });
  };

  const handleSaveEdit = async () => {
    if (!editForm.name || !editForm.days || editingId === null) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/warehouse/aging-thresholds/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: editForm.name,
          days: parseInt(editForm.days),
          color: editForm.color,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update threshold");
      }

      const updated = await response.json();
      setThresholds(
        thresholds
          .map((t) => (t.id === editingId ? updated : t))
          .sort((a, b) => a.days - b.days)
      );
      setEditingId(null);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update threshold");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (id === 0) {
      setError("Cannot delete default thresholds. Create custom ones first.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/warehouse/aging-thresholds/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete threshold");
      }

      setThresholds(thresholds.filter((t) => t.id !== id));
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete threshold");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#2563EB]/10">
              <Calendar className="w-5 h-5 text-[#2563EB]" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Aging Thresholds</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-sm text-muted-foreground mb-4">
            Configure thresholds to trigger aging alerts for inventory items based on their age in days.
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-[#2563EB]" />
            </div>
          ) : (
            <div className="space-y-3">
              {thresholds.map((threshold) => (
                <div
                  key={threshold.id}
                  className="p-3 rounded-xl bg-muted/50 border border-border"
                >
                  {editingId === threshold.id ? (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          placeholder="Name"
                          className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-white text-sm focus:outline-none focus:border-[#2563EB]"
                        />
                        <input
                          type="number"
                          value={editForm.days}
                          onChange={(e) => setEditForm({ ...editForm, days: e.target.value })}
                          placeholder="Days"
                          className="w-20 px-3 py-1.5 rounded-lg border border-border bg-white text-sm focus:outline-none focus:border-[#2563EB]"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex gap-1">
                          {COLOR_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => setEditForm({ ...editForm, color: opt.value })}
                              className={`w-6 h-6 rounded-full border-2 ${
                                editForm.color === opt.value ? "border-gray-800" : "border-transparent"
                              }`}
                              style={{ backgroundColor: opt.value }}
                            />
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1 text-xs rounded-lg border border-border hover:bg-white"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveEdit}
                            disabled={saving}
                            className="px-3 py-1 text-xs rounded-lg bg-[#2563EB] text-white hover:bg-[#1d4ed8] disabled:opacity-50"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: threshold.color }}
                        />
                        <div>
                          <p className="font-medium text-foreground">{threshold.name}</p>
                          <p className="text-xs text-muted-foreground">{threshold.days} days</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEdit(threshold)}
                          className="p-1.5 rounded-lg hover:bg-white transition-colors"
                        >
                          <Edit2 className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => handleDelete(threshold.id)}
                          disabled={threshold.id === 0}
                          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {showAddForm && (
                <div className="p-3 rounded-xl bg-[#2563EB]/5 border border-[#2563EB]/20 space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newThreshold.name}
                      onChange={(e) => setNewThreshold({ ...newThreshold, name: e.target.value })}
                      placeholder="Threshold name"
                      className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-white text-sm focus:outline-none focus:border-[#2563EB]"
                    />
                    <input
                      type="number"
                      value={newThreshold.days}
                      onChange={(e) => setNewThreshold({ ...newThreshold, days: e.target.value })}
                      placeholder="Days"
                      className="w-20 px-3 py-1.5 rounded-lg border border-border bg-white text-sm focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1">
                      {COLOR_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setNewThreshold({ ...newThreshold, color: opt.value })}
                          className={`w-6 h-6 rounded-full border-2 ${
                            newThreshold.color === opt.value ? "border-gray-800" : "border-transparent"
                          }`}
                          style={{ backgroundColor: opt.value }}
                        />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setShowAddForm(false);
                          setNewThreshold({ name: "", days: "", color: "#fbbf24" });
                        }}
                        className="px-3 py-1 text-xs rounded-lg border border-border hover:bg-white"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAdd}
                        disabled={saving}
                        className="px-3 py-1 text-xs rounded-lg bg-[#2563EB] text-white hover:bg-[#1d4ed8] disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-4 border-t border-border">
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB]/5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Threshold
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg bg-[#2563EB] text-white hover:bg-[#1d4ed8] transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
