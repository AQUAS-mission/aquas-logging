import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["maplibre-gl", "react-map-gl"],
};

export default nextConfig;
