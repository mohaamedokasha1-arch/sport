import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  // The database and cache drivers are optional at runtime (the platform boots
  // without them). Keeping them external means the server bundle requires them
  // from node_modules only when a connection is actually configured.
  serverExternalPackages: ["pg", "ioredis"],
};

export default nextConfig;
