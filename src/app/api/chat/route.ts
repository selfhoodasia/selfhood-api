import { Anthropic } from "@anthropic-ai/sdk";
import axios from "axios";

export const runtime = "edge";

// Webflow configuration
const WEBFLOW_CONFIG = {
  API_KEY: process.env.WEBFLOW_API_TOKEN,
  SITE_ID: "674045e3bdb2d16d7e73efd5",
  BASE_URL: "https://api.webflow.com/v2",
  COLLECTIONS: {
    CASE_STUDIES: "67405a6bc01960d426e5da3f",
    SYSTEM_PROMPT: "67409359ef24c542fe79ed6c",
  },
  ITEMS: {
    SYSTEM_PROMPT: "674093e0ef24c542fe7a83b1",
  },
};

// Validate required environment variables
if (!WEBFLOW_CONFIG.API_KEY) {
  throw new Error("WEBFLOW_API_TOKEN environment variable is not set");
}
if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY environment variable is not set");
}

// Initialize Anthropic client with enhanced logging
console.log("Starting Anthropic client initialization...");
console.log("Environment:", process.env.NODE_ENV);
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is undefined!");
} else {
  console.log(
    "ANTHROPIC_API_KEY present with length:",
    process.env.ANTHROPIC_API_KEY.length
  );
  console.log(
    "ANTHROPIC_API_KEY preview:",
    `${process.env.ANTHROPIC_API_KEY.slice(0, 10)}...${process.env.ANTHROPIC_API_KEY.slice(-10)}`
  );
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
console.log("Anthropic client initialized");

// Configure axios instance for Webflow
const webflowClient = axios.create({
  baseURL: WEBFLOW_CONFIG.BASE_URL,
  headers: {
    Authorization: `Bearer ${WEBFLOW_CONFIG.API_KEY}`,
    Accept: "application/json",
  },
});

// Add type declarations
interface CaseStudy {
  title: string;
  slug: string;
  content: string;
  id?: string;
}

interface WebflowResponse {
  fieldData: {
    name: string;
    slug: string;
    content: string;
    "style-guidelines"?: string;
    "specific-question-patterns"?: string;
  };
}

// Replace the Turndown configuration with a simple HTML-to-text converter
function convertHtmlToMarkdown(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") // Remove scripts
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "") // Remove styles
    .replace(/<figure\b[^<]*(?:(?!<\/figure>)<[^<]*)*<\/figure>/gi, "") // Remove figures
    .replace(/<[^>]+>/g, "") // Remove HTML tags
    .replace(/&nbsp;/g, " ") // Replace &nbsp; with space
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim(); // Trim extra whitespace
}

// Webflow data fetching functions
async function fetchData(endpoint: string) {
  const { data } = await webflowClient.get(endpoint);
  return data;
}

async function getSystemPrompt() {
  const data = await fetchData(
    `collections/${WEBFLOW_CONFIG.COLLECTIONS.SYSTEM_PROMPT}/items/${WEBFLOW_CONFIG.ITEMS.SYSTEM_PROMPT}/live`
  );
  return {
    styleGuidelines: data.fieldData["style-guidelines"] || "",
    questionPatterns: data.fieldData["specific-question-patterns"] || "",
  };
}

async function getCaseStudies(): Promise<Record<string, CaseStudy>> {
  const { items } = await fetchData(
    `collections/${WEBFLOW_CONFIG.COLLECTIONS.CASE_STUDIES}/items/live`
  );
  return items.reduce(
    (acc: Record<string, CaseStudy>, item: WebflowResponse) => {
      const key = item.fieldData.name.toLowerCase();
      acc[key] = {
        title: item.fieldData.name,
        slug: item.fieldData.slug,
        content: convertHtmlToMarkdown(item.fieldData.content || ""),
        id: item.fieldData.slug,
      };
      return acc;
    },
    {}
  );
}

export async function POST(req: Request) {
  try {
    console.log("Incoming chat request");
    const { messages } = await req.json();
    console.log("User messages:", messages);

    // Fetch context data
    console.log("Fetching context data...");
    const [systemPromptData, caseStudies] = await Promise.all([
      getSystemPrompt(),
      getCaseStudies(),
    ]);
    console.log("Context data fetched:", {
      systemPromptData,
      caseStudiesCount: Object.keys(caseStudies).length,
    });

    const contextData = {
      systemPrompt: systemPromptData,
      casestudies: Object.values(caseStudies),
    };

    const systemPrompt = `RESPONSE FORMAT:
You must respond with valid JSON in the following format:
{
  "answer": "Your direct answer (1-3 sentences, max 50 words)",
  "sources": [{ // only show 1 max
    "slug": "slug",
    "title": "title",
    }],
  "followUpQuestions": [ // max 10 words each, should not be directly related to the current answer/source so as to increase discoverabilty
    "First follow-up question",
    "Second follow-up question",
    "Third follow-up question"
  ]
}

STYLE GUIDELINES:
${contextData.systemPrompt.styleGuidelines}

SPECIFIC QUESTION PATTERNS:
${contextData.systemPrompt.questionPatterns}

Context:
${JSON.stringify(contextData)}`;

    console.log("Sending request to Anthropic...");
    const response = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages,
    });
    console.log("Received response from Anthropic");

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
    console.error("Error in chat API:", error);
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}

// Add handlers for other HTTP methods
export async function GET() {
  return new Response("Method not allowed", { status: 405 });
}

export async function PUT() {
  return new Response("Method not allowed", { status: 405 });
}

export async function DELETE() {
  return new Response("Method not allowed", { status: 405 });
}
