import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
