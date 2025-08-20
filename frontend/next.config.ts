import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for minimal runtime image
  output: 'standalone',
  // Faster CI/Kubernetes builds: skip browser source maps
  productionBrowserSourceMaps: false,
  // Minor hardening
  poweredByHeader: false,
  compress: true,
};

export default nextConfig;
