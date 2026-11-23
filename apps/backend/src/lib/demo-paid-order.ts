import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import {
  addShippingMethodToCartWorkflow,
  addToCartWorkflow,
  createCartWorkflow,
  createPaymentCollectionForCartWorkflow,
  createPaymentSessionsWorkflow,
  listShippingOptionsForCartWorkflow,
} from "@medusajs/medusa/core-flows"
import { MOCK_PAYMENT_PROVIDER_ID } from "../workflows/carts/basket-rules"
import { ensureMenuCommerceSetupWorkflow } from "../workflows/menu"
import { completeRestaurantCartWorkflow } from "../workflows/orders/complete-restaurant-cart"

export type DemoCustomer = {
  id: string
  email: string
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
}

export type DemoDish = {
  variant_id: string
  revision: number
  price: { amount: number }
}

/**
 * The delivery and billing address of a demo checkout: the Customer's own
 * name and phone where recorded, synthetic values where not.
 */
export function demoAddress(customer: DemoCustomer, postal_code: string) {
  return {
    first_name: customer.first_name || "Demo",
    last_name: customer.last_name || "Kunde",
    address_1: "Demovej 1",
    postal_code,
    city: "København",
    country_code: "dk",
    phone: customer.phone || "+4512345678",
  }
}

/**
 * A Customer's whole paid checkout of one dish, for synthetic demo seeds
 * (#147, #198): the real cart, mock payment and Restaurant completion
 * workflows, so the Order is placed exactly as a storefront checkout places
 * it. `metadata` marks the cart as demo data.
 */
export async function placeDemoPaidOrder(
  container: MedusaContainer,
  input: {
    region_id: string
    customer: DemoCustomer
    dish: DemoDish
    postal_code: string
    metadata: Record<string, unknown>
  },
) {
  const { customer } = input
  const address = demoAddress(customer, input.postal_code)
  // The menu sales channel, which a storefront's publishable key supplies.
  const {
    result: { sales_channel_id },
  } = await ensureMenuCommerceSetupWorkflow(container).run({ input: undefined })
  const { result: cart } = await createCartWorkflow(container).run({
    input: {
      region_id: input.region_id,
      sales_channel_id,
      customer_id: customer.id,
      email: customer.email,
      currency_code: "dkk",
      locale: "da",
      shipping_address: address,
      billing_address: address,
      metadata: {
        ...input.metadata,
        mtogo_checkout_review: {
          version: 1,
          customer_id: customer.id,
          destination: address,
          contact: {
            first_name: address.first_name,
            last_name: address.last_name,
            phone: address.phone,
            email: customer.email,
          },
          order_language: "da",
          reviewed_at: new Date().toISOString(),
        },
      },
    },
  })
  await addToCartWorkflow(container).run({
    input: {
      cart_id: cart.id,
      items: [
        {
          variant_id: input.dish.variant_id,
          quantity: 1,
          metadata: {
            mtogo_dish: {
              revision: input.dish.revision,
              price: input.dish.price.amount,
            },
          },
        },
      ],
    },
  })
  const { result: options } = await listShippingOptionsForCartWorkflow(
    container,
  ).run({ input: { cart_id: cart.id } })
  const delivery = (options as { id: string; name: string }[]).find(
    ({ name }) => name === "MTOGO delivery included",
  )
  if (!delivery)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "The MTOGO delivery option is missing",
    )
  await addShippingMethodToCartWorkflow(container).run({
    input: { cart_id: cart.id, options: [{ id: delivery.id }] },
  })
  await createPaymentCollectionForCartWorkflow(container).run({
    input: { cart_id: cart.id },
  })
  const {
    data: [withCollection],
  } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "cart",
    fields: ["payment_collection.id"],
    filters: { id: cart.id },
  })
  await createPaymentSessionsWorkflow(container).run({
    input: {
      payment_collection_id: withCollection.payment_collection!.id,
      provider_id: MOCK_PAYMENT_PROVIDER_ID,
    },
  })
  const { result: order } = await completeRestaurantCartWorkflow(container).run(
    { input: { cart_id: cart.id } },
  )
  return order as unknown as { id: string; display_id: number }
}
