# Define management measures independently from project flow metrics

Agreed on 11 November 2026 in the issue #10 domain review. Business reporting uses the measures below so that the same label does not silently change its population, period or endpoints. These describe MTOGO Orders, separately from the team's Kanban work-item and Feature measures.

- Open Orders are paid Orders that are neither delivered nor cancelled/failed.
- Orders in the last 24 hours are Orders placed in that rolling period, with cancellations shown separately.
- Average Orders per day is the count placed across the previous seven complete Copenhagen calendar days divided by seven, including days with zero Orders.
- Average processing time is placement to confirmed handover for Orders delivered during the last 24 hours.
- Unresolved payments/refunds and deliveries needing operator attention are shown separately.
- Missing history or timestamps is unavailable, with exclusions visible, rather than invented values.

MTOGO operators see the platform overview and Restaurant staff only their Restaurant's information. The period and eligible population must remain visible so a daily volume measure cannot be confused with elapsed processing time or an average of incomplete records.

## Revision: operations monitoring measures

Agreed on 27 November 2026 in Feature #54 discovery #257. The teacher's suggested business metrics extend the measures above without changing their definitions:

- Orders per hour counts placements in each of the last 24 Copenhagen clock hours; an empty hour is a real zero.
- Unfulfilled Orders (%) is the share of ended Orders placed in the last 24 hours that ended without handover, whether cancelled or with a failed Delivery. Orders still open are left out of both numbers, so recent Orders cannot flatter the rate.
- Delivery transit time is confirmed pickup to confirmed handover, shown next to Order processing time so the two cannot be confused.
- Unassigned deliveries counts Open Orders whose Delivery has no agent yet.
- Average Customer rating reuses the Feedback statistics from Feature #51 and is never calculated a second way.

Uncertain and delayed payment results are not recorded in the MVP, because #134 and #135 were closed as not planned. "Unresolved payments/refunds" therefore shows unresolved Full refunds only. On-time deliveries (%) is left out until an estimated or promised arrival time exists (Feature #56): measuring against escalation thresholds would turn them into promises.
