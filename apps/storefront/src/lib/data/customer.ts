"use server"

import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { HttpTypes } from "@medusajs/types"
import { FetchError } from "@medusajs/js-sdk"
import { httpStatus } from "@dtc/logging"
import { log } from "@lib/logger"
import { getLocale, setLocaleCookie } from "./locale-actions"
import { resolveLocale, resolveCustomerLocale, isLocale } from "@dtc/i18n"
import {
  CustomerAuthCode,
  validateCustomerAddress,
  type CustomerAddressError,
} from "@dtc/i18n"
import { revalidateTag } from "next/cache"
import { redirect } from "next/navigation"
import {
  getAuthHeaders,
  getCacheTag,
  getCartId,
  removeAuthToken,
  removeCartId,
  setAuthToken,
} from "./cookies"

type CustomerAddressForm = {
  first_name: string
  last_name: string
  company: string
  address_1: string
  address_2: string
  city: string
  postal_code: string
  province: string
  country_code: string
  phone: string
  is_default_shipping: boolean
}

type CustomerAddressMutationError =
  | "customer_address_save_failed"
  | "customer_address_delete_failed"
  | "customer_address_default_failed"

const readCustomerAddressForm = (formData: FormData): CustomerAddressForm => ({
  first_name: String(formData.get("first_name") ?? "").trim(),
  last_name: String(formData.get("last_name") ?? "").trim(),
  company: String(formData.get("company") ?? "").trim(),
  address_1: String(formData.get("address_1") ?? "").trim(),
  address_2: String(formData.get("address_2") ?? "").trim(),
  city: String(formData.get("city") ?? "").trim(),
  postal_code: String(formData.get("postal_code") ?? "").trim(),
  province: String(formData.get("province") ?? "").trim(),
  country_code: String(formData.get("country_code") ?? "").trim(),
  phone: String(formData.get("phone") ?? "").trim(),
  is_default_shipping: formData.get("is_default_shipping") === "on",
})

const addressMutationFailure = <T extends CustomerAddressMutationError>(
  error: unknown,
  fallback: T,
): { success: false; error: T } => {
  const status = httpStatus(error)
  log("upstream.request.failed", { status })
  if (status !== undefined && status >= 400 && status < 500) {
    return { success: false as const, error: fallback }
  }
  throw error
}

export type CustomerAuthState =
  | { state: "error"; error: CustomerAuthCode }
  | {
      state: "verification_required"
      email: string
      delivery_failed?: boolean
    }
  | { state: "success" }
  | null

// Requests a verification email for the given customer. The request must be
// authenticated with a token tied to the auth identity (the token returned by
// register or by a login that requires verification).
async function requestVerificationEmail(
  email: string,
  token: string,
  language?: string,
  returnTo?: string,
) {
  const metadata = {
    ...(language ? { preferred_language: language } : {}),
    ...(returnTo?.startsWith("/") && !returnTo.startsWith("//")
      ? { return_to: returnTo }
      : {}),
  }
  await sdk.client.fetch("/auth/customer-verification/request", {
    method: "POST",
    body: {
      entity_id: email,
      metadata: Object.keys(metadata).length ? metadata : undefined,
    },
    headers: {
      authorization: `Bearer ${token}`,
    },
  })
}

export const retrieveCustomer =
  async (): Promise<HttpTypes.StoreCustomer | null> => {
    const authHeaders = await getAuthHeaders()

    if (!("authorization" in authHeaders)) return null

    const headers = {
      ...authHeaders,
    }

    const customer = await sdk.client
      .fetch<{ customer: HttpTypes.StoreCustomer }>(`/store/customers/me`, {
        method: "GET",
        query: {
          fields: "*orders",
        },
        headers,
        cache: "no-store",
      })
      .then(({ customer }) => customer)
      .catch(() => null)

    if (!customer) return null

    const verification = await sdk.client
      .fetch<{ verified: true }>("/store/customers/me/verification", {
        method: "GET",
        headers,
      })
      .then(() => true)
      .catch(() => false)

    return verification ? customer : null
  }

export const updateCustomer = async (body: HttpTypes.StoreUpdateCustomer) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  const updateRes = await sdk.store.customer
    .update(body, {}, headers)
    .then(({ customer }) => customer)
    .catch(medusaError)

  const cacheTag = await getCacheTag("customers")
  revalidateTag(cacheTag, { expire: 0 })

  return updateRes
}

