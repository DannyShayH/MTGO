import {
  captureFinancialBasis,
  financialBasisView,
  type PlacedOrder,
  type PlacementAgreement,
} from "../financial-basis"

const agreement = {
  id: "cta_1",
  terms_version: "common_mvp_v1",
  agreed_at: new Date("2026-11-01T09:00:00.000Z"),
}
const order = {
  version: 1,
  currency_code: "dkk",
  items: [
    {
      id: "ordli_1",
      variant_id: "variant_1",
      raw_unit_price: { value: "50.31" },
      is_tax_inclusive: true,
      quantity: { value: "1" },
    },
  ],
}
const placement = {
  restaurant_id: "res_1",
  placed_at: new Date("2026-11-24T18:30:00.000Z"),
}

describe("The purchased financial basis of a paid Order (#226)", () => {
  it("reproduces the exact food value excluding VAT from the purchased lines (spec #52 §5)", () => {
    const stored = captureFinancialBasis(order, agreement)

    expect(financialBasisView(stored, placement)).toMatchObject({
      status: "preserved",
      food_value_including_vat: "50.31",
      // Exact, not yet rounded: rounding belongs to a recognized amount.
      food_value_excluding_vat: "40.248",
    })
  })

  it("sums every line's unit price times quantity without float error", () => {
    const stored = captureFinancialBasis(
      {
        ...order,
        items: [
          {
            id: "ordli_1",
            variant_id: "variant_1",
            raw_unit_price: { value: "0.1" },
            is_tax_inclusive: true,
            quantity: { value: "3" },
          },
          {
            id: "ordli_2",
            variant_id: "variant_2",
            raw_unit_price: "95",
            is_tax_inclusive: true,
            quantity: 2,
          },
        ],
      },
      agreement,
    )

    expect(financialBasisView(stored, placement)).toMatchObject({
      food_value_including_vat: "190.3",
      food_value_excluding_vat: "152.24",
      lines: [
        {
          line_item_id: "ordli_1",
          quantity: "3",
          unit_price_including_vat: "0.1",
          total_including_vat: "0.3",
        },
        {
          line_item_id: "ordli_2",
          quantity: "2",
          unit_price_including_vat: "95",
          total_including_vat: "190",
        },
      ],
    })
  })

  it("preserves Restaurant, placement time, currency, Order version and the agreed terms with their VAT and commission inputs", () => {
    const stored = captureFinancialBasis(order, agreement)

    expect(financialBasisView(stored, placement)).toEqual(
      expect.objectContaining({
        restaurant_id: "res_1",
        placed_at: "2026-11-24T18:30:00.000Z",
        currency_code: "dkk",
        order_version: 1,
        terms: {
          terms_version: "common_mvp_v1",
          agreement_id: "cta_1",
          agreed_at: "2026-11-01T09:00:00.000Z",
          prices_include_vat: true,
          vat_rate: "0.25",
          commission_tiers: [
            { from_amount: "0", to_amount: "100", rate_percent: "6" },
            { from_amount: "100", to_amount: "500", rate_percent: "5" },
            { from_amount: "500", to_amount: "1000", rate_percent: "4" },
            { from_amount: "1000", to_amount: null, rate_percent: "3" },
          ],
          monthly_service_fee: { amount: "100", currency_code: "dkk" },
        },
      }),
    )
  })

  it("survives a round trip through the JSON column unchanged", () => {
    const stored = captureFinancialBasis(order, agreement)

    expect(
      financialBasisView(JSON.parse(JSON.stringify(stored)), placement),
    ).toEqual(financialBasisView(stored, placement))
  })

  it.each([
    {
      reason: "EP missing: an Order placed before the basis existed",
      stored: null,
    },
    { reason: "EP malformed: a damaged value", stored: { lines: "x" } },
    { reason: "EP wrong shape: a list instead of a basis", stored: [] },
  ])("$reason: shows as unavailable, never guessed", ({ stored }) => {
    expect(financialBasisView(stored, placement)).toEqual({
      status: "unavailable",
    })
  })

  it("shows a basis without a known placement time as unavailable", () => {
    const stored = captureFinancialBasis(order, agreement)

    expect(
      financialBasisView(stored, { ...placement, placed_at: null }),
    ).toEqual({ status: "unavailable" })
  })

  it.each<{
    reason: string
    input: [PlacedOrder, PlacementAgreement | null]
  }>([
    { reason: "EP no agreement", input: [order, null] },
    {
      reason: "EP unknown terms version",
      input: [order, { ...agreement, terms_version: "unknown_v9" }],
    },
    { reason: "BVA zero lines", input: [{ ...order, items: [] }, agreement] },
    {
      reason: "EP a line priced excluding VAT",
      input: [
        {
          ...order,
          items: [{ ...order.items[0], is_tax_inclusive: false }],
        },
        agreement,
      ],
    },
    {
      reason: "EP a line without a price",
      input: [
        {
          ...order,
          items: [{ id: "ordli_1", variant_id: null, quantity: 1 }],
        },
        agreement,
      ],
    },
  ])("$reason: records nothing rather than a partial basis", ({ input }) => {
    const [placed, terms] = input
    expect(captureFinancialBasis(placed, terms)).toBeNull()
  })
})
