import {
  BasketAmount,
  decideBasketAddition,
  parseDishSnapshot,
  reviewBasket,
  reviewBasketAmount,
} from "../basket-rules"

const open = {
  is_active: true,
  is_open: true,
  delivery_postal_codes: ["2200"],
}
const dish = {
  id: "prod_1",
  variant_id: "variant_1",
  revision: 2,
  price: 95.5,
  is_sold_out: false,
}
const line = {
  variant_id: "variant_1",
  quantity: 1,
  snapshot: { revision: 2, price: 95.5 },
}
const plain: BasketAmount = {
  currency_code: "dkk",
  total: 191,
  discount_total: 0,
  shipping_total: 0,
  promotion_count: 0,
  credit_line_count: 0,
  payment: { amount: 191, currency_code: "dkk" },
}

describe("decideBasketAddition", () => {
  it.each([
    { basket: [], incoming: "rest_a", expected: "ok", why: "empty basket" },
    {
      basket: ["rest_a", "rest_a"],
      incoming: "rest_a",
      expected: "ok",
      why: "same Restaurant",
    },
    {
      basket: ["rest_a"],
      incoming: "rest_b",
      expected: "other_restaurant",
      why: "another Restaurant",
    },
    {
      basket: [],
      incoming: null,
      expected: "not_a_dish",
      why: "no Restaurant",
    },
  ])("returns $expected for $why", ({ basket, incoming, expected }) => {
    expect(decideBasketAddition(basket, incoming)).toBe(expected)
  })
})

describe("parseDishSnapshot", () => {
  it.each([
    { value: { revision: 0, price: 10 }, expected: { revision: 0, price: 10 } },
    { value: { revision: "1", price: 10 }, expected: null },
    { value: { revision: 1, price: Number.NaN }, expected: null },
    { value: undefined, expected: null },
  ])("parses $value as $expected", ({ value, expected }) => {
    expect(parseDishSnapshot(value)).toEqual(expected)
  })
})

describe("reviewBasket", () => {
  it("finds nothing when the basket matches the menu", () => {
    expect(reviewBasket([line], [dish], open, "2200")).toEqual([])
  })

  it.each([
    {
      why: "a new revision",
      current: { ...dish, revision: 3 },
      snapshot: line.snapshot,
    },
    {
      why: "a lower price",
      current: { ...dish, price: 90 },
      snapshot: line.snapshot,
    },
    {
      why: "a higher price",
      current: { ...dish, price: 99 },
      snapshot: line.snapshot,
    },
    { why: "no recorded snapshot", current: dish, snapshot: null },
  ])(
    "asks for review with the current facts after $why",
    ({ current, snapshot }) => {
      expect(reviewBasket([{ ...line, snapshot }], [current], open)).toEqual([
        {
          code: "dish_changed",
          variant_id: "variant_1",
          revision: current.revision,
          price: current.price,
        },
      ])
    },
  )

  it.each([
    { why: "removed", menu: [], code: "dish_unavailable" },
    {
      why: "sold out",
      menu: [{ ...dish, is_sold_out: true }],
      code: "dish_sold_out",
    },
  ])("reports a $why dish", ({ menu, code }) => {
    expect(reviewBasket([line], menu, open)).toEqual([
      { code, variant_id: "variant_1" },
    ])
  })

  it.each([
    {
      why: "an inactive Restaurant",
      restaurant: { ...open, is_active: false },
      destination: undefined,
      reason: "restaurant_inactive",
    },
    {
      why: "a closed Restaurant",
      restaurant: { ...open, is_open: false },
      destination: undefined,
      reason: "restaurant_closed",
    },
    {
      why: "an unserved destination",
      restaurant: open,
      destination: "8000",
      reason: "destination_not_served",
    },
  ])("reports $why", ({ restaurant, destination, reason }) => {
    expect(reviewBasket([line], [dish], restaurant, destination)).toEqual([
      { code: "restaurant_not_receiving_orders", reason },
    ])
  })
})

describe("reviewBasketAmount", () => {
  it("accepts the plain DKK menu total, with or without a started payment", () => {
    expect(reviewBasketAmount(plain)).toEqual([])
    expect(reviewBasketAmount({ ...plain, payment: null })).toEqual([])
    expect(
      reviewBasketAmount({ ...plain, total: "191.00", discount_total: null }),
    ).toEqual([])
  })

  it("requires one exact mock payment session before completion", () => {
    const session = {
      amount: 191,
      currency_code: "dkk",
      provider_id: "pp_system_default",
      status: "pending",
    }
    expect(
      reviewBasketAmount({
        ...plain,
        require_payment: true,
        payment: { ...plain.payment!, sessions: [session] },
      }),
    ).toEqual([])
    expect(reviewBasketAmount({ ...plain, require_payment: true })).toEqual([
      { code: "amount_not_allowed", reason: "payment_session_missing" },
    ])
    expect(
      reviewBasketAmount({
        ...plain,
        require_payment: true,
        payment: { ...plain.payment!, sessions: [{ ...session, amount: 190 }] },
      }),
    ).toEqual([
      { code: "amount_not_allowed", reason: "payment_amount_mismatch" },
    ])
    expect(
      reviewBasketAmount({
        ...plain,
        require_payment: true,
        payment: {
          ...plain.payment!,
          sessions: [{ ...session, status: "canceled" }],
        },
      }),
    ).toEqual([
      { code: "amount_not_allowed", reason: "payment_session_unusable" },
    ])
  })

  it.each([
    {
      why: "a EUR cart",
      change: { currency_code: "eur" },
      reason: "currency_not_dkk",
    },
    {
      why: "a promotion",
      change: { promotion_count: 1 },
      reason: "adjustment_not_allowed",
    },
    {
      why: "a discount",
      change: { discount_total: 10 },
      reason: "adjustment_not_allowed",
    },
    {
      why: "a gift card or other credit",
      change: { credit_line_count: 1 },
      reason: "adjustment_not_allowed",
    },
    {
      why: "a delivery charge",
      change: { shipping_total: 29 },
      reason: "delivery_charge_not_allowed",
    },
    {
      why: "a payment for another amount",
      change: { payment: { amount: 190.99, currency_code: "dkk" } },
      reason: "payment_amount_mismatch",
    },
    {
      why: "a payment in another currency",
      change: { payment: { amount: 191, currency_code: "eur" } },
      reason: "payment_amount_mismatch",
    },
  ])("refuses $why", ({ change, reason }) => {
    expect(reviewBasketAmount({ ...plain, ...change })).toEqual([
      { code: "amount_not_allowed", reason },
    ])
  })
})