export async function signup(
  _currentState: unknown,
  formData: FormData,
): Promise<CustomerAuthState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  const password = String(formData.get("password") ?? "")
  try {
    const token = await sdk.auth.register("customer", "customer-emailpass", {
      email,
      password,
    })
    await sdk.store.customer.create(
      {
        email,
        metadata: {
          preferred_language: resolveLocale({
            chosen: String(
              formData.get("language") ?? (await getLocale()) ?? "",
            ),
          }),
        },
      },
      {},
      { authorization: `Bearer ${token}` },
    )
  } catch (error) {
    return { state: "error", error: customerAuthCode(error) }
  }
  return completeLogin(email, password, String(formData.get("next") ?? ""))
}

function customerAuthCode(error: unknown): CustomerAuthCode {
  if (error instanceof FetchError) {
    if (error.status === 409) return "customer_identity_exists"
    if (error.status === 403) return "customer_email_verification_required"
    if (error.status === 401 || error.status === 400)
      return "customer_credentials_invalid"
  }
  return "customer_auth_unavailable"
}

export async function login(
  _currentState: unknown,
  formData: FormData,
): Promise<CustomerAuthState> {
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  return completeLogin(email, password, String(formData.get("next") ?? ""))
}

// Logs the customer in and reconciles the customer record. The behavior is
// driven entirely by the backend's login response, so it works whether or not
// email verification is enabled.
async function completeLogin(
  email: string,
  password: string,
  next?: string,
): Promise<CustomerAuthState> {
  let result: Awaited<ReturnType<typeof sdk.auth.login>>

  try {
    result = await sdk.auth.login("customer", "customer-emailpass", {
      email,
      password,
    })
  } catch (error) {
    return { state: "error", error: customerAuthCode(error) }
  }

  // A `location` is returned by third-party auth providers, which this flow
  // doesn't support.
  if (typeof result === "object" && "location" in result) {
    return {
      state: "error",
      error: "customer_auth_unavailable",
    }
  }

  // The backend requires email verification and the customer hasn't verified
  // yet. Send the verification email and ask them to check their inbox.
  if (
    typeof result === "object" &&
    "verification_required" in result &&
    result.verification_required
  ) {
    try {
      await requestVerificationEmail(
        email,
        result.token,
        (await getLocale()) ?? undefined,
        next,
      )
      return { state: "verification_required", email }
    } catch {
      return {
        state: "verification_required",
        email,
        delivery_failed: true,
      }
    }
  }

  if (typeof result !== "string") {
    return {
      state: "error",
      error: "customer_auth_unavailable",
    }
  }

  let token = result

  // The token may not be tied to a customer record yet — right after
  // registration, or after verifying a brand-new account. Ask the backend:
  // `/store/customers/me` rejects tokens without a registered actor, so a
  // failed retrieve means we still need to create the customer, then log in
  // again to obtain a customer-bound token.
  const customerExists = await sdk.store.customer
    .retrieve({}, { authorization: `Bearer ${token}` })
    .then(() => true)
    .catch(() => false)

  if (!customerExists) {
    try {
      await sdk.store.customer.create(
        {
          email,
          metadata: {
            preferred_language: resolveLocale({
              chosen: (await getLocale()) ?? undefined,
            }),
          },
        },
        {},
        { authorization: `Bearer ${token}` },
      )

      const refreshed = await sdk.auth.login("customer", "customer-emailpass", {
        email,
        password,
      })
      if (typeof refreshed !== "string")
        return { state: "error", error: "customer_auth_unavailable" }
      token = refreshed
    } catch (error) {
      return { state: "error", error: customerAuthCode(error) }
    }
  }

  try {
    const { customer } = await sdk.store.customer.retrieve(
      {},
      { authorization: `Bearer ${token}` },
    )
    const saved = customer.metadata?.preferred_language
    const locale = resolveCustomerLocale(saved, await getLocale())
    if (!isLocale(saved))
      await sdk.store.customer.update(
        { metadata: { preferred_language: locale } },
        {},
        { authorization: `Bearer ${token}` },
      )
    await setLocaleCookie(locale)
  } catch {
    return { state: "error", error: "customer_auth_unavailable" }
  }

  await setAuthToken(token)

  const customerCacheTag = await getCacheTag("customers")
  revalidateTag(customerCacheTag, { expire: 0 })

  try {
    await transferCart()
  } catch {
    return { state: "error", error: "customer_cart_transfer_failed" }
  }

  if (next?.startsWith("/") && !next.startsWith("//")) redirect(next)

  return { state: "success" }
}

