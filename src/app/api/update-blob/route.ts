import { WebflowFetcher } from "@/lib/webflow-fetcher";
import { put } from "@vercel/blob";

const requiredEnv = {
  VERCEL_API_TOKEN: process.env.VERCEL_API_TOKEN,
  EDGE_CONFIG_ID: process.env.EDGE_CONFIG_ID,
} as const;

Object.entries(requiredEnv).forEach(([key, value]) => {
  if (!value) throw new Error(`${key} environment variable is not set`);
});

export async function POST() {
  try {
    const webflowFetcher = new WebflowFetcher();
    const fetchedData = await webflowFetcher.processPage();
    const jsonData = JSON.stringify(fetchedData, null, 2);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const blobFilename = `context-${timestamp}.json`;

    const blob = await put(blobFilename, jsonData, {
      access: "public",
    });

    const response = await fetch(
      `https://api.vercel.com/v1/edge-config/${requiredEnv.EDGE_CONFIG_ID}/items`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${requiredEnv.VERCEL_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: [
            {
              operation: "upsert",
              key: "latestContextUrl",
              value: blob.url,
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error("Edge Config update failed:", {
        status: response.status,
        statusText: response.statusText,
        errorData,
      });
      throw new Error(
        `Failed to update Edge Config: ${
          errorData ? JSON.stringify(errorData) : response.statusText
        }`
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        blobUrl: blob.url,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
