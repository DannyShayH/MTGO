import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import register from "../modules/postal-code/data/postal-codes.json"
import { syncPostalCodeRegisterWorkflow } from "../workflows/postal-codes"

// Migration scripts run once each. A refreshed register file gets a new script,
// named after its source date, that runs the same sync.
export default async function postal_code_register({
  container,
}: {
  container: MedusaContainer
}) {
  const { result } = await syncPostalCodeRegisterWorkflow(container).run({
    input: { postal_codes: register.postal_codes },
  })
  container
    .resolve(ContainerRegistrationKeys.LOGGER)
    .info(
      `Postal code register (${register.source_updated}): ${result.created} created, ${result.updated} renamed, ${result.removed} removed`,
    )
}
