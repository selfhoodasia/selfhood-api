import { Anthropic } from "@anthropic-ai/sdk";
import axios from "axios";
import { WebflowFetcher } from "@/lib/webflow-fetcher";

// Add debug logging at the top of the file
console.log("Environment Variables Check:");
console.log("ANTHROPIC_API_KEY:", process.env.ANTHROPIC_API_KEY);
console.log("WEBFLOW_API_TOKEN:", process.env.WEBFLOW_API_TOKEN);

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
if (!process.env.WEBFLOW_API_TOKEN) {
  throw new Error("WEBFLOW_API_TOKEN environment variable is not set");
}
if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY environment variable is not set");
}

// Initialize Anthropic client (simplified logging)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Update Webflow client configuration
const webflowClient = axios.create({
  baseURL: WEBFLOW_CONFIG.BASE_URL,
  headers: {
    Authorization: `Bearer ${process.env.WEBFLOW_API_TOKEN}`,
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

// Add new interface for page content
interface PageContent {
  title: string;
  slug: string;
  content: string;
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
  console.log("Fetching case studies...");
  const { items } = await fetchData(
    `collections/${WEBFLOW_CONFIG.COLLECTIONS.CASE_STUDIES}/items/live`
  );
  console.log(`Found ${items.length} case studies`);

  const processedItems = items.reduce(
    (acc: Record<string, CaseStudy>, item: WebflowResponse) => {
      const key = item.fieldData.name.toLowerCase();
      acc[key] = {
        title: item.fieldData.name,
        slug: item.fieldData.slug,
        content: convertHtmlToMarkdown(item.fieldData.content || ""),
        id: item.fieldData.slug,
      };
      console.log(
        `Processed case study: ${item.fieldData.name} (${item.fieldData.slug})`
      );
      return acc;
    },
    {}
  );

  console.log("Case studies content:", JSON.stringify(processedItems, null, 2));
  return processedItems;
}

// Replace existing getPageContent function
async function getPageContent(): Promise<Record<string, PageContent>> {
  const fetcher = new WebflowFetcher();
  const result = await fetcher.processPage("679528029097b958606ec2ed");
  return result.pages;
}

export async function POST(req: Request) {
  try {
    console.log("\n=== INCOMING REQUEST ===");
    const { messages } = await req.json();
    console.log("Headers:", Object.fromEntries(req.headers.entries()));
    console.log("Messages:", JSON.stringify(messages, null, 2));
    console.log("=== END REQUEST ===\n");

    // Enhanced logging for context data fetching
    console.log("🔄 Starting context data fetch...");
    const fetcher = new WebflowFetcher();
    const contextData = await fetcher.processPage("679528029097b958606ec2ed");
    
    // Pretty print context data with clear separation
    console.log("\n=== CONTEXT DATA ===");
    console.log(JSON.stringify(contextData, null, 2));
    console.log("=== END CONTEXT DATA ===\n");

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

Context:
${JSON.stringify(contextData, (_, value) =>
  typeof value === "string" ? value.substring(0, 1000) : value
)}`;

    console.log(
      "🤖 Sending request to Anthropic with system prompt length:",
      systemPrompt.length
    );
    const response = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages,
    });

    // Enhanced response logging
    console.log("✅ Anthropic Response Content:");
    console.log(JSON.stringify(response.content[0].text, null, 2));

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
    // Enhanced error logging
    console.error("❌ Error in chat API:", {
      message: error instanceof Error ? error.message : "Unknown error",
      type: error instanceof Error ? error.constructor.name : typeof error,
      stack: error instanceof Error ? error.stack : "No stack trace available",
    });

    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
        type: error instanceof Error ? error.constructor.name : typeof error,
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