// Confirms a customer's email using the token from the verification link.
//
// The confirm route doesn't require authentication, so this works even when the
// customer opens the link on a different device than the one they signed up on.
export async function confirmEmailVerification(
  token: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await sdk.auth.verification.confirm({ code: token })
    return { success: true }
  } catch (error) {
    return { success: false, error: customerAuthCode(error) }
  }
}

export async function signout(countryCode: string) {
  await sdk.auth.logout()

  await removeAuthToken()

  const customerCacheTag = await getCacheTag("customers")
  revalidateTag(customerCacheTag, { expire: 0 })

  await removeCartId()

  const cartCacheTag = await getCacheTag("carts")
  revalidateTag(cartCacheTag, { expire: 0 })

  redirect(`/${countryCode}/account`)
}

export async function transferCart() {
  const cartId = await getCartId()

  if (!cartId) {
    return
  }

  const headers = await getAuthHeaders()

  await sdk.store.cart.transferCart(cartId, {}, headers)

  const cartCacheTag = await getCacheTag("carts")
  revalidateTag(cartCacheTag, { expire: 0 })
}

export const addCustomerAddress = async (
  _currentState: Record<string, unknown>,
  formData: FormData,
): Promise<{
  success: boolean
  error: CustomerAddressError | "customer_address_save_failed" | null
}> => {
  const address = readCustomerAddressForm(formData)

  const validationError = validateCustomerAddress(address)
  if (validationError) return { success: false, error: validationError }

  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.store.customer
    .createAddress(address, {}, headers)
    .then(async () => {
      const customerCacheTag = await getCacheTag("customers")
      revalidateTag(customerCacheTag, { expire: 0 })
      return { success: true, error: null }
    })
    .catch((err) => {
      return addressMutationFailure(err, "customer_address_save_failed")
    })
}

export const deleteCustomerAddress = async (
  addressId: string,
): Promise<{ success: boolean; error: string | null }> => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.store.customer
    .deleteAddress(addressId, headers)
    .then(async () => {
      const customerCacheTag = await getCacheTag("customers")
      revalidateTag(customerCacheTag, { expire: 0 })
      return { success: true, error: null }
    })
    .catch((err) => {
      return addressMutationFailure(err, "customer_address_delete_failed")
    })
}

export const updateCustomerAddressDefault = async (
  addressId: string,
  isDefaultShipping: boolean,
): Promise<{ success: boolean; error: string | null }> => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.store.customer
    .updateAddress(
      addressId,
      { is_default_shipping: isDefaultShipping },
      {},
      headers,
    )
    .then(async () => {
      revalidateTag(await getCacheTag("customers"), { expire: 0 })
      return { success: true, error: null }
    })
    .catch((err) => {
      return addressMutationFailure(err, "customer_address_default_failed")
    })
}

export const updateCustomerAddress = async (
  currentState: Record<string, unknown>,
  formData: FormData,
): Promise<{
  success: boolean
  error: CustomerAddressError | "customer_address_save_failed" | null
}> => {
  const addressId =
    (currentState.addressId as string) || (formData.get("addressId") as string)

  if (!addressId) {
    return { success: false, error: "customer_address_save_failed" }
  }

  const addressFields = readCustomerAddressForm(formData)

  const validationError = validateCustomerAddress(addressFields)
  if (validationError) return { success: false, error: validationError }

  const address = addressFields as HttpTypes.StoreUpdateCustomerAddress

  const phone = String(formData.get("phone") ?? "").trim()

  address.phone = phone

  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.store.customer
    .updateAddress(addressId, address, {}, headers)
    .then(async () => {
      const customerCacheTag = await getCacheTag("customers")
      revalidateTag(customerCacheTag, { expire: 0 })
      return { success: true, error: null }
    })
    .catch((err) => {
      return addressMutationFailure(err, "customer_address_save_failed")
    })
}
