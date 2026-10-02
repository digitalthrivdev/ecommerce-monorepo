import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server for the production Docker image (apps/admin/Dockerfile).
  output: "standalone",
  // Dependencies are hoisted to the monorepo root, so trace files from there.
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  poweredByHeader: false,
};

export default nextConfig;
