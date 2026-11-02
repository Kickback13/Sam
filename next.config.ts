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
        // Everything except the embeddable AZH request form (/r/<slug>/embed…).
        source: "/((?!r/[a-z0-9-]+/embed).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // Self-hosted fonts (src/app/azh-fonts.css): file names carry a version, so cache them forever.
        source: "/fonts/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // AZH request form iframe: may be embedded on AZH's website (AZH-012).
        source: "/r/:slug/embed/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
