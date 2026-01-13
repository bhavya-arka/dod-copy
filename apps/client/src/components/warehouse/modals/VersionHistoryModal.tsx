import React, { useState, useEffect } from "react";
import { X, Loader2, RotateCcw, ChevronRight, Clock, Package, AlertTriangle, CheckCircle, History } from "lucide-react";
import type { ToastMessage } from "../types";
import { 
  getWarehouseVersions, 
  getWarehouseVersionDetails, 
  revertWarehouseVersion,
  type WarehouseStateVersion,
  type WarehouseItemVersion
} from "../../../services/warehouseService";

interface VersionHistoryModalProps {
  siteId: number;
  siteName: string;
  onClose: () => void;
  onSuccess: () => void;
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

export function VersionHistoryModal({
  siteId,
  siteName,
  onClose,
  onSuccess,
  onShowToast,
}: VersionHistoryModalProps) {
  const [versions, setVersions] = useState<WarehouseStateVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState<WarehouseStateVersion | null>(null);
  const [itemChanges, setItemChanges] = useState<WarehouseItemVersion[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState<number | null>(null);

  useEffect(() => {
    loadVersions();
  }, [siteId]);

  async function loadVersions() {
    try {
      setLoading(true);
      const data = await getWarehouseVersions(siteId);
      setVersions(data);
    } catch (error) {
      onShowToast("Failed to load version history", "error");
    } finally {
      setLoading(false);
    }
  }

  async function loadVersionDetails(version: WarehouseStateVersion) {
    try {
      setLoadingDetails(true);
      setSelectedVersion(version);
      const data = await getWarehouseVersionDetails(siteId, version.id);
      setItemChanges(data.itemChanges);
    } catch (error) {
      onShowToast("Failed to load version details", "error");
    } finally {
      setLoadingDetails(false);
    }
  }

  async function handleRevert(versionId: number) {
    try {
      setReverting(true);
      const result = await revertWarehouseVersion(siteId, versionId);
      onShowToast(result.message, "success");
      setConfirmRevert(null);
      setSelectedVersion(null);
      loadVersions();
      onSuccess();
    } catch (error) {
      onShowToast(error instanceof Error ? error.message : "Failed to revert version", "error");
    } finally {
      setReverting(false);
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getSourceIcon(sourceType: string) {
    switch (sourceType) {
      case "optimization":
        return <Package className="w-4 h-4 text-blue-500" />;
      case "revert":
        return <RotateCcw className="w-4 h-4 text-amber-500" />;
      default:
        return <History className="w-4 h-4 text-gray-500" />;
    }
  }

  function getStatusBadge(status: string) {
    if (status === "reverted") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
          <RotateCcw className="w-3 h-3" />
          Reverted
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
        <CheckCircle className="w-3 h-3" />
        Active
      </span>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Version History</h2>
            <p className="text-sm text-gray-500">{siteName} - Optimization snapshots and rollback</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="w-1/2 border-r border-gray-200 overflow-y-auto">
            <div className="p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                {versions.length} Version{versions.length !== 1 ? "s" : ""}
              </h3>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : versions.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <History className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">No version history</p>
                  <p className="text-sm mt-1">Apply an optimization to create a version snapshot</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {versions.map((version) => (
                    <button
                      key={version.id}
                      onClick={() => loadVersionDetails(version)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedVersion?.id === version.id
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-2">
                          {getSourceIcon(version.source_type)}
                          <div>
                            <p className="font-medium text-gray-900 text-sm">{version.name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{version.description}</p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Clock className="w-3 h-3" />
                          {formatDate(version.created_at)}
                        </div>
                        {getStatusBadge(version.status)}
                      </div>
                      <div className="mt-1 text-xs text-gray-600">
                        {version.items_affected} item{version.items_affected !== 1 ? "s" : ""} affected
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="w-1/2 overflow-y-auto bg-gray-50">
            {selectedVersion ? (
              <div className="p-4">
                <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{selectedVersion.name}</h3>
                      <p className="text-sm text-gray-500 mt-1">{selectedVersion.description}</p>
                    </div>
                    {getStatusBadge(selectedVersion.status)}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">Created:</span>
                      <p className="font-medium">{formatDate(selectedVersion.created_at)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Items affected:</span>
                      <p className="font-medium">{selectedVersion.items_affected}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Type:</span>
                      <p className="font-medium capitalize">{selectedVersion.source_type}</p>
                    </div>
                    {selectedVersion.reverted_at && (
                      <div>
                        <span className="text-gray-500">Reverted:</span>
                        <p className="font-medium">{formatDate(selectedVersion.reverted_at)}</p>
                      </div>
                    )}
                  </div>

                  {selectedVersion.status === "active" && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      {confirmRevert === selectedVersion.id ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                          <div className="flex items-start gap-2 mb-3">
                            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                            <div>
                              <p className="font-medium text-amber-800">Confirm Revert</p>
                              <p className="text-sm text-amber-700 mt-1">
                                This will restore {selectedVersion.items_affected} items to their previous locations.
                                This action creates a new version for tracking.
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleRevert(selectedVersion.id)}
                              disabled={reverting}
                              className="flex-1 px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm font-medium"
                            >
                              {reverting ? (
                                <span className="flex items-center justify-center gap-2">
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Reverting...
                                </span>
                              ) : (
                                "Yes, Revert"
                              )}
                            </button>
                            <button
                              onClick={() => setConfirmRevert(null)}
                              disabled={reverting}
                              className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmRevert(selectedVersion.id)}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 font-medium text-sm"
                        >
                          <RotateCcw className="w-4 h-4" />
                          Revert This Version
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-lg border border-gray-200">
                  <div className="px-4 py-3 border-b border-gray-200">
                    <h4 className="font-medium text-gray-900">Item Changes</h4>
                  </div>
                  {loadingDetails ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                    </div>
                  ) : itemChanges.length === 0 ? (
                    <div className="py-8 text-center text-gray-500 text-sm">No item changes recorded</div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-4 py-2 text-left font-medium text-gray-600">Item</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-600">From</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-600">To</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {itemChanges.map((change) => (
                            <tr key={change.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2 font-mono text-xs text-gray-900">
                                {change.requisition_no || `ID: ${change.item_id}`}
                              </td>
                              <td className="px-4 py-2 text-gray-600">{change.from_location || "-"}</td>
                              <td className="px-4 py-2 text-gray-600">{change.to_location || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <ChevronRight className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">Select a version to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
