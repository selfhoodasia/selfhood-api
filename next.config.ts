import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['axios'],
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
