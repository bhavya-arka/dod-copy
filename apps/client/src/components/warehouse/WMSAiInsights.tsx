import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  Brain, 
  Layers, 
  Activity, 
  AlertTriangle,
  AlertCircle, 
  Shield, 
  Loader2, 
  CheckCircle, 
  Wand2, 
  Sparkles,
  RefreshCw,
  ChevronRight,
  Info,
  Warehouse,
  Save,
  Clock,
  Trash2,
  Play,
  Eye,
  X,
  Bell
} from "lucide-react";
import type { WarehouseSite, OptimizationResult, ToastMessage } from "./types";
import { 
  runOptimization, 
  generateWarehouseInsights, 
  getOptimizationPlans,
  executeOptimizationPlan,
  deleteOptimizationPlan,
  getWarehouseAlerts,
  resolveWarehouseAlert,
  runWarehouseAnalytics,
  type WarehouseAiInsight,
  type OptimizationPlan,
  type WarehouseAlert
} from "../../services/warehouseService";
import OptimizationWizardModal, { type Algorithm } from "./modals/OptimizationWizardModal";
import PlanActionsModal from "./modals/PlanActionsModal";
import TextConfirmationDialog from "../ui/TextConfirmationDialog";
import WMSSolutionDashboard from "./WMSSolutionDashboard";
import WMSAnalyticsDashboard from "./WMSAnalyticsDashboard";
import WMSAiRecommendationsPanel from "./WMSAiRecommendationsPanel";

