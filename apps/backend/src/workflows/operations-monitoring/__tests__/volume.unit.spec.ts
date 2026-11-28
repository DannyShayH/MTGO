import {
  hourWindow,
  last24Hours,
  ordersPerHourFigure,
  placementsFigure,
  placementsPerDayFigure,
  previousSevenDays,
} from "../volume"

describe("The last 24 hours", () => {
  it.each([
    {
      now: "2026-11-28T13:00:00.000Z",
      starts_at: "2026-11-27T13:00:00.000Z",
      reason:
        "BVA: at 14:00 it starts at 14:00 yesterday, so 13:30 is out and 14:30 in",
    },
    {
      now: "2026-11-28T13:00:00.001Z",
      starts_at: "2026-11-27T13:00:00.001Z",
      reason: "BVA: one millisecond later the start moves with now",
    },
    {
      now: "2026-10-25T12:00:00.000Z",
      starts_at: "2026-10-24T12:00:00.000Z",
      reason: "EP: 24 real hours across the night the clocks go back",
    },
  ])("$reason", ({ now, starts_at }) => {
    expect(last24Hours(new Date(now))).toEqual({ starts_at, ends_at: now })
  })
})

describe("Placements in the last 24 hours", () => {
  it("states 40 placed with 3 cancelled: 2 Customer, 1 Restaurant rejected, and keeps them in the volume", () => {
    const period = last24Hours(new Date("2026-11-28T13:00:00.000Z"))
    expect(
      placementsFigure(
        [
          { category: null, count: 37 },
          { category: "customer_cancelled", count: 2 },
          { category: "restaurant_rejected", count: 1 },
        ],
        period,
      ),
    ).toEqual({
      period,
      total: 40,
      cancelled: {
        total: 3,
        categories: [
          { category: "restaurant_rejected", count: 1 },
          { category: "acceptance_timeout", count: 0 },
          { category: "customer_cancelled", count: 2 },
          { category: "unassigned_timeout", count: 0 },
          { category: "operator_cancelled", count: 0 },
        ],
      },
      exclusions: [],
    })
  })

  it("states zero placed and zero cancelled when nothing was placed", () => {
    const period = last24Hours(new Date("2026-11-28T13:00:00.000Z"))
    const figure = placementsFigure([], period)
    expect(figure.total).toBe(0)
    expect(figure.cancelled.total).toBe(0)
  })
})

describe("Orders per hour", () => {
  const labels = (now: Date) =>
    ordersPerHourFigure([], now).hours.map(
      ({ local_time, utc_offset }) => `${local_time}${utc_offset}`,
    )

  it("covers the 24 Copenhagen clock hours ending with the current hour", () => {
    // 14:20 in Copenhagen.
    const now = new Date("2026-11-28T13:20:00.000Z")
    expect(hourWindow(now)).toEqual({
      starts_at: "2026-11-27T14:00:00.000Z",
      ends_at: "2026-11-28T13:20:00.000Z",
    })
    const { hours } = ordersPerHourFigure([], now)
    expect(hours).toHaveLength(24)
    expect(hours[0]).toMatchObject({ local_time: "15:00", is_current: false })
    expect(hours[23]).toMatchObject({
      starts_at: "2026-11-28T13:00:00.000Z",
      local_time: "14:00",
      utc_offset: "+01:00",
    })
  })

  it("at 14:20 shows 6 placements in the 14:00 hour so far and 0 in the empty 04:00 hour", () => {
    const now = new Date("2026-11-28T13:20:00.000Z")
    const figure = ordersPerHourFigure(
      [
        { starts_at: "2026-11-28T13:00:00.000Z", count: 6 },
        { starts_at: "2026-11-28T08:00:00.000Z", count: 2 },
      ],
      now,
    )
    const hour = (local_time: string) =>
      figure.hours.find((entry) => entry.local_time === local_time)
    expect(hour("14:00")).toMatchObject({ count: 6, is_current: true })
    expect(hour("04:00")).toMatchObject({ count: 0, is_current: false })
    expect(hour("09:00")).toMatchObject({ count: 2 })
    expect(figure.hours.filter(({ is_current }) => is_current)).toHaveLength(1)
    expect(figure.total).toBe(8)
    expect(figure.period).toEqual(hourWindow(now))
  })

  it("counts the current hour so far even exactly on the hour", () => {
    const now = new Date("2026-11-28T13:00:00.000Z")
    const { hours } = ordersPerHourFigure([], now)
    expect(hours[23]).toMatchObject({ local_time: "14:00", is_current: true })
    expect(hours[0].local_time).toBe("15:00")
  })

  it("shows the 02:00 hour twice, as +02:00 and +01:00, on the night of 25 October 2026", () => {
    // 10:20 in Copenhagen (+01:00), after the clocks went back.
    const hours = labels(new Date("2026-10-25T09:20:00.000Z"))
    expect(hours).toHaveLength(24)
    expect(hours.filter((label) => label.startsWith("02:00"))).toEqual([
      "02:00+02:00",
      "02:00+01:00",
    ])
    expect(hours[0]).toBe("12:00+02:00")
    expect(hours[23]).toBe("10:00+01:00")
  })

  it("has no 02:00 hour on 29 March 2026, when the clocks go forward", () => {
    // 12:00 in Copenhagen (+02:00).
    const hours = labels(new Date("2026-03-29T10:00:00.000Z"))
    expect(hours).toHaveLength(24)
    expect(hours.some((label) => label.startsWith("02:00"))).toBe(false)
    const one = hours.indexOf("01:00+01:00")
    expect(hours[one + 1]).toBe("03:00+02:00")
  })
})

