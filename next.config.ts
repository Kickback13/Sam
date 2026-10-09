import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ADR-004: Cache Components off for Phase 1 — every page is authenticated and per-request.
  cacheComponents: false,
  partialPrefetching: false,
  poweredByHeader: false,
  // Dev only: allow the loopback IP (tests and local tools use 127.0.0.1).
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    serverActions: {
      // CSV imports are sent to server actions in chunks; keep headroom per chunk.
      bodySizeLimit: "4mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
