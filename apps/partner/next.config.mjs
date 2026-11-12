/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The shared packages ship TypeScript source, without a build step.
  transpilePackages: ["@dtc/i18n"],
  poweredByHeader: false,
}

export default nextConfig
