// route.ts
import { Anthropic } from "@anthropic-ai/sdk";
import { WebflowFetcher } from "@/lib/webflow-fetcher";
import fs from "fs/promises";

// Constants
const MODEL = "claude-3-5-haiku-20241022";

// Environment validation
const env = {
  WEBFLOW_API_TOKEN: process.env.WEBFLOW_API_TOKEN,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
} as const;

Object.entries(env).forEach(([key, value]) => {
  if (!value) throw new Error(`${key} environment variable is not set`);
});

// Initialize clients
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const webflowFetcher = new WebflowFetcher();

// System prompt creation
const createSystemPrompt = (contextData: unknown): string => {
  const contextStr = JSON.stringify(contextData, null, 2);
  return `RESPONSE FORMAT:
{
  "answer": "Your direct answer (1-3 sentences, max 50 words)",
  "sources": [{"slug": "slug", "title": "title"}],
  "followUpQuestions": ["Question 1", "Question 2", "Question 3"]
}

Context:
${contextStr}`;
};

// Logger utility (controlled by environment)
const logger = {
  log: (...args: unknown[]) =>
    process.env.NODE_ENV === "development" && console.log(...args),
  error: (...args: unknown[]) => console.error(...args),
};

export async function POST(req: Request) {
  const startTime = performance.now();
  const timings: Record<string, number> = {};

  try {
    logger.log("=== CHAT REQUEST STARTED ===");
    const { messages } = await req.json();

    // Fetch context
    const contextStart = performance.now();
    const contextData = await webflowFetcher.processPage();
    // Write fetched content to a file
    await fs.writeFile(
      "./fetchedContent.json",
      JSON.stringify(contextData, null, 2),
      "utf8"
    );
    timings.contextFetch = performance.now() - contextStart;

    // Create prompt
    const promptStart = performance.now();
    const systemPrompt = createSystemPrompt(contextData);
    timings.promptCreation = performance.now() - promptStart;

    // API call
    const apiStart = performance.now();
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });
    timings.apiCall = performance.now() - apiStart;

    const totalDuration = performance.now() - startTime;
    logger.log("Timing Breakdown:", timings);

    return new Response(
      JSON.stringify({
        role: "assistant",
        content: response.content[0],
        _debug: { timings, totalDuration },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorTime = performance.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("=== ERROR IN CHAT API ===", {
      message: err.message,
      stack: err.stack,
    });

    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: err.message,
        _debug: { timings, errorTime },
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
