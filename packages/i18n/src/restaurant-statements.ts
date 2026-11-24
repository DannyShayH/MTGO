import { formatText } from "./format.ts"
import type { Locale } from "./locale.ts"

/**
 * The Restaurant's monthly statement in the partner app (#227): monthly
 * activity in DKK excluding VAT. It is not a tax invoice, a payout or a
 * running amount owed, and an unknown amount is never shown as zero.
 */
export const RESTAURANT_STATEMENTS_TEXT = {
  da: {
    title: "Opgørelser",
    intro:
      "Jeres restaurants månedlige aktivitet hos MTOGO: madkredit for leverede ordrer, kommission, servicegebyr og reguleringer. Alle beløb er i DKK ekskl. moms.",
    not_invoice:
      "Opgørelsen er ikke en faktura, en udbetaling eller et samlet mellemværende. Den viser kun den valgte måneds aktivitet.",
    month: "Måned",
    show_month: "Vis måned",
    provisional: "Foreløbig",
    provisional_hint:
      "Måneden er ikke slut, så der kan stadig komme aktivitet til.",
    closed: "Afsluttet",
    closed_hint:
      "Måneden er slut. Senere behandling vises som regulering i den aktuelle måned.",
    complete: "Fuldstændig",
    incomplete: "Ufuldstændig",
    processing_pending: "Behandling i gang",
    amounts_basis: "DKK ekskl. moms",
    totals: "Månedens beløb",
    food_credits: "Madkredit",
    commission: "Kommission",
    service_fee: "Servicegebyr",
    adjustments: "Reguleringer",
    balance: "Månedens saldo",
    deduction: "Fratrækkes",
    unavailable: "Ikke tilgængelig",
    reason_not_yet_supported: "Beregnes ikke endnu",
    reason_evidence_missing: "Mangler dokumentation",
    reason_processing_pending: "Behandles stadig",
    reason_depends_on_unavailable: "Kræver alle beløb ovenfor",
    service_fee_heading: "Servicegebyr",
    service_fee_unavailable:
      "Det månedlige servicegebyr og de aktive dage, det bygger på, beregnes ikke endnu. Derfor vises månedens saldo ikke.",
    problems: "Det mangler i opgørelsen",
    entries: "Posteringer",
    entries_count: "{count} posteringer",
    entries_empty: "Ingen bogførte posteringer i denne måned.",
    entry_order: "Ordre",
    entry_order_number: "Ordre #{number}",
    entry_order_unknown: "Ordre",
    entry_delivered: "Leveret",
    entry_posted: "Bogført",
    entry_food_credit: "Madkredit",
    entry_commission: "Kommission",
    entry_net: "Netto",
    entry_funded_by_customer: "Betalt af kunden",
    entry_funded_by_mtogo: "Betalt af MTOGO",
    calculation: "Beregning",
    calculation_food_value:
      "Madens værdi {including} inkl. moms, {excluding} ekskl. moms ({rate} moms)",
    calculation_terms: "Vilkår: {terms}",
    terms_common_mvp_v1: "MTOGO's fælles vilkår, version 1",
    page_status: "Posteringer {from}–{to} af {count}",
    previous: "Forrige",
    next: "Næste",
    pagination: "Sider med posteringer",
    unavailable_title: "Opgørelsen kunne ikke hentes",
    retry_hint: "Det betyder ikke, at måneden er tom. Prøv igen om lidt.",
    retry: "Prøv igen",
    loading: "Henter opgørelse",
    verified_at: "Opdateret {time}",
  },
  en: {
    title: "Statements",
    intro:
      "Your Restaurant's monthly activity with MTOGO: food credit for delivered Orders, commission, service fee and adjustments. All amounts are DKK excluding VAT.",
    not_invoice:
      "This statement is not an invoice, a payout or a running amount owed. It shows only the selected month's activity.",
    month: "Month",
    show_month: "Show month",
    provisional: "Provisional",
    provisional_hint:
      "The month has not ended, so activity can still be added.",
    closed: "Closed",
    closed_hint:
      "The month has ended. Later processing appears as an adjustment in the current month.",
    complete: "Complete",
    incomplete: "Incomplete",
    processing_pending: "Processing pending",
    amounts_basis: "DKK excl. VAT",
    totals: "Month's amounts",
    food_credits: "Food credit",
    commission: "Commission",
    service_fee: "Service fee",
    adjustments: "Adjustments",
    balance: "Monthly balance",
    deduction: "Deducted",
    unavailable: "Unavailable",
    reason_not_yet_supported: "Not calculated yet",
    reason_evidence_missing: "Evidence missing",
    reason_processing_pending: "Still processing",
    reason_depends_on_unavailable: "Needs every amount above",
    service_fee_heading: "Service fee",
    service_fee_unavailable:
      "The monthly service fee and the active days it is based on are not calculated yet, so the monthly balance is not shown.",
    problems: "What the statement is missing",
    entries: "Entries",
    entries_count: "{count} entries",
    entries_empty: "No booked entries this month.",
    entry_order: "Order",
    entry_order_number: "Order #{number}",
    entry_order_unknown: "Order",
    entry_delivered: "Delivered",
    entry_posted: "Booked",
    entry_food_credit: "Food credit",
    entry_commission: "Commission",
    entry_net: "Net",
    entry_funded_by_customer: "Paid by the Customer",
    entry_funded_by_mtogo: "Paid by MTOGO",
    calculation: "Calculation",
    calculation_food_value:
      "Food value {including} incl. VAT, {excluding} excl. VAT ({rate} VAT)",
    calculation_terms: "Terms: {terms}",
    terms_common_mvp_v1: "MTOGO common terms, version 1",
    page_status: "Entries {from}–{to} of {count}",
    previous: "Previous",
    next: "Next",
    pagination: "Entry pages",
    unavailable_title: "The statement could not be loaded",
    retry_hint: "This does not mean the month is empty. Try again shortly.",
    retry: "Try again",
    loading: "Loading statement",
    verified_at: "Updated {time}",
  },
}

