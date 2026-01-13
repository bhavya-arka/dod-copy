import React, { useState, useEffect } from "react";
import { 
  X, 
  Loader2, 
  Check, 
  Clock, 
  Play, 
  SkipForward, 
  ArrowRight, 
  Package, 
  MapPin, 
  AlertCircle,
  Calendar,
  Layers,
  CheckCircle2,
  XCircle,
  PlayCircle,
  Target,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Boxes,
  FolderOpen
} from "lucide-react";
import { 
  updateOptimizationAction, 
  getOptimizationPlan,
  setOptimizationPlanTargetDate,
  startAllOptimizationActions,
  type OptimizationPlan, 
  type OptimizationPlanAction 
} from "../../../services/warehouseService";
import type { ToastMessage } from "../types";

interface PlanActionsModalProps {
  plan: OptimizationPlan | null;
  onClose: () => void;
  onActionUpdate: () => void;
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

export default function PlanActionsModal({
  plan,
  onClose,
  onActionUpdate,
  onShowToast,
}: PlanActionsModalProps) {
  const [currentPlan, setCurrentPlan] = useState<OptimizationPlan | null>(plan);
  const [loading, setLoading] = useState(false);
  const [actionNotes, setActionNotes] = useState<Record<number, string>>({});
  const [activeNoteInput, setActiveNoteInput] = useState<number | null>(null);
  const [processingActions, setProcessingActions] = useState<Set<number>>(new Set());
  const [startingAll, setStartingAll] = useState(false);
  const [settingTargetDate, setSettingTargetDate] = useState(false);
  const [editingTargetDate, setEditingTargetDate] = useState(false);
  const [targetDateInput, setTargetDateInput] = useState<string>("");
  const [showImpactMetrics, setShowImpactMetrics] = useState(true);

  useEffect(() => {
    setCurrentPlan(plan);
    if (plan?.id) {
      refreshPlan();
    }
  }, [plan]);

  useEffect(() => {
    if (currentPlan?.target_completion_date) {
      const date = new Date(currentPlan.target_completion_date);
      setTargetDateInput(date.toISOString().split('T')[0]);
    } else {
      setTargetDateInput("");
    }
  }, [currentPlan?.target_completion_date]);

  const refreshPlan = async () => {
    if (!plan?.id) return;
    setLoading(true);
    try {
      const updatedPlan = await getOptimizationPlan(plan.id);
      setCurrentPlan(updatedPlan);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "Failed to refresh plan", "error");
    } finally {
      setLoading(false);
    }
  };

  if (!currentPlan) return null;

  const actions = currentPlan.actions || [];
  const sortedActions = [...actions].sort((a, b) => a.sequence - b.sequence);

  const handleUpdateAction = async (
    actionId: number, 
    status: 'in_progress' | 'completed' | 'skipped',
    notes?: string
  ) => {
    console.log('[PlanActionsModal] handleUpdateAction called:', { actionId, status, planId: currentPlan.id });
    setProcessingActions(prev => new Set(prev).add(actionId));
    try {
      console.log('[PlanActionsModal] Calling updateOptimizationAction...');
      await updateOptimizationAction(currentPlan.id, actionId, { 
        status, 
        notes: notes || actionNotes[actionId] 
      });
      
      console.log('[PlanActionsModal] Action updated successfully');
      const statusLabel = status === 'in_progress' ? 'started' : status;
      onShowToast(`Action ${statusLabel} successfully`, "success");
      await refreshPlan();
      onActionUpdate();
      setActiveNoteInput(null);
      setActionNotes(prev => ({ ...prev, [actionId]: '' }));
    } catch (err) {
      console.error('[PlanActionsModal] Error updating action:', err);
      onShowToast(err instanceof Error ? err.message : "Failed to update action", "error");
    } finally {
      setProcessingActions(prev => {
        const next = new Set(prev);
        next.delete(actionId);
        return next;
      });
    }
  };