describe("Placements per day over the previous seven complete days", () => {
  it.each([
    {
      now: "2026-10-28T08:00:00.000Z",
      starts_at: "2026-10-20T22:00:00.000Z",
      ends_at: "2026-10-27T23:00:00.000Z",
      first: "2026-10-21",
      last: "2026-10-27",
      reason:
        "EP: a week holding the 25-hour 25 October, starting at +02:00 and ending at +01:00",
    },
    {
      now: "2026-11-27T23:00:00.000Z",
      starts_at: "2026-11-20T23:00:00.000Z",
      ends_at: "2026-11-27T23:00:00.000Z",
      first: "2026-11-21",
      last: "2026-11-27",
      reason: "BVA: at the first second of 28 November, today is left out",
    },
    {
      now: "2026-11-27T22:59:59.999Z",
      starts_at: "2026-11-19T23:00:00.000Z",
      ends_at: "2026-11-26T23:00:00.000Z",
      first: "2026-11-20",
      last: "2026-11-26",
      reason: "BVA: at the last moment of 27 November, it is still today",
    },
    {
      now: "2026-04-05T10:00:00.000Z",
      starts_at: "2026-03-28T23:00:00.000Z",
      ends_at: "2026-04-04T22:00:00.000Z",
      first: "2026-03-29",
      last: "2026-04-04",
      reason: "EP: a week starting on the 23-hour 29 March",
    },
  ])("$reason", ({ now, starts_at, ends_at, first, last }) => {
    const period = previousSevenDays(new Date(now))
    expect(period).toMatchObject({ starts_at, ends_at })
    expect(period.dates).toHaveLength(7)
    expect([period.dates[0], period.dates[6]]).toEqual([first, last])
  })

  it("averages 210 placements, a day without any and the 25-hour day included, as 30.0 a day", () => {
    const now = new Date("2026-10-28T08:00:00.000Z")
    const figure = placementsPerDayFigure(
      [
        { date: "2026-10-21", count: 40 },
        { date: "2026-10-22", count: 30 },
        { date: "2026-10-23", count: 35 },
        { date: "2026-10-24", count: 45 },
        { date: "2026-10-25", count: 25 },
        { date: "2026-10-27", count: 35 },
      ],
      now,
    )
    expect(figure.total).toBe(210)
    expect(figure.average_per_day).toBe(30)
    expect(figure.days).toHaveLength(7)
    expect(figure.days[5]).toEqual({ date: "2026-10-26", count: 0 })
    const { starts_at, ends_at } = previousSevenDays(now)
    expect(figure.period).toEqual({ starts_at, ends_at })
    expect(figure.exclusions).toEqual([])
  })

  it("divides by seven, rounding to one decimal", () => {
    const figure = placementsPerDayFigure(
      [{ date: "2026-11-27", count: 10 }],
      new Date("2026-11-28T13:00:00.000Z"),
    )
    expect(figure.average_per_day).toBe(1.4)
  })
})
