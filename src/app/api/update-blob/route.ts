import { WebflowFetcher } from "@/lib/webflow-fetcher";
import { put } from "@vercel/blob";

export async function POST(_req: Request) {
  void _req;
  try {
    // Optionally, verify the request is from a trusted source (e.g., check header or token)
    const webflowFetcher = new WebflowFetcher();
    const fetchedData = await webflowFetcher.processPage();
    const jsonData = JSON.stringify(fetchedData, null, 2);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const blobFilename = `context-${timestamp}.json`;

    // Upload to blob storage
    const blob = await put(blobFilename, jsonData, {
      access: "public", // Set access as needed.
    });

    const edgeConfigId = "ecfg_ybrypcsldkjlqv6ye4fdhf6x2yef"; // Hardcoded for testing

    // Verify API token exists
    if (!process.env.VERCEL_API_TOKEN) {
      throw new Error("VERCEL_API_TOKEN environment variable is not set");
    }

    // Update Edge Config using the direct API
    const response = await fetch(
      `https://api.vercel.com/v1/edge-config/${edgeConfigId}/items`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`,
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

    // Return the blobUrl. Note: the internal name may show additional unique characters,
    // but the key used to write the file is still "context.json".
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
