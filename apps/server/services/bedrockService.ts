/**
 * AWS Bedrock Service for AI Insights
 * Uses Nova Lite model with Knowledge Base retrieval for regulation-aware insights
 * Optimized for low TTFT with structured prompts and concise system messages
 * Includes S3 trace logging for all AI operations
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand
} from "@aws-sdk/client-bedrock-runtime";

import {
  BedrockAgentRuntimeClient,
  RetrieveCommand
} from "@aws-sdk/client-bedrock-agent-runtime";

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

import crypto from "crypto";

// S3 Trace Logging Configuration (from environment variables)
const S3_TRACE_BUCKET = process.env.BEDROCK_TRACE_S3_BUCKET || "dodpdfchunking";
const S3_TRACE_PREFIX = process.env.BEDROCK_TRACE_S3_PREFIX || "kb_output/";
const S3_TRACE_REGION = process.env.BEDROCK_TRACE_S3_REGION || "us-east-2";

console.log(`[Bedrock:S3] Trace logging configured: s3://${S3_TRACE_BUCKET}/${S3_TRACE_PREFIX} (region: ${S3_TRACE_REGION})`);

// S3 Client for trace logging
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const creds = getAwsCredentials();
    s3Client = new S3Client({
      region: S3_TRACE_REGION,
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey
      }
    });
  }
  return s3Client;
}

// Trace data interface
interface BedrockTrace {
  trace_id: string;
  timestamp: string;
  model: string;
  input: string;
  retrieved_docs: string[];
  latency_ms: number;
  token_input: number;
  token_output: number;
  session_id: string;
}

// Log trace to S3
async function logTraceToS3(trace: BedrockTrace): Promise<void> {
  try {
    const client = getS3Client();
    const datePrefix = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const key = `${S3_TRACE_PREFIX}${datePrefix}/${trace.trace_id}.json`;
    
    const command = new PutObjectCommand({
      Bucket: S3_TRACE_BUCKET,
      Key: key,
      Body: JSON.stringify(trace, null, 2),
      ContentType: "application/json"
    });

    await client.send(command);
    console.log("[Bedrock:S3] Trace logged successfully", { trace_id: trace.trace_id, key });
  } catch (error) {
    // Non-blocking - log error but don't fail the main operation
    console.error("[Bedrock:S3] Failed to log trace", { trace_id: trace.trace_id, error });
  }
}
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
}`,

  land_convoy_analysis: `{
  "convoy_summary": { "total_vehicles": number, "total_cargo_weight_lb": number, "convoy_length_miles": number, "estimated_duration_hours": number },
  "vehicle_utilization": [{ "vehicle_type": "string", "count": number, "weight_utilization_percent": number, "volume_utilization_percent": number }],
  "route_assessment": { "terrain_difficulty": "easy|moderate|difficult|severe", "security_risk": "low|medium|high", "recommended_speed_mph": number },
  "logistics_recommendations": ["string"],
  "fuel_planning": { "total_fuel_gallons": number, "refuel_points_needed": number, "estimated_cost_usd": number },
  "risk_factors": ["string"],
  "mission_readiness": "ready|needs_attention|not_ready"
}`,

  land_route_optimization: `{
  "route_summary": { "origin": "string", "destination": "string", "total_distance_miles": number, "estimated_time_hours": number },
  "waypoints": [{ "name": "string", "purpose": "refuel|rest|security_checkpoint|staging", "distance_from_start_miles": number }],
  "alternative_routes": [{ "name": "string", "distance_miles": number, "time_hours": number, "pros": ["string"], "cons": ["string"] }],
  "terrain_analysis": { "road_conditions": "paved|unpaved|mixed", "elevation_change_ft": number, "challenging_segments": ["string"] },
  "optimization_recommendations": ["string"],
  "weather_considerations": ["string"]
}`,

  sea_voyage_analysis: `{
  "voyage_summary": { "vessel_name": "string", "vessel_type": "string", "total_teu_capacity": number, "teu_utilized": number, "utilization_percent": number },
  "port_schedule": [{ "port": "string", "arrival_date": "string", "departure_date": "string", "operations": ["loading|unloading|bunkering|maintenance"] }],
  "cargo_manifest_summary": { "total_containers": number, "hazmat_containers": number, "refrigerated_containers": number, "oversized_cargo_count": number },
  "fuel_efficiency": { "estimated_fuel_mt": number, "fuel_cost_usd": number, "emissions_mt_co2": number },
  "voyage_risks": [{ "risk_type": "weather|piracy|port_congestion|mechanical", "severity": "low|medium|high", "mitigation": "string" }],
  "compliance_status": { "imo_compliant": boolean, "customs_documentation": "complete|pending|missing", "notes": ["string"] },
  "recommendations": ["string"]
}`,

  sea_container_optimization: `{
  "container_summary": { "total_containers": number, "twenty_ft": number, "forty_ft": number, "forty_ft_hc": number, "special_containers": number },
  "stacking_analysis": { "current_stack_height_avg": number, "max_safe_stack": number, "weight_distribution_grade": "A|B|C|D" },
  "load_sequence": [{ "container_id": "string", "position": "string", "weight_lb": number, "load_order": number, "notes": "string" }],
  "port_optimization": { "estimated_crane_moves": number, "loading_time_hours": number, "efficiency_score": number },
  "hazmat_segregation": { "compliant": boolean, "issues": ["string"], "recommendations": ["string"] },
  "space_utilization_recommendations": ["string"]
}`,

  cross_modal_manifest_analysis: `{
  "manifest_overview": { "manifest_id": "string", "total_items": number, "total_weight_lb": number, "transport_modes": ["air|land|sea"] },
  "modal_breakdown": [{ "mode": "air|land|sea", "item_count": number, "weight_lb": number, "volume_cuft": number, "estimated_cost_usd": number }],
  "transfer_points": [{ "location": "string", "from_mode": "string", "to_mode": "string", "handling_requirements": ["string"], "estimated_time_hours": number }],
  "efficiency_analysis": { "overall_efficiency_score": number, "bottlenecks": ["string"], "cost_per_lb": number },
  "optimization_opportunities": [{ "description": "string", "potential_savings_usd": number, "potential_time_savings_hours": number, "implementation_difficulty": "easy|medium|hard" }],
  "compliance_checklist": [{ "requirement": "string", "status": "met|not_met|pending", "notes": "string" }],
  "recommendations": ["string"]
}`,

  warehouse_capacity_forecast: `{
  "current_capacity": { "total_locations": number, "occupied_locations": number, "utilization_percent": number, "weight_utilization_percent": number },
  "forecast_90_days": [{ "period": "string", "projected_inbound_lb": number, "projected_outbound_lb": number, "net_change_lb": number, "projected_utilization_percent": number }],
  "capacity_alerts": [{ "alert_type": "overcapacity|aging_inventory|weight_limit", "severity": "low|medium|high", "affected_zone": "string", "recommendation": "string" }],
  "trend_analysis": { "growth_rate_percent": number, "seasonal_factors": ["string"], "confidence_level": "low|medium|high" },
  "optimization_recommendations": [{ "action": "string", "expected_impact": "string", "priority": "high|medium|low" }],
  "resource_planning": { "additional_storage_needed_sqft": number, "recommended_actions": ["string"] }
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
  land_convoy_analysis: ["convoy_summary", "vehicle_utilization", "route_assessment", "logistics_recommendations"],
  land_route_optimization: ["route_summary", "waypoints", "terrain_analysis", "optimization_recommendations"],
  sea_voyage_analysis: ["voyage_summary", "port_schedule", "cargo_manifest_summary", "voyage_risks"],
  sea_container_optimization: ["container_summary", "stacking_analysis", "load_sequence", "hazmat_segregation"],
  cross_modal_manifest_analysis: ["manifest_overview", "modal_breakdown", "transfer_points", "recommendations"],
  warehouse_capacity_forecast: ["current_capacity", "forecast_90_days", "capacity_alerts", "optimization_recommendations"],
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
  flight_allocation_analysis: "military airlift fleet allocation cargo loading regulations",
  land_convoy_analysis: "military ground convoy planning vehicle utilization tactical logistics",
  land_route_optimization: "military ground transport route planning terrain analysis waypoints",
  sea_voyage_analysis: "military sealift vessel operations port logistics maritime security",
  sea_container_optimization: "container stacking regulations weight distribution hazmat segregation",
  cross_modal_manifest_analysis: "intermodal cargo transfer air land sea logistics optimization",
  warehouse_capacity_forecast: "warehouse capacity planning inventory forecasting storage optimization"
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

// Retrieve context from Knowledge Base (returns context text and document names for tracing)
async function retrieveKnowledgeBaseContext(query: string, maxResults: number = 3): Promise<{ context: string; documentNames: string[] }> {
  if (!KNOWLEDGE_BASE_ID) {
    console.log("[Bedrock] No Knowledge Base ID configured, skipping retrieval");
    return { context: "", documentNames: [] };
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
      return { context: "", documentNames: [] };
    }

    // Extract document names from location URIs
    const documentNames: string[] = [];
    for (const result of response.retrievalResults) {
      const uri = result.location?.s3Location?.uri || result.location?.webLocation?.url || "";
      if (uri) {
        // Extract filename from URI
        const parts = uri.split('/');
        const filename = parts[parts.length - 1] || uri;
        if (filename && !documentNames.includes(filename)) {
          documentNames.push(filename);
        }
      }
    }

    const context = response.retrievalResults
      .map(r => r.content?.text || "")
      .filter(text => text.length > 0)
      .join("\n\n---\n\n");

    console.log("[Bedrock:TIMING] KB retrieval completed", { durationMs: kbDuration, contextLength: context.length, docs: documentNames });
    return { context, documentNames };
  } catch (error) {
    const kbDuration = Date.now() - kbStartTime;
    console.error("[Bedrock:ERROR] KB retrieval failed", { durationMs: kbDuration, error });
    return { context: "", documentNames: [] };
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
  const traceId = crypto.randomUUID();

  // Include flightPlanId in hash to ensure proper cache isolation per flight plan
  const inputHash = generateInputHash({ type, ...inputData }, flightPlanId);
  
  console.log("[Bedrock:TIMING] Insight generation started", { type, flightPlanId, inputHash, traceId });

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

    // Retrieve knowledge base context (returns context and document names)
    const kbStartTime = Date.now();
    const kbQuery = KB_QUERIES[type] || `military logistics ${type}`;
    const { context: kbContext, documentNames: retrievedDocs } = await retrieveKnowledgeBaseContext(kbQuery);
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

    // Log trace to S3 (non-blocking)
    const trace: BedrockTrace = {
      trace_id: traceId,
      timestamp: new Date().toISOString(),
      model: MODEL_ID,
      input: `${type}: ${kbQuery}`,
      retrieved_docs: retrievedDocs,
      latency_ms: totalDuration,
      token_input: tokenUsage.inputTokens,
      token_output: tokenUsage.outputTokens,
      session_id: userId
    };
    logTraceToS3(trace).catch(() => {}); // Fire and forget

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
