import { MathBN } from "@medusajs/framework/utils"
import { COMMON_MVP_TERMS_V1 } from "../restaurants/commercial-terms"
import {
  copenhagenDateOf,
  copenhagenMidnight,
  copenhagenMonthPeriod,
  roundMoney,
} from "./calculation"

/**
 * The monthly service fee (#228; spec #52 §6; ADR-0006): DKK 100 excluding
 * VAT times the Restaurant's distinct active Copenhagen dates divided by the
 * month's actual number of dates, rounded once for the month. Participation
 * comes only from recorded activation and deactivation; opening and closing
 * never change it, and today's active flag is not proof of earlier days.
 */

/** One recorded change of participation, as the Restaurant history has it. */
export type ParticipationChange = {
  kind: "activated" | "deactivated"
  occurred_at: Date | string
}

/** What is known about a Restaurant's participation. */
export type ParticipationFacts = {
  /** A Restaurant is created inactive; participation starts there. */
  created_at: Date | string
  /** Today's flag, only to detect a change history never recorded. */
  is_active: boolean
  /** Its recorded changes, oldest first. */
  changes: ParticipationChange[]
}

type State = "active" | "inactive" | "unknown"
type Interval = { from: number; to: number; state: State }

/** The policy a fee is calculated under: the common MVP terms. */
export const SERVICE_FEE_POLICY = {
  terms_version: COMMON_MVP_TERMS_V1.terms_version,
  amount: String(COMMON_MVP_TERMS_V1.monthly_service_fee.amount),
}

/**
 * Participation as intervals, each ending where the next change begins, so
 * a deactivation at midnight ends the interval exactly there. A change that
 * repeats the state it is already in, or a flag that disagrees with the
 * replayed history, means a change went unrecorded somewhere in the
 * preceding interval: that interval is unknown, never guessed.
 */
function participationIntervals(facts: ParticipationFacts, now: Date) {
  const created = new Date(facts.created_at).getTime()
  const intervals: Interval[] = []
  let state: "active" | "inactive" = "inactive"
  let since = created
  const close = (to: number, unrecorded: boolean) => {
    if (to > since)
      intervals.push({ from: since, to, state: unrecorded ? "unknown" : state })
  }
  for (const change of facts.changes) {
    const at = Math.max(new Date(change.occurred_at).getTime(), since)
    const next = change.kind === "activated" ? "active" : "inactive"
    // Reaching the state it is already in hides another, unrecorded change.
    close(at, next === state)
    state = next
    since = at
  }
  close(now.getTime(), (facts.is_active ? "active" : "inactive") !== state)
  return intervals
}

export type ServiceFeeEvidence = {
  month: string
  terms_version: string
  /** The full monthly policy amount, DKK excluding VAT. */
  policy_amount: string
  month_day_count: number
  /** The last date counted: today in the current month, else its last. */
  counted_through: string | null
  /** Each distinct Copenhagen date active at any point, oldest first. */
  active_dates: string[]
  active_date_count: number
} & (
  | {
      status: "verified"
      /** The monthly target, rounded once. */
      amount: string
      unknown_dates: []
    }
  | {
      status: "evidence_missing"
      amount: null
      /** Dates whose participation the history cannot establish. */
      unknown_dates: string[]
    }
)

/**
 * The fee evidence of one Copenhagen month as of `now`: its dates from the
 * Restaurant's creation up to and including today, never a future date.
 * Copenhagen calendar dates are counted, not 24-hour periods, so a
 * daylight-saving date counts once like any other.
 */
export function serviceFeeEvidence(
  facts: ParticipationFacts,
  month: string,
  now: Date,
): ServiceFeeEvidence {
  const [year, monthNumber] = month.split("-").map(Number)
  const period = copenhagenMonthPeriod(month)
  // Timestamps have millisecond precision. Include the observed instant so
  // an activation at exactly now already counts today; a midnight deactivation
  // still ends the preceding active interval before the new date.
  const observedEnd = new Date(now.getTime() + 1)
  const intervals = participationIntervals(facts, observedEnd)
  const rangeStart = Math.max(
    period.starts_at.getTime(),
    new Date(facts.created_at).getTime(),
  )
  const rangeEnd = Math.min(period.ends_at.getTime(), observedEnd.getTime())
  const month_day_count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const active_dates: string[] = []
  const unknown_dates: string[] = []
  let counted_through: string | null = null
  for (let day = 1; day <= month_day_count; day++) {
    const dayStart = copenhagenMidnight(year, monthNumber, day).getTime()
    const dayEnd =
      day === month_day_count
        ? period.ends_at.getTime()
        : copenhagenMidnight(year, monthNumber, day + 1).getTime()
    const start = Math.max(dayStart, rangeStart)
    const end = Math.min(dayEnd, rangeEnd)
    if (start >= end) continue
    const date = copenhagenDateOf(new Date(dayStart))
    counted_through = date
    const overlaps = (state: State) =>
      intervals.some(
        (interval) =>
          interval.state === state &&
          interval.from < end &&
          interval.to > start,
      )
    if (overlaps("active")) active_dates.push(date)
    else if (overlaps("unknown")) unknown_dates.push(date)
  }
  const common = {
    month,
    terms_version: SERVICE_FEE_POLICY.terms_version,
    policy_amount: SERVICE_FEE_POLICY.amount,
    month_day_count,
    counted_through,
    active_dates,
    active_date_count: active_dates.length,
  }
  if (unknown_dates.length)
    return {
      ...common,
      status: "evidence_missing",
      amount: null,
      unknown_dates,
    }
  return {
    ...common,
    status: "verified",
    amount: roundMoney(
      MathBN.div(
        MathBN.mult(SERVICE_FEE_POLICY.amount, active_dates.length),
        month_day_count,
      ).toString(),
    ),
    unknown_dates: [],
  }
}

export type ServiceFeeStanding =
  | { status: "accrued"; amount: string }
  | { status: "accrual_pending" }
  | { status: "evidence_missing" }

/**
 * What a statement may show as the month's fee (spec #52 §6, §8): the
 * obligation's booked amount when it holds exactly the active dates the
 * history shows, a verified zero when no date was active and nothing was
 * accrued, owed accrual when they differ, and unknown when the history
 * cannot establish the dates. Never today's flag or a guess.
 */
export function serviceFeeStanding(
  evidence: ServiceFeeEvidence,
  accrued: { active_dates: unknown; amount: string } | undefined,
): ServiceFeeStanding {
  if (evidence.status === "evidence_missing")
    return { status: "evidence_missing" }
  const held = JSON.stringify(accrued?.active_dates ?? [])
  if (held !== JSON.stringify(evidence.active_dates))
    return { status: "accrual_pending" }
  return { status: "accrued", amount: accrued?.amount ?? "0" }
}

/** A signed charge difference for one obligation, after monthly rounding. */
export function serviceFeeDifference(target: string, recognized: string[]) {
  return MathBN.sub(
    target,
    recognized.reduce(
      (sum, amount) => MathBN.add(sum, amount),
      MathBN.convert(0),
    ),
  ).toString()
}
