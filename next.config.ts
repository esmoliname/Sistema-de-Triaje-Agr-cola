import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  basePath: '/Sistema-de-Triaje-Agr-cola',
  assetPrefix: '/Sistema-de-Triaje-Agr-cola/'
};
export default nextConfig;
