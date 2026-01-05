/**
 * AWS Bedrock Service for AI Insights
 * Uses Nova Lite model with Knowledge Base retrieval for regulation-aware insights
 * Optimized for low TTFT with structured prompts and concise system messages
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand
} from "@aws-sdk/client-bedrock-runtime";

import {
  BedrockAgentRuntimeClient,
  RetrieveCommand
} from "@aws-sdk/client-bedrock-agent-runtime";

import crypto from "crypto";
import type { AiInsightType } from "../../../packages/shared/schema";

// Configuration - all configurable via environment variables
const AWS_REGION = process.env.AWS_REGION || "us-east-2";
const KNOWLEDGE_BASE_ID = process.env.AWS_BEDROCK_KNOWLEDGE_BASE_ID || "";
// Model ID can be overridden via environment variable (default: Nova Lite with US regional inference profile)
const MODEL_ID = process.env.AWS_BEDROCK_MODEL_ID || "us.amazon.nova-lite-v1:0";

console.log(`[Bedrock:CONFIG] Region: ${AWS_REGION}, Model: ${MODEL_ID}, KB: ${KNOWLEDGE_BASE_ID ? "configured" : "not configured"}`);

// Sanitize AWS credentials - trim whitespace that may have been introduced during copy/paste
function getAwsCredentials() {
  const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || "").trim();
  
  // Validate format
  if (accessKeyId && accessKeyId.length !== 20) {
    console.warn(`[Bedrock] Warning: AWS_ACCESS_KEY_ID has unexpected length ${accessKeyId.length} (expected 20)`);
  }
  if (secretAccessKey && secretAccessKey.length !== 40) {
    console.warn(`[Bedrock] Warning: AWS_SECRET_ACCESS_KEY has unexpected length ${secretAccessKey.length} (expected 40)`);
  }
  
  return { accessKeyId, secretAccessKey };
}

// Rate limiting configuration - configurable via environment variables
// Validate and parse rate limit values with safe defaults
function parseRateLimit(envVar: string | undefined, defaultValue: number): number {
  if (!envVar) return defaultValue;
  const parsed = parseInt(envVar, 10);
  if (isNaN(parsed) || parsed <= 0) {
    console.warn(`[Bedrock:CONFIG] Invalid rate limit value "${envVar}", using default: ${defaultValue}`);
    return defaultValue;
  }
  return parsed;
}

const RATE_LIMIT = {
  maxRequestsPerMinute: parseRateLimit(process.env.AI_RATE_LIMIT_PER_MINUTE, 10),
  maxRequestsPerHour: parseRateLimit(process.env.AI_RATE_LIMIT_PER_HOUR, 100),
  requestWindow: new Map<string, number[]>()
};

console.log(`[Bedrock:CONFIG] Rate limits: ${RATE_LIMIT.maxRequestsPerMinute}/min, ${RATE_LIMIT.maxRequestsPerHour}/hour`);

// Clients (lazy initialized)
let runtimeClient: BedrockRuntimeClient | null = null;
let agentClient: BedrockAgentRuntimeClient | null = null;

function getBedrockRuntimeClient(): BedrockRuntimeClient {
  if (!runtimeClient) {
    const creds = getAwsCredentials();
    runtimeClient = new BedrockRuntimeClient({
      region: AWS_REGION,
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey
      }
    });
  }
  return runtimeClient;
}

function getBedrockAgentClient(): BedrockAgentRuntimeClient {
  if (!agentClient) {
    const creds = getAwsCredentials();
    agentClient = new BedrockAgentRuntimeClient({
      region: AWS_REGION,
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey
      }
    });
  }
  return agentClient;
}

// Rate limiting check
function checkRateLimit(userId: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  const oneHourAgo = now - 3600000;

  let userRequests = RATE_LIMIT.requestWindow.get(userId) || [];
  
  // Clean old entries
  userRequests = userRequests.filter(ts => ts > oneHourAgo);
  
  const requestsLastMinute = userRequests.filter(ts => ts > oneMinuteAgo).length;
  const requestsLastHour = userRequests.length;

  if (requestsLastMinute >= RATE_LIMIT.maxRequestsPerMinute) {
    const oldestInMinute = userRequests.filter(ts => ts > oneMinuteAgo)[0];
    return { allowed: false, retryAfterMs: oldestInMinute + 60000 - now };
  }

  if (requestsLastHour >= RATE_LIMIT.maxRequestsPerHour) {
    const oldestInHour = userRequests[0];
    return { allowed: false, retryAfterMs: oldestInHour + 3600000 - now };
  }

  // Record this request
  userRequests.push(now);
  RATE_LIMIT.requestWindow.set(userId, userRequests);

  return { allowed: true };
}

// Generate SHA256 hash for cache validation
// Includes flightPlanId to ensure proper cache isolation per flight plan
export function generateInputHash(data: any, flightPlanId?: number | null): string {
  const hashInput = {
    ...data,
    flightPlanId: flightPlanId ?? null
  };
  const normalized = JSON.stringify(hashInput, Object.keys(hashInput).sort());
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

// Guardrail instructions for all prompts
const GUARDRAILS = [
  "NEVER give percentage-based quality ratings implying the optimization is incomplete",
  "Present the allocation as the OPTIMAL solution given the constraints",
  "Frame suggestions as OPERATIONAL considerations, NOT algorithm corrections",
  "Focus on INFORMING the user, not critiquing optimization quality",
  "Report constraint violations factually without implying algorithmic failure",
];

// Compact JSON schema definitions for each insight type
const JSON_SCHEMAS: Record<AiInsightType, string> = {
  allocation_summary: `{
  "summary": "string (2-3 sentence overview)",
  "key_metrics": { "utilization_percentage": number, "balance_status": "optimal|acceptable|needs_attention", "risk_level": "low|medium|high" },
  "optimization_suggestions": ["string"],
  "risk_flags": ["string"],
  "regulation_notes": ["string"]
}`,

  cob_analysis: `{
  "cob_assessment": { "current_mac_percent": number, "target_mac_percent": 28, "deviation": number, "status": "within_limits|marginal|out_of_limits" },
  "balance_analysis": "string",
  "safety_notes": ["string"],
  "optimization_recommendations": ["string"]
}`,

  pallet_review: `{
  "pallet_efficiency": { "weight_utilization": number, "volume_utilization": number, "overall_grade": "A|B|C|D" },
  "configuration_notes": ["string"],
  "tiedown_recommendations": ["string"],
  "hazmat_proximity_issues": ["string or 'None identified'"]
}`,

  route_planning: `{
  "route_assessment": { "total_distance_nm": number, "estimated_fuel_lb": number, "efficiency_rating": "optimal|acceptable|suboptimal" },
  "optimization_notes": ["string"],
  "fuel_efficiency_tips": ["string"],
  "alternate_routes": ["string"]
}`,

  compliance: `{
  "compliance_status": "compliant|needs_review|non_compliant",
  "regulation_citations": [{ "regulation": "string", "section": "string", "requirement": "string" }],
  "checklist_items": [{ "item": "string", "status": "complete|incomplete|na", "notes": "string" }],
  "hazmat_requirements": ["string"],
  "action_items": ["string"]
}`,

  mission_briefing: `{
  "mission_overview": "string (1-2 paragraph summary)",
  "key_statistics": { "total_cargo_weight_lb": number, "aircraft_count": number, "pallet_count": number, "pax_count": number },
  "critical_items": ["string"],
  "commander_notes": ["string"]
}`,

  mission_analytics: `{
  "mission_summary": { "total_aircraft": number, "aircraft_breakdown": [{ "type": "C-17|C-130", "count": number, "total_weight_lb": number }], "total_pallets": number, "total_weight_lb": number, "total_pax": number },
  "route_details": [{ "flight_id": "string", "origin": "ICAO", "destination": "ICAO", "distance_nm": number, "cargo_weight_lb": number }],
  "performance_metrics": { "overall_utilization_percent": number, "average_cob_percent": number, "efficiency_grade": "A|B|C|D", "cob_status": "all_in_envelope|some_marginal|issues_detected" },
  "advice_messages": [{ "priority": "high|medium|low", "category": "optimization|safety|compliance|efficiency", "message": "string", "action": "string" }],
  "risk_assessment": { "overall_risk": "low|medium|high", "risk_factors": ["string"], "mitigation_notes": ["string"] }
}`,

  flight_allocation_analysis: `{
  "executive_summary": "string (use EXACT numbers from summary)",
  "fleet_status": { "aircraft_used": number, "total_pallets_loaded": number, "total_rolling_stock_loaded": number, "total_pax": number, "total_cargo_weight_lb": number, "average_utilization_percent": number },
  "aircraft_selection_rationale": { "c17_rationale": "string", "c130_rationale": "string", "fleet_mix_reasoning": "string" },
  "cob_summary": { "aircraft_in_envelope": number, "aircraft_out_of_envelope": number, "worst_offender": "string|null", "corrective_action": "string" },
  "special_cargo_notes": { "advon_items": "string", "hazmat_items": "string", "oversized_items": "string" },
  "fleet_shortage_analysis": { "has_unloaded_cargo": boolean, "unloaded_item_count": number, "unloaded_weight_lb": number, "recommended_additional_aircraft": [] },
  "optimization_notes": ["string"]
}`
};

// Required fields for response validation
const RESPONSE_SCHEMAS: Record<string, string[]> = {
  allocation_summary: ["summary", "key_metrics", "optimization_suggestions", "risk_flags"],
  cob_analysis: ["cob_assessment", "balance_analysis", "safety_notes"],
  pallet_review: ["pallet_efficiency", "configuration_notes", "tiedown_recommendations"],
  route_planning: ["route_assessment", "optimization_notes", "fuel_efficiency_tips"],
  compliance: ["compliance_status", "regulation_citations", "checklist_items"],
  mission_briefing: ["mission_overview", "key_statistics", "critical_items"],
  mission_analytics: ["mission_summary", "performance_metrics", "advice_messages", "risk_assessment"],
  flight_allocation_analysis: ["executive_summary", "fleet_status", "cob_summary", "fleet_shortage_analysis"],
  warehouse_optimization: ["summary", "recommendations", "metrics"],
};

// Knowledge base query mappings per insight type
const KB_QUERIES: Record<AiInsightType, string> = {
  allocation_summary: "military cargo allocation regulations weight limits",
  cob_analysis: "aircraft center of gravity MAC percentage safety limits",
  pallet_review: "463L pallet tiedown hazmat cargo stacking regulations",
  route_planning: "military airlift route planning fuel efficiency",
  compliance: "DoD cargo transportation regulations hazmat compliance",
  mission_briefing: "military mission briefing format requirements",
  mission_analytics: "military airlift mission performance metrics efficiency optimization",
  flight_allocation_analysis: "military airlift fleet allocation cargo loading regulations"
};

// Validate response against expected schema fields
function validateResponse(result: any, insightType: string): { valid: boolean; missing: string[] } {
  const expectedFields = RESPONSE_SCHEMAS[insightType] || [];
  if (!result || typeof result !== 'object' || result.error) {
    return { valid: false, missing: expectedFields };
  }
  const missing = expectedFields.filter(field => !(field in result));
  return { valid: missing.length === 0, missing };
}

// Build structured prompt in CONTEXT/QUERY/INSTRUCTION format for low TTFT
function buildStructuredPrompt(
  context: string,
  queryData: string,
  schema: string,
  guardrails: string[]
): { system: string; user: string } {
  // Concise system prompt for faster first token
  const system = `You are an expert military logistics analyst. Output ONLY valid JSON matching the schema. No markdown, no explanations.

GUARDRAILS:
${guardrails.map((g, i) => `${i + 1}. ${g}`).join('\n')}`;

  // Structured user prompt
  const user = context
    ? `### CONTEXT START
${context}
### CONTEXT END

### QUERY
${queryData}

### INSTRUCTION
Generate structured JSON matching this schema:
${schema}

Output ONLY the JSON object. No other text.`
    : `### QUERY
${queryData}

### INSTRUCTION
Generate structured JSON matching this schema:
${schema}

Output ONLY the JSON object. No other text.`;

  return { system, user };
}

// Retrieve context from Knowledge Base
async function retrieveKnowledgeBaseContext(query: string, maxResults: number = 3): Promise<string> {
  if (!KNOWLEDGE_BASE_ID) {
    console.log("[Bedrock] No Knowledge Base ID configured, skipping retrieval");
    return "";
  }

  const kbStartTime = Date.now();
  console.log("[Bedrock:TIMING] KB retrieval started");

  try {
    const client = getBedrockAgentClient();
    const command = new RetrieveCommand({
      knowledgeBaseId: KNOWLEDGE_BASE_ID,
      retrievalQuery: { text: query },
      retrievalConfiguration: { 
        vectorSearchConfiguration: { 
          numberOfResults: maxResults 
        } 
      }
    });

    const response = await client.send(command);
    const kbDuration = Date.now() - kbStartTime;
    
    if (!response.retrievalResults || response.retrievalResults.length === 0) {
      console.log("[Bedrock:TIMING] KB retrieval completed", { durationMs: kbDuration, contextLength: 0 });
      return "";
    }

    const context = response.retrievalResults
      .map(r => r.content?.text || "")
      .filter(text => text.length > 0)
      .join("\n\n---\n\n");

    console.log("[Bedrock:TIMING] KB retrieval completed", { durationMs: kbDuration, contextLength: context.length });
    return context;
  } catch (error) {
    const kbDuration = Date.now() - kbStartTime;
    console.error("[Bedrock:ERROR] KB retrieval failed", { durationMs: kbDuration, error });
    return "";
  }
}

// Invoke Nova Lite model with structured prompts
async function invokeModel(
  systemPrompt: string,
  userPrompt: string
): Promise<{ result: any; tokenUsage: { inputTokens: number; outputTokens: number }; ttftMs: number }> {
  const invokeStartTime = Date.now();
  console.log("[Bedrock:TIMING] Model invocation started", { modelId: MODEL_ID });
  
  try {
    const client = getBedrockRuntimeClient();

    const requestBody = {
      schemaVersion: "messages-v1",
      messages: [
        {
          role: "user",
          content: [{ text: userPrompt }]
        }
      ],
      system: [{ text: systemPrompt }],
      inferenceConfig: {
        max_new_tokens: 2048,
        temperature: 0.3,
        top_p: 0.9
      }
    };

    const command = new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(requestBody)
    });

    const response = await client.send(command);
    const ttftMs = Date.now() - invokeStartTime;
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    // Extract text from Nova response format
    let resultText = "";
    if (responseBody.output?.message?.content) {
      resultText = responseBody.output.message.content
        .map((c: any) => c.text || "")
        .join("");
    }

    // Parse and validate JSON from response
    let parsedResult: any;
    let isValidJson = false;
    try {
      // Try to extract JSON from the response
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[0]);
        // Validate it's a proper object (not null)
        isValidJson = parsedResult !== null && typeof parsedResult === 'object';
      }
      
      if (!isValidJson) {
        parsedResult = {
          error: true,
          errorType: "json_extraction_failed",
          message: "No valid JSON object found in model response",
          rawResponse: resultText.substring(0, 500)
        };
      }
    } catch (e) {
      parsedResult = {
        error: true,
        errorType: "json_parse_error",
        message: e instanceof Error ? e.message : "Failed to parse JSON",
        rawResponse: resultText.substring(0, 500)
      };
    }

    const tokenUsage = {
      inputTokens: responseBody.usage?.inputTokens || 0,
      outputTokens: responseBody.usage?.outputTokens || 0
    };

    console.log("[Bedrock:TIMING] Model response received", { 
      ttftMs, 
      tokenUsage, 
      hasValidJson: isValidJson,
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length
    });

    return { result: parsedResult, tokenUsage, ttftMs };
  } catch (error) {
    const ttftMs = Date.now() - invokeStartTime;
    console.error("[Bedrock:ERROR] Model invocation failed", { ttftMs, error });
    throw error;
  }
}

// Main function to generate insight
export interface GenerateInsightOptions {
  type: AiInsightType;
  inputData: any;
  userId: string;
  flightPlanId?: number | null;
  forceRegenerate?: boolean;
}

export interface InsightResult {
  insight: any;
  inputHash: string;
  tokenUsage: { inputTokens: number; outputTokens: number };
  fromCache: boolean;
  timingMs?: { kb: number; model: number; total: number };
}

export async function generateInsight(
  options: GenerateInsightOptions
): Promise<InsightResult> {
  const { type, inputData, userId, flightPlanId, forceRegenerate = false } = options;
  const totalStartTime = Date.now();

  // Include flightPlanId in hash to ensure proper cache isolation per flight plan
  const inputHash = generateInputHash({ type, ...inputData }, flightPlanId);
  
  console.log("[Bedrock:TIMING] Insight generation started", { type, flightPlanId, inputHash });

  try {
    // Rate limit check
    const rateCheck = checkRateLimit(userId);
    if (!rateCheck.allowed) {
      throw new Error(`Rate limit exceeded. Try again in ${Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)} seconds.`);
    }

    const schema = JSON_SCHEMAS[type];
    if (!schema) {
      throw new Error(`Unknown insight type: ${type}`);
    }

    // Retrieve knowledge base context
    const kbStartTime = Date.now();
    const kbQuery = KB_QUERIES[type] || `military logistics ${type}`;
    const kbContext = await retrieveKnowledgeBaseContext(kbQuery);
    const kbDuration = Date.now() - kbStartTime;

    // Build structured prompt
    const queryData = JSON.stringify(inputData, null, 2);
    const { system, user } = buildStructuredPrompt(kbContext, queryData, schema, GUARDRAILS);

    // Invoke model
    const modelStartTime = Date.now();
    const { result, tokenUsage, ttftMs } = await invokeModel(system, user);
    const modelDuration = Date.now() - modelStartTime;

    // Validate response structure
    const validation = validateResponse(result, type);
    if (!validation.valid) {
      console.warn("[Bedrock:VALIDATION] Response missing required fields", { 
        type, 
        missing: validation.missing,
        hasError: !!result?.error
      });
    }

    const totalDuration = Date.now() - totalStartTime;
    console.log("[Bedrock:TIMING] Insight generation completed", {
      type,
      kbMs: kbDuration,
      modelMs: modelDuration,
      ttftMs,
      totalMs: totalDuration,
      valid: validation.valid
    });

    return {
      insight: result,
      inputHash,
      tokenUsage,
      fromCache: false,
      timingMs: { kb: kbDuration, model: modelDuration, total: totalDuration }
    };
  } catch (error) {
    const totalDuration = Date.now() - totalStartTime;
    console.error("[Bedrock:ERROR] Insight generation failed", { type, totalMs: totalDuration, error });
    throw error;
  }
}

// Health check for Bedrock connectivity
export async function checkBedrockHealth(): Promise<{
  healthy: boolean;
  knowledgeBaseConfigured: boolean;
  error?: string;
}> {
  try {
    const knowledgeBaseConfigured = !!KNOWLEDGE_BASE_ID;
    
    // Try a minimal model invocation
    const client = getBedrockRuntimeClient();
    const command = new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        schemaVersion: "messages-v1",
        messages: [{ role: "user", content: [{ text: "test" }] }],
        inferenceConfig: { max_new_tokens: 5 }
      })
    });

    await client.send(command);
    
    return { healthy: true, knowledgeBaseConfigured };
  } catch (error) {
    return { 
      healthy: false, 
      knowledgeBaseConfigured: !!KNOWLEDGE_BASE_ID,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

export default {
  generateInsight,
  generateInputHash,
  checkBedrockHealth
};
