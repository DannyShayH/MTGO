/** Common MVP terms v1 (ADR-0006): marginal commission tiers and the monthly service fee, in DKK excluding VAT. */
export const COMMON_MVP_TERMS_V1 = {
  terms_version: "common_mvp_v1",
  amounts_exclude_vat: true,
  commission_tiers: [
    { from_amount: 0, to_amount: 100, rate_percent: 6 },
    { from_amount: 100, to_amount: 500, rate_percent: 5 },
    { from_amount: 500, to_amount: 1000, rate_percent: 4 },
    { from_amount: 1000, to_amount: null, rate_percent: 3 },
  ],
  monthly_service_fee: { amount: 100, currency_code: "dkk" },
} as const
export type TermsVersion = typeof COMMON_MVP_TERMS_V1.terms_version
