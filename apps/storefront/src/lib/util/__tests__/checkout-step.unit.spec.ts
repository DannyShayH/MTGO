import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  hasDeliveryAddress,
  openCheckoutStep,
  reachedCheckoutStep,
  type CheckoutCart,
} from "../checkout-step.ts"

/** A new cart: Medusa gives it an address holding only the country. */
const fresh: CheckoutCart = {
  email: "test@test.dk",
  shipping_address: { address_1: null, country_code: "dk" },
  shipping_methods: [],
  payment_collection: null,
}
const addressed: CheckoutCart = {
  ...fresh,
  shipping_address: { address_1: "Rømersgade 9", country_code: "dk" },
}
const delivered: CheckoutCart = {
  ...addressed,
  shipping_methods: [{ id: "sm_1" }],
}
const paid: CheckoutCart = {
  ...delivered,
  payment_collection: { payment_sessions: [{ id: "ps_1" }] },
}

describe("which checkout step the cart has reached", () => {
  it("EP: an address with only the country is not a delivery address", () => {
    assert.equal(hasDeliveryAddress(fresh), false)
    assert.equal(reachedCheckoutStep(fresh), "address")
  })

  it("EP: an address without the Customer's email is not finished", () => {
    assert.equal(reachedCheckoutStep({ ...addressed, email: null }), "address")
  })

  it("EP: each finished step opens the next", () => {
    assert.equal(reachedCheckoutStep(addressed), "delivery")
    assert.equal(reachedCheckoutStep(delivered), "payment")
    assert.equal(reachedCheckoutStep(paid), "review")
  })
})

describe("which checkout step is open", () => {
  it("EP: without a step in the address the cart's step opens, so a step is always open", () => {
    assert.equal(openCheckoutStep(null, delivered), "payment")
  })

  it("EP: an unknown step opens the cart's step", () => {
    assert.equal(openCheckoutStep("shipping", delivered), "payment")
  })

  it("EP: an earlier step can be opened again to edit it", () => {
    assert.equal(openCheckoutStep("address", paid), "address")
    assert.equal(openCheckoutStep("delivery", paid), "delivery")
  })

  it("BVA: a step the cart has not reached opens the cart's step instead", () => {
    assert.equal(openCheckoutStep("delivery", fresh), "address")
    assert.equal(openCheckoutStep("review", delivered), "payment")
    assert.equal(openCheckoutStep("payment", delivered), "payment")
  })
})
