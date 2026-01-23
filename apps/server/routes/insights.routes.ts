import { Router } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { storage } from "../storage";
import { generateInsight, generateInputHash, checkBedrockHealth } from "../services/bedrockService";

const router = Router();

const mapInsightToCamelCase = (insight: any) => ({
  id: insight.id,
  userId: insight.user_id,
  flightPlanId: insight.flight_plan_id,
  insightType: insight.insight_type,
  inputHash: insight.input_hash,
  content: insight.insight_data,
  modelId: "amazon.nova-lite-v1:0",
  tokenUsage: insight.token_usage ? {
    inputTokens: insight.token_usage.inputTokens || 0,
    outputTokens: insight.token_usage.outputTokens || 0,
    totalTokens: (insight.token_usage.inputTokens || 0) + (insight.token_usage.outputTokens || 0)
  } : null,
  generatedAt: insight.created_at,
  regeneratedAt: insight.regenerated_at,
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
});

// ============================================================================
// AI INSIGHTS ROUTES
// ============================================================================

router.get("/insights/health", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const health = await checkBedrockHealth();
    res.json(health);
  } catch (error) {
    console.error("[Insights] Health check error:", error);
    res.status(500).json({ 
      healthy: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
});

router.get("/insights/flight-plan/:planId", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const planId = parseInt(req.params.planId);
    if (isNaN(planId)) {
      return res.status(400).json({ error: "Invalid plan ID" });
    }
    
    const insights = await storage.getAiInsightsByPlan(req.user!.id, planId);
    res.json(insights.map(mapInsightToCamelCase));
  } catch (error) {
    console.error("[Insights] Failed to get insights:", error);
    res.status(500).json({ error: "Failed to retrieve insights" });
  }
});

router.post("/insights/generate", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { type, inputData, flightPlanId, forceRegenerate = false } = req.body;
    
    if (!type || !inputData) {
      return res.status(400).json({ error: "Missing required fields: type, inputData" });
    }

    const validTypes = [
      'allocation_summary', 'cob_analysis', 'pallet_review', 'route_planning', 
      'compliance', 'mission_briefing', 'mission_analytics', 'flight_allocation_analysis',
      'land_convoy_analysis', 'land_route_optimization',
      'sea_voyage_analysis', 'sea_container_optimization',
      'cross_modal_manifest_analysis', 'warehouse_capacity_forecast'
    ];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid insight type. Must be one of: ${validTypes.join(', ')}` });
    }

    const inputHash = generateInputHash({ type, ...inputData }, flightPlanId || null);
    
    if (!forceRegenerate) {
      const cachedInsight = await storage.getAiInsight(
        req.user!.id,
        flightPlanId || null,
        type,
        inputHash
      );
      
      if (cachedInsight) {
        console.log(`[Insights] Cache hit for ${type}`);
        return res.json({
          insight: {
            ...mapInsightToCamelCase(cachedInsight),
            fromCache: true
          },
          fromCache: true
        });
      }
    }

    console.log(`[Insights] Generating new insight for ${type}${forceRegenerate ? ' (forced)' : ''}`);
    
    const result = await generateInsight({
      type,
      inputData,
      userId: String(req.user!.id),
      flightPlanId: flightPlanId || null,
      forceRegenerate
    });

    const savedInsight = await storage.createAiInsight({
      user_id: req.user!.id,
      flight_plan_id: flightPlanId || null,
      insight_type: type,
      input_hash: inputHash,
      insight_data: result.insight,
      token_usage: result.tokenUsage
    });

    const mappedInsight = {
      ...mapInsightToCamelCase(savedInsight),
      fromCache: false
    };
    res.json({
      insight: mappedInsight,
      fromCache: false
    });
  } catch (error) {
    console.error("[Insights] Generation error:", error);
    
    if (error instanceof Error && error.message.includes("Rate limit")) {
      return res.status(429).json({ error: error.message });
    }
    
    res.status(500).json({ 
      error: "Failed to generate insight",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

router.delete("/insights/flight-plan/:planId", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const planId = parseInt(req.params.planId);
    if (isNaN(planId)) {
      return res.status(400).json({ error: "Invalid plan ID" });
    }
    
    await storage.deleteAiInsightsByPlan(req.user!.id, planId);
    res.status(204).send();
  } catch (error) {
    console.error("[Insights] Delete error:", error);
    res.status(500).json({ error: "Failed to delete insights" });
  }
});

export default router;
