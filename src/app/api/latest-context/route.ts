import { createClient } from '@vercel/edge-config';

const allowedOrigins = [
  "https://selfhood.global",
  "https://www.selfhood.global",
  "https://selfhood-new.webflow.io",
  "https://selfhoodglobal-new.webflow.io",
  "http://localhost:3000",
];

function getCorsHeaders(origin?: string) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin") || "";
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

export async function GET(req: Request) {
  const origin = req.headers.get("origin") || "";
  
  if (!process.env.EDGE_CONFIG_ID) {
    return new Response(
      JSON.stringify({ error: 'EDGE_CONFIG_ID environment variable is not set' }), 
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(origin),
        },
      }
    );
  }
  
  try {
    const edgeConfig = createClient(process.env.EDGE_CONFIG_ID);
    const latestUrl = await edgeConfig.get('latestContextUrl');
    
    return new Response(JSON.stringify({ url: latestUrl }), {
      headers: { 
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin),
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch latest URL';
    
    return new Response(
      JSON.stringify({ error: errorMessage }), 
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(origin),
        },
      }
    );
  }
} 