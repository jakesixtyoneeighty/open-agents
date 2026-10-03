import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": ["./lib/skills/task-planning/SKILL.md"],
  },
  outputFileTracingExcludes: {
    // Compiled routes are CommonJS, but Vercel does not ship Next's
    // .next/package.json ("type": "commonjs") marker. If tracing pulls in
    // apps/web/package.json or the root package.json (both "type": "module"),
    // Node treats route.js as ESM and throws ERR_REQUIRE_ESM. Vercel groups
    // routes into shared functions, so one route tracing a manifest breaks
    // every route in its group. Known triggers: the workflow runtime's
    // best-effort read of process.cwd()/package.json, and the agent's
    // run_checks detector, whose path.join(dir, "package.json") sandbox reads
    // the tracer resolves to the host manifest. Exclude both for all routes.
    "/*": ["./package.json", "../../package.json"],
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
