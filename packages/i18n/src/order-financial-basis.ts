import { formatText } from "./format.ts"
import type { Locale } from "./locale.ts"

/**
 * The read-only financial basis on a Restaurant's Order (#226): what was
 * purchased and on which agreed terms, frozen at paid placement. It never
 * claims that payment earned commission: commission belongs to delivery.
 */
export const ORDER_FINANCIAL_BASIS_TEXT = {
  da: {
    heading: "Købte økonomiske vilkår",
    status_preserved: "Gemt ved betaling",
    status_unavailable: "Ikke tilgængelig",
    summary: "Madens værdi {amount} ekskl. moms",
    placement: "Køb",
    intro:
      "Det, kunden betalte for, og de vilkår, jeres restaurant havde aftalt, da ordren blev betalt. Oplysningerne gemmes, som de var: Senere ændringer af menu eller vilkår ændrer dem ikke.",
    unavailable:
      "Ordrens økonomiske vilkår blev ikke gemt, da den blev afgivet, så de kan ikke vises. Vi bruger ikke dagens menu eller vilkår i stedet.",
    placed_at: "Betalt og afgivet",
    order_version: "Ordreversion",
    lines: "Købte varer",
    line_amount: "{quantity} × {unit}",
    food_value_including_vat: "Madens værdi inkl. moms",
    food_value_excluding_vat: "Madens værdi ekskl. moms",
    exact_hint:
      "Beregnet præcist ved at fjerne {rate} moms fra værdien inkl. moms. Den afrundes først, når et beløb bogføres.",
    terms: "Aftalte vilkår",
    terms_common_mvp_v1: "MTOGO's fælles vilkår, version 1",
    terms_unknown: "Vilkår {version}",
    agreed_at: "Aftalt {date}",
    vat: "Moms, inkluderet i menupriser",
    commission_tiers: "Kommission (af madens værdi ekskl. moms)",
    commission_note:
      "Kommission beregnes ud fra disse vilkår, når ordren er leveret. Betaling alene udløser ingen kommission.",
    service_fee:
      "Månedligt servicegebyr: {amount} ekskl. moms. Det hører ikke til den enkelte ordre.",
    not_statement: "Dette er ikke en opgørelse, faktura eller udbetaling.",
  },
  en: {
    heading: "Purchased financial terms",
    status_preserved: "Kept at payment",
    status_unavailable: "Unavailable",
    summary: "Food value {amount} excl. VAT",
    placement: "Purchase",
    intro:
      "What the Customer paid for and the terms your Restaurant had agreed when the Order was paid. They are kept as they were: later menu or terms changes do not alter them.",
    unavailable:
      "This Order's financial terms were not recorded when it was placed, so they cannot be shown. Today's menu and terms are not used instead.",
    placed_at: "Paid and placed",
    order_version: "Order version",
    lines: "Purchased items",
    line_amount: "{quantity} × {unit}",
    food_value_including_vat: "Food value incl. VAT",
    food_value_excluding_vat: "Food value excl. VAT",
    exact_hint:
      "Exactly the value incl. VAT with its {rate} VAT removed. It is rounded only when an amount is booked.",
    terms: "Agreed terms",
    terms_common_mvp_v1: "MTOGO common terms, version 1",
    terms_unknown: "Terms {version}",
    agreed_at: "Agreed {date}",
    vat: "VAT, included in menu prices",
    commission_tiers: "Commission (on food value excl. VAT)",
    commission_note:
      "Commission is calculated from these terms when the Order is delivered. Payment alone earns no commission.",
    service_fee:
      "Monthly service fee: {amount} excl. VAT. It is not part of any single Order.",
    not_statement: "This is not a statement, invoice or payout.",
  },
} satisfies Record<Locale, Record<string, string>>

const TIER_TEXT: Record<Locale, { band: string; above: string }> = {
  da: {
    band: "{rate} % fra {from} op til {to}",
    above: "{rate} % af det, der overstiger {from}",
  },
  en: {
    band: "{rate}% from {from} up to {to}",
    above: "{rate}% above {from}",
  },
}

const EXACT_DKK: Record<Locale, Intl.NumberFormat> = {
  da: new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency: "DKK",
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  }),
  en: new Intl.NumberFormat("en", {
    style: "currency",
    currency: "DKK",
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  }),
}

/**
 * An exact decimal DKK amount as the backend sent it, formatted from the
 * string so no binary float rounding occurs, keeping an exact third decimal
 * (`40,248 kr.`). Other amounts read like any price (`95,00 kr.`).
 */
export const formatExactDkk = (amount: string, locale: Locale) =>
  EXACT_DKK[locale].format(amount as Intl.StringNumericLiteral)

const PERCENT: Record<Locale, Intl.NumberFormat> = {
  da: new Intl.NumberFormat("da-DK", {
    style: "percent",
    maximumFractionDigits: 2,
  }),
  en: new Intl.NumberFormat("en", {
    style: "percent",
    maximumFractionDigits: 2,
  }),
}

/** A rate such as `"0.25"`, formatted from its exact string (`25 %`, `25%`). */
export const formatExactPercent = (rate: string, locale: Locale) =>
  PERCENT[locale].format(rate as Intl.StringNumericLiteral)

/** One marginal commission band, in the reader's language. */
export const commissionTierLabel = (
  tier: { from_amount: string; to_amount: string | null; rate_percent: string },
  locale: Locale,
) => {
  const values = {
    rate: tier.rate_percent,
    from: formatExactDkk(tier.from_amount, locale),
    to: tier.to_amount === null ? "" : formatExactDkk(tier.to_amount, locale),
  }
  return formatText(
    tier.to_amount === null ? TIER_TEXT[locale].above : TIER_TEXT[locale].band,
    values,
  )
}
