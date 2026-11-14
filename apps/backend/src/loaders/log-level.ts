import type { LoaderOptions } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/** Keep security events visible; configure the existing Medusa logger. */
export default async function logLevel({ container }: LoaderOptions) {
  container
    .resolve(ContainerRegistrationKeys.LOGGER)
    .setLogLevel(
      (process.env.NODE_ENV || "development") === "development"
        ? "debug"
        : "info",
    )
}