interface WMSAiInsightsProps {
  sites: WarehouseSite[];
  selectedSiteId: number | null;
  onSelectSite: (id: number | null) => void;
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

interface InsightCard {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  hoverBgColor: string;
  action: "wizard" | "analysis";
  algorithm?: Algorithm;
  tooltip: string;
}

const insightCards: InsightCard[] = [
  {
    id: "placement",
    title: "Placement Optimization",
    description: "AI-powered recommendations for optimal item placement based on access frequency and weight distribution",
    icon: Layers,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    hoverBgColor: "hover:bg-blue-100",
    action: "wizard",
    algorithm: "cardstack",
    tooltip: "Opens the Optimization Wizard with CardStack algorithm pre-selected",
  },
  {
    id: "load-balancing",
    title: "Predictive Load Balancing",
    description: "Forecast capacity needs and balance inventory across sites to prevent bottlenecks",
    icon: Activity,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    hoverBgColor: "hover:bg-purple-100",
    action: "wizard",
    algorithm: "bin_packing",
    tooltip: "Opens the Optimization Wizard with Bin-Packing algorithm pre-selected",
  },
  {
    id: "aging",
    title: "Aging Alerts",
    description: "Proactive notifications for items approaching shelf life limits or requiring rotation",
    icon: AlertTriangle,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    hoverBgColor: "hover:bg-amber-100",
    action: "analysis",
    tooltip: "Runs optimization analysis to identify aging inventory items",
  },
  {
    id: "readiness",
    title: "Mission Readiness Score",
    description: "Real-time assessment of inventory completeness for active and planned missions",
    icon: Shield,
    color: "text-green-600",
    bgColor: "bg-green-50",
    hoverBgColor: "hover:bg-green-100",
    action: "analysis",
    tooltip: "Runs optimization analysis to calculate mission readiness metrics",
  },
];

export default function WMSAiInsights({
  sites,
  selectedSiteId,
  onSelectSite,
  onShowToast,
}: WMSAiInsightsProps) {
  const [optimizationLoading, setOptimizationLoading] = useState(false);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [showSolutionDashboard, setShowSolutionDashboard] = useState(false);
  const [showAnalyticsDashboard, setShowAnalyticsDashboard] = useState(false);
  const [preselectedAlgorithm, setPreselectedAlgorithm] = useState<Algorithm | null>(null);
  const [aiInsightLoading, setAiInsightLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState<WarehouseAiInsight | null>(null);
  const [loadingCardId, setLoadingCardId] = useState<string | null>(null);
  const [savedPlans, setSavedPlans] = useState<OptimizationPlan[]>([]);
  const [executeDialogOpen, setExecuteDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<OptimizationPlan | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [viewingPlan, setViewingPlan] = useState<OptimizationPlan | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [dismissingAlertId, setDismissingAlertId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const selectedSite = sites.find(s => s.id === selectedSiteId);

  const { data: alerts = [], isLoading: alertsLoading, refetch: refetchAlerts } = useQuery<WarehouseAlert[]>({
    queryKey: ['warehouse-alerts', selectedSiteId],
    queryFn: () => selectedSiteId ? getWarehouseAlerts(selectedSiteId) : Promise.resolve([]),
    enabled: !!selectedSiteId,
  });

  const activeAlerts = alerts.filter(a => !a.is_resolved);

  const handleRunAnalytics = async () => {
    if (!selectedSiteId) {
      onShowToast("Please select a warehouse site first", "warning");
      return;
    }
    setAnalyticsLoading(true);
    try {
      await runWarehouseAnalytics(selectedSiteId);
      await refetchAlerts();
      onShowToast("Analytics completed, alerts refreshed!", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to run analytics";
      onShowToast(message, "error");
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const handleDismissAlert = async (alertId: number) => {
    if (!selectedSiteId) return;
    setDismissingAlertId(alertId);
    try {
      await resolveWarehouseAlert(selectedSiteId, alertId);
      await refetchAlerts();
      onShowToast("Alert dismissed", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to dismiss alert";
      onShowToast(message, "error");
    } finally {
      setDismissingAlertId(null);
    }
  };

  const formatRelativeTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  const getAlertIcon = (severity: WarehouseAlert['severity']) => {
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-amber-500" />;
      case 'info':
      default:
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getAlertBorderClass = (severity: WarehouseAlert['severity']) => {
    switch (severity) {
      case 'critical':
        return 'border-l-4 border-red-500';
      case 'warning':
        return 'border-l-4 border-amber-500';
      case 'info':
      default:
        return 'border-l-4 border-blue-500';
    }
  };

  const fetchPlans = useCallback(async () => {
    if (!selectedSiteId) return;
    try {
      const plans = await getOptimizationPlans(selectedSiteId);
      setSavedPlans(plans);
    } catch (err) {
      console.error("Failed to fetch plans:", err);
    }
  }, [selectedSiteId]);

  useEffect(() => {
    if (selectedSiteId) {
      fetchPlans();
    } else {
      setSavedPlans([]);
    }
  }, [selectedSiteId, fetchPlans]);

  useEffect(() => {
    if (!showWizard && selectedSiteId) {
      fetchPlans();
    }
  }, [showWizard, selectedSiteId, fetchPlans]);

  const handleExecutePlan = async () => {
    if (!selectedPlan) return;
    setActionLoading(true);
    try {
      await executeOptimizationPlan(selectedPlan.id);
      onShowToast("Optimization plan started!", "success");
      setExecuteDialogOpen(false);
      setSelectedPlan(null);
      fetchPlans();
    } catch (err) {
      onShowToast("Failed to execute plan", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeletePlan = async () => {
    if (!selectedPlan) return;
    setActionLoading(true);
    try {
      await deleteOptimizationPlan(selectedPlan.id);
      onShowToast("Plan deleted", "success");
      setDeleteDialogOpen(false);
      setSelectedPlan(null);
      fetchPlans();
    } catch (err) {
      onShowToast("Failed to delete plan", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const formatAlgorithmName = (algo: string) => {
    const names: Record<string, string> = {
      cardstack: "CardStack",
      size_standardization: "Size Standardization",
      value_density: "Value Density",
      bin_packing: "Bin-Packing",
      run_all: "Run All",
    };
    return names[algo] || algo;
  };

  const getStatusBadge = (status: OptimizationPlan['status']) => {
    switch (status) {
      case 'pending':
        return { color: 'bg-amber-100 text-amber-700', label: 'Pending' };
      case 'in_progress':
        return { color: 'bg-blue-100 text-blue-700', label: 'In Progress' };
      case 'completed':
        return { color: 'bg-green-100 text-green-700', label: 'Completed' };
      case 'cancelled':
        return { color: 'bg-gray-100 text-gray-600', label: 'Cancelled' };
      default:
        return { color: 'bg-gray-100 text-gray-600', label: status };
    }
  };

  const handleRunOptimization = async () => {
    if (!selectedSiteId) {
      onShowToast("Please select a warehouse site first", "warning");
      return;
    }
    setOptimizationLoading(true);
    try {
      const data = await runOptimization(selectedSiteId);
      setOptimization(data);
      onShowToast("Optimization analysis complete!", "success");
    } catch (err) {
      onShowToast("Failed to run optimization", "error");
    } finally {
      setOptimizationLoading(false);
    }
  };

  const handleCardClick = async (card: InsightCard) => {
    if (!selectedSiteId) {
      onShowToast("Please select a warehouse site first", "warning");
      return;
    }

    if (card.action === "wizard" && card.algorithm) {
      setPreselectedAlgorithm(card.algorithm);
      setShowWizard(true);
    } else if (card.action === "analysis") {
      setLoadingCardId(card.id);
      try {
        const data = await runOptimization(selectedSiteId);
        setOptimization(data);
        onShowToast(`${card.title} analysis complete!`, "success");
      } catch (err) {
        onShowToast(`Failed to run ${card.title}`, "error");
      } finally {
        setLoadingCardId(null);
      }
    }
  };

  const handleOpenWizard = () => {
    if (!selectedSiteId) {
      onShowToast("Please select a warehouse site first", "warning");
      return;
    }
    setPreselectedAlgorithm(null);
    setShowWizard(true);
  };

  const handleWizardSuccess = () => {
    setShowWizard(false);
    setPreselectedAlgorithm(null);
    onShowToast("Optimization completed successfully!", "success");
  };

  const handleGenerateAiInsights = async (forceRegenerate: boolean = false) => {
    if (!selectedSiteId) {
      onShowToast("Please select a warehouse site first", "warning");
      return;
    }

    setAiInsightLoading(true);
    try {
      const data = await generateWarehouseInsights(
        selectedSiteId,
        'warehouse_optimization',
        {
          totalItems: optimization?.metrics.total_items,
          totalValue: optimization?.metrics.total_value,
          agingAlerts: optimization?.metrics.aging_alerts,
          siteCode: selectedSite?.code,
          siteName: selectedSite?.name,
        },
        forceRegenerate
      );
      setAiInsight(data);
      onShowToast(
        forceRegenerate ? "AI insights regenerated!" : (data.cached ? "Loaded cached AI insights" : "AI insights generated!"),
        "success"
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate AI insights";
      onShowToast(message, "error");
    } finally {
      setAiInsightLoading(false);
    }
  };

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">AI Insights</h1>
            <p className="text-muted-foreground">Intelligent optimization and predictive analytics</p>
          </div>
          <button
            onClick={handleOpenWizard}
            disabled={!selectedSiteId}
            className="px-5 py-2.5 rounded-xl bg-[#2563EB] text-white hover:bg-[#1d4ed8] transition-all flex items-center gap-2 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-md"
          >
            <Wand2 className="w-5 h-5" />
            <span className="font-medium">Optimization Wizard</span>
          </button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl bg-blue-50 border border-[#2563EB]/20 p-4 mb-6"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Warehouse className="w-5 h-5 text-[#2563EB]" />
            <span className="text-sm font-medium text-foreground">Select Warehouse:</span>
          </div>
          <select
            value={selectedSiteId || ""}
            onChange={(e) => {
              onSelectSite(e.target.value ? Number(e.target.value) : null);
              setOptimization(null);
              setAiInsight(null);
            }}
            className="flex-1 px-4 py-2.5 rounded-xl bg-white border-2 border-[#2563EB]/30 text-foreground text-sm focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 transition-all font-medium"
          >
            <option value="">Choose a warehouse site to analyze...</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name} ({site.code}) {site.item_count ? `- ${site.item_count} items` : ''}
              </option>
            ))}
          </select>
          {selectedSite && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="w-4 h-4" />
              <span>Selected: <strong className="text-foreground">{selectedSite.name}</strong></span>
            </div>
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mb-6"
      >
        <button
          onClick={() => setShowSolutionDashboard(true)}
          className="w-full p-4 rounded-2xl bg-blue-50 border border-blue-200 hover:border-blue-300 transition-all group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-blue-100 group-hover:scale-110 transition-transform">
                <Sparkles className="w-6 h-6 text-blue-600" />
              </div>
              <div className="text-left">
                <h3 className="text-lg font-semibold text-[#111827] group-hover:text-blue-600 transition-colors">
                  Solution Dashboard
                </h3>
                <p className="text-sm text-[#6B7280]">
                  Dynamic layouts, load balancing, density mapping, predictive forecasting & integrations
                </p>
              </div>
            </div>
            <ChevronRight className="w-6 h-6 text-blue-600 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="mb-6"
      >
        <button
          onClick={() => setShowAnalyticsDashboard(true)}
          disabled={!selectedSiteId}
          className="w-full p-4 rounded-2xl bg-emerald-50 border border-emerald-200 hover:border-emerald-300 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-emerald-100 group-hover:scale-110 transition-transform">
                <Activity className="w-6 h-6 text-emerald-600" />
              </div>
              <div className="text-left">
                <h3 className="text-lg font-semibold text-[#111827] group-hover:text-emerald-600 transition-colors">
                  Analytics Dashboard
                </h3>
                <p className="text-sm text-[#6B7280]">
                  Movement tracking, growth insights, velocity analysis & zone heatmaps
                </p>
              </div>
            </div>
            <ChevronRight className="w-6 h-6 text-emerald-600 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {insightCards.map((card, i) => (
          <motion.button
            key={card.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 + 0.2 }}
            onClick={() => handleCardClick(card)}
            disabled={!selectedSiteId || loadingCardId === card.id}
            className={`group rounded-2xl bg-white border border-border shadow-sm p-6 text-left transition-all duration-200 hover:shadow-lg hover:border-[#2563EB]/30 ${card.hoverBgColor} disabled:opacity-60 disabled:cursor-not-allowed relative overflow-hidden`}
            title={card.tooltip}
          >
            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
              {loadingCardId === card.id ? (
                <Loader2 className="w-5 h-5 animate-spin text-[#2563EB]" />
              ) : (
                <ChevronRight className="w-5 h-5 text-[#2563EB]" />
              )}
            </div>
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl ${card.bgColor} group-hover:scale-110 transition-transform duration-200`}>
                <card.icon className={`w-6 h-6 ${card.color}`} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground mb-1 group-hover:text-[#2563EB] transition-colors">
                  {card.title}
                </h3>
                <p className="text-sm text-muted-foreground">{card.description}</p>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  {card.action === "wizard" ? (
                    <span className="px-2 py-0.5 bg-[#2563EB]/10 text-[#2563EB] rounded-full font-medium">
                      Opens Wizard
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
                      Quick Analysis
                    </span>
                  )}
                </div>
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      {savedPlans.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="rounded-2xl bg-white border border-border shadow-sm p-6 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#2563EB]/10 rounded-xl">
                <Save className="w-5 h-5 text-[#2563EB]" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Saved Plans</h2>
                <p className="text-sm text-muted-foreground">Previously saved optimization plans</p>
              </div>
            </div>
            <span className="text-xs px-2 py-1 bg-muted rounded-full text-muted-foreground">
              {savedPlans.length} plan{savedPlans.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {savedPlans.map((plan) => {
              const statusBadge = getStatusBadge(plan.status);
              const progressPercent = plan.total_actions > 0 
                ? Math.round((plan.completed_actions / plan.total_actions) * 100) 
                : 0;

              return (
                <div
                  key={plan.id}
                  className="p-4 rounded-xl border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-foreground truncate">
                          {plan.name}
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-[#2563EB]/10 text-[#2563EB] rounded-full font-medium">
                          {formatAlgorithmName(plan.algorithm)}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge.color}`}>
                          {statusBadge.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(plan.created_at).toLocaleDateString()} {new Date(plan.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span>{plan.total_actions} actions</span>
                        <span>{plan.summary.slotsFreed} slots freed</span>
                      </div>
                      
                      {plan.status === 'in_progress' && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                            <span>Progress</span>
                            <span>{plan.completed_actions} / {plan.total_actions} ({progressPercent}%)</span>
                          </div>
                          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-blue-500 rounded-full transition-all duration-300"
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Preview button for all plans */}
                      <button
                        onClick={() => setViewingPlan(plan)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-[#2563EB] hover:bg-[#2563EB]/10 transition-colors"
                        title={plan.status === 'pending' ? "Preview plan" : "View details"}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {plan.status === 'pending' && (
                        <button
                          onClick={() => {
                            setSelectedPlan(plan);
                            setExecuteDialogOpen(true);
                          }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-green-600 hover:bg-green-50 transition-colors"
                          title="Execute plan"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setSelectedPlan(plan);
                          setDeleteDialogOpen(true);
                        }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete plan"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.48 }}
        className="rounded-2xl bg-white border border-border shadow-sm p-6 mb-6"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-xl">
              <Bell className="w-5 h-5 text-red-500" />
            </div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">Active Alerts</h2>
              {activeAlerts.length > 0 && (
                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                  {activeAlerts.length}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={handleRunAnalytics}
            disabled={!selectedSiteId || analyticsLoading}
            className="px-3 py-1.5 rounded-lg bg-[#2563EB]/10 text-[#2563EB] hover:bg-[#2563EB]/20 transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {analyticsLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span>Run Analytics</span>
          </button>
        </div>

        {alertsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : activeAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="p-3 bg-green-50 rounded-full mb-3">
              <CheckCircle className="w-6 h-6 text-green-500" />
            </div>
            <p className="text-sm font-medium text-foreground">No Active Alerts</p>
            <p className="text-xs text-muted-foreground mt-1">
              {selectedSiteId 
                ? "All systems are operating normally. Run analytics to check for new alerts."
                : "Select a warehouse site to view alerts."}
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {activeAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-4 rounded-lg bg-white shadow-sm ${getAlertBorderClass(alert.severity)} transition-all hover:shadow-md`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="flex-shrink-0 mt-0.5">
                      {getAlertIcon(alert.severity)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {alert.message}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted-foreground">
                        {alert.entity_name && (
                          <span className="px-2 py-0.5 bg-gray-100 rounded-full">
                            {alert.entity_name}
                          </span>
                        )}
                        {alert.metric_value && alert.threshold_value && (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full">
                            {alert.metric_value} / {alert.threshold_value} threshold
                          </span>
                        )}
                        {alert.trend_change_percent && (
                          <span className={`px-2 py-0.5 rounded-full ${
                            parseFloat(alert.trend_change_percent) > 0 
                              ? 'bg-green-50 text-green-700' 
                              : 'bg-red-50 text-red-700'
                          }`}>
                            {parseFloat(alert.trend_change_percent) > 0 ? '+' : ''}
                            {alert.trend_change_percent}% trend
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatRelativeTime(alert.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDismissAlert(alert.id)}
                    disabled={dismissingAlertId === alert.id}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-gray-100 transition-colors flex-shrink-0 disabled:opacity-50"
                    title="Dismiss alert"
                  >
                    {dismissingAlertId === alert.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <X className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="rounded-2xl bg-purple-50 border border-purple-200 shadow-sm p-6 mb-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-purple-100 rounded-xl">
            <Sparkles className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">AI-Powered Analysis</h2>
            <p className="text-sm text-muted-foreground">Generate intelligent insights using AWS Bedrock AI</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <button
            onClick={() => handleGenerateAiInsights(false)}
            disabled={!selectedSiteId || aiInsightLoading}
            className="flex-1 px-4 py-2.5 rounded-xl bg-purple-600 text-white hover:bg-purple-700 transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {aiInsightLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span className="font-medium">Generate AI Insights</span>
          </button>
          {aiInsight && (
            <button
              onClick={() => handleGenerateAiInsights(true)}
              disabled={!selectedSiteId || aiInsightLoading}
              className="px-4 py-2.5 rounded-xl border border-purple-300 text-purple-700 hover:bg-purple-100 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Force regenerate insights (bypass cache)"
            >
              <RefreshCw className={`w-4 h-4 ${aiInsightLoading ? 'animate-spin' : ''}`} />
              <span className="font-medium">Regenerate</span>
            </button>
          )}
        </div>

        {aiInsight && (
          <div className="space-y-4 mt-4 p-4 bg-white/70 rounded-xl border border-purple-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-purple-600" />
                <span className="font-medium text-foreground">AI Analysis Results</span>
              </div>
              {aiInsight.cached && (
                <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                  Cached
                </span>
              )}
            </div>
            <div className="prose prose-sm max-w-none text-foreground">
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {aiInsight.content}
              </div>
            </div>
            {aiInsight.recommendations && aiInsight.recommendations.length > 0 && (
              <div className="mt-4 pt-4 border-t border-purple-100">
                <h4 className="text-sm font-medium text-foreground mb-2">Key Recommendations:</h4>
                <ul className="space-y-2">
                  {aiInsight.recommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Generated: {new Date(aiInsight.createdAt).toLocaleString()}
            </p>
          </div>
        )}

        {!selectedSiteId && (
          <p className="text-sm text-purple-600 mt-2 flex items-center gap-2">
            <Info className="w-4 h-4" />
            Select a warehouse site above to generate AI insights
          </p>
        )}
      </motion.div>

      <div className="mb-6">
        <WMSAiRecommendationsPanel
          selectedSite={selectedSite || null}
          onShowToast={onShowToast}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="rounded-2xl bg-white border border-border shadow-sm p-6"
      >
        <h2 className="text-lg font-semibold text-foreground mb-4">Run Optimization Analysis</h2>
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <button
            onClick={handleRunOptimization}
            disabled={!selectedSiteId || optimizationLoading}
            className="px-4 py-2.5 rounded-xl bg-[#2563EB] text-white hover:bg-[#1d4ed8] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed min-w-[160px]"
          >
            {optimizationLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
            <span className="font-medium">Run Analysis</span>
          </button>
          {!selectedSiteId && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Info className="w-4 h-4" />
              Select a warehouse site to run optimization analysis
            </p>
          )}
        </div>

        {optimization && (
          <div className="space-y-4 mt-6 border-t border-border pt-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">Total Items</p>
                <p className="text-xl font-bold text-foreground">{optimization.metrics.total_items}</p>
              </div>
              <div className="p-4 rounded-xl bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">Total Value</p>
                <p className="text-xl font-bold text-foreground">${optimization.metrics.total_value.toLocaleString()}</p>
              </div>
              <div className="p-4 rounded-xl bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">Aging Alerts</p>
                <p className="text-xl font-bold text-foreground">{optimization.metrics.aging_alerts}</p>
              </div>
            </div>

            {optimization.recommendations.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-foreground mb-3">Recommendations</h3>
                <div className="space-y-2">
                  {optimization.recommendations.map((rec, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-xl flex items-start gap-3 ${
                        rec.priority === "high"
                          ? "bg-red-50 border border-red-200"
                          : rec.priority === "medium"
                            ? "bg-amber-50 border border-amber-200"
                            : "bg-blue-50 border border-blue-200"
                      }`}
                    >
                      <CheckCircle
                        className={`w-4 h-4 mt-0.5 ${
                          rec.priority === "high"
                            ? "text-[#DC2626]"
                            : rec.priority === "medium"
                              ? "text-[#F59E0B]"
                              : "text-[#2563EB]"
                        }`}
                      />
                      <div>
                        <p className="text-sm font-medium text-foreground">{rec.type}</p>
                        <p className="text-sm text-muted-foreground">{rec.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>

      {showWizard && selectedSiteId && selectedSite && (
        <OptimizationWizardModal
          siteId={selectedSiteId}
          siteName={selectedSite.name}
          onClose={() => {
            setShowWizard(false);
            setPreselectedAlgorithm(null);
          }}
          onSuccess={handleWizardSuccess}
          onShowToast={onShowToast}
          initialAlgorithm={preselectedAlgorithm}
        />
      )}

      {showSolutionDashboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-5xl max-h-[90vh] overflow-auto">
            <WMSSolutionDashboard
              siteId={selectedSiteId || undefined}
              siteName={selectedSite?.name}
              onClose={() => setShowSolutionDashboard(false)}
            />
          </div>
        </div>
      )}

      {showAnalyticsDashboard && selectedSiteId && (
        <WMSAnalyticsDashboard
          siteId={selectedSiteId}
          siteName={selectedSite?.name || "Warehouse"}
          onClose={() => setShowAnalyticsDashboard(false)}
          onShowToast={onShowToast}
        />
      )}

      <TextConfirmationDialog
        open={executeDialogOpen}
        onOpenChange={setExecuteDialogOpen}
        title="Execute Optimization Plan"
        description={`This will start the "${selectedPlan?.name}" optimization. Warehouse staff will need to physically move inventory items according to the plan.`}
        confirmLabel="Start Optimization"
        expectedPhrase="run optimization"
        onConfirm={handleExecutePlan}
        isLoading={actionLoading}
      />

      <TextConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Optimization Plan"
        description={`This will permanently delete the "${selectedPlan?.name}" plan and all its actions. This cannot be undone.`}
        confirmLabel="Delete Plan"
        expectedPhrase="permanently delete"
        onConfirm={handleDeletePlan}
        isDestructive
        isLoading={actionLoading}
      />

      <PlanActionsModal
        plan={viewingPlan}
        onClose={() => setViewingPlan(null)}
        onActionUpdate={fetchPlans}
        onShowToast={onShowToast}
      />
    </>
  );
}
