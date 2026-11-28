import { staffOperations } from "../staff-view"

const figure = (name: string) => ({ name })
const day = (date: string) => ({
  date,
  processing_time: { average_seconds: 1800, included: 2 },
  delivery_transit_time: { average_seconds: 600, included: 2 },
})

/** A Restaurant's operations read, as the operator sees it (#264). */
const operatorView = {
  as_of: "2026-11-28T13:00:00.000Z",
  scope: { type: "restaurant", restaurant_id: "rest_scarpetta" },
  open_orders: figure("open_orders"),
  unassigned_deliveries: figure("unassigned_deliveries"),
  attention: figure("attention"),
  full_refunds: figure("full_refunds"),
  placements: figure("placements"),
  orders_per_hour: figure("orders_per_hour"),
  placements_per_day: figure("placements_per_day"),
  processing_time: figure("processing_time"),
  delivery_transit_time: figure("delivery_transit_time"),
  times_per_day: {
    period: figure("period"),
    processing_time: figure("processing_seven_days"),
    delivery_transit_time: figure("transit_seven_days"),
    days: [day("2026-11-21"), day("2026-11-22")],
  },
  unfulfilled_orders: figure("unfulfilled_orders"),
  customer_rating: null,
}

describe("Restaurant staff's operations", () => {
  it("keeps the staff measures with the operator's figures unchanged", () => {
    const view = staffOperations(operatorView)
    expect(view).toEqual({
      as_of: operatorView.as_of,
      scope: operatorView.scope,
      open_orders: operatorView.open_orders,
      placements: operatorView.placements,
      orders_per_hour: operatorView.orders_per_hour,
      placements_per_day: operatorView.placements_per_day,
      processing_time: operatorView.processing_time,
      times_per_day: {
        period: operatorView.times_per_day.period,
        processing_time: operatorView.times_per_day.processing_time,
        days: [
          {
            date: "2026-11-21",
            processing_time: { average_seconds: 1800, included: 2 },
          },
          {
            date: "2026-11-22",
            processing_time: { average_seconds: 1800, included: 2 },
          },
        ],
      },
      unfulfilled_orders: operatorView.unfulfilled_orders,
    })
  })

  it("never carries Full refunds, attention, unassigned deliveries, transit time or the Customer rating", () => {
    const text = JSON.stringify(staffOperations(operatorView))
    expect(text).not.toMatch(
      /full_refunds|attention|unassigned_deliveries|transit|customer_rating/,
    )
  })

  it("leaves out a measure the read gains later until the staff view names it", () => {
    const grown = { ...operatorView, revenue: figure("money") }
    const view = staffOperations(grown)
    expect(view).not.toHaveProperty("revenue")
  })
})
