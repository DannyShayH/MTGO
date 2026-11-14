import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MENU_CURRENCY } from "../published-menu"

/** Dishes are sold through this channel only, so native product browsing never lists them. */
export const MENU_SALES_CHANNEL_NAME = "MTOGO menus"

/** What already exists of the commerce configuration every dish needs. */
export const readMenuCommerceSetupStep = createStep(
  "read-menu-commerce-setup",
  async (_input: undefined, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const [channels, profiles, preferences] = await Promise.all([
      query.graph({
        entity: "sales_channel",
        fields: ["id"],
        filters: { name: MENU_SALES_CHANNEL_NAME },
      }),
      query.graph({
        entity: "shipping_profile",
        fields: ["id"],
        filters: { type: "default" },
      }),
      query.graph({
        entity: "price_preference",
        fields: ["id", "is_tax_inclusive"],
        filters: { attribute: "currency_code", value: MENU_CURRENCY },
      }),
    ])
    const [preference] = preferences.data
    return new StepResponse({
      sales_channel_id: (channels.data[0]?.id ?? null) as string | null,
      shipping_profile_id: (profiles.data[0]?.id ?? null) as string | null,
      price_preference_id: (preference?.id ?? null) as string | null,
      is_tax_inclusive: preference?.is_tax_inclusive === true,
    })
  },
)
