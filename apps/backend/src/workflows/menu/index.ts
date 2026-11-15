import { Modules, ProductStatus } from "@medusajs/framework/utils"
import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  acquireLockStep,
  createPricePreferencesWorkflow,
  createProductsWorkflow,
  createRemoteLinkStep,
  createSalesChannelsWorkflow,
  createShippingProfilesWorkflow,
  releaseLockStep,
  updatePricePreferencesWorkflow,
} from "@medusajs/medusa/core-flows"
import { RESTAURANT_MODULE } from "../../modules/restaurant"
import { restaurantLock } from "../restaurants/restaurant-lock"
import { MENU_CURRENCY } from "./published-menu"
import {
  MENU_SALES_CHANNEL_NAME,
  readMenuCommerceSetupStep,
} from "./steps/commerce-setup"
import { readRestaurantMenuStep } from "./steps/read-menu"
import {
  createSyntheticCategoriesStep,
  createSyntheticDishContentStep,
  SyntheticCategory,
} from "./steps/synthetic-dishes"

export { readPublishedMenu } from "./steps/read-menu"
export { countPublishedDishes } from "./published-menu"
export { MENU_SALES_CHANNEL_NAME } from "./steps/commerce-setup"
export type { SyntheticCategory } from "./steps/synthetic-dishes"

const SETUP_LOCK = { key: "menu-commerce:setup", timeout: 10, ttl: 60 }

/** The Customer menu of an active Restaurant (`GET /store/restaurants/{id}/menu`). */
export const readRestaurantMenuWorkflow = createWorkflow(
  "read-restaurant-menu",
  function (input: { restaurant_id: string }) {
    return new WorkflowResponse(readRestaurantMenuStep(input))
  },
)

/**
 * The commerce configuration every dish needs, added where missing: the menu
 * sales channel, a shipping profile, and DKK prices that include tax, so a
 * menu price never gains VAT on top (ADR-0006). Repeating it changes nothing.
 */
export const ensureMenuCommerceSetupWorkflow = createWorkflow(
  "ensure-menu-commerce-setup",
  function () {
    acquireLockStep(SETUP_LOCK)
    const existing = readMenuCommerceSetupStep()
    const createdChannels = when(
      "menu-sales-channel-missing",
      existing,
      ({ sales_channel_id }) => !sales_channel_id,
    ).then(() =>
      createSalesChannelsWorkflow.runAsStep({
        input: {
          salesChannelsData: [
            {
              name: MENU_SALES_CHANNEL_NAME,
              description: "Restaurant dishes, read through the MTOGO menu.",
            },
          ],
        },
      }),
    )
    const createdProfiles = when(
      "menu-shipping-profile-missing",
      existing,
      ({ shipping_profile_id }) => !shipping_profile_id,
    ).then(() =>
      createShippingProfilesWorkflow.runAsStep({
        input: {
          data: [{ name: "Default Shipping Profile", type: "default" }],
        },
      }),
    )
    when(
      "menu-price-preference-missing",
      existing,
      ({ price_preference_id }) => !price_preference_id,
    ).then(() => {
      createPricePreferencesWorkflow.runAsStep({
        input: [
          {
            attribute: "currency_code",
            value: MENU_CURRENCY,
            is_tax_inclusive: true,
          },
        ],
      })
    })
    when(
      "menu-price-preference-excludes-tax",
      existing,
      ({ price_preference_id, is_tax_inclusive }) =>
        !!price_preference_id && !is_tax_inclusive,
    ).then(() => {
      const change = transform({ existing }, ({ existing }) => ({
        selector: { id: [existing.price_preference_id as string] },
        update: { is_tax_inclusive: true },
      }))
      updatePricePreferencesWorkflow.runAsStep({ input: change })
    })
    const setup = transform(
      { existing, createdChannels, createdProfiles },
      ({ existing, createdChannels, createdProfiles }) => ({
        sales_channel_id: (existing.sales_channel_id ??
          createdChannels?.[0].id) as string,
        shipping_profile_id: (existing.shipping_profile_id ??
          createdProfiles?.[0].id) as string,
      }),
    )
    releaseLockStep(SETUP_LOCK)
    return new WorkflowResponse(setup)
  },
)

/**
 * Publishes synthetic categories and dishes in the real menu model, for the
 * demonstration seed and test fixtures until staff publish dishes themselves
 * (#44). Each dish is a published product with one variant and one DKK price,
 * linked to its Restaurant, its category and its bilingual dish content.
 */
export const publishSyntheticMenuWorkflow = createWorkflow(
  "publish-synthetic-menu",
  function (input: { restaurant_id: string; categories: SyntheticCategory[] }) {
    const setup = ensureMenuCommerceSetupWorkflow.runAsStep({
      input: undefined,
    })
    const lock = transform({ input }, ({ input }) =>
      restaurantLock(input.restaurant_id),
    )
    acquireLockStep(lock).config({ name: "acquire-restaurant-lock" })
    const categoryIds = createSyntheticCategoriesStep(input)
    const productInput = transform({ input, setup }, ({ input, setup }) => ({
      products: input.categories.flatMap(({ dishes }) =>
        dishes.map((dish) => ({
          // Admin is English only (ADR-0018), so the native title is the English name.
          title: dish.name.en,
          handle: dish.handle,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: setup.shipping_profile_id,
          sales_channels: [{ id: setup.sales_channel_id }],
          options: [{ title: "Portion", values: ["Regular"] }],
          variants: [
            {
              title: "Regular",
              options: { Portion: "Regular" },
              // Sold out is a manual switch, never a stock quantity.
              manage_inventory: false,
              prices: [{ amount: dish.price, currency_code: MENU_CURRENCY }],
            },
          ],
        })),
      ),
    }))
    const products = createProductsWorkflow.runAsStep({ input: productInput })
    const contentInput = transform(
      { input, categoryIds },
      ({ input, categoryIds }) => ({ ...input, category_ids: categoryIds }),
    )
    const dishIds = createSyntheticDishContentStep(contentInput)
    const links = transform(
      { input, products, dishIds },
      ({ input, products, dishIds }) => {
        return products.flatMap((product, index) => [
          {
            [RESTAURANT_MODULE]: { restaurant_id: input.restaurant_id },
            [Modules.PRODUCT]: { product_id: product.id },
          },
          {
            [Modules.PRODUCT]: { product_id: product.id },
            [RESTAURANT_MODULE]: { menu_dish_id: dishIds[index] },
          },
        ])
      },
    )
    createRemoteLinkStep(links)
    releaseLockStep(lock).config({ name: "release-restaurant-lock" })
    const result = transform(
      { categoryIds, products },
      ({ categoryIds, products }) => ({
        category_ids: categoryIds,
        product_ids: products.map(({ id }) => id),
      }),
    )
    return new WorkflowResponse(result)
  },
)
