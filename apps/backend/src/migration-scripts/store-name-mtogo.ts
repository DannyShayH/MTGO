import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateStoresWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Names the store MTOGO, so operators see the platform's name at the top of
 * the Admin sidebar instead of Medusa's "Default Store". New installations
 * are seeded with the name; this renames the existing ones.
 */
export default async function store_name_mtogo({
  container,
}: {
  container: MedusaContainer
}) {
  const { data: stores } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({
      entity: "store",
      fields: ["id"],
      filters: { name: "Default Store" },
    })
  if (stores.length === 0) return
  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: stores.map(({ id }) => id) },
      update: { name: "MTOGO" },
    },
  })
}
