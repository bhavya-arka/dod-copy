import React, { useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ListOrdered,
  ArrowRight,
  Clock,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  Zap,
  Loader2,
  BarChart3,
  TrendingUp,
} from "lucide-react";
import type { ToastMessage } from "./types";
import {
  fetchTransferQueue,
  fetchQueueStats,
  escalateTransfer,
  updateTransferPriority,
  recalculateQueue,
  type QueueTransfer,
  type QueueStats,
  type TransferPriorityLevel,
} from "../../services/warehouseService";

interface PriorityQueueDashboardProps {
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

const PRIORITY_COLORS: Record<TransferPriorityLevel, { bg: string; text: string; border: string }> = {
  routine: { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-300" },
  priority: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-300" },
  immediate: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300" },
  flash: { bg: "bg-red-100", text: "text-red-700", border: "border-red-300" },
};

const PRIORITY_LEVELS: TransferPriorityLevel[] = ["routine", "priority", "immediate", "flash"];

function formatWaitTime(createdAt: string): string {
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  
  if (diffHours < 1) {
    const mins = Math.round(diffMs / (1000 * 60));
    return `${mins}m`;
  } else if (diffHours < 24) {
    return `${Math.round(diffHours)}h`;
  } else {
    const days = Math.round(diffHours / 24);
    return `${days}d`;
  }
}

function formatOldestPending(oldestDate: string | null): string {
  if (!oldestDate) return "N/A";
  const oldest = new Date(oldestDate);
  const now = new Date();
  const diffMs = now.getTime() - oldest.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  
  if (diffHours < 24) {
    return `${Math.round(diffHours)} hours`;
  } else {
    const days = Math.round(diffHours / 24);
    return `${days} days`;
  }
}

export default function PriorityQueueDashboard({ onShowToast }: PriorityQueueDashboardProps) {
  const queryClient = useQueryClient();
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null);

  const { data: queueData = [], isLoading: queueLoading, refetch: refetchQueue } = useQuery<QueueTransfer[]>({
    queryKey: ["warehouse-queue"],
    queryFn: () => fetchTransferQueue({ status: "pending", limit: 100 }),
  });

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<QueueStats>({
    queryKey: ["warehouse-queue-stats"],
    queryFn: fetchQueueStats,
  });

  const escalateMutation = useMutation({
    mutationFn: escalateTransfer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse-queue"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-queue-stats"] });
      onShowToast("Transfer escalated successfully", "success");
    },
    onError: (error: Error) => {
      onShowToast(error.message || "Failed to escalate transfer", "error");
    },
  });

  const priorityMutation = useMutation({
    mutationFn: ({ id, level }: { id: number; level: TransferPriorityLevel }) =>
      updateTransferPriority(id, level),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse-queue"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-queue-stats"] });
      onShowToast("Priority updated successfully", "success");
      setOpenDropdownId(null);
    },
    onError: (error: Error) => {
      onShowToast(error.message || "Failed to update priority", "error");
    },
  });

  const recalculateMutation = useMutation({
    mutationFn: recalculateQueue,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["warehouse-queue"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-queue-stats"] });
      onShowToast(data.message, "success");
    },
    onError: (error: Error) => {
      onShowToast(error.message || "Failed to recalculate queue", "error");
    },
  });

  const handleRefresh = () => {
    refetchQueue();
    refetchStats();
  };

  const handleEscalate = (transferId: number) => {
    escalateMutation.mutate(transferId);
  };

  const handlePriorityChange = (transferId: number, level: TransferPriorityLevel) => {
    priorityMutation.mutate({ id: transferId, level });
  };

  const isLoading = queueLoading || statsLoading;

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Priority Queue</h1>
            <p className="text-muted-foreground">Transfer orders ranked by priority and urgency</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="text-sm px-3 py-2 rounded-lg border border-border bg-white hover:bg-muted transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              onClick={() => recalculateMutation.mutate()}
              disabled={recalculateMutation.isPending}
              className="text-sm px-3 py-2 rounded-lg bg-[#2563EB] text-white hover:bg-[#1d4ed8] transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {recalculateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <TrendingUp className="w-4 h-4" />
              )}
              Recalculate Queue
            </button>
          </div>
        </div>
      </motion.div>

      {statsLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-[#2563EB]" />
        </div>
      ) : stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="p-4 rounded-2xl bg-white border border-border shadow-sm"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-3">
              <ListOrdered className="w-5 h-5 text-[#2563EB]" />
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.total_pending}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Pending</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-4 rounded-2xl bg-white border border-border shadow-sm"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center mb-3">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.avg_wait_hours}h</p>
            <p className="text-xs text-muted-foreground mt-1">Avg Wait Time</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="p-4 rounded-2xl bg-white border border-border shadow-sm"
          >
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center mb-3">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <p className="text-2xl font-bold text-foreground">{formatOldestPending(stats.oldest_pending)}</p>
            <p className="text-xs text-muted-foreground mt-1">Oldest Pending</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="p-4 rounded-2xl bg-white border border-border shadow-sm"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center mb-3">
              <BarChart3 className="w-5 h-5 text-purple-600" />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {PRIORITY_LEVELS.map((level) => {
                const count = stats.by_priority[level] || 0;
                const colors = PRIORITY_COLORS[level];
                return (
                  <span
                    key={level}
                    className={`text-xs px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}
                  >
                    {level.charAt(0).toUpperCase()}: {count}
                  </span>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">By Priority</p>
          </motion.div>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="rounded-2xl bg-white border border-border shadow-sm"
      >
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Transfer Queue</h2>
        </div>

        {queueLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-[#2563EB]" />
          </div>
        ) : queueData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <ListOrdered className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg mb-2">No pending transfers</p>
            <p className="text-sm text-muted-foreground/70">Create a transfer to see it in the queue</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {queueData.map((transfer, index) => {
              const priorityColors = PRIORITY_COLORS[transfer.priority_level || "routine"];
              const isEscalated = !!transfer.escalated_at;
              const queuePosition = transfer.queue_position || index + 1;

              return (
                <div
                  key={transfer.id}
                  className="p-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                        <span className="text-sm font-bold text-foreground">#{queuePosition}</span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-medium text-foreground truncate">
                            {transfer.source_site_name || `Site ${transfer.source_site_id}`}
                          </span>
                          <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium text-foreground truncate">
                            {transfer.destination_site_name || `Site ${transfer.destination_site_id}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityColors.bg} ${priorityColors.text}`}
                          >
                            {(transfer.priority_level || "routine").toUpperCase()}
                          </span>
                          {isEscalated && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                              Escalated
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatWaitTime(transfer.created_at)} wait
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleEscalate(transfer.id)}
                        disabled={escalateMutation.isPending}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors flex items-center gap-1 disabled:opacity-50"
                        title="Escalate this transfer"
                      >
                        <Zap className="w-3 h-3" />
                        Escalate
                      </button>

                      <div className="relative">
                        <button
                          onClick={() => setOpenDropdownId(openDropdownId === transfer.id ? null : transfer.id)}
                          className="text-xs px-2.5 py-1.5 rounded-lg border border-border bg-white text-foreground hover:bg-muted transition-colors flex items-center gap-1"
                        >
                          Priority
                          <ChevronDown className="w-3 h-3" />
                        </button>

                        {openDropdownId === transfer.id && (
                          <div className="absolute right-0 top-full mt-1 w-32 bg-white border border-border rounded-lg shadow-lg z-10">
                            {PRIORITY_LEVELS.map((level) => {
                              const colors = PRIORITY_COLORS[level];
                              const isSelected = transfer.priority_level === level;
                              return (
                                <button
                                  key={level}
                                  onClick={() => handlePriorityChange(transfer.id, level)}
                                  disabled={priorityMutation.isPending}
                                  className={`w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors first:rounded-t-lg last:rounded-b-lg flex items-center justify-between ${
                                    isSelected ? "bg-muted" : ""
                                  }`}
                                >
                                  <span className={`${colors.text} font-medium`}>
                                    {level.charAt(0).toUpperCase() + level.slice(1)}
                                  </span>
                                  {isSelected && (
                                    <span className="text-[#2563EB]">✓</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {openDropdownId !== null && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setOpenDropdownId(null)}
        />
      )}
    </>
  );
}
