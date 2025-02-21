import { createClient } from '@vercel/edge-config';

export async function GET() {
  try {
    const edgeConfig = createClient(process.env.EDGE_CONFIG_ID!);
    const latestUrl = await edgeConfig.get('latestContextUrl');
    
    // Option 1: Return the URL for client-side fetching
    return new Response(JSON.stringify({ url: latestUrl }), {
      headers: { 'Content-Type': 'application/json' },
    });

    // Option 2: Redirect directly to the latest version
    // return Response.redirect(latestUrl as string);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Failed to fetch latest URL' }), 
      { status: 500 }
    );
  }
} 