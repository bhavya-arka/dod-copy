import React, { useState } from "react";
import { motion } from "framer-motion";
import { Brain, Layers, Activity, AlertTriangle, Shield, Loader2, CheckCircle } from "lucide-react";
import type { WarehouseSite, OptimizationResult, ToastMessage } from "./types";
import { runOptimization } from "../../services/warehouseService";

interface WMSAiInsightsProps {
  sites: WarehouseSite[];
  selectedSiteId: number | null;
  onSelectSite: (id: number | null) => void;
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

const insightCards = [
  {
    title: "Placement Optimization",
    description: "AI-powered recommendations for optimal item placement based on access frequency and weight distribution",
    icon: Layers,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  {
    title: "Predictive Load Balancing",
    description: "Forecast capacity needs and balance inventory across sites to prevent bottlenecks",
    icon: Activity,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
  },
  {
    title: "Aging Alerts",
    description: "Proactive notifications for items approaching shelf life limits or requiring rotation",
    icon: AlertTriangle,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
  },
  {
    title: "Mission Readiness Score",
    description: "Real-time assessment of inventory completeness for active and planned missions",
    icon: Shield,
    color: "text-green-600",
    bgColor: "bg-green-50",
  },
];

/**
 * AI Insights tab component - Intelligent optimization and predictive analytics
 */
export default function WMSAiInsights({
  sites,
  selectedSiteId,
  onSelectSite,
  onShowToast,
}: WMSAiInsightsProps) {
  const [optimizationLoading, setOptimizationLoading] = useState(false);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);

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

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl font-bold text-foreground mb-1">AI Insights</h1>
        <p className="text-muted-foreground">Intelligent optimization and predictive analytics</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {insightCards.map((card, i) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="rounded-2xl bg-white border border-border shadow-sm p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl ${card.bgColor}`}>
                <card.icon className={`w-6 h-6 ${card.color}`} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground mb-1">{card.title}</h3>
                <p className="text-sm text-muted-foreground">{card.description}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="rounded-2xl bg-white border border-border shadow-sm p-6"
      >
        <h2 className="text-lg font-semibold text-foreground mb-4">Run Optimization Analysis</h2>
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <select
            value={selectedSiteId || ""}
            onChange={(e) => {
              onSelectSite(e.target.value ? Number(e.target.value) : null);
              setOptimization(null);
            }}
            className="flex-1 px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
          >
            <option value="">Select warehouse site...</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name} ({site.code})
              </option>
            ))}
          </select>
          <button
            onClick={handleRunOptimization}
            disabled={!selectedSiteId || optimizationLoading}
            className="px-4 py-2 rounded-lg bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {optimizationLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
            Run Analysis
          </button>
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
                              : "text-[#004E89]"
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
    </>
  );
}