  const handleBatchComplete = async () => {
    const inProgressActions = sortedActions.filter(a => a.status === 'in_progress');
    if (inProgressActions.length === 0) return;
    
    setLoading(true);
    try {
      const results = await Promise.allSettled(
        inProgressActions.map(action => 
          updateOptimizationAction(currentPlan.id, action.id, { status: 'completed' })
        )
      );
      
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      if (failed > 0) {
        onShowToast(`Completed ${succeeded} actions, ${failed} failed`, failed === inProgressActions.length ? "error" : "warning");
      } else {
        onShowToast(`${succeeded} actions marked complete`, "success");
      }
      
      await refreshPlan();
      onActionUpdate();
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "Failed to complete actions", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSkipRemaining = async () => {
    const pendingActions = sortedActions.filter(a => a.status === 'pending');
    if (pendingActions.length === 0) return;
    
    setLoading(true);
    try {
      const results = await Promise.allSettled(
        pendingActions.map(action => 
          updateOptimizationAction(currentPlan.id, action.id, { status: 'skipped' })
        )
      );
      
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      if (failed > 0) {
        onShowToast(`Skipped ${succeeded} actions, ${failed} failed`, failed === pendingActions.length ? "error" : "warning");
      } else {
        onShowToast(`${succeeded} actions skipped`, "success");
      }
      
      await refreshPlan();
      onActionUpdate();
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "Failed to skip actions", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleStartAll = async () => {
    if (pendingCount === 0) return;
    
    setStartingAll(true);
    try {
      const result = await startAllOptimizationActions(currentPlan.id);
      onShowToast(`Started ${result.started_count} actions`, "success");
      setCurrentPlan({ ...result.plan, actions: result.actions });
      onActionUpdate();
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "Failed to start all actions", "error");
    } finally {
      setStartingAll(false);
    }
  };

  const handleSetTargetDate = async () => {
    if (!targetDateInput) {
      onShowToast("Please select a target date", "warning");
      return;
    }
    
    setSettingTargetDate(true);
    try {
      const targetDate = new Date(targetDateInput).toISOString();
      const updatedPlan = await setOptimizationPlanTargetDate(currentPlan.id, targetDate);
      setCurrentPlan({ ...currentPlan, target_completion_date: updatedPlan.target_completion_date });
      setEditingTargetDate(false);
      onShowToast("Target completion date set successfully", "success");
      onActionUpdate();
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "Failed to set target date", "error");
    } finally {
      setSettingTargetDate(false);
    }
  };

  const handleClearTargetDate = async () => {
    setSettingTargetDate(true);
    try {
      const updatedPlan = await setOptimizationPlanTargetDate(currentPlan.id, null);
      setCurrentPlan({ ...currentPlan, target_completion_date: null });
      setTargetDateInput("");
      setEditingTargetDate(false);
      onShowToast("Target date cleared", "success");
      onActionUpdate();
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "Failed to clear target date", "error");
    } finally {
      setSettingTargetDate(false);
    }
  };

  const getStatusBadge = (status: OptimizationPlanAction['status']) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            <Play className="w-3 h-3" />
            In Progress
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <Check className="w-3 h-3" />
            Completed
          </span>
        );
      case 'skipped':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700/50 dark:text-gray-400">
            <SkipForward className="w-3 h-3" />
            Skipped
          </span>
        );
    }
  };

  const getPlanStatusBadge = (status: OptimizationPlan['status']) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            <Play className="w-3 h-3" />
            In Progress
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle2 className="w-3 h-3" />
            Completed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            <XCircle className="w-3 h-3" />
            Cancelled
          </span>
        );
    }
  };

  const formatActionType = (type: string): string => {
    const types: Record<string, string> = {
      move: 'Move',
      consolidate: 'Consolidate',
      reposition: 'Reposition',
    };
    return types[type.toLowerCase()] || type;
  };

  const formatAlgorithm = (algorithm: string): string => {
    const algorithms: Record<string, string> = {
      cardstack: 'CardStack',
      size_standardization: 'Size Standardization',
      value_density: 'Value Density',
      bin_packing: 'Bin-Packing',
      run_all: 'Full Optimization',
    };
    return algorithms[algorithm] || algorithm;
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const progressPercent = currentPlan.total_actions > 0 
    ? Math.round((currentPlan.completed_actions / currentPlan.total_actions) * 100)
    : 0;

  const pendingCount = sortedActions.filter(a => a.status === 'pending').length;
  const inProgressCount = sortedActions.filter(a => a.status === 'in_progress').length;
  
  const isPlanFinalized = currentPlan.status === 'completed' || currentPlan.status === 'cancelled';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-border">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-foreground">{currentPlan.name}</h2>
              {getPlanStatusBadge(currentPlan.status)}
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Layers className="w-4 h-4" />
                {formatAlgorithm(currentPlan.algorithm)}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {formatDate(currentPlan.created_at)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('[PlanActionsModal] Close button clicked');
              onClose();
            }}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">
              Progress: {currentPlan.completed_actions} / {currentPlan.total_actions} actions
            </span>
            <span className="text-sm font-medium text-foreground">{progressPercent}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-[#2563EB] rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Impact Metrics Section */}
          <div className="mt-4 rounded-xl bg-background border border-border overflow-hidden">
            <button
              onClick={() => setShowImpactMetrics(!showImpactMetrics)}
              className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-foreground">Impact Metrics</span>
              </div>
              {showImpactMetrics ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
            
            {showImpactMetrics && (
              <div className="p-3 pt-0 grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span className="text-xs font-medium text-green-700 dark:text-green-400">Items Moved</span>
                  </div>
                  <span className="text-xl font-bold text-green-700 dark:text-green-300">
                    {currentPlan.completed_actions}
                  </span>
                </div>
                
                <div className="p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2 mb-1">
                    <FolderOpen className="w-4 h-4 text-green-600" />
                    <span className="text-xs font-medium text-green-700 dark:text-green-400">Positions Freed</span>
                  </div>
                  <span className="text-xl font-bold text-green-700 dark:text-green-300">
                    {(currentPlan.summary as any)?.positions_freed ?? 0}
                  </span>
                </div>
                
                <div className="p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2 mb-1">
                    <Boxes className="w-4 h-4 text-green-600" />
                    <span className="text-xs font-medium text-green-700 dark:text-green-400">Consolidated</span>
                  </div>
                  <span className="text-xl font-bold text-green-700 dark:text-green-300">
                    {(currentPlan.summary as any)?.items_consolidated ?? 0}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Target Completion Date Section */}
          <div className="mt-4 p-3 rounded-xl bg-background border border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Target Completion Date</span>
              </div>
              {!isPlanFinalized && !editingTargetDate && (
                <button
                  onClick={() => setEditingTargetDate(true)}
                  className="text-xs text-[#2563EB] hover:underline"
                >
                  {currentPlan.target_completion_date ? 'Edit' : 'Set Date'}
                </button>
              )}
            </div>
            
            {editingTargetDate ? (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="date"
                  value={targetDateInput}
                  onChange={(e) => setTargetDateInput(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-[#2563EB]/50"
                />
                <button
                  onClick={handleSetTargetDate}
                  disabled={settingTargetDate || !targetDateInput}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-[#2563EB] text-white hover:bg-[#2563EB]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {settingTargetDate ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Save
                </button>
                {currentPlan.target_completion_date && (
                  <button
                    onClick={handleClearTargetDate}
                    disabled={settingTargetDate}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={() => setEditingTargetDate(false)}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="mt-1">
                {currentPlan.target_completion_date ? (
                  <span className="text-sm text-foreground">
                    {new Date(currentPlan.target_completion_date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground italic">Not set</span>
                )}
              </div>
            )}
          </div>
          
          {isPlanFinalized ? (
            <div className="flex items-center gap-2 mt-4 p-3 rounded-xl bg-muted/50 border border-border">
              <AlertCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm text-muted-foreground">
                This plan is {currentPlan.status}. Actions cannot be modified.
              </span>
            </div>
          ) : (currentPlan.status === 'in_progress' || currentPlan.status === 'pending') && (
            <div className="flex flex-wrap gap-2 mt-4">
              {/* Start All Button */}
              {pendingCount > 0 && (
                <button
                  onClick={handleStartAll}
                  disabled={loading || startingAll || isPlanFinalized}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-[#2563EB] text-white hover:bg-[#2563EB]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {startingAll ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <PlayCircle className="w-4 h-4" />
                  )}
                  Start All ({pendingCount})
                </button>
              )}
              {inProgressCount > 0 && (
                <button
                  onClick={handleBatchComplete}
                  disabled={loading || isPlanFinalized}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Mark All Complete ({inProgressCount})
                </button>
              )}
              {pendingCount > 0 && (
                <button
                  onClick={handleSkipRemaining}
                  disabled={loading || isPlanFinalized}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <SkipForward className="w-4 h-4" />
                  Skip Remaining ({pendingCount})
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading && !sortedActions.length ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#2563EB]" />
            </div>
          ) : sortedActions.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No actions found for this plan.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedActions.map((action) => (
                <div 
                  key={action.id}
                  className="p-4 rounded-xl border border-border bg-card hover:border-[#2563EB]/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#2563EB]/10 text-[#2563EB] flex items-center justify-center text-sm font-medium">
                        {action.sequence + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-foreground">
                            {formatActionType(action.action_type)}
                          </span>
                          {getStatusBadge(action.status)}
                        </div>
                        
                        <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                          <Package className="w-4 h-4 flex-shrink-0" />
                          <span>Item #{action.item_id}</span>
                          {action.quantity > 1 && (
                            <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                              Qty: {action.quantity}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2 mt-1 text-sm">
                          <MapPin className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                          <span className="text-muted-foreground">{action.from_location || 'N/A'}</span>
                          <ArrowRight className="w-4 h-4 text-[#2563EB]" />
                          <span className="text-foreground font-medium">{action.to_location || 'N/A'}</span>
                        </div>

                        {action.movement_notes && (
                          <div className="mt-2 p-2 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                            <span className="font-medium">Notes:</span> {action.movement_notes}
                          </div>
                        )}

                        {(action.status === 'completed' || action.status === 'skipped') && action.completed_at && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            {action.status === 'completed' ? 'Completed' : 'Skipped'} on {formatDate(action.completed_at)}
                            {action.completed_by && ` by User #${action.completed_by}`}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex-shrink-0">
                      {action.status === 'pending' && !isPlanFinalized && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('[PlanActionsModal] Start button clicked for action:', action.id);
                            handleUpdateAction(action.id, 'in_progress');
                          }}
                          disabled={processingActions.has(action.id) || isPlanFinalized}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {processingActions.has(action.id) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                          Start
                        </button>
                      )}
                      
                      {action.status === 'in_progress' && !isPlanFinalized && (
                        <div className="flex flex-col gap-2">
                          {activeNoteInput === action.id ? (
                            <div className="flex flex-col gap-2">
                              <input
                                type="text"
                                placeholder="Add notes (optional)"
                                value={actionNotes[action.id] || ''}
                                onChange={(e) => setActionNotes(prev => ({ ...prev, [action.id]: e.target.value }))}
                                className="w-40 px-2 py-1 text-sm rounded-lg border border-border bg-background text-foreground"
                                autoFocus
                                disabled={isPlanFinalized}
                              />
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleUpdateAction(action.id, 'completed')}
                                  disabled={processingActions.has(action.id) || isPlanFinalized}
                                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                  {processingActions.has(action.id) ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Check className="w-3 h-3" />
                                  )}
                                  Done
                                </button>
                                <button
                                  onClick={() => setActiveNoteInput(null)}
                                  className="px-2 py-1 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button
                                onClick={() => setActiveNoteInput(action.id)}
                                disabled={processingActions.has(action.id) || isPlanFinalized}
                                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                <Check className="w-4 h-4" />
                                Complete
                              </button>
                              <button
                                onClick={() => handleUpdateAction(action.id, 'skipped')}
                                disabled={processingActions.has(action.id) || isPlanFinalized}
                                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-500 text-white hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {processingActions.has(action.id) ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <SkipForward className="w-4 h-4" />
                                )}
                                Skip
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-border">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('[PlanActionsModal] Footer Close button clicked');
              onClose();
            }}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-muted text-foreground hover:bg-muted/80 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
