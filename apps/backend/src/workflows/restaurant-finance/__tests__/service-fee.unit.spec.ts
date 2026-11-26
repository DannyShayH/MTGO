import {
  serviceFeeEvidence,
  serviceFeeDifference,
  serviceFeeStanding,
  type ParticipationFacts,
} from "../service-fee"

/** A Copenhagen wall-clock time in winter (UTC+1) as an instant. */
const cet = (local: string) => new Date(`${local}+01:00`)
/** A Copenhagen wall-clock time in summer (UTC+2) as an instant. */
const cest = (local: string) => new Date(`${local}+02:00`)

const activated = (occurred_at: Date) => ({
  kind: "activated" as const,
  occurred_at,
})
const deactivated = (occurred_at: Date) => ({
  kind: "deactivated" as const,
  occurred_at,
})

describe("Service fee from Copenhagen active dates (spec #52 §6)", () => {
  /**
   * Conditions: the month's day count, active intervals and their
   * boundaries, repeated changes, the current month, recorded evidence.
   */
  it.each([
    {
      facts: {
        created_at: cet("2026-11-01T10:00:00"),
        is_active: true,
        changes: [activated(cet("2026-11-26T13:00:00"))],
      },
      month: "2026-11",
      now: cet("2026-11-26T13:00:00"),
      expected: {
        status: "verified",
        active_dates: ["2026-11-26"],
        active_date_count: 1,
        amount: "3.33",
      },
      reason:
        "BVA: activation at the observed instant already counts today's active date",
    },
    {
      facts: {
        created_at: cest("2026-08-20T10:00:00"),
        is_active: false,
        changes: [
          activated(cest("2026-09-01T08:00:00")),
          deactivated(cest("2026-09-15T20:00:00")),
        ],
      },
      month: "2026-09",
      now: cet("2026-11-10T12:00:00"),
      expected: {
        status: "verified",
        month_day_count: 30,
        active_date_count: 15,
        counted_through: "2026-09-30",
        amount: "50",
      },
      reason: "EP: fifteen active dates of a thirty-day month cost DKK 50",
    },
    {
      facts: {
        created_at: cet("2026-02-01T09:00:00"),
        is_active: false,
        changes: [
          activated(cet("2026-02-10T12:00:00")),
          deactivated(cet("2026-02-10T13:00:00")),
        ],
      },
      month: "2026-02",
      now: cest("2026-06-01T00:00:00"),
      expected: {
        status: "verified",
        month_day_count: 28,
        active_dates: ["2026-02-10"],
        amount: "3.57",
      },
      reason: "BVA: one active day of a 28-day February, rounded once",
    },
    {
      facts: {
        created_at: cet("2028-02-01T09:00:00"),
        is_active: false,
        changes: [
          activated(cet("2028-02-10T12:00:00")),
          deactivated(cet("2028-02-10T13:00:00")),
        ],
      },
      month: "2028-02",
      now: cest("2028-06-01T00:00:00"),
      expected: {
        status: "verified",
        month_day_count: 29,
        active_dates: ["2028-02-10"],
        amount: "3.45",
      },
      reason: "BVA: one active day of the 29-day leap-year February 2028",
    },
    {
      facts: {
        created_at: cet("2026-03-01T09:00:00"),
        is_active: false,
        changes: [
          activated(cet("2026-03-28T23:30:00")),
          deactivated(cest("2026-03-30T00:00:00")),
        ],
      },
      month: "2026-03",
      now: cest("2026-05-01T00:00:00"),
      expected: {
        month_day_count: 31,
        active_dates: ["2026-03-28", "2026-03-29"],
      },
      reason:
        "BVA: the 23-hour daylight-saving date counts once, and a midnight deactivation ends it",
    },
    {
      facts: {
        created_at: cest("2026-10-01T09:00:00"),
        is_active: false,
        changes: [
          activated(cet("2026-10-25T23:59:00")),
          deactivated(cet("2026-10-26T00:00:00")),
        ],
      },
      month: "2026-10",
      now: cet("2026-11-10T00:00:00"),
      expected: { active_dates: ["2026-10-25"] },
      reason:
        "BVA: the 25-hour daylight-saving date counts from its last minute, not the next date",
    },
    {
      facts: {
        created_at: cet("2026-11-01T09:00:00"),
        is_active: false,
        changes: [
          activated(cet("2026-11-03T08:00:00")),
          deactivated(cet("2026-11-03T09:00:00")),
          activated(cet("2026-11-03T10:00:00")),
          deactivated(cet("2026-11-03T11:00:00")),
          activated(cet("2026-11-03T12:00:00")),
          deactivated(cet("2026-11-05T00:00:00")),
        ],
      },
      month: "2026-11",
      now: cet("2026-12-02T12:00:00"),
      expected: {
        active_dates: ["2026-11-03", "2026-11-04"],
        amount: "6.67",
      },
      reason:
        "DT: repeated changes on one date count it once; a midnight deactivation does not count the new date",
    },
    {
      facts: {
        created_at: cet("2026-10-20T09:00:00"),
        is_active: true,
        changes: [activated(cest("2026-10-21T09:00:00"))],
      },
      month: "2026-11",
      now: cet("2026-11-25T00:30:00"),
      expected: {
        status: "verified",
        month_day_count: 30,
        counted_through: "2026-11-25",
        active_date_count: 25,
        amount: "83.33",
      },
      reason:
        "BVA: the current month counts up to and including today, 30 minutes in, never later dates",
    },
    {
      facts: {
        created_at: cet("2026-11-12T09:00:00"),
        is_active: false,
        changes: [],
      },
      month: "2026-11",
      now: cet("2026-11-25T12:00:00"),
      expected: {
        status: "verified",
        counted_through: "2026-11-25",
        active_dates: [],
        amount: "0",
      },
      reason: "EP: a month the Restaurant stayed inactive is a verified zero",
    },
    {
      facts: {
        created_at: cet("2026-11-12T09:00:00"),
        is_active: true,
        changes: [],
      },
      month: "2026-11",
      now: cet("2026-11-14T12:00:00"),
      expected: {
        status: "evidence_missing",
        amount: null,
        active_dates: [],
        unknown_dates: ["2026-11-12", "2026-11-13", "2026-11-14"],
      },
      reason:
        "DT: today's active flag without a recorded activation proves no date",
    },
    {
      facts: {
        created_at: cet("2026-10-01T09:00:00"),
        is_active: true,
        changes: [
          deactivated(cet("2026-11-02T10:00:00")),
          activated(cet("2026-11-20T10:00:00")),
        ],
      },
      month: "2026-11",
      now: cet("2026-11-21T12:00:00"),
      expected: {
        status: "evidence_missing",
        unknown_dates: ["2026-11-01", "2026-11-02"],
        active_dates: ["2026-11-20", "2026-11-21"],
      },
      reason:
        "DT: a deactivation never activated leaves the dates up to it unknown, and later ones known",
    },
  ] as {
    facts: ParticipationFacts
    month: string
    now: Date
    expected: Record<string, unknown>
    reason: string
  }[])("$reason", ({ facts, month, now, expected }) => {
    expect(serviceFeeEvidence(facts, month, now)).toMatchObject(expected)
  })
})

