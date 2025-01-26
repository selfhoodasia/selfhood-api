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

// Constants
const WEBFLOW_PAGE_ID = "679528029097b958606ec2ed";
const MODEL = "claude-3-5-haiku-20241022";

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
  const startTime = performance.now();
  const timings: Record<string, number> = {};

  try {
    console.log("\n=== CHAT REQUEST STARTED ===");

    const { messages } = await req.json();
    console.log("Messages received:", messages.length);

    // Time context fetching
    const contextStartTime = performance.now();
    const contextData = await webflowFetcher.processPage(WEBFLOW_PAGE_ID);
    timings.contextFetch = performance.now() - contextStartTime;

    // Time system prompt creation
    const promptStartTime = performance.now();
    const systemPrompt = createSystemPrompt(contextData);
    timings.promptCreation = performance.now() - promptStartTime;

    console.log("Operation Timings (ms):");
    console.log("- Context Fetch:", timings.contextFetch.toFixed(2));
    console.log("- Prompt Creation:", timings.promptCreation.toFixed(2));

    // Log request details
    console.log("Last Message:", messages[messages.length - 1]);
    console.log(
      "Context Data Size:",
      JSON.stringify(contextData).length,
      "bytes"
    );
    console.log("System Prompt Size:", systemPrompt.length, "chars");

    // Time API call
    const apiStartTime = performance.now();
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });
    timings.apiCall = performance.now() - apiStartTime;

    console.log("\n=== CHAT RESPONSE ===");
    console.log("API Call Duration:", timings.apiCall.toFixed(2), "ms");
    console.log("Response:", JSON.stringify(response.content[0], null, 2));

    // Calculate total duration
    const totalDuration = performance.now() - startTime;
    console.log("\n=== REQUEST COMPLETE ===");
    console.log("Total Duration:", totalDuration.toFixed(2), "ms");
    console.log("Timing Breakdown:", timings);

    return new Response(
      JSON.stringify({
        role: "assistant",
        content: response.content[0],
        _debug: { timings },
      }),
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    const errorTime = performance.now() - startTime;
    console.error("\n=== ERROR IN CHAT API ===");
    console.error("Error occurred after:", errorTime.toFixed(2), "ms");
    console.error(
      "Error details:",
      error instanceof Error
        ? {
            message: error.message,
            type: error.constructor.name,
            stack: error.stack,
          }
        : "Unknown error"
    );

    const errorResponse = {
      error: "Internal Server Error",
      message:
        error instanceof Error ? error.message : "Unknown error occurred",
      type: error instanceof Error ? error.constructor.name : typeof error,
      _debug: { timings, errorTime },
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}
