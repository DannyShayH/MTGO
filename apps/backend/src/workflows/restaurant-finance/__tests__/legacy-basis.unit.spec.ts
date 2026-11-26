import { legacyFinancialBasis } from "../legacy-basis"

/**
 * #231: a delivered Order without a preserved purchase basis is
 * reconstructed only from facts that prove what was bought and which terms
 * applied at placement. Anything else is named as missing evidence; today's
 * agreement or a changed Order is never used as historical proof.
 *
 * | Rule | Purchase reproducible? | One known agreement in force? | Result               |
 * | ---- | ---------------------- | ----------------------------- | -------------------- |
 * | R1   | Yes                    | Yes                           | verified             |
 * | R2   | No                     | Yes                           | missing purchase     |
 * | R3   | Yes                    | No                            | missing terms        |
 * | R4   | No                     | No                            | missing both         |
 */
const PLACED_AT = "2026-10-03T11:00:05.000Z"
const line = {
  id: "ordli_1",
  variant_id: "variant_1",
  raw_unit_price: { value: "95" } as { value?: string | null } | null,
  is_tax_inclusive: true,
  quantity: 2 as number | string,
}
const placedOrder = {
  version: 1,
  edited: false,
  currency_code: "dkk",
  created_at: "2026-10-03T11:00:00.000Z",
  items: [line],
}
const agreement = {
  id: "cta_1",
  terms_version: "common_mvp_v1",
  agreed_at: "2026-09-01T08:00:00.000Z",
  deleted_at: null as string | null,
}
/** One millisecond before and after placement. */
const JUST_BEFORE = "2026-10-03T11:00:04.999Z"
const JUST_AFTER = "2026-10-03T11:00:05.001Z"

describe("legacyFinancialBasis", () => {
  it("reconstructs the basis from the original Order lines and the agreement in force, with its placement time", () => {
    expect(
      legacyFinancialBasis({
        order: placedOrder,
        placed_at: PLACED_AT,
        agreements: [agreement],
      }),
    ).toEqual({
      status: "verified",
      placed_at: PLACED_AT,
      placement_time_source: "paid_placement",
      basis: {
        basis_version: 1,
        currency_code: "dkk",
        order_version: 1,
        terms: expect.objectContaining({
          terms_version: "common_mvp_v1",
          agreement_id: "cta_1",
          agreed_at: "2026-09-01T08:00:00.000Z",
          vat_rate: "0.25",
        }),
        lines: [
          {
            line_item_id: "ordli_1",
            variant_id: "variant_1",
            quantity: "2",
            unit_price_including_vat: "95",
          },
        ],
      },
    })
  })

  it.each([
    {
      order: placedOrder,
      placed_at: PLACED_AT as string | null,
      agreements: [agreement],
      expected: { status: "verified" },
      reason: "DT R1: original lines and one agreement in force",
    },
    {
      order: placedOrder,
      placed_at: null,
      agreements: [agreement],
      expected: { status: "verified", placement_time_source: "order_created" },
      reason:
        "EP: a placement record without a time uses the native Order's creation",
    },
    {
      order: { ...placedOrder, version: 2 },
      placed_at: PLACED_AT,
      agreements: [agreement],
      expected: { status: "unverifiable", missing: ["purchase"] },
      reason: "DT R2: lines of a later Order version are not the purchase",
    },
    {
      order: { ...placedOrder, edited: true },
      placed_at: PLACED_AT,
      agreements: [agreement],
      expected: { status: "unverifiable", missing: ["purchase"] },
      reason: "DT R2: an Order edited after placement may have changed prices",
    },
    {
      order: { ...placedOrder, items: [] },
      placed_at: PLACED_AT,
      agreements: [agreement],
      expected: { status: "unverifiable", missing: ["purchase"] },
      reason: "DT R2, EP: no original lines",
    },
    {
      order: { ...placedOrder, items: [{ ...line, is_tax_inclusive: false }] },
      placed_at: PLACED_AT,
      agreements: [agreement],
      expected: { status: "unverifiable", missing: ["purchase"] },
      reason: "DT R2, EP: a price not stated as including VAT",
    },
    {
      order: { ...placedOrder, items: [{ ...line, raw_unit_price: null }] },
      placed_at: PLACED_AT,
      agreements: [agreement],
      expected: { status: "unverifiable", missing: ["purchase"] },
      reason: "DT R2, EP: a missing price",
    },
    {
      order: {
        ...placedOrder,
        items: [{ ...line, raw_unit_price: { value: "ninety" } }],
      },
      placed_at: PLACED_AT,
      agreements: [agreement],
      expected: { status: "unverifiable", missing: ["purchase"] },
      reason: "DT R2, EP: a price that is not an exact decimal",
    },
    {
      order: placedOrder,
      placed_at: PLACED_AT,
      agreements: [],
      expected: { status: "unverifiable", missing: ["terms"] },
      reason: "DT R3, EP: no agreement at all",
    },
    {
      order: placedOrder,
      placed_at: PLACED_AT,
      agreements: [{ ...agreement, agreed_at: PLACED_AT }],
      expected: { status: "verified" },
      reason: "BVA: agreed exactly at placement applies",
    },
    {
      order: placedOrder,
      placed_at: PLACED_AT,
      agreements: [{ ...agreement, agreed_at: JUST_AFTER }],
      expected: { status: "unverifiable", missing: ["terms"] },
      reason: "DT R3, BVA: agreed 1 ms after placement is today's, not proof",
    },
    {
      order: placedOrder,
      placed_at: PLACED_AT,
      agreements: [{ ...agreement, deleted_at: PLACED_AT }],
      expected: { status: "unverifiable", missing: ["terms"] },
      reason: "DT R3, BVA: removed exactly at placement no longer applies",
    },
    {
      order: placedOrder,
      placed_at: PLACED_AT,
      agreements: [{ ...agreement, deleted_at: JUST_AFTER }],
      expected: { status: "verified" },
      reason: "BVA: removed 1 ms after placement still applied",
    },
    {
      order: placedOrder,
      placed_at: PLACED_AT,
      agreements: [{ ...agreement, deleted_at: JUST_BEFORE }],
      expected: { status: "unverifiable", missing: ["terms"] },
      reason: "DT R3, BVA: removed 1 ms before placement",
    },
    {
      order: placedOrder,
      placed_at: PLACED_AT,
      agreements: [agreement, { ...agreement, id: "cta_2" }],
      expected: { status: "unverifiable", missing: ["terms"] },
      reason: "DT R3, EP: two agreements in force do not establish one",
    },
    {
      order: placedOrder,
      placed_at: PLACED_AT,
      agreements: [{ ...agreement, terms_version: "special_deal" }],
      expected: { status: "unverifiable", missing: ["terms"] },
      reason: "DT R3, EP: terms of an unknown version",
    },
    {
      order: { ...placedOrder, version: 3 },
      placed_at: null,
      agreements: [],
      expected: { status: "unverifiable", missing: ["purchase", "terms"] },
      reason: "DT R4: neither fact can be established",
    },
  ])("$reason", ({ order, placed_at, agreements, expected }) => {
    expect(legacyFinancialBasis({ order, placed_at, agreements })).toEqual(
      expect.objectContaining(expected),
    )
  })
})
