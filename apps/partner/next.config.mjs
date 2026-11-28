import { pinOwnReact } from "@dtc/next-react"

// Render with this app's React 19, not the root's React 18 (#82, see
// packages/next-react/README.md).
pinOwnReact(import.meta.dirname)

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  serverExternalPackages: ["winston", "@dtc/logging"],
  // Next dev logs can include action arguments, URLs and browser errors.
  logging: false,
  // AGENTS.md at the repository root guides agents; do not generate one here.
  agentRules: false,
  // The shared packages ship TypeScript source, without a build step.
  transpilePackages: ["@dtc/charts", "@dtc/i18n"],
  // Recharts (#264) is hoisted to the root beside the Admin's react-is 18,
  // which does not recognise React 19 elements; give it this app's copy.
  turbopack: { resolveAlias: { "react-is": "./node_modules/react-is" } },
  poweredByHeader: false,
}

export default nextConfig
