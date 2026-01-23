import React, { useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Brain,
  Sparkles,
  Truck,
  Ship,
  Route,
  Container,
  Loader2,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  ChevronRight,
  TrendingUp,
  MapPin,
} from "lucide-react";
import type { InsightType, AiInsight, GenerateInsightResponse } from "../../hooks/useAiInsights";

export type TransportMode = 'land' | 'sea';

export interface TransportAiInsightsProps {
  mode: TransportMode;
  inputData: Record<string, unknown>;
  planId?: number | null;
  className?: string;
}

interface InsightCardConfig {
  id: string;
  type: InsightType;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const landInsightCards: InsightCardConfig[] = [
  {
    id: "convoy_analysis",
    type: "land_convoy_analysis",
    title: "Convoy Analysis",
    description: "AI-powered analysis of convoy composition, capacity utilization, and logistics efficiency",
    icon: Truck,
  },
  {
    id: "route_optimization",
    type: "land_route_optimization",
    title: "Route Optimization",
    description: "Recommendations for optimal routing, fuel efficiency, and travel time reduction",
    icon: Route,
  },
];

const seaInsightCards: InsightCardConfig[] = [
  {
    id: "voyage_analysis",
    type: "sea_voyage_analysis",
    title: "Voyage Analysis",
    description: "AI-powered analysis of voyage planning, port scheduling, and maritime logistics",
    icon: Ship,
  },
  {
    id: "container_optimization",
    type: "sea_container_optimization",
    title: "Container Optimization",
    description: "Recommendations for container loading, weight distribution, and space utilization",
    icon: Container,
  },
];

const modeConfig = {
  land: {
    cards: landInsightCards,
    primaryColor: "amber",
    headerBg: "bg-slate-800/80",
    borderAccent: "border-l-amber-500",
    iconColor: "text-amber-400",
    bgLight: "bg-amber-50",
    textColor: "text-amber-600",
    hoverBg: "hover:bg-amber-50",
    icon: Truck,
    title: "Land Logistics Insights",
  },
  sea: {
    cards: seaInsightCards,
    primaryColor: "teal",
    headerBg: "bg-slate-800/80",
    borderAccent: "border-l-teal-500",
    iconColor: "text-teal-400",
    bgLight: "bg-teal-50",
    textColor: "text-teal-600",
    hoverBg: "hover:bg-teal-50",
    icon: Ship,
    title: "Maritime Insights",
  },
};

async function generateInsightApi(request: {
  type: InsightType;
  inputData: Record<string, unknown>;
  flightPlanId: number | null;
  forceRegenerate?: boolean;
}): Promise<GenerateInsightResponse> {
  const response = await fetch('/api/insights/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    const errorText = await response.text();
    throw new Error(errorText || `Failed to generate insight: ${response.status}`);
  }

  return response.json();
}

function renderInsightContent(content: Record<string, unknown>): React.ReactNode {
  if (!content || Object.keys(content).length === 0) {
    return <p className="text-gray-500 italic">No insights available</p>;
  }

  const renderValue = (value: unknown, depth = 0): React.ReactNode => {
    if (value === null || value === undefined) {
      return <span className="text-gray-400">-</span>;
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return <span>{String(value)}</span>;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return <span className="text-gray-400">None</span>;
      return (
        <ul className="list-disc list-inside space-y-1 ml-2">
          {value.map((item, idx) => (
            <li key={idx} className="text-sm">
              {typeof item === 'object' ? renderValue(item, depth + 1) : String(item)}
            </li>
          ))}
        </ul>
      );
    }

    if (typeof value === 'object') {
      return (
        <div className={`${depth > 0 ? 'ml-3 pl-3 border-l border-gray-200' : ''} space-y-2`}>
          {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
            <div key={k}>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {k.replace(/_/g, ' ')}
              </span>
              <div className="mt-0.5">{renderValue(v, depth + 1)}</div>
            </div>
          ))}
        </div>
      );
    }

    return <span>{JSON.stringify(value)}</span>;
  };

  return (
    <div className="space-y-4">
      {Object.entries(content).map(([key, value]) => (
        <div key={key} className="p-3 rounded-lg bg-gray-50 border border-gray-100">
          <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </h4>
          <div className="text-sm text-gray-600">{renderValue(value)}</div>
        </div>
      ))}
    </div>
  );
}

