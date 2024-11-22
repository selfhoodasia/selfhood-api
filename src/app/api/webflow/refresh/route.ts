import { fetchWebflowData, invalidateWebflowCache } from "@/lib/webflow";

export async function POST() {
  try {
    console.log("Starting Webflow data refresh...");
    await invalidateWebflowCache();
    const data = await fetchWebflowData();
    console.log("Webflow refresh completed successfully");
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Failed to refresh Webflow data:", error);
    return new Response(
      JSON.stringify({ error: "Failed to refresh Webflow data" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}
