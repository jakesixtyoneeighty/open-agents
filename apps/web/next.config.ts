import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": ["./lib/skills/task-planning/SKILL.md"],
  },
  outputFileTracingExcludes: {
    // The workflow runtime does a best-effort (try/catch) read of
    // process.cwd()/package.json, so tracing ships apps/web/package.json
    // ("type": "module") with these functions. Node then treats the compiled
    // CJS route.js as ESM and throws ERR_REQUIRE_ESM on every invocation.
    "/.well-known/workflow/**": ["./package.json"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "vercel.com",
      },
      {
        protocol: "https",
        hostname: "*.vercel.com",
      },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default withWorkflow(withBotId(nextConfig));
