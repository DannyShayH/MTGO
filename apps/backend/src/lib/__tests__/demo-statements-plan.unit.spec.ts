import { planDemoStatementOrders } from "../demo-statements-plan"

/** A Copenhagen wall-clock time in winter (UTC+1) as an instant. */
const cet = (local: string) => new Date(`${local}+01:00`)

const plan = (
  overrides: Partial<Parameters<typeof planDemoStatementOrders>[0]> = {},
) =>
  planDemoStatementOrders({
    seed: "res_demo",
    active_dates: ["2026-11-13", "2026-11-14", "2026-11-25"],
    not_before: cet("2026-11-13T14:58:31"),
    now: cet("2026-11-25T18:00:00"),
    per_day: { min: 2, max: 4 },
    ...overrides,
  })

describe("Demo statement Orders (#228)", () => {
  it.each([
    {
      check: (orders: ReturnType<typeof plan>) =>
        orders.every(({ date }) =>
          ["2026-11-13", "2026-11-14", "2026-11-25"].includes(date),
        ),
      reason: "EP: Orders fall only on the Restaurant's active dates",
    },
    {
      check: (orders: ReturnType<typeof plan>) =>
        orders.every(
          ({ handover_at }) =>
            handover_at < cet("2026-11-25T18:00:00") &&
            handover_at >= cet("2026-11-13T14:58:31"),
        ),
      reason:
        "BVA: never after now on today, never before the first activation on its date",
    },
    {
      check: (orders: ReturnType<typeof plan>) =>
        ["2026-11-14"].every((date) => {
          const count = orders.filter((order) => order.date === date).length
          return count >= 2 && count <= 4
        }),
      reason: "BVA: a whole past active date has between min and max Orders",
    },
    {
      check: (orders: ReturnType<typeof plan>) =>
        new Set(orders.map(({ slot }) => slot)).size === orders.length,
      reason: "EP: every Order has its own slot, so a rerun can skip it",
    },
  ])("$reason", ({ check }) => {
    expect(check(plan())).toBe(true)
  })

  it("plans the same Orders for the same input, and none for no active date", () => {
    expect(plan()).toEqual(plan())
    expect(plan({ active_dates: [] })).toEqual([])
  })

  it("mixes basket sizes, including a few large Orders over a month", () => {
    const month = Array.from(
      { length: 30 },
      (_, day) => `2026-11-${String(day + 1).padStart(2, "0")}`,
    )
    const baskets = new Set(
      plan({
        active_dates: month,
        not_before: cet("2026-11-01T00:00:00"),
        now: cet("2026-12-01T00:00:00"),
      }).map(({ basket }) => basket),
    )
    expect([...baskets].sort()).toEqual(
      ["catering", "dinner", "family", "pair", "single"].sort(),
    )
  })
})
