import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useAiInsights,
  InsightType,
  AiInsight,
  INSIGHT_TYPE_LABELS,
  INSIGHT_TYPE_DESCRIPTIONS,
} from '../hooks/useAiInsights';

interface AiInsightsPanelProps {
  flightPlanId: number;
  inputData?: Record<string, unknown>;
  className?: string;
}

const INSIGHT_TYPES: InsightType[] = [
  'allocation_summary',
  'cob_analysis',
  'pallet_review',
  'route_planning',
  'compliance',
  'mission_briefing',
  'mission_analytics',
];

const INSIGHT_ICONS: Record<InsightType, string> = {
  allocation_summary: '📦',
  cob_analysis: '⚖️',
  pallet_review: '🎯',
  route_planning: '🗺️',
  compliance: '✅',
  mission_briefing: '📋',
  mission_analytics: '📊',
};

export default function AiInsightsPanel({
  flightPlanId,
  inputData = {},
  className = '',
}: AiInsightsPanelProps) {
  const [activeTab, setActiveTab] = useState<InsightType>('allocation_summary');
  const [generatingType, setGeneratingType] = useState<InsightType | null>(null);

  const {
    insights,
    isLoading,
    error,
    isRateLimited,
    rateLimitRetryAfter,
    generateInsight,
    isGenerating,
    generateError,
    getInsightByType,
    refetch,
  } = useAiInsights({ flightPlanId, enabled: flightPlanId > 0 });

  const currentInsight = useMemo(
    () => getInsightByType(activeTab),
    [activeTab, getInsightByType]
  );

  const handleGenerate = useCallback(
    async (type: InsightType, forceRegenerate = false) => {
      if (isRateLimited) return;

      setGeneratingType(type);
      try {
        await generateInsight({
          type,
          inputData,
          flightPlanId,
          forceRegenerate,
        });
      } catch (err) {
        console.error('Failed to generate insight:', err);
      } finally {
        setGeneratingType(null);
      }
    },
    [generateInsight, inputData, flightPlanId, isRateLimited]
  );

  const handleGenerateAll = useCallback(async () => {
    for (const type of INSIGHT_TYPES) {
      if (!getInsightByType(type)) {
        await handleGenerate(type, false);
      }
    }
  }, [getInsightByType, handleGenerate]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!flightPlanId || flightPlanId <= 0) {
    return (
      <div className={`glass-card p-6 ${className}`}>
        <div className="text-center text-neutral-500 py-8">
          <span className="text-4xl mb-4 block">🤖</span>
          <p>Select a flight plan to view AI insights</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`glass-card overflow-hidden ${className}`}>
      <div className="p-4 sm:p-6 border-b border-neutral-200/50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-3">
            <span className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-xl">
              🤖
            </span>
            <div>
              <h2 className="text-lg font-bold text-neutral-900">AI Insights</h2>
              <p className="text-sm text-neutral-500">
                Powered by Amazon Bedrock
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isRateLimited && (
              <span className="badge badge-warning text-xs">
                Rate limited ({rateLimitRetryAfter}s)
              </span>
            )}
            <button
              onClick={handleGenerateAll}
              disabled={isGenerating || isRateLimited}
              className="btn-secondary text-sm px-4 py-2 disabled:opacity-50"
            >
              Generate All
            </button>
          </div>
        </div>
      </div>

      <div className="flex overflow-x-auto scrollbar-thin border-b border-neutral-200/50">
        {INSIGHT_TYPES.map((type) => {
          const insight = getInsightByType(type);
          const isActive = activeTab === type;
          const hasContent = !!insight;

          return (
            <button
              key={type}
              onClick={() => setActiveTab(type)}
              className={`flex-shrink-0 px-4 py-3 text-sm font-medium transition-all border-b-2 ${
                isActive
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
              }`}
            >
              <span className="flex items-center gap-2">
                <span>{INSIGHT_ICONS[type]}</span>
                <span className="hidden sm:inline">{INSIGHT_TYPE_LABELS[type]}</span>
                {hasContent && (
                  <span
                    className={`w-2 h-2 rounded-full ${
                      insight?.fromCache ? 'bg-amber-400' : 'bg-green-400'
                    }`}
                    title={insight?.fromCache ? 'Cached' : 'Fresh'}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="p-4 sm:p-6 min-h-[300px] max-h-[500px] overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState error={error.message} onRetry={refetch} />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {generatingType === activeTab ? (
                <GeneratingState type={activeTab} />
              ) : currentInsight ? (
                <InsightContent
                  insight={currentInsight}
                  onRegenerate={() => handleGenerate(activeTab, true)}
                  isRegenerating={isGenerating && generatingType === activeTab}
                  formatDate={formatDate}
                />
              ) : (
                <EmptyState
                  type={activeTab}
                  onGenerate={() => handleGenerate(activeTab)}
                  isGenerating={isGenerating}
                  isRateLimited={isRateLimited}
                />
              )}

              {generateError && generatingType === activeTab && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-red-700 text-sm">{generateError.message}</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {insights.length > 0 && (
        <div className="px-4 sm:px-6 py-3 bg-neutral-50 border-t border-neutral-200/50">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
            <span>
              {insights.length} of {INSIGHT_TYPES.length} insights generated
            </span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-400"></span>
                Fresh
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                Cached
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
      <p className="text-neutral-500">Loading insights...</p>
    </div>
  );
}

function GeneratingState({ type }: { type: InsightType }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center mb-4 animate-pulse">
        <span className="text-2xl">{INSIGHT_ICONS[type]}</span>
      </div>
      <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
      <p className="text-neutral-700 font-medium">Generating {INSIGHT_TYPE_LABELS[type]}...</p>
      <p className="text-neutral-500 text-sm mt-1">This may take a few seconds</p>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mb-4">
        <span className="text-2xl">⚠️</span>
      </div>
      <p className="text-red-600 font-medium mb-2">Failed to load insights</p>
      <p className="text-neutral-500 text-sm mb-4">{error}</p>
      <button onClick={onRetry} className="btn-secondary text-sm px-4 py-2">
        Try Again
      </button>
    </div>
  );
}

function EmptyState({
  type,
  onGenerate,
  isGenerating,
  isRateLimited,
}: {
  type: InsightType;
  onGenerate: () => void;
  isGenerating: boolean;
  isRateLimited: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="w-16 h-16 bg-neutral-100 rounded-2xl flex items-center justify-center mb-4">
        <span className="text-3xl opacity-50">{INSIGHT_ICONS[type]}</span>
      </div>
      <h3 className="text-neutral-900 font-medium mb-1">
        {INSIGHT_TYPE_LABELS[type]}
      </h3>
      <p className="text-neutral-500 text-sm text-center mb-6 max-w-sm">
        {INSIGHT_TYPE_DESCRIPTIONS[type]}
      </p>
      <button
        onClick={onGenerate}
        disabled={isGenerating || isRateLimited}
        className="btn-primary text-sm px-6 py-2 disabled:opacity-50"
      >
        {isRateLimited ? 'Rate Limited' : 'Generate Insight'}
      </button>
    </div>
  );
}

interface InsightContentProps {
  insight: AiInsight;
  onRegenerate: () => void;
  isRegenerating: boolean;
  formatDate: (date: string) => string;
}

function InsightContent({
  insight,
  onRegenerate,
  isRegenerating,
  formatDate,
}: InsightContentProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`badge text-xs ${
              insight.fromCache ? 'badge-warning' : 'badge-success'
            }`}
          >
            {insight.fromCache ? 'Cached' : 'Fresh'}
          </span>
          <span className="text-xs text-neutral-500">
            Generated {formatDate(insight.generatedAt)}
          </span>
          {insight.tokenUsage && (
            <span className="text-xs text-neutral-400">
              {insight.tokenUsage.totalTokens.toLocaleString()} tokens
            </span>
          )}
        </div>
        <button
          onClick={onRegenerate}
          disabled={isRegenerating}
          className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-50"
        >
          <span className={isRegenerating ? 'animate-spin' : ''}>🔄</span>
          Regenerate
        </button>
      </div>

      <div className="prose prose-sm max-w-none">
        <div className="bg-neutral-50 rounded-xl p-4 sm:p-6 border border-neutral-200/50">
          <InsightTextRenderer content={insight.content} />
        </div>
      </div>

      {insight.modelId && (
        <div className="flex items-center justify-end">
          <span className="text-xs text-neutral-400">
            Model: {insight.modelId.split('.').pop()}
          </span>
        </div>
      )}
    </div>
  );
}

function InsightTextRenderer({ content }: { content: Record<string, unknown> | string }) {
  // Handle JSON content from AI
  if (typeof content === 'object') {
    return <JsonContentRenderer data={content} />;
  }
  
  const sections = String(content).split(/\n{2,}/);

  return (
    <div className="space-y-4">
      {sections.map((section, idx) => {
        if (section.startsWith('# ')) {
          return (
            <h3 key={idx} className="text-lg font-bold text-neutral-900 mt-2">
              {section.replace('# ', '')}
            </h3>
          );
        }
        if (section.startsWith('## ')) {
          return (
            <h4 key={idx} className="text-base font-semibold text-neutral-800 mt-2">
              {section.replace('## ', '')}
            </h4>
          );
        }
        if (section.startsWith('### ')) {
          return (
            <h5 key={idx} className="text-sm font-semibold text-neutral-700 mt-1">
              {section.replace('### ', '')}
            </h5>
          );
        }
        if (section.startsWith('- ') || section.startsWith('* ')) {
          const items = section.split('\n').filter((line) => line.trim());
          return (
            <ul key={idx} className="list-disc list-inside space-y-1 text-neutral-700">
              {items.map((item, i) => (
                <li key={i} className="text-sm">
                  {item.replace(/^[-*]\s*/, '')}
                </li>
              ))}
            </ul>
          );
        }
        if (/^\d+\.\s/.test(section)) {
          const items = section.split('\n').filter((line) => line.trim());
          return (
            <ol key={idx} className="list-decimal list-inside space-y-1 text-neutral-700">
              {items.map((item, i) => (
                <li key={i} className="text-sm">
                  {item.replace(/^\d+\.\s*/, '')}
                </li>
              ))}
            </ol>
          );
        }
        if (section.startsWith('**') && section.endsWith('**')) {
          return (
            <p key={idx} className="font-semibold text-neutral-800">
              {section.replace(/\*\*/g, '')}
            </p>
          );
        }
        return (
          <p key={idx} className="text-sm text-neutral-700 leading-relaxed">
            {section}
          </p>
        );
      })}
    </div>
  );
}

// Renders JSON content from AI insights in a human-readable format
function JsonContentRenderer({ data }: { data: Record<string, unknown> }) {
  const formatKey = (key: string) => 
    key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const renderValue = (value: unknown, depth: number = 0): React.ReactNode => {
    if (value === null || value === undefined) {
      return <span className="text-neutral-400 italic">N/A</span>;
    }
    if (typeof value === 'boolean') {
      return <span className={value ? 'text-green-600' : 'text-red-600'}>{value ? 'Yes' : 'No'}</span>;
    }
    if (typeof value === 'number') {
      return <span className="font-mono text-blue-600">{value.toLocaleString()}</span>;
    }
    if (typeof value === 'string') {
      return <span className="text-neutral-700">{value}</span>;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return <span className="text-neutral-400 italic">None</span>;
      return (
        <ul className="list-disc list-inside space-y-1 ml-2">
          {value.map((item, i) => (
            <li key={i} className="text-sm text-neutral-700">
              {typeof item === 'object' ? renderValue(item, depth + 1) : String(item)}
            </li>
          ))}
        </ul>
      );
    }
    if (typeof value === 'object') {
      return (
        <div className={`space-y-2 ${depth > 0 ? 'ml-4 border-l-2 border-neutral-200 pl-3' : ''}`}>
          {Object.entries(value).map(([k, v]) => (
            <div key={k}>
              <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">{formatKey(k)}: </span>
              {renderValue(v, depth + 1)}
            </div>
          ))}
        </div>
      );
    }
    return String(value);
  };

  // Check for error response
  if (data.error === true) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700 font-medium">Error generating insight</p>
        <p className="text-red-600 text-sm mt-1">{String(data.message || 'Unknown error')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="border-b border-neutral-100 pb-3 last:border-0 last:pb-0">
          <h4 className="text-sm font-semibold text-neutral-800 mb-2">{formatKey(key)}</h4>
          <div className="text-sm">{renderValue(value)}</div>
        </div>
      ))}
    </div>
  );
}
