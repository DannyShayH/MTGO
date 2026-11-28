import { cancelledSummary, hourLabels, peakHour } from "../operations-api"

const none = [
  "restaurant_rejected",
  "acceptance_timeout",
  "customer_cancelled",
  "unassigned_timeout",
  "operator_cancelled",
] as const

describe("The cancellations line", () => {
  it('reads "3 cancelled: 2 Customer, 1 Restaurant rejected", largest first', () => {
    expect(
      cancelledSummary({
        total: 3,
        categories: none.map((category) => ({
          category,
          count:
            { customer_cancelled: 2, restaurant_rejected: 1 }[
              category as string
            ] ?? 0,
        })),
      }),
    ).toBe("3 cancelled: 2 Customer, 1 Restaurant rejected")
  })

  it('reads "0 cancelled" when none was', () => {
    expect(
      cancelledSummary({
        total: 0,
        categories: none.map((category) => ({ category, count: 0 })),
      }),
    ).toBe("0 cancelled")
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
