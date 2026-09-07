/** @type {import('next').NextConfig} */
// Server-side backend address (not exposed to the browser): localhost:8004 when
// the Next.js server runs directly on the host, or the backend's Docker Compose
// service address when the frontend itself runs in a container.
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8004";

const nextConfig = {
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
