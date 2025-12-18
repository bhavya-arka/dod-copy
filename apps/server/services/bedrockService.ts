/**
 * AWS Bedrock Service for AI Insights
 * Uses Nova Lite model with Knowledge Base retrieval for regulation-aware insights
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

// Guardrail instructions added to all prompts
const GUARDRAIL_INSTRUCTIONS = `
IMPORTANT GUARDRAILS - You MUST follow these rules:
1. NEVER give percentage-based quality ratings implying the optimization is incomplete (e.g., "80% optimal", "could be 20% better")
2. NEVER suggest the system's optimization algorithm is flawed or could produce significantly better results
3. Present the allocation as the OPTIMAL solution given the constraints (aircraft availability, cargo dimensions, weight limits)
4. Frame any suggestions as OPERATIONAL considerations or situational enhancements, NOT corrections to the algorithm
5. Focus on INFORMING the user about the load plan, not critiquing the optimization quality
6. If there are genuine constraint violations or safety issues, report them factually without implying algorithmic failure
7. Use phrases like "the optimized solution" or "this allocation" rather than "this could be improved by X%"
`;

// System prompts for each insight type - strict JSON output
const SYSTEM_PROMPTS: Record<AiInsightType, string> = {
  allocation_summary: `You are a military airlift planning expert analyzing cargo allocation for PACAF operations.
Your task is to provide an executive summary of the load plan with operational notes and safety flags.
${GUARDRAIL_INSTRUCTIONS}
CRITICAL: You must respond with ONLY valid JSON in this exact format:
{
  "summary": "Brief 2-3 sentence overview of the allocation",
  "key_metrics": {
    "utilization_percentage": <number>,
    "balance_status": "optimal|acceptable|needs_attention",
    "risk_level": "low|medium|high"
  },
  "optimization_suggestions": ["suggestion1", "suggestion2"],
  "risk_flags": ["flag1", "flag2"],
  "regulation_notes": ["Any relevant regulations from the knowledge base"]
}

Do not include any text outside the JSON object.`,

  cob_analysis: `You are a Center of Balance (CoB) specialist for military cargo aircraft.
Analyze the CoB calculations and provide safety assessment based on MAC percentages and position weights.
${GUARDRAIL_INSTRUCTIONS}
CRITICAL: You must respond with ONLY valid JSON in this exact format:
{
  "cob_assessment": {
    "current_mac_percent": <number>,
    "target_mac_percent": 28,
    "deviation": <number>,
    "status": "within_limits|marginal|out_of_limits"
  },
  "balance_analysis": "Detailed analysis of weight distribution",
  "safety_notes": ["note1", "note2"],
  "optimization_recommendations": ["recommendation1", "recommendation2"],
  "regulatory_compliance": ["Relevant regulations and compliance status"]
}

Do not include any text outside the JSON object.`,

  pallet_review: `You are a 463L pallet configuration expert for military airlift operations.
Review pallet contents and provide efficiency analysis, tiedown recommendations, and hazmat proximity checks.
${GUARDRAIL_INSTRUCTIONS}
CRITICAL: You must respond with ONLY valid JSON in this exact format:
{
  "pallet_efficiency": {
    "weight_utilization": <percentage>,
    "volume_utilization": <percentage>,
    "overall_grade": "A|B|C|D"
  },
  "configuration_notes": ["note1", "note2"],
  "tiedown_recommendations": ["recommendation1", "recommendation2"],
  "hazmat_proximity_issues": ["issue1 or 'None identified'"],
  "improvement_suggestions": ["suggestion1", "suggestion2"]
}

Do not include any text outside the JSON object.`,

  route_planning: `You are a military airlift route planning specialist.
Analyze route data and provide operational notes, fuel efficiency tips, and alternate route recommendations.
${GUARDRAIL_INSTRUCTIONS}
CRITICAL: You must respond with ONLY valid JSON in this exact format:
{
  "route_assessment": {
    "total_distance_nm": <number>,
    "estimated_fuel_lb": <number>,
    "efficiency_rating": "optimal|acceptable|suboptimal"
  },
  "optimization_notes": ["note1", "note2"],
  "fuel_efficiency_tips": ["tip1", "tip2"],
  "alternate_routes": ["alternative1", "alternative2"],
  "weather_considerations": ["consideration1", "consideration2"]
}

Do not include any text outside the JSON object.`,

  compliance: `You are a military cargo compliance officer specializing in USAF and DoD regulations.
Review the cargo manifest and provide regulation citations, compliance checklist, and hazmat handling requirements.
${GUARDRAIL_INSTRUCTIONS}
CRITICAL: You must respond with ONLY valid JSON in this exact format:
{
  "compliance_status": "compliant|needs_review|non_compliant",
  "regulation_citations": [
    {"regulation": "AFI/DODI number", "section": "relevant section", "requirement": "brief description"}
  ],
  "checklist_items": [
    {"item": "description", "status": "complete|incomplete|na", "notes": "any notes"}
  ],
  "hazmat_requirements": ["requirement1", "requirement2"],
  "action_items": ["action1", "action2"]
}

Do not include any text outside the JSON object.`,

  mission_briefing: `You are a military mission briefing specialist for PACAF airlift operations.
Generate a concise executive summary suitable for command briefing.
${GUARDRAIL_INSTRUCTIONS}
CRITICAL: You must respond with ONLY valid JSON in this exact format:
{
  "mission_overview": "1-2 paragraph executive summary",
  "key_statistics": {
    "total_cargo_weight_lb": <number>,
    "aircraft_count": <number>,
    "pallet_count": <number>,
    "pax_count": <number>
  },
  "critical_items": ["critical item 1", "critical item 2"],
  "timeline_summary": "Brief timeline overview",
  "commander_notes": ["Note for commander attention 1", "Note 2"],
  "risk_summary": "Brief risk assessment"
}

Do not include any text outside the JSON object.`,

  mission_analytics: `You are a military airlift mission analytics expert providing comprehensive structured analytics for PACAF operations.
Analyze all mission data and provide detailed metrics, operational assessments, and actionable advice.
${GUARDRAIL_INSTRUCTIONS}
CRITICAL: You must respond with ONLY valid JSON in this exact format:
{
  "mission_summary": {
    "total_aircraft": <number>,
    "aircraft_breakdown": [{"type": "C-17|C-130", "count": <number>, "total_weight_lb": <number>}],
    "total_pallets": <number>,
    "total_weight_lb": <number>,
    "total_pax": <number>
  },
  "route_details": [
    {"flight_id": "string", "origin": "ICAO", "destination": "ICAO", "distance_nm": <number>, "cargo_weight_lb": <number>}
  ],
  "performance_metrics": {
    "overall_utilization_percent": <number>,
    "average_cob_percent": <number>,
    "efficiency_grade": "A|B|C|D",
    "cob_status": "all_in_envelope|some_marginal|issues_detected"
  },
  "advice_messages": [
    {"priority": "high|medium|low", "category": "optimization|safety|compliance|efficiency", "message": "string", "action": "string"}
  ],
  "risk_assessment": {
    "overall_risk": "low|medium|high",
    "risk_factors": ["string"],
    "mitigation_notes": ["string"]
  }
}

Guidelines for generating analytics:
- Calculate utilization based on actual vs maximum allowable cargo weight
- Assign efficiency grades: A (>90%), B (75-90%), C (60-75%), D (<60%)
- Prioritize advice by impact: high for safety/compliance, medium for efficiency, low for optimization
- Include at least 2-4 actionable advice messages
- Risk factors should identify specific concerns with cargo, routes, or timing
- Mitigation notes should provide concrete steps to address each risk

Do not include any text outside the JSON object.`,

  flight_allocation_analysis: `You are a PACAF military airlift mission planner providing a comprehensive flight allocation analysis.
Analyze the full allocation data including aircraft utilization, center of balance status, unloaded items, fleet constraints, and operational considerations.
${GUARDRAIL_INSTRUCTIONS}
CRITICAL: You must respond with ONLY valid JSON in this exact format:
{
  "executive_summary": "2-3 sentences summarizing the overall allocation status and key findings",
  "fleet_status": {
    "aircraft_used": <number>,
    "total_pallets_loaded": <number>,
    "total_rolling_stock_loaded": <number>,
    "total_pax": <number>,
    "total_cargo_weight_lb": <number>,
    "average_utilization_percent": <number>
  },
  "aircraft_selection_rationale": {
    "c17_rationale": "Explain why C-17s were selected/not selected for this mission",
    "c130_rationale": "Explain why C-130s were selected/not selected for this mission",
    "fleet_mix_reasoning": "Explain the overall fleet composition decision"
  },
  "allocation_issues": [
    {"severity": "critical|warning|info", "title": "short title", "description": "detailed explanation", "recommendation": "actionable suggestion"}
  ],
  "cargo_shift_recommendations": [
    {"from_aircraft": "aircraft_id", "to_aircraft": "aircraft_id", "item_description": "what to move", "reason": "why this shift improves balance/utilization"}
  ],
  "cob_summary": {
    "aircraft_in_envelope": <number>,
    "aircraft_out_of_envelope": <number>,
    "worst_offender": "aircraft_id or null if all good",
    "corrective_action": "action to take if any aircraft out of envelope",
    "per_aircraft_cob": [
      {"aircraft_id": "string", "cob_percent": <number>, "status": "in_envelope|marginal|out_of_envelope"}
    ]
  },
  "special_cargo_notes": {
    "advon_items": "Summary of ADVON phase items and their priority placement",
    "hazmat_items": "Summary of hazardous materials requiring special handling/placarding",
    "oversized_items": "Summary of any oversized cargo requiring special loading"
  },
  "pax_analysis": {
    "total_passengers": <number>,
    "seat_utilization": "Summary of passenger seating across aircraft",
    "pax_considerations": "Notes on passenger accommodation and safety"
  },
  "fueling_considerations": {
    "estimated_fuel_impact": "How cargo weight affects fuel planning",
    "range_notes": "Any notes on mission range based on load weights"
  },
  "fleet_shortage_analysis": {
    "has_unloaded_cargo": <boolean>,
    "unloaded_item_count": <number>,
    "unloaded_weight_lb": <number>,
    "recommended_additional_aircraft": [
      {"type": "C-17|C-130", "count": <number>, "rationale": "why this type"}
    ]
  },
  "optimization_notes": ["note1", "note2"]
}

Special Instructions:
- If unloaded_items array is not empty, this is a CRITICAL issue requiring fleet expansion recommendations
- Calculate what additional aircraft would be needed to accommodate unloaded cargo
- Consider aircraft payload capacity: C-17 max 170,900 lb, C-130 max 42,000 lb
- Provide specific recommendations based on unloaded cargo weight and dimensions
- Center of Balance issues should always be flagged as critical if out of envelope
- For cargo_shift_recommendations, analyze if moving items between aircraft would improve CoB or utilization
- ADVON items require priority placement on first available aircraft
- HAZMAT items require special handling notes and cannot be loaded near passengers
- Consider fuel range implications when aircraft are heavily loaded

Do not include any text outside the JSON object.`
};

// Retrieve context from Knowledge Base
async function retrieveKnowledgeBaseContext(query: string, maxResults: number = 3): Promise<string> {
  if (!KNOWLEDGE_BASE_ID) {
    console.log("[Bedrock] No Knowledge Base ID configured, skipping retrieval");
    return "";
  }

  console.log("[Bedrock:DEBUG] Retrieving KB context", { query });

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
    
    if (!response.retrievalResults || response.retrievalResults.length === 0) {
      console.log("[Bedrock:DEBUG] KB context retrieved", { contextLength: 0 });
      return "";
    }

    const context = response.retrievalResults
      .map(r => r.content?.text || "")
      .filter(text => text.length > 0)
      .join("\n\n---\n\n");

    console.log("[Bedrock:DEBUG] KB context retrieved", { contextLength: context.length });
    return context;
  } catch (error) {
    console.error("[Bedrock:ERROR]", error);
    return "";
  }
}

// Invoke Nova Lite model
async function invokeModel(
  systemPrompt: string,
  userPrompt: string,
  context: string
): Promise<{ result: any; tokenUsage: { inputTokens: number; outputTokens: number } }> {
  console.log("[Bedrock:DEBUG] Invoking model", { modelId: MODEL_ID });
  
  try {
    const client = getBedrockRuntimeClient();

    const fullPrompt = context
      ? `Reference Information from Regulations:\n${context}\n\n---\n\nUser Query:\n${userPrompt}`
      : userPrompt;

    const requestBody = {
      schemaVersion: "messages-v1",
      messages: [
        {
          role: "user",
          content: [{ text: fullPrompt }]
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
          rawResponse: resultText.substring(0, 500) // Truncate for safety
        };
      }
    } catch (e) {
      parsedResult = {
        error: true,
        errorType: "json_parse_error",
        message: e instanceof Error ? e.message : "Failed to parse JSON",
        rawResponse: resultText.substring(0, 500) // Truncate for safety
      };
    }

    const tokenUsage = {
      inputTokens: responseBody.usage?.inputTokens || 0,
      outputTokens: responseBody.usage?.outputTokens || 0
    };

    console.log("[Bedrock:DEBUG] Model response received", { tokenUsage, hasValidJson: isValidJson });

    return { result: parsedResult, tokenUsage };
  } catch (error) {
    console.error("[Bedrock:ERROR]", error);
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
}

export async function generateInsight(
  options: GenerateInsightOptions
): Promise<InsightResult> {
  const { type, inputData, userId, flightPlanId, forceRegenerate = false } = options;

  // Include flightPlanId in hash to ensure proper cache isolation per flight plan
  const inputHash = generateInputHash({ type, ...inputData }, flightPlanId);
  
  console.log("[Bedrock:DEBUG] Starting insight generation", { type, flightPlanId, inputHash });

  try {
    // Rate limit check
    const rateCheck = checkRateLimit(userId);
    if (!rateCheck.allowed) {
      throw new Error(`Rate limit exceeded. Try again in ${Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)} seconds.`);
    }

    const systemPrompt = SYSTEM_PROMPTS[type];

    if (!systemPrompt) {
      throw new Error(`Unknown insight type: ${type}`);
    }

    // Build user prompt based on insight type
    let userPrompt = "";
    let kbQuery = "";

    switch (type) {
      case "allocation_summary":
        userPrompt = `Analyze this cargo allocation:\n${JSON.stringify(inputData, null, 2)}`;
        kbQuery = "military cargo allocation regulations weight limits";
        break;
      case "cob_analysis":
        userPrompt = `Analyze Center of Balance for this load:\n${JSON.stringify(inputData, null, 2)}`;
        kbQuery = "aircraft center of gravity MAC percentage safety limits";
        break;
      case "pallet_review":
        userPrompt = `Review this 463L pallet configuration:\n${JSON.stringify(inputData, null, 2)}`;
        kbQuery = "463L pallet tiedown hazmat cargo stacking regulations";
        break;
      case "route_planning":
        userPrompt = `Analyze this airlift route:\n${JSON.stringify(inputData, null, 2)}`;
        kbQuery = "military airlift route planning fuel efficiency";
        break;
      case "compliance":
        userPrompt = `Check compliance for this cargo manifest:\n${JSON.stringify(inputData, null, 2)}`;
        kbQuery = "DoD cargo transportation regulations hazmat compliance";
        break;
      case "mission_briefing":
        userPrompt = `Generate mission briefing for:\n${JSON.stringify(inputData, null, 2)}`;
        kbQuery = "military mission briefing format requirements";
        break;
      case "mission_analytics":
        userPrompt = `Generate comprehensive mission analytics for:\n${JSON.stringify(inputData, null, 2)}`;
        kbQuery = "military airlift mission performance metrics efficiency optimization";
        break;
    }

    // Retrieve knowledge base context
    const kbContext = await retrieveKnowledgeBaseContext(kbQuery);

    // Invoke model
    const { result, tokenUsage } = await invokeModel(systemPrompt, userPrompt, kbContext);

    return {
      insight: result,
      inputHash,
      tokenUsage,
      fromCache: false
    };
  } catch (error) {
    console.error("[Bedrock:ERROR]", error);
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
