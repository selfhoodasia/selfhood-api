import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  },
  async headers() {
    const allowedOrigins = [
      'https://selfhood.global',
      'https://www.selfhood.global', 
      'https://selfhood-new.webflow.io', 
      'https://selfhoodglobal-new.webflow.io'
    ];
    
    return [
      {
        // Apply these headers to all routes
        source: "/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Credentials",
            value: "true",
          },
          {
            key: "Access-Control-Allow-Origin",
            value: process.env.NODE_ENV === "development"
              ? "http://localhost:3000"
              : allowedOrigins.join(','),
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,OPTIONS,PATCH,DELETE,POST,PUT",
          },
          {
            key: "Access-Control-Allow-Headers",
            value:
              "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
