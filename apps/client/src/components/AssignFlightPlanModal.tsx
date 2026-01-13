import React, { useState, useEffect } from "react";
import { X, Loader2, Plane, Check } from "lucide-react";
import {
  getFlightPlans,
  assignFlightPlanToTransfer,
  FlightPlan,
  PendingAirTransfer,
} from "../services/flightService";

interface AssignFlightPlanModalProps {
  transfer: PendingAirTransfer;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AssignFlightPlanModal({
  transfer,
  onClose,
  onSuccess,
}: AssignFlightPlanModalProps) {
  const [flightPlans, setFlightPlans] = useState<FlightPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const plans = await getFlightPlans();
        setFlightPlans(plans);
      } catch (err) {
        console.error("Failed to fetch flight plans:", err);
        setError("Failed to load flight plans");
      } finally {
        setLoading(false);
      }
    };
    fetchPlans();
  }, []);

  const handleAssign = async () => {
    if (!selectedPlanId) {
      setError("Please select a flight plan");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await assignFlightPlanToTransfer(transfer.id, selectedPlanId);
      onSuccess();
    } catch (err) {
      console.error("Failed to assign flight plan:", err);
      setError(err instanceof Error ? err.message : "Failed to assign flight plan");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-xl mx-4 p-6 max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
              <Plane className="w-5 h-5 text-blue-600" />
              Assign Flight Plan
            </h2>
            <p className="text-sm text-neutral-500 mt-1">
              Transfer #{transfer.id}: {transfer.source_site?.name || "Unknown"} →{" "}
              {transfer.destination_site?.name || "Unknown"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <span className="ml-2 text-neutral-500">Loading flight plans...</span>
            </div>
          ) : flightPlans.length === 0 ? (
            <div className="text-center py-12">
              <Plane className="w-12 h-12 mx-auto text-neutral-300 mb-4" />
              <p className="text-neutral-500">No flight plans available</p>
              <p className="text-sm text-neutral-400 mt-1">
                Create a flight plan first to assign to this transfer
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {flightPlans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition ${
                    selectedPlanId === plan.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-neutral-200 hover:border-blue-300 hover:bg-neutral-50"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-neutral-900 truncate">
                          {plan.name}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            plan.status === "complete"
                              ? "bg-green-100 text-green-700"
                              : plan.status === "draft"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-neutral-100 text-neutral-600"
                          }`}
                        >
                          {plan.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2 text-xs text-neutral-500">
                        <span className="bg-neutral-100 px-2 py-0.5 rounded">
                          {plan.movement_items_count} items
                        </span>
                        <span className="bg-neutral-100 px-2 py-0.5 rounded">
                          {(plan.total_weight_lb / 1000).toFixed(1)}K lbs
                        </span>
                        <span className="bg-neutral-100 px-2 py-0.5 rounded">
                          {plan.aircraft_count} aircraft
                        </span>
                        <span className="text-neutral-400">
                          Updated {formatDate(plan.updated_at)}
                        </span>
                      </div>
                    </div>
                    {selectedPlanId === plan.id && (
                      <div className="ml-2 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-4 mt-4 border-t border-neutral-200">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 text-sm rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAssign}
            disabled={!selectedPlanId || submitting || loading}
            className={`flex-1 py-2.5 text-sm rounded-xl font-medium transition flex items-center justify-center gap-2 ${
              selectedPlanId && !submitting
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-neutral-200 text-neutral-400 cursor-not-allowed"
            }`}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Assigning...
              </>
            ) : (
              <>
                <Plane className="w-4 h-4" />
                Assign Flight Plan
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
