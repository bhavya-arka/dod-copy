import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  TrendingUp,
  AlertTriangle,
  MapPin,
  Zap,
  Loader2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Info,
  BarChart3,
  Target,
  Package,
  Sparkles
} from "lucide-react";
import type { WarehouseSite, ToastMessage } from "./types";

interface AiRecommendation {
  type: "demand_forecast" | "anomaly_detection" | "smart_placement" | "inventory_velocity";
  loading: boolean;
  data: any;
  error: string | null;
  cached: boolean;
  generatedAt: string | null;
}

interface WMSAiRecommendationsPanelProps {
  selectedSite: WarehouseSite | null;
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

const insightTypes = [
  {
    type: "demand_forecast" as const,
    title: "Demand Forecast",
    description: "Predict future inventory needs and procurement timing",
    icon: TrendingUp,
    color: "text-blue-500",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    accentColor: "bg-blue-500"
  },
  {
    type: "anomaly_detection" as const,
    title: "Anomaly Detection",
    description: "Identify unusual patterns and inventory discrepancies",
    icon: AlertTriangle,
    color: "text-amber-500",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    accentColor: "bg-amber-500"
  },
  {
    type: "smart_placement" as const,
    title: "Smart Placement",
    description: "Optimize item locations for efficiency",
    icon: MapPin,
    color: "text-green-500",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    accentColor: "bg-green-500"
  },
  {
    type: "inventory_velocity" as const,
    title: "Inventory Velocity",
    description: "Analyze stock movement and turnover rates",
    icon: Zap,
    color: "text-purple-500",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    accentColor: "bg-purple-500"
  }
];

export default function WMSAiRecommendationsPanel({
  selectedSite,
  onShowToast
}: WMSAiRecommendationsPanelProps) {
  const [recommendations, setRecommendations] = useState<Record<string, AiRecommendation>>({});
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);

