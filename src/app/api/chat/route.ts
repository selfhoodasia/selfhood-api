import { Anthropic } from "@anthropic-ai/sdk";
import { fetchWebflowData } from "@/lib/webflow";

export const runtime = "edge";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
  "sources": [{ // only show 1 max
    "slug": "slug", // must be either: "offerings", "index", "showroom", "about", or "casestudies/${contextData.casestudies.map(cs => cs.id).join('" or "casestudies/')}"
    "name": "name", // must be one of the page titles from the context data (Offerings, Index, Showroom, About, or case study names)
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

  const response = await anthropic.messages.create({
    model: "claude-3-5-haiku-20241022",
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages,
  });

  return new Response(
    JSON.stringify({
      role: "assistant",
      content: response.content[0],
    })
  );
}
