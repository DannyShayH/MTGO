import { lastThirtyDays } from "../statistics-period"

describe("Feedback statistics period", () => {
  it("spans exactly thirty 24-hour days across the Copenhagen daylight-saving change", () => {
    const period = lastThirtyDays(new Date("2026-04-01T12:00:00.000Z"))
    expect(period).toEqual({
      key: "last_30_days",
      from: new Date("2026-03-02T12:00:00.000Z"),
      to: new Date("2026-04-01T12:00:00.000Z"),
    })
  })
})
