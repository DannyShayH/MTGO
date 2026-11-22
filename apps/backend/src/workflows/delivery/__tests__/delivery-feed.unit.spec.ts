import {
  advanceDeliveryFeed,
  fingerprintOf,
  type DeliveryFeedState,
} from "../delivery-feed"

const state = (available: string, current: string): DeliveryFeedState => ({
  available,
  current,
})

describe("The Delivery agent feed", () => {
  it.each([
    {
      announced: state("a1", "c1"),
      read: state("a1", "c1"),
      scopes: [],
      reason: "EP: nothing changed since the last read",
    },
    {
      announced: state("a1", "c1"),
      read: state("a2", "c1"),
      scopes: ["available"],
      reason: "EP: the eligible available work changed",
    },
    {
      announced: state("a1", "c1"),
      read: state("a1", "c2"),
      scopes: ["current"],
      reason: "EP: the agent's own current delivery changed",
    },
    {
      announced: state("a1", "c1"),
      read: state("a2", "c2"),
      scopes: ["available", "current"],
      reason: "EP: a claim changes both at once",
    },
  ])("$reason", ({ announced, read, scopes }) => {
    const advanced = advanceDeliveryFeed(announced, read)
    expect(advanced.scopes).toEqual(scopes)
    expect(advanced.announced).toEqual(read)
  })

  it("fingerprints equal facts equally and different facts differently, without exposing them", () => {
    expect(fingerprintOf(["order_1:ready"])).toBe(
      fingerprintOf(["order_1:ready"]),
    )
    expect(fingerprintOf(["order_1:ready"])).not.toBe(
      fingerprintOf(["order_1:preparing"]),
    )
    expect(fingerprintOf(["order_1:ready"])).not.toContain("order_1")
  })

  it("does not confuse a different split of the same text", () => {
    expect(fingerprintOf(["ab", "c"])).not.toBe(fingerprintOf(["a", "bc"]))
  })
})
