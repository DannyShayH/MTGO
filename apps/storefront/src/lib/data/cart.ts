"use server"

import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { refusalOf, type CartRefusal } from "./cart-refusal"
import { HttpTypes } from "@medusajs/types"
import { revalidateTag } from "next/cache"
import { redirect } from "next/navigation"
import {
  getAuthHeaders,
  getCacheOptions,
  getCacheTag,
  getCartId,
  removeCartId,
  setCartId,
} from "./cookies"
import { listCartShippingMethods } from "./fulfillment"
import { getRegion } from "./regions"
import { explainBasketReview } from "./basket-review"
import { getLocale } from "./locale-actions"
import { retrieveCustomer } from "./current-customer"
import {
  CHECKOUT_REVIEW_METADATA_KEY,
  createReviewedCheckout,
  isLocale,
  reviewedCheckoutIsComplete,
  validateCustomerAddress,
  type ReviewedCheckoutAddress,
} from "@dtc/i18n"

/**
 * Retrieves a cart by its ID. If no ID is provided, it will use the cart ID from the cookies.
 * @param cartId - optional - The ID of the cart to retrieve.
 * @returns The cart object if found, or null if not found.
 */
export async function retrieveCart(
  cartId?: string,
  fields?: string,
  options?: { fresh?: boolean },
) {
  const id = cartId || (await getCartId())
  fields ??=
    "*items, *region, *items.product, *items.variant, *items.thumbnail, *items.metadata, +items.total, *promotions, +shipping_methods.name"

  if (!id) {
    return null
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = options?.fresh ? undefined : await getCacheOptions("carts")

  return await sdk.client
    .fetch<HttpTypes.StoreCartResponse>(`/store/carts/${id}`, {
      method: "GET",
      query: {
        fields,
      },
      headers,
      ...(next ? { next } : { cache: "no-store" }),
    })
    .then(({ cart }: { cart: HttpTypes.StoreCart }) => cart)
    .catch(() => null)
}

export async function getOrSetCart(countryCode: string) {
  const region = await getRegion(countryCode)

  if (!region) {
    throw new Error(`Region not found for country code: ${countryCode}`)
  }

  let cart = await retrieveCart(undefined, "id,region_id")

  const headers = {
    ...(await getAuthHeaders()),
  }

  if (!cart) {
    const locale = await getLocale()
    const cartResp = await sdk.store.cart.create(
      { region_id: region.id, locale: locale || undefined },
      {},
      headers,
    )
    cart = cartResp.cart

    await setCartId(cart.id)

    const cartCacheTag = await getCacheTag("carts")
    revalidateTag(cartCacheTag, { expire: 0 })
  }

  if (cart && cart?.region_id !== region.id) {
    await sdk.store.cart.update(cart.id, { region_id: region.id }, {}, headers)
    const cartCacheTag = await getCacheTag("carts")
    revalidateTag(cartCacheTag, { expire: 0 })
  }

  return cart
}

export async function updateCart(data: HttpTypes.StoreUpdateCart) {
  const cartId = await getCartId()

  if (!cartId) {
    throw new Error("No existing cart found, please create one before updating")
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.store.cart
    .update(cartId, data, {}, headers)
    .then(async ({ cart }: { cart: HttpTypes.StoreCart }) => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag, { expire: 0 })

      const fulfillmentCacheTag = await getCacheTag("fulfillment")
      revalidateTag(fulfillmentCacheTag, { expire: 0 })

      return cart
    })
    .catch(medusaError)
}

export async function addToCart({
  variantId,
  quantity,
  countryCode,
}: {
  variantId: string
  quantity: number
  countryCode: string
}) {
  if (!variantId) {
    throw new Error("Missing variant ID when adding to cart")
  }

  const cart = await getOrSetCart(countryCode)

  if (!cart) {
    throw new Error("Error retrieving or creating cart")
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  await sdk.store.cart
    .createLineItem(
      cart.id,
      {
        variant_id: variantId,
        quantity,
      },
      {},
      headers,
    )
    .then(async () => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag, { expire: 0 })

      const fulfillmentCacheTag = await getCacheTag("fulfillment")
      revalidateTag(fulfillmentCacheTag, { expire: 0 })
    })
    .catch(medusaError)
}

/** Expires the cached basket after a change to its lines. */
async function expireBasket() {
  revalidateTag(await getCacheTag("carts"), { expire: 0 })
}

