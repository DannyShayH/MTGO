import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import {
  createShippingOptionsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows"
import { ensureMenuCommerceSetupWorkflow } from "../workflows/menu"

const DELIVERY_OPTION_NAME = "MTOGO delivery included"

/** A DKK Restaurant basket uses the starter's Denmark service zone at zero Customer cost. */
export default async function menu_delivery({
  container,
}: {
  container: MedusaContainer
}) {
  const { result: setup } = await ensureMenuCommerceSetupWorkflow(
    container,
  ).run({
    input: undefined,
  })
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const [{ data: locations }, { data: options }] = await Promise.all([
    query.graph({
      entity: "stock_location",
      fields: ["id", "fulfillment_sets.service_zones.id"],
    }),
    query.graph({
      entity: "shipping_option",
      fields: ["id"],
      filters: { name: DELIVERY_OPTION_NAME },
    }),
  ])
  const location = locations.find((entry) =>
    (
      entry as { fulfillment_sets?: { service_zones?: { id: string }[] }[] }
    ).fulfillment_sets?.some((set) => set.service_zones?.length),
  ) as
    | {
        id: string
        fulfillment_sets: { service_zones: { id: string }[] }[]
      }
    | undefined
  if (!location || !setup.sales_channel_id || !setup.shipping_profile_id)
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "menu_delivery_setup_incomplete",
    )
  const serviceZoneId = location.fulfillment_sets.find(
    (set) => set.service_zones?.length,
  )?.service_zones[0].id
  if (!serviceZoneId)
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "menu_delivery_setup_incomplete",
    )

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: { id: location.id, add: [setup.sales_channel_id] },
  })
  if (options.length) return

  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: DELIVERY_OPTION_NAME,
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: serviceZoneId,
        shipping_profile_id: setup.shipping_profile_id,
        type: {
          label: "Delivery included",
          description: "Restaurant delivery is included in menu prices.",
          code: "mtogo-delivery",
        },
        prices: [{ currency_code: "dkk", amount: 0 }],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      },
    ],
  })
}
