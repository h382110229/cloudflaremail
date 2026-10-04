import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 自托管：standalone 输出，node server.js 即可运行，内存占用更小
  output: "standalone",
};

export default nextConfig;
