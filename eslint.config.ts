import { defineConfig } from "eslint/config"
import medusa from "@medusajs/eslint-plugin"
import sonarjs from "eslint-plugin-sonarjs"
import tseslint from "typescript-eslint"

export default defineConfig([
  ...medusa.configs.recommended,
  {
    basePath: `${import.meta.dirname}/apps/backend`,
    files: ["**/*.{ts,tsx}"],
    ignores: ["**/eslint.config.*"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./apps/backend/tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { sonarjs, "@typescript-eslint": tseslint.plugin },
    rules: {
      ...sonarjs.configs.recommended.rules,
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
])
