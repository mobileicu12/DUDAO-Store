import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Product images are pasted in as URLs, so any https host is allowed.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  // These pull in Node built-ins; keep them out of the client bundle trace so
  // the route handlers that use them stay on the Node runtime.
  serverExternalPackages: ["exceljs", "@prisma/client", "@prisma/adapter-pg"],
};

export default nextConfig;
