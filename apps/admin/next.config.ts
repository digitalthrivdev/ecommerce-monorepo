import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server for the production Docker image (apps/admin/Dockerfile).
  output: "standalone",
  // Dependencies are hoisted to the monorepo root, so trace files from there.
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  poweredByHeader: false,
  experimental: {
    // Image uploads go through a server action; the API accepts up to 10 MB. Nginx allows 12 MB.
    serverActions: { bodySizeLimit: "11mb" },
    proxyClientMaxBodySize: "11mb",
  },
};

export default nextConfig;
