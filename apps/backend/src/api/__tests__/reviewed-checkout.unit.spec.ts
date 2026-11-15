import { asValue } from "@medusajs/framework/awilix"
import {
  Modules,
  MedusaError,
  createMedusaContainer,
} from "@medusajs/framework/utils"
import { requireReviewedCheckout } from "../reviewed-checkout"

const res = {} as never

const address = {
  first_name: "Ada",
  last_name: "Lovelace",
  company: "",
  address_1: "Testvej 12",
  address_2: "",
  postal_code: "2200",
  city: "København N",
  province: "",
  country_code: "dk",
  phone: "+45 12 34 56 78",
}

function createReview(customerId = "cus_123") {
  return {
    version: 1 as const,
    customer_id: customerId,
    destination: { ...address },
    contact: {
      first_name: "Ada",
      last_name: "Lovelace",
      phone: address.phone,
      email: "ada@example.com",
    },
    order_language: "da" as const,
    reviewed_at: "2026-11-15T12:00:00.000Z",
  }
}

function request(review = createReview(), cartOverrides = {}) {
  const scope = createMedusaContainer()
  scope.register(
    Modules.CART,
    asValue({
      retrieveCart: jest.fn().mockResolvedValue({
        id: "cart_test",
        customer_id: "cus_123",
        email: "ada@example.com",
        shipping_address: address,
        metadata: { mtogo_checkout_review: review },
        ...cartOverrides,
      }),
    }),
  )

  return {
    params: { id: "cart_test" },
    scope,
    auth_context: { actor_type: "customer", actor_id: "cus_123" },
  } as never
}

it.each([
  {
    name: "accepts matching reviewed facts",
    request: request(),
    allowed: true,
  },
  {
    name: "rejects missing review metadata",
    request: request(undefined as never, { metadata: {} }),
    allowed: false,
  },
  {
    name: "rejects changed shipping facts",
    request: request(undefined as never, {
      shipping_address: { ...address, city: "Aarhus" },
    }),
    allowed: false,
  },
  {
    name: "accepts omitted empty optional address fields",
    request: request(undefined as never, {
      shipping_address: {
        ...address,
        company: undefined,
        address_2: undefined,
        province: undefined,
      },
    }),
    allowed: true,
  },
  {
    name: "rejects a review owned by another Customer",
    request: request(createReview("cus_other")),
    allowed: false,
  },
])("$name", async ({ request: req, allowed }) => {
  const next = jest.fn()
  const result = requireReviewedCheckout(req, res, next)

  if (allowed) {
    await result
    expect(next).toHaveBeenCalledTimes(1)
    return
  }

  await expect(result).rejects.toMatchObject({
    type: MedusaError.Types.NOT_ALLOWED,
    message: "checkout_review_incomplete",
  })
})
