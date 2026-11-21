/** @type {import('next').NextConfig} */
// Server-side backend address (not exposed to the browser): localhost:8004 when
// the Next.js server runs directly on the host, or the backend's Docker Compose
// service address when the frontend itself runs in a container.
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8004";

// The Privacy Policy and Terms live only on the static marketing site, so they never depend on the
// dashboard's login logic. Keep these URLs in step with src/lib/public-paths.ts.
export const LEGAL_REDIRECTS = [
  { source: "/privacy-policy", destination: "https://spirit-monkey.com/privacy-policy/", permanent: true },
  { source: "/terms-and-conditions", destination: "https://spirit-monkey.com/terms/", permanent: true },
];

const nextConfig = {
  async redirects() {
    return LEGAL_REDIRECTS;
  },
  async rewrites() {
    return [
      {
        source: "/agent-api/:path*",
        destination: `${BACKEND_URL}/:path*`,
      },
      {
        source: "/api/v1/:path*",
        destination: `${BACKEND_URL}/api/v1/:path*`,
      },
      {
        source: "/ws-api/:path*",
        destination: `${BACKEND_URL}/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  reactStrictMode: false,
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