/**
 * Sets a basket line's quantity. A refusal is returned, not thrown, so the
 * stepper can explain it in a production build too (#252).
 */
export async function updateLineItem({
  lineId,
  quantity,
}: {
  lineId: string
  quantity: number
}): Promise<CartRefusal | undefined> {
  const cartId = await getCartId()
  if (!lineId || !cartId) return { error: { code: "order_not_placed" } }

  try {
    await sdk.store.cart.updateLineItem(
      cartId,
      lineId,
      { quantity },
      {},
      await getAuthHeaders(),
    )
  } catch (error) {
    return refusalOf(error, "order_not_placed")
  }
  await expireBasket()
}

/**
 * Removes a basket line. Delivery is always included at one price, so the
 * shipping options need no expiry here; only the cart does (#252). A refusal
 * is returned, not thrown.
 */
export async function deleteLineItem(
  lineId: string,
): Promise<CartRefusal | undefined> {
  const cartId = await getCartId()
  if (!lineId || !cartId) return { error: { code: "line_not_removed" } }

  try {
    await sdk.store.cart.deleteLineItem(
      cartId,
      lineId,
      {},
      await getAuthHeaders(),
    )
  } catch (error) {
    return refusalOf(error, "line_not_removed")
  }
  await expireBasket()
}

export async function setShippingMethod({
  cartId,
  shippingMethodId,
}: {
  cartId: string
  shippingMethodId: string
}) {
  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.store.cart
    .addShippingMethod(cartId, { option_id: shippingMethodId }, {}, headers)
    .then(async () => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag, { expire: 0 })
    })
    .catch(medusaError)
}

/**
 * Starts the payment for the cart's current total. A refusal is returned, not
 * thrown, so the payment step can explain it in a production build (#252).
 */
export async function initiatePaymentSession(
  cart: HttpTypes.StoreCart,
  data: HttpTypes.StoreInitializePaymentSession,
): Promise<CartRefusal | undefined> {
  try {
    await sdk.store.payment.initiatePaymentSession(
      cart,
      data,
      {},
      await getAuthHeaders(),
    )
  } catch (error) {
    return refusalOf(error, "order_not_placed")
  }
  await expireBasket()
}

export async function applyPromotions(codes: string[]) {
  const cartId = await getCartId()

  if (!cartId) {
    throw new Error("No existing cart found")
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.store.cart
    .update(cartId, { promo_codes: codes }, {}, headers)
    .then(async () => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag, { expire: 0 })

      const fulfillmentCacheTag = await getCacheTag("fulfillment")
      revalidateTag(fulfillmentCacheTag, { expire: 0 })
    })
    .catch(medusaError)
}