  const generateInsight = async (type: string, forceRefresh = false) => {
    if (!selectedSite) {
      onShowToast("Please select a warehouse site first", "warning");
      return;
    }

    setRecommendations(prev => ({
      ...prev,
      [type]: { ...prev[type], loading: true, error: null }
    }));

    try {
      const response = await fetch(`/api/warehouse/${selectedSite.id}/ai-insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          insightType: `warehouse_${type}`,
          forceRefresh
        })
      });

      if (!response.ok) {
        throw new Error("Failed to generate insight");
      }

      const data = await response.json();
      
      setRecommendations(prev => ({
        ...prev,
        [type]: {
          type: type as any,
          loading: false,
          data: data.insight,
          error: null,
          cached: data.cached || false,
          generatedAt: new Date().toISOString()
        }
      }));

      setExpandedType(type);
      onShowToast(`${type.replace(/_/g, " ")} analysis complete`, "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate insight";
      setRecommendations(prev => ({
        ...prev,
        [type]: {
          ...prev[type],
          loading: false,
          error: message
        }
      }));
      onShowToast(message, "error");
    }
  };

  const generateAllInsights = async () => {
    if (!selectedSite) {
      onShowToast("Please select a warehouse site first", "warning");
      return;
    }

    setGeneratingAll(true);
    
    for (const insight of insightTypes) {
      await generateInsight(insight.type, false);
    }
    
    setGeneratingAll(false);
    onShowToast("All AI recommendations generated", "success");
  };

  const renderDemandForecast = (data: any) => {
    if (!data) return null;
    
    return (
      <div className="space-y-4">
        {data.demand_overview && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Forecast Period</p>
              <p className="text-lg font-semibold text-gray-900">{data.demand_overview.forecast_period_days} days</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Projected Inbound</p>
              <p className="text-lg font-semibold text-blue-600">{(data.demand_overview.total_projected_inbound_lb || 0).toLocaleString()} lbs</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Projected Outbound</p>
              <p className="text-lg font-semibold text-amber-600">{(data.demand_overview.total_projected_outbound_lb || 0).toLocaleString()} lbs</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Confidence</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${(data.demand_overview.confidence_score || 0) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-gray-900">{Math.round((data.demand_overview.confidence_score || 0) * 100)}%</span>
              </div>
            </div>
          </div>
        )}

        {data.high_demand_items && data.high_demand_items.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-600 mb-2 flex items-center gap-2">
              <Target className="w-4 h-4" />
              High Demand Items
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {data.high_demand_items.slice(0, 5).map((item: any, idx: number) => (
                <div key={idx} className="p-3 bg-gray-50 rounded-lg flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.item_description}</p>
                    {item.nsn && <p className="text-xs text-gray-500">NSN: {item.nsn}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-blue-600">{item.projected_demand_units} units projected</p>
                    {item.reorder_recommended && (
                      <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-600 rounded-full">Reorder</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.stockout_risks && data.stockout_risks.length > 0 && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <h4 className="text-sm font-medium text-red-700 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Stockout Risks
            </h4>
            <div className="space-y-2">
              {data.stockout_risks.map((risk: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <span className="text-gray-900">{risk.item_description}</span>
                  <span className="text-red-600">{risk.days_until_stockout} days until stockout</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.summary && (
          <p className="text-sm text-gray-600 italic border-l-2 border-blue-500 pl-3">{data.summary}</p>
        )}
      </div>
    );
  };

  const renderAnomalyDetection = (data: any) => {
    if (!data) return null;

    return (
      <div className="space-y-4">
        {data.risk_score && (
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-gray-600">Overall Risk Score</h4>
              <span className={`text-2xl font-bold ${
                data.risk_score.overall > 70 ? 'text-red-600' :
                data.risk_score.overall > 40 ? 'text-amber-600' : 'text-green-600'
              }`}>{data.risk_score.overall}/100</span>
            </div>
            {data.risk_score.breakdown && (
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-gray-500">Inventory Accuracy</p>
                  <div className="h-1.5 bg-gray-200 rounded-full mt-1">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${data.risk_score.breakdown.inventory_accuracy}%` }} />
                  </div>
                </div>
                <div>
                  <p className="text-gray-500">Movement Consistency</p>
                  <div className="h-1.5 bg-gray-200 rounded-full mt-1">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${data.risk_score.breakdown.movement_consistency}%` }} />
                  </div>
                </div>
                <div>
                  <p className="text-gray-500">Capacity Stability</p>
                  <div className="h-1.5 bg-gray-200 rounded-full mt-1">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${data.risk_score.breakdown.capacity_stability}%` }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {data.anomalies_detected && data.anomalies_detected.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-600 mb-2">Detected Anomalies</h4>
            <div className="space-y-2">
              {data.anomalies_detected.map((anomaly: any, idx: number) => (
                <div key={idx} className={`p-3 rounded-lg border-l-4 ${
                  anomaly.severity === 'critical' ? 'bg-red-50 border-red-500' :
                  anomaly.severity === 'high' ? 'bg-orange-50 border-orange-500' :
                  anomaly.severity === 'medium' ? 'bg-amber-50 border-amber-500' :
                  'bg-blue-50 border-blue-500'
                }`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        anomaly.severity === 'critical' ? 'bg-red-100 text-red-700' :
                        anomaly.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                        anomaly.severity === 'medium' ? 'bg-amber-100 text-amber-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>{anomaly.type?.replace(/_/g, ' ')}</span>
                      <p className="text-sm text-gray-900 mt-1">{anomaly.description}</p>
                    </div>
                  </div>
                  {anomaly.recommended_action && (
                    <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      {anomaly.recommended_action}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {data.summary && (
          <p className="text-sm text-gray-600 italic border-l-2 border-amber-500 pl-3">{data.summary}</p>
        )}
      </div>
    );
  };

  const renderSmartPlacement = (data: any) => {
    if (!data) return null;

    return (
      <div className="space-y-4">
        {data.placement_recommendations && data.placement_recommendations.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-600 mb-2 flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Placement Recommendations ({data.placement_recommendations.length})
            </h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {data.placement_recommendations.slice(0, 6).map((rec: any, idx: number) => (
                <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-gray-900">{rec.item_description}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      rec.priority === 'high' ? 'bg-red-100 text-red-700' :
                      rec.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                      'bg-green-100 text-green-700'
                    }`}>{rec.priority}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{rec.current_zone}/{rec.current_location}</span>
                    <span>→</span>
                    <span className="text-green-600">{rec.recommended_zone}/{rec.recommended_location}</span>
                  </div>
                  {rec.reason && <p className="text-xs text-gray-500 mt-1">{rec.reason}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {data.implementation_plan && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <h4 className="text-sm font-medium text-green-700 mb-2">Implementation Plan</h4>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-bold text-gray-900">{data.implementation_plan.phase_1_moves}</p>
                <p className="text-xs text-gray-500">Phase 1 Moves</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{data.implementation_plan.phase_2_moves}</p>
                <p className="text-xs text-gray-500">Phase 2 Moves</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{data.implementation_plan.estimated_completion_hours}h</p>
                <p className="text-xs text-gray-500">Est. Time</p>
              </div>
            </div>
          </div>
        )}

        {data.summary && (
          <p className="text-sm text-gray-600 italic border-l-2 border-green-500 pl-3">{data.summary}</p>
        )}
      </div>
    );
  };

  const renderInventoryVelocity = (data: any) => {
    if (!data) return null;

    return (
      <div className="space-y-4">
        {data.velocity_overview && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-xs text-gray-500">Total Tracked</p>
              <p className="text-xl font-bold text-gray-900">{data.velocity_overview.total_items_tracked}</p>
            </div>
            <div className="p-3 bg-green-50 rounded-lg text-center">
              <p className="text-xs text-green-600">Fast Movers</p>
              <p className="text-xl font-bold text-green-600">{data.velocity_overview.high_velocity_count}</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg text-center">
              <p className="text-xs text-blue-600">Medium</p>
              <p className="text-xl font-bold text-blue-600">{data.velocity_overview.medium_velocity_count}</p>
            </div>
            <div className="p-3 bg-amber-50 rounded-lg text-center">
              <p className="text-xs text-amber-600">Slow Movers</p>
              <p className="text-xl font-bold text-amber-600">{data.velocity_overview.low_velocity_count}</p>
            </div>
            <div className="p-3 bg-red-50 rounded-lg text-center">
              <p className="text-xs text-red-600">Stale</p>
              <p className="text-xl font-bold text-red-600">{data.velocity_overview.stale_inventory_count}</p>
            </div>
          </div>
        )}

        {data.fast_movers && data.fast_movers.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-600 mb-2 flex items-center gap-2">
              <Zap className="w-4 h-4 text-green-500" />
              Fast Movers
            </h4>
            <div className="space-y-2">
              {data.fast_movers.slice(0, 4).map((item: any, idx: number) => (
                <div key={idx} className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.item_description}</p>
                    <p className="text-xs text-gray-500">{item.turns_per_month} turns/month · {item.avg_days_in_stock} days avg</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    item.placement_score === 'optimal' ? 'bg-green-100 text-green-700' :
                    item.placement_score === 'suboptimal' ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  }`}>{item.placement_score}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.slow_movers && data.slow_movers.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-600 mb-2 flex items-center gap-2">
              <Package className="w-4 h-4 text-amber-500" />
              Slow Movers (Action Required)
            </h4>
            <div className="space-y-2">
              {data.slow_movers.slice(0, 4).map((item: any, idx: number) => (
                <div key={idx} className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.item_description}</p>
                    <p className="text-xs text-gray-500">{item.days_static} days static</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    item.recommended_action === 'dispose' ? 'bg-red-100 text-red-700' :
                    item.recommended_action === 'transfer' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>{item.recommended_action}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.throughput_metrics && (
          <div className="p-3 bg-gray-50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-600 mb-2">Throughput Metrics</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500">Daily Average</p>
                <p className="text-lg font-semibold text-gray-900">{(data.throughput_metrics.daily_average_lb || 0).toLocaleString()} lbs</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Weekly Peak</p>
                <p className="text-lg font-semibold text-gray-900">{(data.throughput_metrics.weekly_peak_lb || 0).toLocaleString()} lbs</p>
              </div>
            </div>
          </div>
        )}

        {data.summary && (
          <p className="text-sm text-gray-600 italic border-l-2 border-purple-500 pl-3">{data.summary}</p>
        )}
      </div>
    );
  };

  const renderInsightContent = (type: string, data: any) => {
    switch (type) {
      case "demand_forecast":
        return renderDemandForecast(data);
      case "anomaly_detection":
        return renderAnomalyDetection(data);
      case "smart_placement":
        return renderSmartPlacement(data);
      case "inventory_velocity":
        return renderInventoryVelocity(data);
      default:
        return <p className="text-sm text-gray-500">No data available</p>;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden"
    >
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-xl">
              <Brain className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">AI Recommendations</h2>
              <p className="text-sm text-gray-500">Bedrock-powered insights for warehouse optimization</p>
            </div>
          </div>
          <button
            onClick={generateAllInsights}
            disabled={!selectedSite || generatingAll}
            className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generatingAll ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Generate All
          </button>
        </div>
        
        {!selectedSite && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2 text-sm text-blue-700">
            <Info className="w-4 h-4" />
            Select a warehouse site to generate AI recommendations
          </div>
        )}
      </div>

      <div className="divide-y divide-gray-200">
        {insightTypes.map((insight) => {
          const rec = recommendations[insight.type];
          const Icon = insight.icon;
          const isExpanded = expandedType === insight.type;

          return (
            <div key={insight.type} className="bg-gray-50">
              <div
                role="button"
                tabIndex={0}
                onClick={() => setExpandedType(isExpanded ? null : insight.type)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setExpandedType(isExpanded ? null : insight.type);
                  }
                }}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 ${insight.bgColor} rounded-lg`}>
                    <Icon className={`w-5 h-5 ${insight.color}`} />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-medium text-gray-900">{insight.title}</h3>
                    <p className="text-xs text-gray-500">{insight.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {rec?.loading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                  ) : rec?.data ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : rec?.error ? (
                    <XCircle className="w-4 h-4 text-red-500" />
                  ) : null}
                  
                  {!rec?.loading && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        generateInsight(insight.type, !!rec?.data);
                      }}
                      disabled={!selectedSite}
                      className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className="w-4 h-4 text-gray-500" />
                    </button>
                  )}
                  
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  )}
                </div>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-4 pt-0 bg-white">
                      {rec?.loading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
                        </div>
                      ) : rec?.error ? (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                          {rec.error}
                        </div>
                      ) : rec?.data ? (
                        <div>
                          {rec.cached && (
                            <div className="mb-3 flex items-center gap-1 text-xs text-gray-500">
                              <Clock className="w-3 h-3" />
                              Cached result
                            </div>
                          )}
                          {renderInsightContent(insight.type, rec.data)}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-500 text-sm">
                          Click the refresh button to generate insights
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
