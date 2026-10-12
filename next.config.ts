import type { NextConfig } from "next";
const localOnly = process.env.LOOPI_RUNTIME_PROFILE === "local" || process.env.LOOPI_LOCAL_ONLY === "true";
const connectSources = localOnly ? "'self' http://127.0.0.1:54321 ws://127.0.0.1:54321" : "'self' https://*.supabase.co wss://*.supabase.co https://nominatim.openstreetmap.org";
const imageSources = localOnly ? "'self' data: blob:" : "'self' data: blob: https://*.tile.openstreetmap.org";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/login",
        destination: "/auth/login",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Permissions-Policy",
            value: "camera=(self), geolocation=(self), microphone=()",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src ${connectSources}; img-src ${imageSources}; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`,
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
      {
        source: "/app/(.*)",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      },
      {
        source: "/api/(.*)",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
