import { WebflowFetcher } from "@/lib/webflow-fetcher";
import { put } from "@vercel/blob";

/**
 * This API endpoint should be configured as a webhook in Webflow.
 * When Webflow publishes new content, it issues an HTTP POST to this endpoint.
 * The endpoint then fetches the latest content from Webflow and stores it in Vercel Blob.
 */
export async function POST(req: Request) {
  // Optionally: Verify that this request is coming from Webflow.
  // For example, by checking a custom header or verifying a shared secret.
  try {
    // Read webhook payload (if needed)
    const payload = await req.json();
    console.log("Received webhook payload:", payload);
  } catch {
    // It's always a good idea to validate the webhook here.
  }

  try {
    // Fetch updated content using your WebflowFetcher
    const fetcher = new WebflowFetcher();
    const updatedContent = await fetcher.processPage();

    // Store fetched content in Vercel Blob
    // You may choose a fixed name (e.g., "fetchedContent.json") so that the latest version is always available at the same blob URL.
    const blobResponse = await put(
      "fetchedContent.json",
      JSON.stringify(updatedContent),
      {
        access: "public", // or "private" if you want to restrict access; you'll then serve it via your API
        // Optionally adjust cacheControlMaxAge if necessary
        cacheControlMaxAge: 0,
      }
    );

    console.log("Content updated in blob:", blobResponse.url);
    return new Response(
      JSON.stringify({
        message: "Content successfully updated in Vercel Blob.",
        blobUrl: blobResponse.url,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Failed to update content from Webflow:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to update content",
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