export function TransportAiInsights({
  mode,
  inputData,
  planId,
  className = "",
}: TransportAiInsightsProps) {
  const [loadingCard, setLoadingCard] = useState<string | null>(null);
  const [insights, setInsights] = useState<Record<string, AiInsight>>({});
  const [error, setError] = useState<string | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  const config = modeConfig[mode];
  const ModeIcon = config.icon;

  const handleGenerateInsight = useCallback(async (card: InsightCardConfig, forceRegenerate = false) => {
    setLoadingCard(card.id);
    setError(null);

    try {
      const response = await generateInsightApi({
        type: card.type,
        inputData,
        flightPlanId: planId || null,
        forceRegenerate,
      });

      setInsights(prev => ({
        ...prev,
        [card.id]: response.insight,
      }));
      setExpandedCard(card.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate insight');
    } finally {
      setLoadingCard(null);
    }
  }, [inputData, planId]);

  const hasAnyInsight = Object.keys(insights).length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl bg-white border border-[#E5E7EB] shadow-sm overflow-hidden ${className}`}
    >
      <div className={`px-6 py-4 ${config.headerBg} border-l-4 ${config.borderAccent}`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${config.primaryColor === 'amber' ? 'bg-amber-500/20' : 'bg-teal-500/20'}`}>
            <Brain className={`w-5 h-5 ${config.iconColor}`} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">{config.title}</h2>
            <p className="text-sm text-slate-400">AI-powered analysis and recommendations</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-sm text-red-600 hover:text-red-800 font-medium"
            >
              Dismiss
            </button>
          </motion.div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {config.cards.map((card, i) => {
            const isLoading = loadingCard === card.id;
            const hasInsight = !!insights[card.id];
            const isExpanded = expandedCard === card.id;
            const CardIcon = card.icon;

            return (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`group rounded-xl border transition-all duration-200 ${
                  hasInsight
                    ? `${config.borderAccent} ${config.bgLight}`
                    : 'border-[#E5E7EB] bg-white hover:border-gray-300'
                }`}
              >
                <button
                  onClick={() => hasInsight ? setExpandedCard(isExpanded ? null : card.id) : handleGenerateInsight(card)}
                  disabled={isLoading}
                  className="w-full p-4 text-left"
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${config.bgLight} group-hover:scale-110 transition-transform duration-200`}>
                      <CardIcon className={`w-5 h-5 ${config.textColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className={`font-medium text-[#111827] group-hover:${config.textColor} transition-colors`}>
                          {card.title}
                        </h3>
                        {isLoading ? (
                          <Loader2 className={`w-4 h-4 animate-spin ${config.textColor}`} />
                        ) : hasInsight ? (
                          <ChevronRight
                            className={`w-4 h-4 ${config.textColor} transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          />
                        ) : (
                          <Sparkles className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
                        )}
                      </div>
                      <p className="text-sm text-[#6B7280] mt-1">{card.description}</p>
                      {hasInsight && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 ${config.bgLight} ${config.textColor} rounded-full font-medium`}>
                            Insight Available
                          </span>
                          {insights[card.id]?.fromCache && (
                            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                              Cached
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </button>

                {hasInsight && isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="px-4 pb-4 border-t border-gray-100"
                  >
                    <div className="pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs text-gray-500">
                          Generated: {new Date(insights[card.id].generatedAt).toLocaleString()}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleGenerateInsight(card, true);
                          }}
                          disabled={isLoading}
                          className={`text-xs flex items-center gap-1 ${config.textColor} hover:underline`}
                        >
                          <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                          Regenerate
                        </button>
                      </div>
                      {renderInsightContent(insights[card.id].content)}
                    </div>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>

        {!hasAnyInsight && (
          <div className="text-center py-6">
            <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full ${config.bgLight} mb-3`}>
              <ModeIcon className={`w-6 h-6 ${config.textColor}`} />
            </div>
            <p className="text-[#6B7280] text-sm">
              Click on an insight card above to generate AI-powered analysis
            </p>
          </div>
        )}

        {hasAnyInsight && (
          <div className="flex items-center justify-center pt-4 border-t border-gray-100">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span>
                {Object.keys(insights).length} insight{Object.keys(insights).length !== 1 ? 's' : ''} generated
              </span>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default TransportAiInsights;
