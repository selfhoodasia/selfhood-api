import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { fetchWebflowData } from "@/lib/webflow";

export const runtime = "edge";

export async function POST(req: Request) {
  // Extract messages early to fail fast if invalid
  const { messages } = await req.json();

  // Fetch context data in parallel with message parsing
  const contextDataPromise = fetchWebflowData();
  const contextData = await contextDataPromise;

  // Move system prompt to a separate constant/file to improve readability
  const systemPrompt = `RESPONSE FORMAT:
You must respond with valid JSON in the following format:
{
  "answer": "Your direct answer (1-3 sentences, max 50 words)",
  "sources": ["[slug]", "[slug]"], // for case studies, show the slug name as /casestudies/[slug] (can show up to 2, though only when necessary. minimum 1)
  "followUpQuestions": [ // max 20 words each
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

  return streamText({
    model: anthropic("claude-3-5-haiku-20241022"),
    messages: [{ role: "system", content: systemPrompt }, ...messages],
  }).toDataStreamResponse();
}
