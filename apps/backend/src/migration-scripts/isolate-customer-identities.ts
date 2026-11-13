import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { isolateCustomerIdentityWorkflow } from "../workflows/customer-auth"

export default async function isolate_customer_identities({
  container,
}: {
  container: MedusaContainer
}) {
  const auth = container.resolve(Modules.AUTH)
  let skip = 0
  while (true) {
    const identities = await auth.listAuthIdentities(
      {},
      { take: 100, skip, order: { id: "ASC" } },
    )
    if (!identities.length) break
    for (const identity of identities) {
      if (!identity.app_metadata?.customer_id) continue
      const providers = await auth.listProviderIdentities({
        auth_identity_id: identity.id,
        provider: "emailpass",
      })
      if (!providers.length) continue
      await isolateCustomerIdentityWorkflow(container).run({
        input: { auth_identity_id: identity.id },
      })
    }
    skip += identities.length
  }
}
