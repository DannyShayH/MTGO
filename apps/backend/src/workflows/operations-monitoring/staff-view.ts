/** The per-day times as the operations read gives them (#262). */
type TimesPerDay<Processing, Day> = {
  period: unknown
  processing_time: Processing
  delivery_transit_time: unknown
  days: (Day & { date: string; delivery_transit_time: unknown })[]
}

/** The measures of one Restaurant's operations read the staff view draws on. */
type RestaurantFigures<Processing, Day> = {
  as_of: string
  scope: unknown
  open_orders: unknown
  placements: unknown
  orders_per_hour: unknown
  placements_per_day: unknown
  processing_time: unknown
  times_per_day: TimesPerDay<Processing, Day>
  unfulfilled_orders: unknown
}

/**
 * Restaurant staff's subset of their own Restaurant's operations read (#264):
 * an allow-list of the measures staff see, with the same definitions the
 * operator's Restaurant view uses. Full refunds, attention items,
 * unassigned deliveries, Delivery transit time and the platform's Customer
 * rating are operator figures, so a measure added to the read later stays
 * out of the staff response until it is named here.
 */
export const staffOperations = <
  Processing,
  Day extends { processing_time: unknown },
>(
  figures: RestaurantFigures<Processing, Day>,
) => ({
  as_of: figures.as_of,
  scope: figures.scope,
  open_orders: figures.open_orders,
  placements: figures.placements,
  orders_per_hour: figures.orders_per_hour,
  placements_per_day: figures.placements_per_day,
  processing_time: figures.processing_time,
  times_per_day: {
    period: figures.times_per_day.period,
    processing_time: figures.times_per_day.processing_time,
    days: figures.times_per_day.days.map(({ date, processing_time }) => ({
      date,
      processing_time,
    })),
  },
  unfulfilled_orders: figures.unfulfilled_orders,
})
