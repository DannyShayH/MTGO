import {
  changePercent,
  processingTimeFigure,
  timesPerDayFigure,
  transitTimeFigure,
} from "../speed"

const period = {
  starts_at: "2026-11-27T13:00:00.000Z",
  ends_at: "2026-11-28T13:00:00.000Z",
}

describe("Order processing time", () => {
  it.each([
    {
      counts: {
        included: 3,
        average_seconds: 2400,
        no_placement_time: 1,
        no_handover_time: 0,
      },
      average: 2400,
      reason: "EP: 30, 40 and 50 minutes and a legacy Order give 40 over 3",
    },
    {
      counts: {
        included: 0,
        average_seconds: null,
        no_placement_time: 0,
        no_handover_time: 1,
      },
      average: null,
      reason: "EP: no Order included has no average, never zero",
    },
    {
      counts: {
        included: 3,
        average_seconds: 2400.6666,
        no_placement_time: 0,
        no_handover_time: 0,
      },
      average: 2401,
      reason: "BVA: the database average rounds to whole seconds",
    },
  ])("$reason", ({ counts, average }) => {
    expect(processingTimeFigure(counts, period)).toEqual({
      period,
      included: counts.included,
      average_seconds: average,
      exclusions: [
        { reason: "no_placement_time", count: counts.no_placement_time },
        { reason: "no_handover_time", count: counts.no_handover_time },
      ],
    })
  })
})

describe("Delivery transit time", () => {
  it.each([
    {
      counts: { included: 1, average_seconds: 1200, no_pickup_time: 1 },
      average: 1200,
      reason: "EP: picked up 18:05, handed over 18:25, one without pickup",
    },
    {
      counts: { included: 0, average_seconds: null, no_pickup_time: 0 },
      average: null,
      reason: "EP: no Order included has no average",
    },
  ])("$reason", ({ counts, average }) => {
    expect(transitTimeFigure(counts, period)).toEqual({
      period,
      included: counts.included,
      average_seconds: average,
      exclusions: [{ reason: "no_pickup_time", count: counts.no_pickup_time }],
    })
  })
})

describe("Change from the previous seven days", () => {
  it.each([
    {
      current: 2400,
      previous: 3000,
      change: -20,
      reason: "EP: 40 against 50 minutes is 20% faster",
    },
    {
      current: 3300,
      previous: 3000,
      change: 10,
      reason: "EP: 55 against 50 minutes is 10% slower",
    },
    {
      current: 3000,
      previous: 3000,
      change: 0,
      reason: "BVA: the same average is no change",
    },
    {
      current: 3010,
      previous: 3000,
      change: 0,
      reason: "BVA: under half a percent rounds to no change",
    },
    {
      current: null,
      previous: 3000,
      change: null,
      reason: "EP: no average in the last 24 hours",
    },
    {
      current: 2400,
      previous: null,
      change: null,
      reason: "EP: no average in the previous seven days",
    },
    {
      current: 2400,
      previous: 0,
      change: null,
      reason: "BVA: a zero average cannot be a base",
    },
  ])("$reason", ({ current, previous, change }) => {
    expect(changePercent(current, previous)).toBe(change)
  })
})

describe("Handover times per day", () => {
  // 10:00 on Monday 26 October: the previous seven days are 19 to 25 October.
  const now = new Date("2026-10-26T09:00:00.000Z")

  it("names every one of the seven days, with no average where none was handed over", () => {
    const figure = timesPerDayFigure(
      {
        processing: [
          { date: "2026-10-20", included: 2, average_seconds: 2700 },
          { date: "2026-10-25", included: 1, average_seconds: 1800.4 },
        ],
        transit: [{ date: "2026-10-20", included: 1, average_seconds: 900 }],
        processingTotal: {
          included: 3,
          average_seconds: 2400,
          no_placement_time: 1,
          no_handover_time: 0,
        },
        transitTotal: { included: 1, average_seconds: 900, no_pickup_time: 1 },
      },
      now,
    )
    expect(figure.period).toEqual({
      starts_at: "2026-10-18T22:00:00.000Z",
      ends_at: "2026-10-25T23:00:00.000Z",
    })
    expect(figure.days.map(({ date }) => date)).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ])
    expect(figure.days[0]).toEqual({
      date: "2026-10-19",
      processing_time: { included: 0, average_seconds: null },
      delivery_transit_time: { included: 0, average_seconds: null },
    })
    expect(figure.days[1]).toEqual({
      date: "2026-10-20",
      processing_time: { included: 2, average_seconds: 2700 },
      delivery_transit_time: { included: 1, average_seconds: 900 },
    })
    expect(figure.days[6].processing_time.average_seconds).toBe(1800)
    expect(figure.processing_time).toMatchObject({
      included: 3,
      average_seconds: 2400,
      exclusions: [
        { reason: "no_placement_time", count: 1 },
        { reason: "no_handover_time", count: 0 },
      ],
    })
    expect(figure.delivery_transit_time.exclusions).toEqual([
      { reason: "no_pickup_time", count: 1 },
    ])
  })
})
