import {
  copenhagenMonthOf,
  copenhagenMonthPeriod,
  deliveredRecognition,
  marginalCommission,
  reverseCommission,
  roundMoney,
} from "../calculation"
import { COMMON_MVP_TERMS_V1 } from "../../restaurants/commercial-terms"

const tiers = COMMON_MVP_TERMS_V1.commission_tiers.map((tier) => ({
  from_amount: String(tier.from_amount),
  to_amount: tier.to_amount === null ? null : String(tier.to_amount),
  rate_percent: String(tier.rate_percent),
}))

/** A preserved basis as the placement record stores it (#226). */
const basisOf = (unit_price_including_vat: string, quantity = "1") => ({
  basis_version: 1,
  currency_code: "dkk",
  order_version: 1,
  terms: {
    terms_version: "common_mvp_v1",
    agreement_id: "cta_1",
    agreed_at: "2026-11-01T09:00:00.000Z",
    prices_include_vat: true,
    vat_rate: "0.25",
    commission_tiers: tiers,
    monthly_service_fee: { amount: "100", currency_code: "dkk" },
  },
  lines: [
    {
      line_item_id: "ordli_1",
      variant_id: "variant_1",
      quantity,
      unit_price_including_vat,
    },
  ],
})

describe("Restaurant finance calculation (spec #52 §5)", () => {
  /**
   * Tiers excl. VAT: 6% to 100, 5% to 500, 4% to 1000, 3% above. Each
   * boundary is tested on it and 0.01 DKK either side; the rate change is
   * below a cent there, so the rounded commission stays the same.
   */
  it.each([
    { value: "0", commission: "0", reason: "BVA: no food value" },
    { value: "0.01", commission: "0", reason: "BVA: smallest food value" },
    { value: "99.99", commission: "6", reason: "BVA: 5.9994 below 100" },
    { value: "100", commission: "6", reason: "Spec: 6% of 100" },
    { value: "100.01", commission: "6", reason: "BVA: 6.0005 above 100" },
    { value: "499.99", commission: "26", reason: "BVA: 25.9995 below 500" },
    { value: "500", commission: "26", reason: "Spec: 6 + 5% of 400" },
    { value: "500.01", commission: "26", reason: "BVA: 26.0004 above 500" },
    { value: "600", commission: "30", reason: "Spec: 26 + 4% of 100" },
    { value: "999.99", commission: "46", reason: "BVA: 45.9996 below 1000" },
    { value: "1000", commission: "46", reason: "Spec: 26 + 4% of 500" },
    { value: "1000.01", commission: "46", reason: "BVA: 46.0003 above 1000" },
    { value: "1100", commission: "49", reason: "Spec: 46 + 3% of 100" },
  ])(
    "charges marginal commission $commission on $value excl. VAT ($reason)",
    ({ value, commission }) => {
      expect(marginalCommission(value, tiers)).toBe(commission)
    },
  )

  it.each([
    { raw: "1.004", rounded: "1", reason: "BVA: just below a tie rounds down" },
    {
      raw: "1.005",
      rounded: "1.01",
      reason: "BVA: a tie rounds away from zero",
    },
    {
      raw: "-1.005",
      rounded: "-1.01",
      reason: "EP: a negative tie rounds away from zero",
    },
    { raw: "2.4149", rounded: "2.41", reason: "Spec: commission of 40.248" },
  ])("rounds $raw once to $rounded ($reason)", ({ raw, rounded }) => {
    expect(roundMoney(raw)).toBe(rounded)
  })

  it("recognizes DKK 50.31 incl. VAT as food credit 40.25 and commission 2.41, independently rounded", () => {
    expect(
      deliveredRecognition(basisOf("50.31"), {
        restaurant_id: "res_1",
        placed_at: "2026-11-24T18:00:00.000Z",
      }),
    ).toEqual({
      status: "recognizable",
      currency_code: "dkk",
      food_credit: "40.25",
      commission: "2.41",
      evidence: {
        terms_version: "common_mvp_v1",
        agreement_id: "cta_1",
        order_version: 1,
        vat_rate: "0.25",
        commission_tiers: tiers,
        food_value_including_vat: "50.31",
        food_value_excluding_vat: "40.248",
        lines: [
          {
            line_item_id: "ordli_1",
            variant_id: "variant_1",
            quantity: "1",
            unit_price_including_vat: "50.31",
            total_including_vat: "50.31",
          },
        ],
      },
    })
  })

  it("charges commission on the exact food value, not on the rounded credit", () => {
    // 125.625 incl. VAT is exactly 100.5 excl.: commission 6 + 0.025 = 6.025.
    const recognized = deliveredRecognition(basisOf("125.625"), {
      restaurant_id: "res_1",
      placed_at: "2026-11-24T18:00:00.000Z",
    })
    expect(recognized).toMatchObject({
      food_credit: "100.5",
      commission: "6.03",
    })
  })

  it("cannot recognize an Order whose purchased basis was not preserved", () => {
    expect(
      deliveredRecognition(null, {
        restaurant_id: "res_1",
        placed_at: "2026-11-24T18:00:00.000Z",
      }),
    ).toEqual({ status: "missing_financial_basis" })
  })

  it.each([
    { original: "30.00", reversal: "-30", reason: "EP: a whole amount" },
    {
      original: "2.41",
      reversal: "-2.41",
      reason: "Spec: the 50.31 commission",
    },
  ])(
    "reverses exactly the booked commission $original ($reason)",
    ({ original, reversal }) => {
      expect(reverseCommission(original)).toBe(reversal)
    },
  )
})

describe("Copenhagen calendar months (spec #52 §7)", () => {
  it.each([
    {
      instant: "2026-11-30T22:59:59.999Z",
      month: "2026-11",
      reason: "BVA: 1 ms before Copenhagen midnight stays in November",
    },
    {
      instant: "2026-11-30T23:00:00.000Z",
      month: "2026-12",
      reason: "BVA: Copenhagen midnight starts December",
    },
    {
      instant: "2026-11-30T23:30:00.000Z",
      month: "2026-12",
      reason: "EP: still 30 November in UTC, already December in Copenhagen",
    },
    {
      instant: "2026-07-31T21:59:59.999Z",
      month: "2026-07",
      reason: "BVA: 1 ms before summer-time midnight stays in July",
    },
    {
      instant: "2026-07-31T22:00:00.000Z",
      month: "2026-08",
      reason: "BVA: summer-time midnight starts August",
    },
  ])("classifies $instant as $month ($reason)", ({ instant, month }) => {
    expect(copenhagenMonthOf(new Date(instant))).toBe(month)
  })

  it.each([
    {
      month: "2026-11",
      starts_at: "2026-10-31T23:00:00.000Z",
      ends_at: "2026-11-30T23:00:00.000Z",
      reason: "EP: a winter-time month",
    },
    {
      month: "2026-10",
      starts_at: "2026-09-30T22:00:00.000Z",
      ends_at: "2026-10-31T23:00:00.000Z",
      reason: "BVA: the month of the October daylight-saving change",
    },
    {
      month: "2028-02",
      starts_at: "2028-01-31T23:00:00.000Z",
      ends_at: "2028-02-29T23:00:00.000Z",
      reason: "BVA: a leap-year February",
    },
  ])(
    "runs $month from Copenhagen midnight to the next month's start ($reason)",
    ({ month, starts_at, ends_at }) => {
      expect(copenhagenMonthPeriod(month)).toEqual({
        starts_at: new Date(starts_at),
        ends_at: new Date(ends_at),
      })
    },
  )
})
