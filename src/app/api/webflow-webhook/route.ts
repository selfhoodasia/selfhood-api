import { WebflowFetcher } from "@/lib/webflow-fetcher";

const WEBFLOW_PAGE_ID = "679528029097b958606ec2ed";
const CACHE_KEY = `webflow_page_${WEBFLOW_PAGE_ID}`;

export async function POST() {
  try {
    console.log('Webhook triggered - fetching fresh data');
    const webflowFetcher = new WebflowFetcher();
    const newData = await webflowFetcher.processPage(WEBFLOW_PAGE_ID);
    console.log('Fresh data fetched:', newData);

    const edgeConfig = process.env.EDGE_CONFIG;
    if (!edgeConfig) {
      throw new Error('EDGE_CONFIG environment variable is not set');
    }

    console.log('Updating Edge Config cache');
    const response = await fetch(edgeConfig, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{
          operation: 'upsert',
          key: CACHE_KEY,
          value: newData
        }]
      }),
    });

    console.log('Cache update response:', {
      status: response.status,
      ok: response.ok
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update cache: ${errorText}`);
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Detailed webhook error:', error);
    return new Response(`Internal Server Error: ${error}`, { status: 500 });
  }
} 