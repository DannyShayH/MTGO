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
    closed: "Afsluttet",
    complete: "Fuldstændig",
    status_explain: "Hvad betyder mærkerne?",
    status_heading: "Månedens status",
    status_provisional:
      "Måneden er ikke slut endnu. Der kan stadig komme ordrer og aktive dage til, så beløbene kan ændre sig.",
    status_closed:
      "Måneden er slut og ændres ikke længere. Det, der behandles senere, vises som regulering i den aktuelle måned.",
    status_complete:
      "Alt, som månedens beløb bygger på, er dokumenteret og bogført, så alle beløb og saldoen vises.",
    status_incomplete:
      "Noget dokumentation mangler, så de berørte beløb og saldoen vises ikke. Se nedenfor, hvad der mangler.",
    status_processing_pending:
      "Noget er endnu ikke bogført, så de berørte beløb og saldoen vises først, når det er på plads.",
    status_complete_not_final:
      "Fuldstændig betyder, at det hidtil kendte er på plads – ikke at måneden er slut.",
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
    service_fee_intro:
      "Servicegebyret er {policy} om måneden, fordelt på de dage restauranten var aktiv hos MTOGO. En dag tæller én gang, hvis restauranten var aktiv på et tidspunkt den dag, også når den var midlertidigt lukket for ordrer.",
    service_fee_days: "{active} af månedens {days} dage aktive",
    service_fee_calculation: "{policy} × {active} ÷ {days} = {amount}",
    service_fee_active_dates: "Aktive dage",
    service_fee_no_active_dates:
      "Restauranten var ikke aktiv i denne måned, så der er intet servicegebyr.",
    service_fee_counted_through:
      "Talt til og med {date} – kommende dage tæller først, når de er nået.",
    service_fee_dates_hint: "Dagene er markeret i diagrammet nedenfor.",
    service_fee_explain: "Sådan beregnes servicegebyret",
    days_heading: "Måneden dag for dag",
    days_intro:
      "Netto pr. dag af de bogførte posteringer: madkredit minus kommission og eventuelle reguleringer af servicegebyr. En prik under dagen betyder, at restauranten var aktiv og dagen tæller med i servicegebyret.",
    days_withheld:
      "Viser kun de bogførte posteringer. Månedens beløb ovenfor er tilbageholdt, indtil det manglende er på plads.",
    days_chart_label: "Netto pr. dag i {month}",
    day_active: "Aktiv dag",
    day_inactive: "Ikke aktiv",
    day_unknown: "Deltagelse ukendt",
    day_not_reached: "Ikke nået endnu",
    day_orders: "{count} ordrer",
    day_today: "I dag",
    days_show_table: "Vis dagene som tabel",
    days_date: "Dato",
    days_participation: "Deltagelse",
    service_fee_evidence_missing:
      "Restaurantens historik viser ikke, om den var aktiv på {count} af månedens dage. Derfor vises servicegebyret og saldoen ikke.",
    service_fee_accrual_pending:
      "Gebyret er beregnet ud fra historikken, men er endnu ikke bogført. Saldoen vises, når det er bogført.",
    problems: "Det mangler i opgørelsen",
    entries: "Posteringer",
    entries_count: "{count} posteringer",
    entries_empty: "Ingen bogførte posteringer i denne måned.",
    entry_order: "Ordre",
    entry_order_number: "Ordre #{number}",
    entry_order_unknown: "Ordre",
    entry_posted: "Bogført",
    entry_original: "Oprindeligt udfald",
    entry_original_statement: "Regulering af {month}",
    entry_service_fee_difference: "Regulering af servicegebyr",
    entry_fee_difference_explanation:
      "Månedens gebyr {target} minus allerede bogført {recognized}: gebyrforskel {difference}.",
    closed_warnings_fixed:
      "Beløb og advarsler er fastholdt ved månedens afslutning. Senere behandling vises som regulering i den måned, den bogføres.",
    entry_food_credit: "Madkredit",
    entry_commission: "Kommission",
    entry_net: "Netto",
    entry_funded_by_mtogo: "Betalt af MTOGO",
    entry_outcome: "Udfald",
    entry_prepared_food:
      "Kompensation for tilberedt mad – betalt af MTOGO, ingen kommission",
    unsuccessful_heading: "Ordrer uden madkredit",
    unsuccessful_intro:
      "Ordrer, der blev afvist eller annulleret, før maden blev tilberedt. De giver ingen madkredit og ingen kommission, så de har ingen postering.",
    unsuccessful_count: "{count} ordrer",
    unsuccessful_count_one: "1 ordre",
    calculation: "Beregning",
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
    closed: "Closed",
    complete: "Complete",
    status_explain: "What do the labels mean?",
    status_heading: "The month's status",
    status_provisional:
      "The month has not ended. Orders and active days can still be added, so the amounts can change.",
    status_closed:
      "The month has ended and no longer changes. Anything processed later appears as an adjustment in the current month.",
    status_complete:
      "Everything the month's amounts are based on is documented and booked, so every amount and the balance are shown.",
    status_incomplete:
      "Some evidence is missing, so the affected amounts and the balance are not shown. See below what is missing.",
    status_processing_pending:
      "Something is not booked yet, so the affected amounts and the balance are shown once it is in place.",
    status_complete_not_final:
      "Complete means what is known so far is in place, not that the month has ended.",
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
    service_fee_intro:
      "The service fee is {policy} a month, shared over the days your Restaurant was active with MTOGO. A day counts once if the Restaurant was active at any time that day, also while it was temporarily closed for Orders.",
    service_fee_days: "{active} of the month's {days} days active",
    service_fee_calculation: "{policy} × {active} ÷ {days} = {amount}",
    service_fee_active_dates: "Active days",
    service_fee_no_active_dates:
      "The Restaurant was not active this month, so there is no service fee.",
    service_fee_counted_through:
      "Counted up to and including {date}; coming days count only once they are reached.",
    service_fee_dates_hint: "The days are marked in the chart below.",
    service_fee_explain: "How the service fee is calculated",
    days_heading: "The month day by day",
    days_intro:
      "Net per day of the booked entries: food credit minus commission and any service-fee adjustments. A dot under a day means the Restaurant was active and the day counts for the service fee.",
    days_withheld:
      "Shows the booked entries only. The month's amounts above are withheld until what is missing is in place.",
    days_chart_label: "Net per day in {month}",
    day_active: "Active day",
    day_inactive: "Not active",
    day_unknown: "Participation unknown",
    day_not_reached: "Not reached yet",
    day_orders: "{count} Orders",
    day_today: "Today",
    days_show_table: "Show the days as a table",
    days_date: "Date",
    days_participation: "Participation",
    service_fee_evidence_missing:
      "The Restaurant's history does not show whether it was active on {count} of the month's days, so the service fee and balance are not shown.",
    service_fee_accrual_pending:
      "The fee is calculated from the history but not booked yet. The balance is shown once it is booked.",
    problems: "What the statement is missing",
    entries: "Entries",
    entries_count: "{count} entries",
    entries_empty: "No booked entries this month.",
    entry_order: "Order",
    entry_order_number: "Order #{number}",
    entry_order_unknown: "Order",
    entry_posted: "Booked",
    entry_original: "Original outcome",
    entry_original_statement: "Adjustment for {month}",
    entry_service_fee_difference: "Service-fee adjustment",
    entry_fee_difference_explanation:
      "Monthly fee {target} minus already recognized {recognized}: fee difference {difference}.",
    closed_warnings_fixed:
      "Amounts and warnings are fixed at month end. Later processing appears as an adjustment in the month posted.",
    entry_food_credit: "Food credit",
    entry_commission: "Commission",
    entry_net: "Net",
    entry_funded_by_mtogo: "Paid by MTOGO",
    entry_outcome: "Outcome",
    entry_prepared_food:
      "Compensation for prepared food – paid by MTOGO, no commission",
    unsuccessful_heading: "Orders without food credit",
    unsuccessful_intro:
      "Orders rejected or cancelled before the food was prepared. They earn no food credit and no commission, so they have no entry.",
    unsuccessful_count: "{count} Orders",
    unsuccessful_count_one: "1 Order",
    calculation: "Calculation",
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
      "{count} ordrer fra tidligere måneder venter på behandling og vises senere som regulering.",
    prepared_food_credit_pending:
      "{count} ordrer har kompensation for tilberedt mad, som endnu ikke er bogført.",
    cancellation_processing_pending:
      "{count} annullerede ordrer uden tilberedt mad er endnu ikke behandlet. De giver ingen madkredit.",
    missing_outcome_evidence:
      "{count} annullerede ordrer mangler oplysninger om, hvorfor eller hvornår de blev annulleret, så deres madkredit kan ikke fastslås.",
    responsibility_unknown:
      "{count} leveringer mislykkedes uden registreret ansvar. Der beregnes ingen madkredit ud fra det alene.",
    participation_evidence_missing:
      "Historikken over aktivering og deaktivering mangler for dele af måneden, så servicegebyret kan ikke beregnes.",
    service_fee_accrual_pending:
      "Servicegebyret for de seneste aktive dage er endnu ikke bogført.",
    earlier_month_service_fee_pending:
      "Servicegebyret for {count} tidligere måneder er ikke fuldt bogført og vises senere som regulering.",
    earlier_month_evidence_missing:
      "Dokumentation for tidligere måneder mangler. Reguleringer og saldo vises ikke, før beløbene kan fastslås.",
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
      "{count} Orders from earlier months await processing and will appear later as adjustments.",
    prepared_food_credit_pending:
      "{count} Orders have prepared-food compensation that is not booked yet.",
    cancellation_processing_pending:
      "{count} cancelled Orders without prepared food are not processed yet. They earn no food credit.",
    missing_outcome_evidence:
      "{count} cancelled Orders lack the record of why or when they were cancelled, so their food credit cannot be established.",
    responsibility_unknown:
      "{count} deliveries failed without recorded responsibility. No food credit is calculated from that alone.",
    participation_evidence_missing:
      "The activation and deactivation history is missing for part of the month, so the service fee cannot be calculated.",
    service_fee_accrual_pending:
      "The service fee for the latest active days is not booked yet.",
    earlier_month_service_fee_pending:
      "The service fee of {count} earlier months is not fully booked and will appear later as an adjustment.",
    earlier_month_evidence_missing:
      "Evidence for earlier months is missing. Adjustments and the balance are withheld until the amounts can be established.",
    unknown: "Some financial evidence needs attention ({code}).",
  },
}

