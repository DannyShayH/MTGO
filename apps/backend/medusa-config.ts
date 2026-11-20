import { loadEnv, defineConfig, Modules } from "@medusajs/framework/utils"
import * as linkModules from "@medusajs/medusa/link-modules"
import path from "node:path"
import { redisModules } from "./src/config/redis-modules"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

// Also moves Medusa's session store to Redis. Unset in CI, which keeps the
// local fallbacks.
const redisUrl =
  process.env.NODE_ENV === "test"
    ? undefined
    : process.env.REDIS_URL || undefined

// Development uses local files. Staging keeps objects private in Tigris and
// signs only registered photo attachments when a Customer or staff reads them.
const backendUrl = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
const localFileDirectory = path.join(process.cwd(), "static")
const photoFileProvider = process.env.PHOTO_S3_BUCKET
  ? {
      resolve: "@medusajs/medusa/file-s3",
      id: "s3",
      options: {
        bucket: process.env.PHOTO_S3_BUCKET,
        endpoint: process.env.PHOTO_S3_ENDPOINT,
        region: process.env.PHOTO_S3_REGION,
        file_url: process.env.PHOTO_S3_FILE_URL,
        access_key_id: process.env.PHOTO_S3_ACCESS_KEY_ID,
        secret_access_key: process.env.PHOTO_S3_SECRET_ACCESS_KEY,
        acl: false,
        download_file_duration: 3600,
      },
    }
  : {
      resolve: "@medusajs/medusa/file-local",
      id: "local",
      options: {
        // Outside .medusa build output, so local images survive dev restarts.
        upload_dir: localFileDirectory,
        private_upload_dir: localFileDirectory,
        backend_url: `${backendUrl}/static`,
      },
    }

// Real email only when a Resend key is configured. Development and tests keep
// the private mailbox provider, which captures messages without logging links.
const emailNotificationProvider = process.env.RESEND_API_KEY
  ? {
      resolve: "./src/modules/resend",
      id: "resend",
      options: {
        channels: ["email"],
        api_key: process.env.RESEND_API_KEY,
        from: process.env.RESEND_FROM_EMAIL || undefined,
      },
    }
  : {
      resolve: "./src/modules/private-mailbox",
      id: "private-mailbox",
      options: { channels: ["email"] },
    }

module.exports = defineConfig({
  admin: {
    // The staging worker container serves no dashboard.
    disable: process.env.DISABLE_MEDUSA_ADMIN === "true",
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
        delivery_agent: ["delivery-agent-emailpass"],
        user: ["emailpass"],
      },
      authVerificationsPerActor: {
        customer: [
          { auth_provider: "customer-emailpass", entity_type: "email" },
        ],
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
            resolve: "./src/modules/delivery-agent-emailpass",
            id: "delivery-agent-emailpass",
          },
          {
            resolve: "./src/modules/customer-emailpass",
            id: "customer-emailpass",
          },
        ],
        verification: {
          providers: [{ id: "token", options: { ttl_seconds: 900 } }],
        },
      },
    },
    {
      resolve: "@medusajs/medusa/file",
      options: {
        providers: [photoFileProvider],
      },
    },
    {
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [emailNotificationProvider],
      },
    },
    {
      resolve: "./src/modules/restaurant",
      // Invite links point to the partner app's invitation page.
      options: { partner_url: process.env.PARTNER_PUBLIC_URL },
    },
    { resolve: "./src/modules/postal-code" },
    { resolve: "./src/modules/food-catalogue" },
    { resolve: "./src/modules/order-operation" },
    { resolve: "./src/modules/delivery" },
    {
      // Trip and pickup distances (#191). Without a key every distance is
      // unavailable and nothing is sent to openrouteservice.
      resolve: "./src/modules/routing",
      options: {
        api_key: process.env.ORS_API_KEY,
        base_url: process.env.ORS_BASE_URL,
      },
    },
  ],
})
