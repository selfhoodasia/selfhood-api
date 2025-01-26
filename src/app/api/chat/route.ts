import { Anthropic } from "@anthropic-ai/sdk";
import { WebflowFetcher } from "@/lib/webflow-fetcher";

// Add debug logging at the top of the file
console.log("Environment Variables Check:");
console.log("ANTHROPIC_API_KEY:", process.env.ANTHROPIC_API_KEY);
console.log("WEBFLOW_API_TOKEN:", process.env.WEBFLOW_API_TOKEN);

// Environment validation
const requiredEnvVars = {
  WEBFLOW_API_TOKEN: process.env.WEBFLOW_API_TOKEN,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
} as const;

// Validate all required environment variables
Object.entries(requiredEnvVars).forEach(([key, value]) => {
  if (!value) throw new Error(`${key} environment variable is not set`);
});

// Initialize clients
const anthropic = new Anthropic({ apiKey: requiredEnvVars.ANTHROPIC_API_KEY });
const webflowFetcher = new WebflowFetcher();
const edgeConfig = process.env.EDGE_CONFIG;

if (!edgeConfig) {
  throw new Error('EDGE_CONFIG environment variable is not set');
}

// Constants
const WEBFLOW_PAGE_ID = "679528029097b958606ec2ed";
const MODEL = "claude-3-5-haiku-20241022";
const CACHE_KEY = `webflow_page_${WEBFLOW_PAGE_ID}`;

// Helper function to get cached data
async function getCachedData() {
  if (!edgeConfig) {
    console.error('Edge Config URL is not available');
    return null;
  }

  try {
    console.log('Fetching from Edge Config URL:', edgeConfig);
    const response = await fetch(`${edgeConfig}/items/${CACHE_KEY}`);
    console.log('Edge Config Response:', {
      status: response.status,
      ok: response.ok
    });
    
    if (!response.ok) {
      console.log('Cache miss - no data found');
      return null;
    }
    
    const data = await response.json();
    console.log('Cache hit - data found:', data);
    return data;
  } catch (error) {
    console.error('Detailed Edge Config fetch error:', error);
    return null;
  }
}

// Helper function to set cached data
async function setCachedData(data: unknown) {
  if (!edgeConfig) {
    console.error('Edge Config URL is not available');
    return;
  }

  try {
    console.log('Attempting to cache data:', data);
    const response = await fetch(edgeConfig, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{
          operation: 'upsert',
          key: CACHE_KEY,
          value: data
        }]
      }),
    });
    
    console.log('Cache set response:', {
      status: response.status,
      ok: response.ok
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to set cache:', errorText);
    }
  } catch (error) {
    console.error('Detailed cache set error:', error);
  }
}

// Helper functions
const createSystemPrompt = (contextData: unknown) => `RESPONSE FORMAT:
You must respond with valid JSON in the following format:
{
  "answer": "Your direct answer (1-3 sentences, max 50 words)",
  "sources": [{ // only show 1 max
    "slug": "slug",
    "title": "title",
  }],
  "followUpQuestions": [ // max 10 words each, should not be directly related to the current answer/source
    "First follow-up question",
    "Second follow-up question",
    "Third follow-up question"
  ]
}

Context:
${JSON.stringify(contextData, (_, value) =>
  typeof value === "string" ? value.substring(0, 1000) : value
)}`;

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    
    // Try to get cached data first
    let contextData = await getCachedData();
    
    // If no cached data, fetch and cache it
    if (!contextData) {
      contextData = await webflowFetcher.processPage(WEBFLOW_PAGE_ID);
      await setCachedData(contextData);
    }

    const systemPrompt = createSystemPrompt(contextData);

    console.log("\n=== CHAT REQUEST ===");
    console.log("Last Message:", messages[messages.length - 1]);
    console.log("System Prompt:", systemPrompt);
    console.log("=== END REQUEST ===\n");

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    console.log("=== CHAT RESPONSE ===");
    console.log(JSON.stringify(response.content[0], null, 2));
    console.log("=== END RESPONSE ===\n");

    return new Response(
      JSON.stringify({
        role: "assistant",
        content: response.content[0],
      }),
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error(
      "Error in chat API:",
      error instanceof Error ? error.message : "Unknown error"
    );

    const errorResponse = {
      error: "Internal Server Error",
      message:
        error instanceof Error ? error.message : "Unknown error occurred",
      type: error instanceof Error ? error.constructor.name : typeof error,
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}
