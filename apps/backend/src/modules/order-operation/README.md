# Order Operations module

Registered as `orderOperations` (spec #47). Owns the operational side of a paid
Order, separate from Medusa's payment, fulfillment and Order status. Issue #140
adds the first part: one durable record per paid Order. Acceptance,
preparation, cancellation and refund facts arrive in later slices.

## Data model

| Model            | Owns                                                                                                                                                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OrderOperation` | `order_id` (unique), `restaurant_id`, `placed_at`, `acceptance_deadline`, `state` (`awaiting_acceptance`, `accepted`, `preparing`, `ready` or `cancelled`, default `awaiting_acceptance`), `revision` (default 1) and `purchased_items` (JSON, nullable) |
| `PurchaseReview` | `cart_id` (unique), `items` (JSON) and `reviewed_at`: the kitchen facts of the cart's last server-validated review                                                                                                                                       |

- **The record is the paid-placement fact.** The placement workflow creates it
  last, after capture and the Restaurant link, so an Order is placed exactly
  when its record exists. Customer and Admin visibility checks the record, not
  `state`, so later operational changes never hide a paid Order.
- **`order_id` and `restaurant_id` never change.** Restaurant ownership is
  recorded at placement, so closing or deactivating the Restaurant leaves its
  Orders readable by its staff.
- **`acceptance_deadline` is `placed_at` plus five minutes** (ADR-0009). At
  exactly the deadline acceptance is too late. The rule lives in
  `src/workflows/order-operations/rules.ts`.
- **Legacy Orders have no timing.** An Order placed before this module existed
  only carries `metadata.mtogo_order_state = awaiting_restaurant_acceptance`.
  The `legacy-order-placements` migration script gives each such Order, when it
  has a Restaurant link, a record with `placed_at` and `acceptance_deadline`
  `null`. Nothing invents a placement time or a fresh five-minute window for
  it, and staff see "Timing unknown". The script is idempotent.

- **Purchased kitchen facts are frozen at review (#141).** When completion's
  basket review passes, under the cart lock, the `validate` hook in
  `src/workflows/hooks/restaurant-basket.ts` stores each dish's Danish and
  English names, allergen declaration (Annex II numbers, codes, specific
  types) and food labels (codes, names, descriptions and `yes`/`no`/`unknown`) as the cart's
  `PurchaseReview`, replacing an earlier review of the same cart. A completed
  cart is not reviewed again, so its review stays frozen. Placement copies the
  items onto `purchased_items` when it creates the record, so a delayed or
  retried placement uses the reviewed facts, never the live menu, and a placed
  record is never rewritten. The same placement then soft-deletes the cart's
  review (compensated by restoring it), and a completion that fails after the
  review removes or restores it, so stored reviews belong only to paid Orders
  still awaiting placement. Quantities and prices stay in Medusa's Order line
  items; the kitchen read joins the two by variant
  (`src/workflows/order-operations/purchased-items.ts`).
- **Older records have no purchased facts.** Records placed before #141, and
  legacy records, keep `purchased_items` `null`; staff see the retained title
  and "unavailable" information. Nothing is backfilled from the current menu.
  The read keeps each well-formed stored entry, so a single damaged entry
  makes only its own line "unavailable".

Indexes: unique `order_id`; unique `PurchaseReview.cart_id`; `(restaurant_id, state, acceptance_deadline, id)`
for the awaiting queue and `(restaurant_id, state, placed_at, id)` for the
active and history views. The queue filters, orders and paginates in the
module (`listAndCountOrderOperations`).

## Link

`src/links/order-order-operation.ts` is a read-only, one-to-one link from the Order
(`id`) to the record (`order_id`). Query reads it as `order.order_operation`;
there is no link table, so creating the record is the single write that
places the Order. Customer and Admin Order reads do not use the link inside Medusa's
list workflow: `withOrderOperations` in `src/workflows/orders` attaches the
records with one indexed `order_id` query, which kept the Order history
concurrency gate (20 journeys, p95 under two seconds) at about 1.6 s locally
instead of 1.7 to 2.3 s.

## Reads

`listPartnerOrdersWorkflow` and `retrievePartnerOrderWorkflow` in
`src/workflows/order-operations` check the staff record first (revoked access is
refused), then read the Restaurant's records and the Orders' purchase snapshot
(reference, items, quantities, prices) with each line's purchased kitchen facts. See `GET /partner/orders` in
[the API documentation](../../api/README.md).

## Verification

`integration-tests/http/partner-orders.spec.ts` covers placement and retries, purchased kitchen facts across menu edits,
removal and an interrupted placement, unknown versus empty declarations,
Customer/Admin visibility by state, queue order and pagination, views, closed
and deactivated Restaurants, legacy timing, refusals and the twenty-journey
queue-read target. `src/workflows/order-operations/__tests__/rules.unit.spec.ts`
covers the deadline boundary and the view definitions.

Measured locally in the devcontainer (in-process HTTP runner, disposable
PostgreSQL, one Restaurant with five awaiting Orders, twenty simultaneous
journeys of one queue read plus one detail read), two runs on 18 November
2026: p50 275 and 347 ms, p95 590 and 748 ms,
against the agreed 95% within two seconds.
