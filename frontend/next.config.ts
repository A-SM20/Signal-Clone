import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // Dev only: lets a second browser profile on 127.0.0.1 act as another user.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
