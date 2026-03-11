import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": ["./src/lib/llm/prompts/**/*.md"],
  },
};

export default nextConfig;
