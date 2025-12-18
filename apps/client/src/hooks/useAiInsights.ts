import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

export type InsightType = 
  | 'allocation_summary'
  | 'cob_analysis'
  | 'pallet_review'
  | 'route_planning'
  | 'compliance'
  | 'mission_briefing'
  | 'mission_analytics';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AiInsight {
  id: number;
  flightPlanId: number | null;
  insightType: InsightType;
  inputHash?: string;
  content: Record<string, unknown>;
  modelId: string;
  tokenUsage: TokenUsage | null;
  fromCache?: boolean;
  generatedAt: string;
  regeneratedAt?: string | null;
  expiresAt: string;
}

export interface GenerateInsightRequest {
  type: InsightType;
  inputData: Record<string, unknown>;
  flightPlanId: number;
  forceRegenerate?: boolean;
}

export interface GenerateInsightResponse {
  insight: AiInsight;
  fromCache: boolean;
}

interface UseAiInsightsOptions {
  flightPlanId: number;
  enabled?: boolean;
}

interface UseAiInsightsReturn {
  insights: AiInsight[];
  isLoading: boolean;
  error: Error | null;
  isRateLimited: boolean;
  rateLimitRetryAfter: number | null;
  generateInsight: (request: GenerateInsightRequest) => Promise<GenerateInsightResponse>;
  isGenerating: boolean;
  generateError: Error | null;
  refetch: () => void;
  getInsightByType: (type: InsightType) => AiInsight | undefined;
}

async function fetchInsights(flightPlanId: number): Promise<AiInsight[]> {
  console.log("[AiInsights:DEBUG] Fetching insights", { flightPlanId });
  
  const response = await fetch(`/api/insights/flight-plan/${flightPlanId}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    if (response.status === 404) {
      console.log("[AiInsights:DEBUG] No insights found (404)", { flightPlanId });
      return [];
    }
    const errorText = await response.text();
    const error = new Error(errorText || `Failed to fetch insights: ${response.status}`);
    console.error("[AiInsights:ERROR]", error);
    throw error;
  }

  const insights = await response.json();
  console.log("[AiInsights:DEBUG] Insights fetched successfully", { flightPlanId, count: insights.length });
  return insights;
}

async function generateInsightApi(request: GenerateInsightRequest): Promise<GenerateInsightResponse> {
  console.log("[AiInsights:DEBUG] Generating insight", { type: request.type, flightPlanId: request.flightPlanId });
  
  const response = await fetch('/api/insights/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const error = new Error('Rate limit exceeded. Please try again later.') as Error & { retryAfter?: number };
      error.retryAfter = retryAfter ? parseInt(retryAfter, 10) : 60;
      console.error("[AiInsights:ERROR]", error);
      throw error;
    }
    const errorText = await response.text();
    const error = new Error(errorText || `Failed to generate insight: ${response.status}`);
    console.error("[AiInsights:ERROR]", error);
    throw error;
  }

  const data = await response.json();
  console.log("[AiInsights:DEBUG] Insight received", { type: request.type, fromCache: data.fromCache });
  return data;
}

export function useAiInsights({ flightPlanId, enabled = true }: UseAiInsightsOptions): UseAiInsightsReturn {
  const queryClient = useQueryClient();
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [rateLimitRetryAfter, setRateLimitRetryAfter] = useState<number | null>(null);

  const queryKey = ['ai-insights', flightPlanId];

  const {
    data: insights = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => fetchInsights(flightPlanId),
    enabled: enabled && flightPlanId > 0,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const mutation = useMutation({
    mutationFn: generateInsightApi,
    onSuccess: (data) => {
      console.log("[AiInsights:DEBUG] Mutation success", { insightType: data.insight.insightType, fromCache: data.fromCache });
      setIsRateLimited(false);
      setRateLimitRetryAfter(null);
      queryClient.setQueryData<AiInsight[]>(queryKey, (oldData = []) => {
        const existingIndex = oldData.findIndex(
          (i) => i.insightType === data.insight.insightType
        );
        if (existingIndex >= 0) {
          const newData = [...oldData];
          newData[existingIndex] = data.insight;
          return newData;
        }
        return [...oldData, data.insight];
      });
    },
    onError: (err: Error & { retryAfter?: number }) => {
      console.error("[AiInsights:ERROR]", err);
      if (err.message.includes('Rate limit')) {
        setIsRateLimited(true);
        setRateLimitRetryAfter(err.retryAfter || 60);
        setTimeout(() => {
          setIsRateLimited(false);
          setRateLimitRetryAfter(null);
        }, (err.retryAfter || 60) * 1000);
      }
    },
  });

  const generateInsight = useCallback(
    async (request: GenerateInsightRequest): Promise<GenerateInsightResponse> => {
      return mutation.mutateAsync(request);
    },
    [mutation]
  );

  const getInsightByType = useCallback(
    (type: InsightType): AiInsight | undefined => {
      return insights.find((i) => i.insightType === type);
    },
    [insights]
  );

  return {
    insights,
    isLoading,
    error: error as Error | null,
    isRateLimited,
    rateLimitRetryAfter,
    generateInsight,
    isGenerating: mutation.isPending,
    generateError: mutation.error as Error | null,
    refetch,
    getInsightByType,
  };
}

export const INSIGHT_TYPE_LABELS: Record<InsightType, string> = {
  allocation_summary: 'Allocation Summary',
  cob_analysis: 'CoB Analysis',
  pallet_review: 'Pallet Review',
  route_planning: 'Route Planning',
  compliance: 'Compliance',
  mission_briefing: 'Mission Briefing',
  mission_analytics: 'Mission Analytics',
};

export const INSIGHT_TYPE_DESCRIPTIONS: Record<InsightType, string> = {
  allocation_summary: 'Overview of cargo allocation across aircraft',
  cob_analysis: 'Center of balance analysis and recommendations',
  pallet_review: 'Detailed review of pallet loading efficiency',
  route_planning: 'Route optimization and fuel efficiency insights',
  compliance: 'Regulatory compliance and safety checks',
  mission_briefing: 'Executive summary for mission commanders',
  mission_analytics: 'Comprehensive analytics with performance metrics and actionable advice',
};