describe("Whether a month's service fee has accrued (spec #52 §6, §8)", () => {
  const twoActiveDays = serviceFeeEvidence(
    {
      created_at: cet("2026-11-01T09:00:00"),
      is_active: true,
      changes: [activated(cet("2026-11-24T09:00:00"))],
    },
    "2026-11",
    cet("2026-11-25T12:00:00"),
  )
  const inactive = serviceFeeEvidence(
    { created_at: cet("2026-11-01T09:00:00"), is_active: false, changes: [] },
    "2026-11",
    cet("2026-11-25T12:00:00"),
  )
  const unknown = serviceFeeEvidence(
    { created_at: cet("2026-11-01T09:00:00"), is_active: true, changes: [] },
    "2026-11",
    cet("2026-11-25T12:00:00"),
  )

  it.each([
    {
      evidence: twoActiveDays,
      accrued: { active_dates: ["2026-11-24", "2026-11-25"], amount: "6.67" },
      expected: { status: "accrued", amount: "6.67" },
      reason:
        "DT R1: the obligation holds every active date: its booked amount",
    },
    {
      evidence: twoActiveDays,
      accrued: { active_dates: ["2026-11-24"], amount: "3.33" },
      expected: { status: "accrual_pending" },
      reason: "DT R2: a new active date since the last accrual is still owed",
    },
    {
      evidence: twoActiveDays,
      accrued: undefined,
      expected: { status: "accrual_pending" },
      reason: "DT R3: active dates without an obligation are still owed",
    },
    {
      evidence: inactive,
      accrued: undefined,
      expected: { status: "accrued", amount: "0" },
      reason: "EP: no active date and no obligation is a verified zero",
    },
    {
      evidence: unknown,
      accrued: { active_dates: [], amount: "0" },
      expected: { status: "evidence_missing" },
      reason: "DT R4: unknown dates stay unknown, whatever was accrued",
    },
  ])("$reason", ({ evidence, accrued, expected }) => {
    expect(serviceFeeStanding(evidence, accrued)).toEqual(expected)
  })
})

/** EP/BVA: use monthly targets rounded independently, never rounded daily differences. */
describe("Closed monthly service-fee differences (#230)", () => {
  it.each([
    {
      target: "6.67",
      recognized: ["3.33"],
      expected: "3.34",
      reason: "BVA: two November active dates minus the one-date accrual",
    },
    {
      target: "6.67",
      recognized: ["3.33", "3.34"],
      expected: "0",
      reason: "EP: replay after the difference was already recognized",
    },
    {
      target: "6.67",
      recognized: ["10"],
      expected: "-3.33",
      reason: "EP: a lower verified monthly target restores the overcharge",
    },
    {
      target: "100",
      recognized: [],
      expected: "100",
      reason:
        "EP: an obligation that never accrued owes the whole verified target",
    },
  ])("$reason", ({ target, recognized, expected }) => {
    expect(serviceFeeDifference(target, recognized)).toBe(expected)
  })
})
