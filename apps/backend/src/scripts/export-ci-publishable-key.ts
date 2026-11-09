import { appendFileSync } from "node:fs"
import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

/** Export the initial seed's publishable key without putting it in command output. */
export default async function exportCiPublishableKey({ container }: ExecArgs) {
  const outputFile = process.env.CI_PUBLISHABLE_KEY_FILE
  if (!outputFile) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "CI_PUBLISHABLE_KEY_FILE must point to a temporary file",
    )
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: keys } = await query.graph({
    entity: "api_key",
    fields: ["token"],
    filters: {
      title: "Default Publishable API Key",
      type: "publishable",
      revoked_at: null,
    },
  })

  if (keys.length !== 1 || !keys[0].token?.startsWith("pk_")) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Expected one publishable API key from the initial data seed",
    )
  }

  appendFileSync(outputFile, `${keys[0].token}\n`, { mode: 0o600 })
}
