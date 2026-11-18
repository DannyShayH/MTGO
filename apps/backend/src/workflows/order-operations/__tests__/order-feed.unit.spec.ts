import { advanceOrderFeed, orderFeedWindowStart } from "../order-feed"

describe("The kitchen Order feed", () => {
  it.each([
    {
      before: {} as Record<string, number>,
      read: [{ id: "order_new", revision: 1 }],
      hints: [{ id: "order_new", revision: 1 }],
      reason: "EP: a newly placed Order",
    },
    {
      before: { order_a: 1 },
      read: [{ id: "order_a", revision: 1 }],
      hints: [],
      reason: "EP: the same revision read again inside the overlap window",
    },
    {
      before: { order_a: 1 },
      read: [{ id: "order_a", revision: 2 }],
      hints: [{ id: "order_a", revision: 2 }],
      reason: "EP: a persisted change raised the revision",
    },
    {
      before: { order_a: 3 },
      read: [{ id: "order_a", revision: 2 }],
      hints: [],
      reason: "EP: an older revision never announces a step back",
    },
    {
      before: { order_a: 1 },
      read: [
        { id: "order_b", revision: 1 },
        { id: "order_a", revision: 1 },
        { id: "order_c", revision: 4 },
      ],
      hints: [
        { id: "order_b", revision: 1 },
        { id: "order_c", revision: 4 },
      ],
      reason: "EP: several Orders sharing one updated time are all announced",
    },
  ])("$reason", ({ before, read, hints }) => {
    expect(advanceOrderFeed(before, read).hints).toEqual(hints)
  })

  it("forgets Orders that left the window, keeping the newest revision of the rest", () => {
    const { announced } = advanceOrderFeed({ order_old: 1, order_a: 3 }, [
      { id: "order_a", revision: 2 },
    ])
    expect(announced).toEqual({ order_a: 3 })
  })

  it("reads back far enough to catch a change committed after a newer one", () => {
    expect(orderFeedWindowStart(new Date("2026-11-18T12:00:30.000Z"))).toEqual(
      new Date("2026-11-18T12:00:00.000Z"),
    )
  })
})
