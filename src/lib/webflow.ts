// Define types for better type safety
interface WebflowData {
  about: string;
  casestudies: CaseStudy[];
  index: string;
  offerings: string;
  contact: string;
  systemPrompt: SystemPrompt;
}

interface CaseStudy {
  id: string;
  name: string;
  subtitle: string;
  content: string;
}

interface SystemPrompt {
  styleGuidelines: string;
  questionPatterns: string;
}

interface WebflowNode {
  text: {
    text: string;
  };
}

interface CaseStudyResponse {
  items: {
    fieldData: {
      slug: string;
      name: string;
      subtitle: string;
      content: string;
    };
  }[];
}

// Move constants outside
const WEBFLOW_API_BASE = "https://api.webflow.com/v2";
const ENDPOINTS = {
  casestudies: "collections/67405a6bc01960d426e5da3f/items/live",
  about: "pages/6740554d9f3f3af86027fa6c/dom",
  index: "pages/674055a52157d44524e67fe4/dom",
  offerings: "pages/674055be7198930c41a0cd9d/dom",
  contact: "pages/67405571c37ae49704efc983/dom",
  systemPrompt:
    "collections/67409359ef24c542fe79ed6c/items/674093e0ef24c542fe7a83b1/live",
} as const;

// Update cached data type
let cachedData: WebflowData | null = null;

const headers = {
  accept: "application/json",
  authorization: `Bearer ${process.env.WEBFLOW_API_TOKEN}`,
};

export async function fetchWebflowData(): Promise<WebflowData> {
  if (cachedData) {
    console.debug("[Webflow] Using cached data");
    return cachedData;
  }

  console.debug("[Webflow] Fetching fresh data...");
  const startTime = performance.now();

  try {
    const responses = await Promise.all(
      Object.entries(ENDPOINTS).map(async ([key, path]) => {
        const response = await fetch(`${WEBFLOW_API_BASE}/${path}`, {
          headers,
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch ${key}: ${response.statusText}`);
        }
        const data = await response.json();
        return { key, data };
      })
    );

    // Create a map of responses
    const responseMap = Object.fromEntries(
      responses.map(({ key, data }) => [key, data])
    );

    // Clean and structure the data
    const data: WebflowData = {
      about: cleanTextNodes(responseMap.about.nodes),
      casestudies: responseMap.casestudies.items.map(
        (item: CaseStudyResponse["items"][0]) => ({
          id: item.fieldData.slug,
          name: item.fieldData.name,
          subtitle: item.fieldData.subtitle,
          content: cleanHtmlContent(item.fieldData.content),
        })
      ),
      index: cleanTextNodes(responseMap.index.nodes),
      offerings: cleanTextNodes(responseMap.offerings.nodes),
      contact: cleanTextNodes(responseMap.contact.nodes),
      systemPrompt: {
        styleGuidelines:
          responseMap.systemPrompt?.fieldData?.["style-guidelines"] ?? "",
        questionPatterns:
          responseMap.systemPrompt?.fieldData?.["specific-question-patterns"] ??
          "",
      },
    };

    console.debug("[Webflow] Cleaned and structured data:", data);

    cachedData = data;
    logPerformance(startTime);
    return data;
  } catch (error) {
    console.error("[Webflow] Error fetching data:", error);
    throw new Error(
      "Failed to fetch Webflow data: " +
        (error instanceof Error ? error.message : "Unknown error")
    );
  }
}

// Helper functions for cleaner code
function cleanTextNodes(nodes: WebflowNode[]): string {
  return nodes.map((n) => n.text.text).join("\n");
}

function cleanHtmlContent(content: string): string {
  return content
    .replace(/<h1 id="">/g, "")
    .replace(/<\/h1>/g, "\n")
    .replace(/<p id="">/g, "")
    .replace(/<\/p>/g, "\n");
}

function logPerformance(startTime: number): void {
  const duration = Math.round(performance.now() - startTime);
  console.debug(`[Webflow] Fresh data cached (${duration}ms)`);
}

// Function to manually invalidate cache
export async function invalidateWebflowCache() {
  cachedData = null;
  console.debug("[Webflow] Cache invalidated");
}
