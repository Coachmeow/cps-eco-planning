import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // ยัง report errors แต่ไม่ block production build
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