const OUTCOME_TEXT: Record<Locale, Record<string, string>> = {
  da: {
    service_fee_difference: "Regulering af servicegebyr",
    delivered: "Leveret",
    unassigned_timeout: "Intet bud inden fristen",
    operator_cancelled: "Annulleret af MTOGO",
    restaurant_rejected: "Afvist af restauranten",
    acceptance_timeout: "Ikke accepteret i tide",
    customer_cancelled: "Annulleret af kunden",
  },
  en: {
    service_fee_difference: "Service-fee adjustment",
    delivered: "Delivered",
    unassigned_timeout: "No Delivery agent by the deadline",
    operator_cancelled: "Cancelled by MTOGO",
    restaurant_rejected: "Rejected by the Restaurant",
    acceptance_timeout: "Not accepted in time",
    customer_cancelled: "Cancelled by the Customer",
  },
}

/**
 * An Order's qualifying outcome on the statement (#229), in the reader's
 * language; an outcome this text does not know yet reads as its code.
 */
export const statementOutcomeText = (outcome: string, locale: Locale) =>
  OUTCOME_TEXT[locale][outcome] ?? outcome

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

const DATE_FORMAT: Record<Locale, Intl.DateTimeFormat> = {
  da: new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }),
  en: new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }),
}

/** A `YYYY-MM-DD` Copenhagen date as its calendar date (`25. nov.`). */
export const formatStatementDate = (date: string, locale: Locale) => {
  const [year, month, day] = date.split("-").map(Number)
  return DATE_FORMAT[locale].format(new Date(Date.UTC(year, month - 1, day)))
}
