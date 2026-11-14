import { pinOwnReact } from "@dtc/next-react"

// Render with this app's React 19, not the root's React 18 (#82, see
// packages/next-react/README.md).
pinOwnReact(import.meta.dirname)

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["winston", "@dtc/logging"],
  // Next dev logs can include action arguments, URLs and browser errors.
  logging: false,
  // AGENTS.md at the repository root guides agents; do not generate one here.
  agentRules: false,
  // The shared packages ship TypeScript source, without a build step.
  transpilePackages: ["@dtc/i18n"],
  poweredByHeader: false,
}

export default nextConfig
