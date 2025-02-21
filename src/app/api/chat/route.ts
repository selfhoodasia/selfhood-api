// route.ts
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { WebflowFetcher } from "@/lib/webflow-fetcher";
import { z } from "zod";

// -----------------------------------------------------------------------
// Environment Validation
// -----------------------------------------------------------------------
const env = {
  WEBFLOW_API_TOKEN: process.env.WEBFLOW_API_TOKEN,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
} as const;

for (const [key, value] of Object.entries(env)) {
  if (!value) {
    throw new Error(`${key} environment variable is not set`);
  }
}

// -----------------------------------------------------------------------
// Client Initialization & Helpers
// -----------------------------------------------------------------------
const webflowFetcher = new WebflowFetcher();

// Creates a system prompt including context retrieved from Webflow.
async function createSystemPrompt(): Promise<string> {
  const contextData = await webflowFetcher.processPage();
  const contextStr = JSON.stringify(contextData, null, 2);
  return `You must respond with a JSON object in exactly this format:
{
  "answer": "Your direct answer (1-3 sentences)",
  "sources": [{"slug": "string", "title": "string"}],
  "followUpQuestions": ["Question 1", "Question 2", "Question 3"]
}
Do not include any other text or explanation outside of this JSON structure.

Context:
${contextStr}`;
}

// Logger utility (logs in development mode)
const logger = {
  log: (...args: unknown[]) =>
    process.env.NODE_ENV === "development" && console.log(...args),
  error: (...args: unknown[]) => console.error(...args),
};

// -----------------------------------------------------------------------
// Response Schema & Fallback
// -----------------------------------------------------------------------
const responseSchema = z.object({
  answer: z.string().max(50),
  sources: z.array(
    z.object({
      slug: z.string(),
      title: z.string(),
    })
  ),
  followUpQuestions: z.array(z.string()).length(3),
});

const fallbackResponse = {
  answer: "",
  sources: [],
  followUpQuestions: ["", "", ""],
};

// -----------------------------------------------------------------------
// AI Output Parsing Helper
// -----------------------------------------------------------------------
function parseAIOutput(text: string): typeof fallbackResponse {
  try {
    let cleanedText = text.trim();

    // Remove Markdown code fences, if present.
    if (cleanedText.startsWith("```")) {
      const parts = cleanedText.split("\n");
      parts.shift(); // Remove the opening fence.
      if (parts.length && parts[parts.length - 1].startsWith("```")) {
        parts.pop(); // Remove the closing fence.
      }
      cleanedText = parts.join("\n").trim();
    }

    // Extract the JSON substring if extra text exists.
    const jsonMatch = cleanedText.match(/{[\s\S]*}/);
    if (jsonMatch) {
      cleanedText = jsonMatch[0];
    }

    const parsed = JSON.parse(cleanedText);
    return {
      answer: typeof parsed.answer === "string" ? parsed.answer : "",
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      followUpQuestions:
        Array.isArray(parsed.followUpQuestions) &&
        parsed.followUpQuestions.length === 3
          ? parsed.followUpQuestions
          : ["", "", ""],
    };
  } catch (error) {
    logger.error("Error parsing AI output:", error);
    return fallbackResponse;
  }
}

// -----------------------------------------------------------------------
// API Route Handler
// -----------------------------------------------------------------------
export async function POST(req: Request) {
  const startTime = performance.now();

  try {
    const { messages } = await req.json();

    // Compose the conversation with system prompt containing structured context.
    const systemPrompt = await createSystemPrompt();
    const messagesWithContext = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    // Call the AI model with our schema and custom parsing.
    const result = await generateObject<typeof fallbackResponse>({
      model: anthropic("claude-3-5-haiku-20241022"),
      messages: messagesWithContext,
      maxRetries: 3,
      schema: responseSchema,
      temperature: 0.7,
      maxTokens: 1000,
      parse: parseAIOutput,
    });

    // Apply fallback defaults if any key is missing.
    const sanitizedResult = {
      answer: result?.answer ?? "",
      sources: result?.sources ?? [],
      followUpQuestions: result?.followUpQuestions ?? ["", "", ""],
    };

    // Log the raw LLM output
    logger.log("Raw LLM Output:", result?.rawOutput);

    // Validate the cleaned object. A Zod error here indicates a schema mismatch.
    const validated = responseSchema.parse(sanitizedResult);

    const endTime = performance.now();
    logger.log("Total response time:", endTime - startTime, "ms");

    return Response.json(validated);
  } catch (error) {
    logger.error("Error in chat route:", error);
    return new Response("Error processing request", { status: 500 });
  }
}
