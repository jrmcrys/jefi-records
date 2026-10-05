import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      /* The Claude connector looks for these two addresses. Both are served
         by app/oauth-metadata/route.ts. */
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/oauth-metadata",
      },
      {
        source: "/.well-known/oauth-protected-resource/api/mcp",
        destination: "/oauth-metadata",
      },
    ];
  },
};

export default nextConfig;
