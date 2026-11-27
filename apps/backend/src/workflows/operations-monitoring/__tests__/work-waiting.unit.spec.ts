import {
  attentionFigure,
  fullRefundFigure,
  unassignedDeliveriesFigure,
  unassignedWaitingCutoff,
} from "../work-waiting"

const now = new Date("2026-11-27T12:00:00.000Z")
const at = now.toISOString()

describe("Unassigned deliveries waiting over ten minutes", () => {
  // The strict comparison at the cutoff runs in the database: the HTTP spec
  // reads it through the workflow with an explicit now on each side.
  it("puts the cutoff exactly ten minutes before now", () => {
    expect(unassignedWaitingCutoff(now).toISOString()).toBe(
      "2026-11-27T11:50:00.000Z",
    )
  })

  it("states two unassigned, one waiting over ten minutes, at the moment of the read", () => {
    expect(unassignedDeliveriesFigure({ total: 2, waiting: 1 }, at)).toEqual({
      period: { at },
      total: 2,
      waiting_over_ten_minutes: 1,
      exclusions: [],
    })
  })
})

describe("Deliveries needing attention", () => {
  it("names every attention type in the deliveries page order, zero when none is outstanding", () => {
    expect(attentionFigure([], at)).toEqual({
      period: { at },
      total: 0,
      types: [
        { type: "unassigned", count: 0, waiting_unassigned_orders: 0 },
        { type: "access_revoked", count: 0 },
        { type: "assigned_without_pickup", count: 0 },
        { type: "in_transit_without_delivery", count: 0 },
        { type: "arrived_without_handover", count: 0 },
        { type: "agent_reported_problem", count: 0 },
      ],
      exclusions: [],
    })
  })

  it("marks unassigned items that are the same Orders as the deliveries waiting over ten minutes", () => {
    const figure = attentionFigure(
      [
        { type: "unassigned", count: 1, waiting_unassigned: 1 },
        { type: "agent_reported_problem", count: 2, waiting_unassigned: 0 },
      ],
      at,
    )
    expect(figure.total).toBe(3)
    expect(figure.types[0]).toEqual({
      type: "unassigned",
      count: 1,
      waiting_unassigned_orders: 1,
    })
    expect(figure.types[5]).toEqual({
      type: "agent_reported_problem",
      count: 2,
    })
  })
})

describe("Unresolved Full refunds", () => {
  it("counts pending and failed separately and totals them", () => {
    expect(fullRefundFigure({ pending: 1, failed: 1 }, at)).toEqual({
      period: { at },
      total: 2,
      pending: 1,
      failed: 1,
      exclusions: [],
    })
  })
})