const PROBLEM_TEXT: Record<Locale, Record<string, string>> = {
  da: {
    missing_financial_basis:
      "{count} leverede ordrer har ingen gemte købsvilkår, så deres madkredit og kommission kan ikke beregnes.",
    conflicting_recognition:
      "{count} leverede ordrer har oplysninger, der ikke stemmer med det allerede bogførte. Beløbet er ikke ændret.",
    recognition_pending:
      "{count} leverede ordrer fra denne måned er endnu ikke bogført.",
    earlier_month_processing_pending:
      "{count} leverede ordrer fra tidligere måneder venter på behandling og vises senere som regulering.",
    prepared_food_credit_pending:
      "{count} ordrer har kompensation for tilberedt mad, som opgørelsen ikke viser endnu.",
    unknown: "Noget økonomisk dokumentation kræver opmærksomhed ({code}).",
  },
  en: {
    missing_financial_basis:
      "{count} delivered Orders have no preserved purchase terms, so their food credit and commission cannot be calculated.",
    conflicting_recognition:
      "{count} delivered Orders have details that do not match what was already booked. The amount has not been changed.",
    recognition_pending:
      "{count} delivered Orders from this month are not booked yet.",
    earlier_month_processing_pending:
      "{count} delivered Orders from earlier months await processing and will appear later as adjustments.",
    prepared_food_credit_pending:
      "{count} Orders have prepared-food compensation that the statement does not show yet.",
    unknown: "Some financial evidence needs attention ({code}).",
  },
}

/** One statement problem in the reader's language. */
export const statementProblemText = (
  problem: { code: string; count: number },
  locale: Locale,
) =>
  formatText(
    PROBLEM_TEXT[locale][problem.code] ?? PROBLEM_TEXT[locale].unknown,
    {
      count: problem.count,
      code: problem.code,
    },
  )

const MONTH_FORMAT: Record<Locale, Intl.DateTimeFormat> = {
  da: new Intl.DateTimeFormat("da-DK", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }),
  en: new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }),
}

/** A `YYYY-MM` statement month as its calendar month (`november 2026`). */
export const formatStatementMonth = (month: string, locale: Locale) => {
  const [year, number] = month.split("-").map(Number)
  return MONTH_FORMAT[locale].format(new Date(Date.UTC(year, number - 1, 1)))
}
