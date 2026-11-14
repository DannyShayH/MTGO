import { loadEnv, defineConfig, Modules } from "@medusajs/framework/utils"
import * as linkModules from "@medusajs/medusa/link-modules"
import { redisModules } from "./src/config/redis-modules"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

// Also moves Medusa's session store to Redis. Unset in CI, which keeps the
// local fallbacks.
const redisUrl =
  process.env.NODE_ENV === "test"
    ? undefined
    : process.env.REDIS_URL || undefined

module.exports = defineConfig({
  admin: {
    // Dashboard and extensions must share one React Query context, even when npm
    // retains nested copies of the same version.
    // Medusa merges this override with its base config; returning base plugins
    // would run React Refresh twice during development.
    vite: () => ({
      resolve: {
        dedupe: ["@tanstack/react-query", "@tanstack/query-core"],
      },
    }),
  },
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl,
    // Only the disposable browser harness serves the production build over HTTP.
    cookieOptions:
      process.env.MEDUSA_CI_HTTP === "1" ? { secure: false } : undefined,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      authMethodsPerActor: {
        customer: ["customer-emailpass"],
        restaurant_staff: ["emailpass"],
        user: ["emailpass"],
      },
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
    },
  },
  modules: [
    ...redisModules(redisUrl),
    // Resolve links from the app: hoisted framework utilities cannot see a nested Medusa install.
    { key: Modules.LINK, ...linkModules },
    {
      resolve: "@medusajs/medusa/auth",
      options: {
        providers: [
          { resolve: "@medusajs/medusa/auth-emailpass", id: "emailpass" },
          {
            resolve: "./src/modules/customer-emailpass",
            id: "customer-emailpass",
          },
        ],
      },
    },
    {
      resolve: "./src/modules/restaurant",
      // Invite links point to the partner app's invitation page.
      options: { partner_url: process.env.PARTNER_PUBLIC_URL },
    },
    { resolve: "./src/modules/postal-code" },
    { resolve: "./src/modules/food-catalogue" },
  ],
})
