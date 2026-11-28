import {
  inCauseOrder,
  formatRate,
  formatRating,
  exclusionSummary,
  changeSummary,
  formatDuration,
  hourLabels,
  peakHour,
} from "../operations-api"

const none = [
  "restaurant_rejected",
  "acceptance_timeout",
  "customer_cancelled",
  "unassigned_timeout",
  "operator_cancelled",
] as const

describe("The order of causes (#263)", () => {
  it("lists cancellations Customer first, then Restaurant, then MTOGO, as the Unfulfilled chart does", () => {
    expect(
      inCauseOrder(none.map((category) => ({ category }))).map(
        ({ category }) => category,
      ),
    ).toEqual([
      "customer_cancelled",
      "restaurant_rejected",
      "acceptance_timeout",
      "unassigned_timeout",
      "operator_cancelled",
    ])
  })
})

describe("Hour labels", () => {
  const hour = (
    local_time: string,
    utc_offset: string,
    is_current = false,
  ) => ({
    starts_at: "",
    local_time,
    utc_offset,
    is_current,
    count: 0,
  })

  it("names the repeated 02:00 hour by its UTC offset and the current hour so far", () => {
    expect(
      hourLabels([
        hour("01:00", "+02:00"),
        hour("02:00", "+02:00"),
        hour("02:00", "+01:00"),
        hour("03:00", "+01:00", true),
      ]),
    ).toEqual(["01:00", "02:00 (+02:00)", "02:00 (+01:00)", "03:00 (so far)"])
  })

  it("keeps the offset on a repeated hour that is the current one", () => {
    expect(
      hourLabels([hour("02:00", "+02:00"), hour("02:00", "+01:00", true)]),
    ).toEqual(["02:00 (+02:00)", "02:00 (+01:00, so far)"])
  })
})

describe("The peak hour", () => {
  const hour = (local_time: string, count: number, utc_offset = "+01:00") => ({
    starts_at: "",
    local_time,
    utc_offset,
    is_current: false,
    count,
  })

  it.each([
    {
      hours: [hour("12:00", 2), hour("13:00", 6), hour("14:00", 3)],
      expected: { label: "13:00", count: 6 },
      reason: "EP: the hour with the most placements",
    },
    {
      hours: [hour("12:00", 4), hour("13:00", 4)],
      expected: { label: "12:00", count: 4 },
      reason: "BVA: a tie names the earlier hour",
    },
    {
      hours: [hour("02:00", 1, "+02:00"), hour("02:00", 3, "+01:00")],
      expected: { label: "02:00 (+01:00)", count: 3 },
      reason: "EP: a repeated hour keeps its UTC offset",
    },
    {
      hours: [hour("12:00", 0), hour("13:00", 0)],
      expected: null,
      reason: "BVA: no placements has no peak",
    },
  ])("$reason", ({ hours, expected }) => {
    expect(peakHour(hours)).toEqual(expected)
  })
})

describe("Time measure wording (#262)", () => {
  it('reads "1 excluded: no placement time" for one legacy Order', () => {
    expect(
      exclusionSummary([
        { reason: "no_placement_time", count: 1 },
        { reason: "no_handover_time", count: 0 },
      ]),
    ).toBe("1 excluded: no placement time")
  })

  it("names each reason with its count, largest first, when there are several", () => {
    expect(
      exclusionSummary([
        { reason: "no_placement_time", count: 1 },
        { reason: "no_handover_time", count: 2 },
      ]),
    ).toBe("3 excluded: 2 no handover time, 1 no placement time")
  })

  it('reads "None excluded" when every Order is included', () => {
    expect(exclusionSummary([{ reason: "no_pickup_time", count: 0 }])).toBe(
      "None excluded",
    )
  })

  it.each([
    { seconds: 3180, shown: "53 min", reason: "EP: under an hour in minutes" },
    {
      seconds: 3174,
      shown: "53 min",
      reason: "BVA: 52.9 minutes rounds to 53",
    },
    {
      seconds: 3570,
      shown: "1 h",
      reason: "BVA: 59.5 minutes rounds up to the hour",
    },
    {
      seconds: 7356,
      shown: "2 h 3 min",
      reason: "EP: 122.6 minutes as hours and minutes",
    },
    {
      seconds: 7200,
      shown: "2 h",
      reason: "BVA: whole hours drop the minutes",
    },
    { seconds: 0, shown: "0 min", reason: "BVA: a real zero average" },
    { seconds: null, shown: null, reason: "EP: no average is not zero" },
  ])("shows a duration: $reason", ({ seconds, shown }) => {
    expect(formatDuration(seconds)).toBe(shown)
  })

  it.each([
    {
      percent: -19,
      previous: 2600,
      text: "19% faster than the 7-day average of 43 min",
      tone: "faster",
      reason: "EP: shorter is faster",
    },
    {
      percent: 12,
      previous: 2600,
      text: "12% slower than the 7-day average of 43 min",
      tone: "slower",
      reason: "EP: longer is slower",
    },
    {
      percent: 0,
      previous: 2600,
      text: "Same as the 7-day average of 43 min",
      tone: "same",
      reason: "BVA: no change",
    },
    {
      percent: null,
      previous: null,
      text: "No previous 7 days to compare with",
      tone: "none",
      reason: "EP: nothing to compare",
    },
  ])(
    "compares with the previous 7 days: $reason",
    ({ percent, previous, text, tone }) => {
      expect(changeSummary(percent, previous)).toEqual({ text, tone })
    },
  )
})

describe("The Unfulfilled Order rate (#263)", () => {
  it.each([
    { percent: 10, text: "10%", reason: "EP: 3 of 30 reads 10%, no decimal" },
    { percent: 66.7, text: "66.7%", reason: "EP: one decimal is kept" },
    { percent: 0, text: "0%", reason: "BVA: none unfulfilled is a real 0%" },
    { percent: null, text: null, reason: "EP: nothing ended has no rate" },
  ])("$reason", ({ percent, text }) => {
    expect(formatRate(percent)).toBe(text)
  })
})

describe("The Customer rating (#263)", () => {
  it.each([
    {
      average: 4,
      text: "4.0",
      reason: "EP: a whole average keeps one decimal",
    },
    { average: 3.5, text: "3.5", reason: "EP: one decimal" },
    {
      average: null,
      text: null,
      reason: "EP: no ratings has no average, never 0",
    },
  ])("$reason", ({ average, text }) => {
    expect(formatRating(average)).toBe(text)
  })
})
