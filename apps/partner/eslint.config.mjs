import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Tailwind and PostCSS load CommonJS configuration.
    files: ["*.config.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  globalIgnores([
    "playwright-report/**",
    "test-results/**",
    ".next/**",
    "next-env.d.ts",
  ]),
])
