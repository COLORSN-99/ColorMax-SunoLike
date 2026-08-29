import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 纯 TS 依赖（@colormax/* 以 TS 源码直接编译），避免打包器外部化问题
  transpilePackages: ["@colormax/schema", "@colormax/llm"],
};

export default nextConfig;
