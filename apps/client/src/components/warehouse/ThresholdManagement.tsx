import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Settings,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  Loader2,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import {
  fetchThresholds,
  createThreshold,
  updateThreshold,
  deleteThreshold,
  fetchSites,
  type InventoryThreshold,
  type CreateThresholdData,
} from "../../services/warehouseService";
import type { ToastMessage, WarehouseSite } from "./types";

interface ThresholdManagementProps {
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

interface ThresholdFormData {
  siteId: number | "";
  nsn: string;
  minThreshold: number | "";
  maxThreshold: number | "";
  reorderPoint: number | "";
}

const emptyForm: ThresholdFormData = {
  siteId: "",
  nsn: "",
  minThreshold: "",
  maxThreshold: "",
  reorderPoint: "",
};

export default function ThresholdManagement({
  onShowToast,
}: ThresholdManagementProps) {
  const [loading, setLoading] = useState(true);
  const [thresholds, setThresholds] = useState<InventoryThreshold[]>([]);
  const [sites, setSites] = useState<WarehouseSite[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<ThresholdFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [thresholdsData, sitesData] = await Promise.all([
        fetchThresholds(),
        fetchSites(),
      ]);
      setThresholds(thresholdsData);
      setSites(sitesData);
    } catch (error) {
      console.error("Failed to load thresholds:", error);
      onShowToast("Failed to load threshold data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleInputChange = (
    field: keyof ThresholdFormData,
    value: string | number
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const validateForm = (): string | null => {
    if (!formData.siteId) return "Please select a site";
    if (!formData.nsn.trim()) return "NSN is required";
    if (formData.minThreshold === "" || formData.minThreshold < 0)
      return "Min threshold must be >= 0";
    if (formData.maxThreshold === "" || formData.maxThreshold < 0)
      return "Max threshold must be >= 0";
    if (formData.reorderPoint === "" || formData.reorderPoint < 0)
      return "Reorder point must be >= 0";
    if (Number(formData.minThreshold) > Number(formData.reorderPoint))
      return "Min threshold cannot be greater than reorder point";
    if (Number(formData.reorderPoint) > Number(formData.maxThreshold))
      return "Reorder point cannot be greater than max threshold";
    return null;
  };

  const handleSave = async () => {
    const error = validateForm();
    if (error) {
      onShowToast(error, "error");
      return;
    }

    setSaving(true);
    try {
      const data: CreateThresholdData = {
        siteId: formData.siteId as number,
        nsn: formData.nsn.trim(),
        minThreshold: Number(formData.minThreshold),
        maxThreshold: Number(formData.maxThreshold),
        reorderPoint: Number(formData.reorderPoint),
      };

      if (editingId) {
        await updateThreshold(editingId, data);
        onShowToast("Threshold updated successfully", "success");
      } else {
        await createThreshold(data);
        onShowToast("Threshold created successfully", "success");
      }

      setFormData(emptyForm);
      setShowAddForm(false);
      setEditingId(null);
      await loadData();
    } catch (error) {
      console.error("Failed to save threshold:", error);
      onShowToast("Failed to save threshold", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (threshold: InventoryThreshold) => {
    setFormData({
      siteId: threshold.siteId,
      nsn: threshold.nsn,
      minThreshold: threshold.minThreshold,
      maxThreshold: threshold.maxThreshold,
      reorderPoint: threshold.reorderPoint,
    });
    setEditingId(threshold.id);
    setShowAddForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this threshold?")) return;

    setDeletingId(id);
    try {
      await deleteThreshold(id);
      onShowToast("Threshold deleted successfully", "success");
      await loadData();
    } catch (error) {
      console.error("Failed to delete threshold:", error);
      onShowToast("Failed to delete threshold", "error");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCancel = () => {
    setFormData(emptyForm);
    setShowAddForm(false);
    setEditingId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-3 text-slate-400">Loading thresholds...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Settings className="w-7 h-7 text-blue-500" />
            Threshold Management
          </h1>
          <p className="text-slate-400 mt-1">
            Configure inventory min/max thresholds and reorder points
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Threshold
            </button>
          )}
        </div>
      </motion.div>

      {showAddForm && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-slate-800 border border-slate-700 p-6"
        >
          <h2 className="text-lg font-semibold text-white mb-4">
            {editingId ? "Edit Threshold" : "Add New Threshold"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Site</label>
              <select
                value={formData.siteId}
                onChange={(e) =>
                  handleInputChange(
                    "siteId",
                    e.target.value ? Number(e.target.value) : ""
                  )
                }
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!!editingId}
              >
                <option value="">Select site...</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.code} - {site.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">NSN</label>
              <input
                type="text"
                value={formData.nsn}
                onChange={(e) => handleInputChange("nsn", e.target.value)}
                placeholder="1234-56-789-0123"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!!editingId}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Min Threshold
              </label>
              <input
                type="number"
                min="0"
                value={formData.minThreshold}
                onChange={(e) =>
                  handleInputChange(
                    "minThreshold",
                    e.target.value ? Number(e.target.value) : ""
                  )
                }
                placeholder="0"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Reorder Point
              </label>
              <input
                type="number"
                min="0"
                value={formData.reorderPoint}
                onChange={(e) =>
                  handleInputChange(
                    "reorderPoint",
                    e.target.value ? Number(e.target.value) : ""
                  )
                }
                placeholder="10"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Max Threshold
              </label>
              <input
                type="number"
                min="0"
                value={formData.maxThreshold}
                onChange={(e) =>
                  handleInputChange(
                    "maxThreshold",
                    e.target.value ? Number(e.target.value) : ""
                  )
                }
                placeholder="100"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 mt-4">
            <button
              onClick={handleCancel}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {editingId ? "Update" : "Save"}
            </button>
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl bg-slate-800 border border-slate-700 overflow-hidden"
      >
        <div className="p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">
            Configured Thresholds
          </h2>
          <p className="text-sm text-slate-400">
            {thresholds.length} threshold{thresholds.length !== 1 ? "s" : ""}{" "}
            configured
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-900/50">
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-300 border-b border-slate-700">
                  Site
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-300 border-b border-slate-700">
                  NSN
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-300 border-b border-slate-700">
                  Description
                </th>
                <th className="text-center px-4 py-3 text-sm font-medium text-slate-300 border-b border-slate-700">
                  Min
                </th>
                <th className="text-center px-4 py-3 text-sm font-medium text-slate-300 border-b border-slate-700">
                  Reorder
                </th>
                <th className="text-center px-4 py-3 text-sm font-medium text-slate-300 border-b border-slate-700">
                  Max
                </th>
                <th className="text-right px-4 py-3 text-sm font-medium text-slate-300 border-b border-slate-700">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {thresholds.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-slate-400"
                  >
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No thresholds configured</p>
                    <p className="text-sm mt-1">
                      Add thresholds to monitor inventory levels across sites
                    </p>
                  </td>
                </tr>
              ) : (
                thresholds.map((threshold, idx) => (
                  <tr
                    key={threshold.id}
                    className={`${idx % 2 === 0 ? "bg-slate-800/50" : "bg-slate-800"} hover:bg-slate-700/50 transition-colors`}
                  >
                    <td className="px-4 py-3 border-b border-slate-700">
                      <div className="text-sm font-medium text-white">
                        {threshold.siteCode}
                      </div>
                      <div className="text-xs text-slate-400">
                        {threshold.siteName}
                      </div>
                    </td>
                    <td className="px-4 py-3 border-b border-slate-700">
                      <span className="text-sm font-mono text-white">
                        {threshold.nsn}
                      </span>
                    </td>
                    <td className="px-4 py-3 border-b border-slate-700">
                      <span className="text-sm text-slate-300 truncate max-w-[150px] block">
                        {threshold.description || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center border-b border-slate-700">
                      <span className="inline-flex items-center px-2 py-1 rounded bg-red-500/20 text-red-400 text-sm">
                        {threshold.minThreshold}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center border-b border-slate-700">
                      <span className="inline-flex items-center px-2 py-1 rounded bg-yellow-500/20 text-yellow-400 text-sm">
                        {threshold.reorderPoint}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center border-b border-slate-700">
                      <span className="inline-flex items-center px-2 py-1 rounded bg-blue-500/20 text-blue-400 text-sm">
                        {threshold.maxThreshold}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right border-b border-slate-700">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(threshold)}
                          className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(threshold.id)}
                          disabled={deletingId === threshold.id}
                          className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          {deletingId === threshold.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-xl bg-slate-800/50 border border-slate-700 p-4"
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-white">
              Threshold Guidelines
            </h3>
            <ul className="mt-2 text-sm text-slate-400 space-y-1 list-disc list-inside">
              <li>
                <strong className="text-red-400">Min Threshold</strong>: Critical
                level - triggers urgent alerts
              </li>
              <li>
                <strong className="text-yellow-400">Reorder Point</strong>:
                Triggers reorder recommendation when stock falls below
              </li>
              <li>
                <strong className="text-blue-400">Max Threshold</strong>: Upper
                limit - excess above this is flagged as surplus
              </li>
              <li>
                Values should follow: Min {"<="} Reorder {"<="} Max
              </li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
