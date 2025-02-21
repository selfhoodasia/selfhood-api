import { WebflowFetcher } from "@/lib/webflow-fetcher";
import { put } from "@vercel/blob";
import { writeFile } from "fs/promises";
import { join } from "path";

export async function POST(_req: Request) {
  void _req;
  try {
    // Optionally, verify the request is from a trusted source (e.g., check header or token)
    const webflowFetcher = new WebflowFetcher();
    const fetchedData = await webflowFetcher.processPage();
    const jsonData = JSON.stringify(fetchedData, null, 2);

    // Upload to blob storage
    const blob = await put("context.json", jsonData, {
      access: "public", // Set access as needed.
    });

    // Write to local file
    const localPath = join(process.cwd(), "public", "context.json");
    await writeFile(localPath, jsonData, "utf-8");

    // Return the blobUrl. Note: the internal name may show additional unique characters,
    // but the key used to write the file is still "context.json".
    return new Response(
      JSON.stringify({ 
        success: true, 
        blobUrl: blob.url,
        localPath: localPath 
      }), {
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
