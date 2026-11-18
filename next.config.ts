import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // self-hosted (docker) build; ignored on Vercel
  outputFileTracingIncludes: {
    "/*": ["./src/lib/llm/prompts/**/*.md"],
  },
};

export default nextConfig;
