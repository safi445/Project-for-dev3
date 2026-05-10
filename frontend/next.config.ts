import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Avoid picking a parent directory when multiple lockfiles exist (e.g. user home).
  turbopack: {
    root: path.resolve(process.cwd()),
  },
};

export default nextConfig;
