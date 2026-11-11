import { loadEnv, defineConfig } from "@medusajs/framework/utils"
import { redisModules } from "./src/config/redis-modules"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

// Also moves Medusa's session store to Redis. Unset in CI, which keeps the
// local fallbacks.
const redisUrl = process.env.REDIS_URL || undefined

module.exports = defineConfig({
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
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
    },
  },
  modules: redisModules(redisUrl),
})