export async function submitPromotionForm(
  currentState: unknown,
  formData: FormData,
) {
  const code = formData.get("code") as string
  try {
    await applyPromotions([code])
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

// TODO: Pass a POJO instead of a form entity here
export async function setAddresses(currentState: unknown, formData: FormData) {
  let nextStep = "delivery"
  try {
    if (!formData) {
      throw new Error("No form data found when setting addresses")
    }
    const cartId = await getCartId()
    if (!cartId) {
      throw new Error("No existing cart found when setting addresses")
    }

    // The form only holds text inputs, so every entry is a string
    const field = (name: string) => String(formData.get(name) ?? "").trim()

    const customer = await retrieveCustomer()
    if (!customer) throw new Error("checkout_customer_required")

    const orderLanguage = field("order_language")
    if (!isLocale(orderLanguage)) throw new Error("customer_language_invalid")

    const data: HttpTypes.StoreUpdateCart = {
      shipping_address: {
        first_name: field("shipping_address.first_name"),
        last_name: field("shipping_address.last_name"),
        address_1: field("shipping_address.address_1"),
        address_2: field("shipping_address.address_2"),
        company: field("shipping_address.company"),
        postal_code: field("shipping_address.postal_code"),
        city: field("shipping_address.city"),
        country_code: field("shipping_address.country_code"),
        province: field("shipping_address.province"),
        phone: field("shipping_address.phone"),
      },
      email: field("email"),
    }

    const address = data.shipping_address as ReviewedCheckoutAddress
    const addressError = validateCustomerAddress(address)
    if (addressError) throw new Error(addressError)

    const cart = await retrieveCart(cartId)
    if (!cart || cart.customer_id !== customer.id) {
      throw new Error("checkout_cart_not_owned")
    }

    const review = createReviewedCheckout(
      {
        customer_id: customer.id,
        destination: address,
        contact: {
          first_name: address.first_name,
          last_name: address.last_name,
          phone: address.phone,
          email: field("email"),
        },
        order_language: orderLanguage,
      },
      new Date().toISOString(),
    )
    if (!reviewedCheckoutIsComplete(review)) {
      throw new Error("checkout_review_incomplete")
    }

    const sameAsBilling = formData.get("same_as_billing")
    if (sameAsBilling === "on") data.billing_address = data.shipping_address

    if (sameAsBilling !== "on")
      data.billing_address = {
        first_name: field("billing_address.first_name"),
        last_name: field("billing_address.last_name"),
        address_1: field("billing_address.address_1"),
        address_2: "",
        company: field("billing_address.company"),
        postal_code: field("billing_address.postal_code"),
        city: field("billing_address.city"),
        country_code: field("billing_address.country_code"),
        province: field("billing_address.province"),
        phone: field("billing_address.phone"),
      }
    await updateCart({
      ...data,
      locale: orderLanguage,
      metadata: {
        ...(cart.metadata ?? {}),
        [CHECKOUT_REVIEW_METADATA_KEY]: review,
      },
    })
    const methods = await listCartShippingMethods(cartId)
    const included = methods?.find(
      (method) =>
        method.name === "MTOGO delivery included" && method.amount === 0,
    )
    if (included) {
      try {
        await setShippingMethod({ cartId, shippingMethodId: included.id })
      } catch {
        return "checkout_delivery_failed"
      }
      nextStep = "payment"
    }
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }

  redirect(
    `/${formData.get("shipping_address.country_code")}/checkout?step=${nextStep}`,
  )
}

/**
 * Places the Order for the cart (by default the cookie's) and goes to its
 * confirmation. A refusal is returned, not thrown, because a production build
 * replaces a thrown server-action message with "Minified React error #441"
 * (#252). A basket review carries the explanation naming the changed dishes.
 */
export async function placeOrder(
  cartId?: string,
): Promise<CartRefusal | undefined> {
  const id = cartId || (await getCartId())
  if (!id) return { error: { code: "order_not_placed" } }

  let completion: HttpTypes.StoreCompleteCartResponse
  try {
    completion = await sdk.store.cart.complete(id, {}, await getAuthHeaders())
  } catch (error) {
    const refusal = refusalOf(error, "order_not_placed")
    // A basket review names the changed dishes in the Customer's language.
    if (refusal.error.code === "basket_review_required")
      refusal.error.detail = await explainBasketReview(id)
    return refusal
  }
  await expireBasket()
  if (completion.type !== "order")
    return { error: { code: "order_not_placed" } }

  revalidateTag(await getCacheTag("orders"), { expire: 0 })
  await removeCartId()
  const countryCode =
    completion.order.shipping_address?.country_code?.toLowerCase()
  redirect(`/${countryCode}/order/${completion.order.id}/confirmed`)
}

/**
 * Updates the countrycode param and revalidates the regions cache
 * @param regionId
 * @param countryCode
 */
export async function updateRegion(countryCode: string, currentPath: string) {
  const cartId = await getCartId()
  const region = await getRegion(countryCode)

  if (!region) {
    throw new Error(`Region not found for country code: ${countryCode}`)
  }

  if (cartId) {
    await updateCart({ region_id: region.id })
    const cartCacheTag = await getCacheTag("carts")
    revalidateTag(cartCacheTag, { expire: 0 })
  }

  const regionCacheTag = await getCacheTag("regions")
  revalidateTag(regionCacheTag, { expire: 0 })

  const productsCacheTag = await getCacheTag("products")
  revalidateTag(productsCacheTag, { expire: 0 })

  redirect(`/${countryCode}${currentPath}`)
}

export async function listCartOptions() {
  const cartId = await getCartId()
  const headers = {
    ...(await getAuthHeaders()),
  }
  const next = {
    ...(await getCacheOptions("shippingOptions")),
  }

  return await sdk.client.fetch<{
    shipping_options: HttpTypes.StoreCartShippingOption[]
  }>("/store/shipping-options", {
    query: { cart_id: cartId },
    next,
    headers,
    cache: "force-cache",
  })
}
