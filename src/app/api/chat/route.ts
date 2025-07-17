import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import fs from "fs/promises";
import { get } from "@vercel/edge-config";

const MODEL = "gemini-2.5-flash-lite-preview-06-17";

const env = {
  GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  VERCEL_API_TOKEN: process.env.VERCEL_API_TOKEN,
} as const;

Object.entries(env).forEach(([key, value]) => {
  if (!value) throw new Error(`${key} environment variable is not set`);
});

const logger = {
  log: (...args: unknown[]) =>
    process.env.NODE_ENV === "development" && console.log(...args),
  error: (...args: unknown[]) => console.error(...args),
};

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
      }),
    )
    .describe("List of sources with title and slug"),
  followUpQuestions: z
    .array(z.string().min(1, "Each follow-up question cannot be empty"))
    .refine((arr) => arr.length === 3, {
      message: "Exactly 3 relevant follow-up questions are required",
    })
    .describe("Exactly 3 relevant follow-up questions"),
});

const allowedOrigins = [
  "https://selfhood.global",
  "https://www.selfhood.global",
  "https://selfhood-new.webflow.io",
  "https://selfhoodglobal-new.webflow.io",
  "http://localhost:3000",
];

function getCorsHeaders(origin?: string) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,OPTIONS,PATCH,DELETE,POST,PUT",
    "Access-Control-Allow-Headers":
      "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version",
  };
  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin") || "";
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

export async function POST(req: Request) {
  const startTime = performance.now();
  const timings: Record<string, number> = {};

  const origin = req.headers.get("origin") || "";
  try {
    logger.log("=== CHAT REQUEST STARTED ===");
    const { messages } = await req.json();

    const contextStart = performance.now();

    const latestContextUrl = await get("latestContextUrl");
    if (!latestContextUrl) {
      throw new Error("Latest context URL not found in Edge Config");
    }

    const blobResponse = await fetch(String(latestContextUrl));
    if (!blobResponse.ok) {
      throw new Error(
        `Failed to fetch blob content from ${latestContextUrl}: ${blobResponse.statusText}`,
      );
    }
    const contextData = await blobResponse.json();

    if (process.env.NODE_ENV === "development") {
      await fs.writeFile(
        "./fetchedBlobContent.json",
        JSON.stringify(contextData, null, 2),
        "utf8",
      );
    }
    timings.contextFetch = performance.now() - contextStart;

    const apiStart = performance.now();

    const response = await generateObject({
      model: google(MODEL, {
        structuredOutputs: false
      }),
      messages,
      schema: responseSchema,
      system: `Context:\n${JSON.stringify(contextData, null, 2)}\n\n
You are a thoughtful, nuanced assistant with careful reasoning abilities. When responding:
- Craft clear, precise answers (2-3 sentences) that directly address the user's question
- Use accessible language and avoid unnecessary jargon or buzzwords
- Break complex ideas into readable segments with concise sentences
- Draw exclusively from the provided context data, setting aside any external knowledge
- Approach complex topics with appropriate nuance, acknowledging limitations
- Use a warm, balanced conversational tone while avoiding first-person phrases like "I am..." (use "We" when appropriate)
- Incorporate relevant case studies from the context to illustrate key points when available
- Keep your answer text free from explicit source references, as these belong solely in the dedicated 'sources' field
- Carefully select only the most relevant sources in the 'sources' field that directly support your response
- Conclude with exactly 3 thoughtfully crafted follow-up questions that are relevant to the topic but don't directly reference the current response. Each question should be limited to 60 characters maximum.`,
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
      headers: {
        "Content-Type": "application/json",
        ...getCorsHeaders(origin),
      },
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
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(origin),
        },
      },
    );
  }
}
