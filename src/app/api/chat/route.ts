// route.ts
import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { WebflowFetcher } from "@/lib/webflow-fetcher";
import { z } from "zod";
import fs from "fs/promises";

// Constants - update the model to a Google Generative AI one
const MODEL = "gemini-2.0-flash-lite-preview-02-05";

// Environment validation
const env = {
  WEBFLOW_API_TOKEN: process.env.WEBFLOW_API_TOKEN,
  GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
} as const;

Object.entries(env).forEach(([key, value]) => {
  if (!value) throw new Error(`${key} environment variable is not set`);
});

// Initialize clients
const webflowFetcher = new WebflowFetcher();

// Logger utility (controlled by environment)
const logger = {
  log: (...args: unknown[]) =>
    process.env.NODE_ENV === "development" && console.log(...args),
  error: (...args: unknown[]) => console.error(...args),
};

// Define the response schema using Zod
const responseSchema = z.object({
  answer: z
    .string()
    .min(1, "Answer is required and cannot be empty")
    .describe("Your direct answer (1-3 sentences)"),
  sources: z
    .array(
      z.object({
        slug: z.string().min(1, "Slug is required"),
        title: z.string().min(1, "Title is required"),
      })
    )
    .describe("List of sources with title and slug"),
  followUpQuestions: z
    .array(z.string().min(1, "Each follow-up question cannot be empty"))
    .refine((arr) => arr.length === 3, {
      message: "Exactly 3 relevant follow-up questions are required",
    })
    .describe("Exactly 3 relevant follow-up questions"),
});

export async function POST(req: Request) {
  const startTime = performance.now();
  const timings: Record<string, number> = {};

  try {
    logger.log("=== CHAT REQUEST STARTED ===");
    const { messages } = await req.json();

    // Fetch context
    const contextStart = performance.now();
    const contextData = await webflowFetcher.processPage();
    if (process.env.NODE_ENV === "development") {
      await fs.writeFile(
        "./fetchedContent.json",
        JSON.stringify(contextData, null, 2),
        "utf8"
      );
    }
    timings.contextFetch = performance.now() - contextStart;

    // Generate response using AI SDK with the fixed Zod schema
    const apiStart = performance.now();

    const response = await generateObject({
      model: google(MODEL),
      messages,
      schema: responseSchema,
      system: `Context:\n${JSON.stringify(contextData, null, 2)}\n\n
IMPORTANT: Your answer should be:
- Clear and concise (2-3 sentences)
- Focused on directly answering the questions
- Based ONLY on the provided context data, not external knowledge
- When citing sources, use the exact title and slug from the context.
- Always provide a source, even if not immediately relevant – to push the user to explore the site more. You can preface this in the answer if needed, so that it feels natural.
- Followed by exactly 3 relevant follow-up questions`,
      maxRetries: 3,
      experimental_repairText: async (options) => {
        logger.log("=== REPAIR ATTEMPT ===");
        logger.log("Error:", options.error);
        logger.log("Original text:", options.text);

        try {
          const parsed = JSON.parse(options.text);
          return JSON.stringify(parsed);
        } catch (e) {
          logger.error("Repair attempt failed:", e);
          return null;
        }
      },
    });
    logger.log("=== RESPONSE DEBUG ===");
    logger.log("Parsed object:", response.object);
    logger.log("Token usage:", response.usage);

    const { object } = response;
    timings.apiCall = performance.now() - apiStart;

    logger.log("Timing Breakdown:", timings);

    // Respond with a flat JSON that contains only answer, sources, and followUpQuestions:
    return new Response(JSON.stringify(object), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errorTime = performance.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));

    logger.error("=== ERROR IN CHAT API ===", {
      message: err.message,
      stack: err.stack,
      rawError: error,
    });

    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: err.message,
        _debug: { timings, errorTime, fullError: error },
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
