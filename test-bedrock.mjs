import { BedrockAgentRuntimeClient, RetrieveCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const AWS_REGION = process.env.AWS_REGION || "us-east-2";
const KNOWLEDGE_BASE_ID = process.env.AWS_BEDROCK_KNOWLEDGE_BASE_ID;

console.log('🧪 Testing AWS Bedrock Connection...\n');
console.log('Region:', AWS_REGION);
console.log('Knowledge Base ID:', KNOWLEDGE_BASE_ID ? KNOWLEDGE_BASE_ID.slice(0,10) + '...' : 'NOT SET');
console.log('AWS Access Key:', process.env.AWS_ACCESS_KEY_ID ? '✅ Set' : '❌ Not Set');
console.log('AWS Secret Key:', process.env.AWS_SECRET_ACCESS_KEY ? '✅ Set' : '❌ Not Set');
console.log('');

async function testBedrock() {
  // Test 1: Knowledge Base retrieval
  console.log('1️⃣ Testing Knowledge Base retrieval...');
  try {
    const agentClient = new BedrockAgentRuntimeClient({ region: AWS_REGION });
    const retrieveCmd = new RetrieveCommand({
      knowledgeBaseId: KNOWLEDGE_BASE_ID,
      retrievalQuery: { text: "C-17 cargo loading regulations" },
      retrievalConfiguration: { vectorSearchConfiguration: { numberOfResults: 2 } }
    });
    const response = await agentClient.send(retrieveCmd);
    console.log('✅ Knowledge Base connected!');
    console.log('   Results found:', response.retrievalResults?.length || 0);
    if (response.retrievalResults?.[0]) {
      console.log('   First result preview:', response.retrievalResults[0].content?.text?.slice(0, 150) + '...');
    }
  } catch (err) {
    console.log('❌ Knowledge Base error:', err.message);
  }
  
  // Test 2: Model invocation
  console.log('\n2️⃣ Testing Nova Lite model invocation...');
  try {
    const runtimeClient = new BedrockRuntimeClient({ region: AWS_REGION });
    const modelId = "amazon.nova-lite-v1:0";
    
    const payload = {
      schemaVersion: "messages-v1",
      messages: [{ 
        role: "user", 
        content: [{ text: "Respond with only this JSON: {\"status\": \"ok\", \"message\": \"Bedrock working\"}" }]
      }],
      inferenceConfig: { maxTokens: 100, temperature: 0.1 }
    };
    
    const cmd = new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(payload)
    });
    
    const response = await runtimeClient.send(cmd);
    const result = JSON.parse(new TextDecoder().decode(response.body));
    console.log('✅ Model responded!');
    console.log('   Response:', result.output?.message?.content?.[0]?.text || JSON.stringify(result).slice(0, 200));
    console.log('   Token usage:', result.usage);
  } catch (err) {
    console.log('❌ Model error:', err.message);
  }
}

testBedrock().catch(console.error);
