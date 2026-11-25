import type { LogRecord } from "@dtc/logging"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * Writes one safe record to Medusa's logger. Its CLI formatter displays only
 * `message`, so development keeps the whole record visible there, while
 * production retains structured top-level fields.
 */
export function writeRecord(
  container: Pick<MedusaContainer, "resolve">,
  record: LogRecord,
) {
  container
    .resolve(ContainerRegistrationKeys.LOGGER)
    .log(
      record.level,
      record.env === "development" ? JSON.stringify(record) : record.msg,
      record,
    )
}
