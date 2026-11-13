import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16.4.6 can replay stale HMR versions from its persistent dev cache.
  // Keep Turbopack development but start each process with a fresh module graph.
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**/image/upload/**",
        search: "",
      },
    ],
  },
  poweredByHeader: false,
  // Recovery URLs contain secrets. Do not forward URL or browser logs in development.
  logging: {
    incomingRequests: false,
    browserToTerminal: false,
    serverFunctions: false,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
