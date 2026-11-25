import { lastThirtyDays, resolveStatisticsPeriod } from "../statistics-period"

describe("Feedback statistics period", () => {
  it("spans exactly thirty 24-hour days across the Copenhagen daylight-saving change", () => {
    const period = lastThirtyDays(new Date("2026-04-01T12:00:00.000Z"))
    expect(period).toEqual({
      key: "last_30_days",
      from: new Date("2026-03-02T12:00:00.000Z"),
      to: new Date("2026-04-01T12:00:00.000Z"),
    })
  })

  it.each([
    {
      key: "last_30_days",
      now: "2026-04-01T12:00:00.000Z",
      from: "2026-03-02T12:00:00.000Z",
      to: "2026-04-01T12:00:00.000Z",
      reason: "EP: the default rolling period",
    },
    {
      key: "previous_month",
      now: "2026-11-15T12:00:00.000Z",
      from: "2026-09-30T22:00:00.000Z",
      to: "2026-10-31T23:00:00.000Z",
      reason:
        "BVA: October starts in summer time (UTC+2) and ends in winter time (UTC+1)",
    },
    {
      key: "previous_month",
      now: "2026-04-10T08:00:00.000Z",
      from: "2026-02-28T23:00:00.000Z",
      to: "2026-03-31T22:00:00.000Z",
      reason:
        "BVA: March starts in winter time (UTC+1) and ends in summer time (UTC+2)",
    },
    {
      key: "previous_month",
      now: "2026-10-31T22:59:00.000Z",
      from: "2026-08-31T22:00:00.000Z",
      to: "2026-09-30T22:00:00.000Z",
      reason:
        "BVA: one minute before the month change, 31 October 23:59 in Copenhagen; the previous month is September",
    },
    {
      key: "previous_month",
      now: "2026-10-31T23:00:00.000Z",
      from: "2026-09-30T22:00:00.000Z",
      to: "2026-10-31T23:00:00.000Z",
      reason:
        "BVA: on the month change, 1 November 00:00 in Copenhagen; the previous month is October",
    },
    {
      key: "previous_month",
      now: "2026-10-31T23:01:00.000Z",
      from: "2026-09-30T22:00:00.000Z",
      to: "2026-10-31T23:00:00.000Z",
      reason:
        "BVA: one minute after the month change, 1 November 00:01 in Copenhagen is still October in UTC; the previous month is October",
    },
    {
      key: "previous_month",
      now: "2027-01-05T12:00:00.000Z",
      from: "2026-11-30T23:00:00.000Z",
      to: "2026-12-31T23:00:00.000Z",
      reason: "BVA: January wraps to the previous year's December",
    },
    {
      key: "all_time",
      now: "2026-04-01T12:00:00.000Z",
      from: null,
      to: null,
      reason: "EP: all time has open bounds",
    },
  ] as const)("$reason", ({ key, now, from, to }) => {
    expect(resolveStatisticsPeriod(key, new Date(now))).toEqual({
      key,
      from: from && new Date(from),
      to: to && new Date(to),
    })
  })
})
