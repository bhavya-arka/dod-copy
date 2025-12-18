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
import type { AiInsightType as SharedAiInsightType } from "@shared/schema";

// Define type locally as fallback if import fails
type AiInsightType = SharedAiInsightType | 'allocation_summary' | 'cob_analysis' | 'pallet_review' | 'route_planning' | 'compliance' | 'mission_briefing';

// Configuration
const AWS_REGION = process.env.AWS_REGION || "us-east-2";
const KNOWLEDGE_BASE_ID = process.env.AWS_BEDROCK_KNOWLEDGE_BASE_ID || "";
// Use US regional inference profile for Nova Lite (required for on-demand access)
const MODEL_ID = "us.amazon.nova-lite-v1:0";

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

// Rate limiting configuration
const RATE_LIMIT = {
  maxRequestsPerMinute: 10,
  maxRequestsPerHour: 100,
  requestWindow: new Map<string, number[]>()
};

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

// System prompts for each insight type - strict JSON output
const SYSTEM_PROMPTS: Record<AiInsightType, string> = {
  allocation_summary: `You are a military airlift planning expert analyzing cargo allocation for PACAF operations.
Your task is to provide an executive summary of the load plan with optimization suggestions and risk flags.

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
Analyze route data and provide optimization suggestions, fuel efficiency notes, and alternate route recommendations.

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
