import assert from "node:assert/strict"
import test from "node:test"
import {
  createReviewedCheckout,
  isReviewedCheckout,
  reviewedCheckoutIsComplete,
  reviewedCheckoutMatchesCart,
} from "../checkout.ts"

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

test("creates a complete reviewed checkout copy", () => {
  const review = createReviewedCheckout(
    {
      customer_id: "cus_123",
      destination: address,
      contact: {
        first_name: "Ada",
        last_name: "Lovelace",
        phone: "+45 12 34 56 78",
        email: "ada@example.com",
      },
      order_language: "da",
    },
    "2026-11-15T12:00:00.000Z",
  )

  assert.equal(review.version, 1)
  assert.equal(review.destination.address_1, "Testvej 12")
  assert.equal(review.order_language, "da")
  assert.equal(reviewedCheckoutIsComplete(review), true)

  address.address_1 = "Changedvej 99"
  assert.equal(review.destination.address_1, "Testvej 12")
  assert.equal(isReviewedCheckout(review), true)
  assert.equal(
    reviewedCheckoutMatchesCart(review, {
      customer_id: "cus_123",
      email: "ada@example.com",
      shipping_address: review.destination,
    }),
    true,
  )
})

const incompleteReviewCases = [
  {
    name: "missing destination phone",
    input: { destination: { ...address, phone: "" } },
    reason: "EP invalid required string",
  },
  {
    name: "missing contact phone",
    input: {
      contact: {
        first_name: "Ada",
        last_name: "Lovelace",
        phone: "",
        email: "ada@example.com",
      },
    },
    reason: "EP invalid required string",
  },
  {
    name: "missing contact email",
    input: {
      contact: {
        first_name: "Ada",
        last_name: "Lovelace",
        phone: "+45 12 34 56 78",
        email: "",
      },
    },
    reason: "EP invalid required string",
  },
  {
    name: "missing customer ownership",
    input: { customer_id: "" },
    reason: "EP invalid ownership identifier",
  },
] as const

for (const { name, input, reason } of incompleteReviewCases) {
  test(`rejects ${name} (${reason})`, () => {
    const review = createReviewedCheckout(
      {
        customer_id: input.customer_id ?? "cus_123",
        destination: input.destination ?? address,
        contact: input.contact ?? {
          first_name: "Ada",
          last_name: "Lovelace",
          phone: "+45 12 34 56 78",
          email: "ada@example.com",
        },
        order_language: "en",
      },
      "2026-11-15T12:00:00.000Z",
    )

    assert.equal(reviewedCheckoutIsComplete(review), false)
  })
}

test("rejects a review whose facts no longer match the cart", () => {
  const review = createReviewedCheckout(
    {
      customer_id: "cus_123",
      destination: address,
      contact: {
        first_name: "Ada",
        last_name: "Lovelace",
        phone: "+45 12 34 56 78",
        email: "ada@example.com",
      },
      order_language: "en",
    },
    "2026-11-15T12:00:00.000Z",
  )

  assert.equal(
    reviewedCheckoutMatchesCart(review, {
      customer_id: "cus_123",
      email: "ada@example.com",
      shipping_address: { ...address, city: "Aarhus" },
    }),
    false,
  )
})

test("matches a cart that omits empty optional address fields", () => {
  const review = createReviewedCheckout(
    {
      customer_id: "cus_123",
      destination: address,
      contact: {
        first_name: "Ada",
        last_name: "Lovelace",
        phone: "+45 12 34 56 78",
        email: "ada@example.com",
      },
      order_language: "en",
    },
    "2026-11-15T12:00:00.000Z",
  )
  const cartAddress = {
    ...address,
    address_2: undefined,
    company: undefined,
    province: undefined,
  } as unknown as typeof address

  assert.equal(
    reviewedCheckoutMatchesCart(review, {
      customer_id: "cus_123",
      email: "ada@example.com",
      shipping_address: cartAddress,
    }),
    true,
  )
})
