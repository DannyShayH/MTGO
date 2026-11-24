# Order Operations module

Registered as `orderOperations` (spec #47). Owns the operational side of a paid
Order, separate from Medusa's payment, fulfillment and Order status. Issue #140
adds the first part: one durable record per paid Order. Issue #142 adds the
acceptance milestone, #143 the cancellation and its full-refund
obligation, #146 the preparation-start and readiness milestones, #162
the thirty-minute unassigned cancellation and its prepared-food credit, and
issue #199 the Operator cancellation.

## Data model

| Model              | Owns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OrderOperation`   | `order_id` (unique), `restaurant_id`, `placed_at`, `acceptance_deadline`, `state` (`awaiting_acceptance`, `accepted`, `preparing`, `ready` or `cancelled`, default `awaiting_acceptance`), `revision` (default 1), `purchased_items` (JSON, nullable), `financial_basis` (JSON, nullable, #226), `accepted_at` and `accepted_by` (both `null` until accepted), `preparation_started_at`/`preparation_started_by` and `ready_at`/`ready_by` (each `null` until recorded), `cancelled_at`, `cancelled_by` (staff, Customer or operator id, or `system`), `cancellation_category` (`restaurant_rejected`, `acceptance_timeout`, `customer_cancelled`, `unassigned_timeout` or `operator_cancelled`), `cancellation_note` and `native_cancelled_at` (all `null` until cancelled), `delivery_outcome` (`delivered` or `not_delivered`) and `delivery_ended_at` (both `null` until the delivery ends, #204) |
| `RefundObligation` | `order_id` (unique), `payment_id`, `amount` (captured minus already refunded, incl. VAT), `currency_code`, `idempotency_key` (unique, `mtogo-full-refund:{order_id}`), `status` (`pending`, `failed` or `succeeded`), `attempt_count`, `last_attempted_at`, `failure_code` (a safe class, never a provider message), `refund_id` and `succeeded_at`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `RefundAttempt`    | One real refund attempt, only ever added to (#197): `refund_obligation_id`, `order_id`, `attempted_at`, `attempted_by` (the operator, staff or Customer id that triggered it, or `system`), `outcome` (`succeeded`, `failed` or `in_progress`) and `failure_code` (the safe class of a failed attempt, else `null`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `FoodCredit`       | `order_id` (unique), `restaurant_id`, `amount` (full food value excl. VAT), `currency_code`, `commission_amount` (always 0), `funded_by` (`mtogo`), `reason` (the cancellation category) and the copied preparation evidence `preparation_started_at` and `ready_at` (#162)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `PurchaseReview`   | `cart_id` (unique), `items` (JSON) and `reviewed_at`: the kitchen facts of the cart's last server-validated review                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

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
  No rule can time such an Order out, so an operator ends the ones still
  awaiting with `src/scripts/cancel-legacy-awaiting-orders.ts`
  (`cancelLegacyAwaitingOrdersWorkflow`, `legacy-cancellation.ts`). Without
  arguments it only lists them; with `apply` it cancels each, under the
  Order's lock and revision guard, as `acceptance_timeout` by `system` with
  its full-refund obligation, then runs the shared settlement as `system`.
  No deadline is invented: the cancellation takes effect when processed.
  Accepted legacy work, and anything that changed meanwhile, is left alone,
  and a repeat finds nothing.

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
- **The purchased financial basis is frozen at placement (#226).** The same
  create that records the paid placement stores `financial_basis`: the
  Restaurant's agreement in force (id, `terms_version`, `agreed_at`) with the
  common terms' VAT rate, commission bands and monthly service fee, the
  native Order `version` and currency, and each line's id, variant, quantity
  and exact unit price including VAT (`src/workflows/order-operations/financial-basis.ts`).
  Ownership and placement time are the record's own immutable fields. It is
  recorded whatever the `restaurant_statements` flag says and never changed,
  so later menu prices or a new agreement do not rewrite it. When the facts
  are incomplete (no agreement, unknown terms, a line without a price or not priced including VAT) a warning `financial_basis_unavailable` is logged and it is
  `null` instead of failing the paid placement. Older records also keep
  `null`; staff then see the basis as unavailable, never a current-menu or
  current-terms backfill.

Indexes: unique `order_id`; `RefundObligation (status, created_at, id)` for
the recovery sweep and the Refunds page (#198); unique `PurchaseReview.cart_id`; `(restaurant_id, state, acceptance_deadline, id)`
for the awaiting queue and `(restaurant_id, state, placed_at, id)` for the
active and history views. `(restaurant_id, updated_at)` serves the kitchen
feed's bounded read of recently changed records (#148). Any persisted
operational change must raise `revision`, an undo included (the acceptance
compensation writes a newer revision, not the old one): the feed announces
each Order revision once. The queue filters, orders and paginates in the
module (`listAndCountOrderOperations`).

## Transitions

Every transition takes the Order's lock (`orderOperationLock`, key
`order-operation:{order_id}`) through Medusa's locking module, re-reads the
record and writes the new state with `revision + 1` in one update whose
selector includes the revision it read. That is the persisted guard: a write
based on a stale read matches nothing and is refused with `order_changed`.

- **Accept** (`acceptPartnerOrderWorkflow`, #142): allowed while
  `awaiting_acceptance` and strictly before `acceptance_deadline`, decided by
  `decideAcceptance` in `src/workflows/order-operations/rules.ts` with the
  server's time at the transition. It records `accepted_at` (that time) and
  `accepted_by` (the staff id). An Order with `accepted_at` already set returns
  its current outcome unchanged, so repeats and competing staff never record a
  second acceptance. Acceptance does not touch the native Order, preparation,
  assignment or pickup.
- **Start preparation** (`startPartnerOrderPreparationWorkflow`, #146): allowed
  only while `accepted`; writes `state: preparing`, `preparation_started_at`
  and `preparation_started_by`.
- **Ready** (`markPartnerOrderReadyWorkflow`, #146): allowed only while
  `preparing`; writes `state: ready`, `ready_at` and `ready_by`. Readiness
  never invents a preparation start, and is not pickup, delivery or native
  Order completion.

The three milestones share `transitionRestaurantOrderStep` and the transition
table `ORDER_TRANSITIONS` with `decideTransition` in `rules.ts`. A cancelled
Order is refused (`order_cancelled` for the kitchen milestones); otherwise a
recorded milestone returns the current outcome unchanged, so repeats and
competing staff never move it, and staff cannot undo it. No milestone depends
on a Delivery agent, and only acceptance depends on the deadline. If a later
step of the same request fails, compensation restores the previous state under
a newer revision, so the kitchen feed (#148) announces the change.

- **Reject** (`rejectPartnerOrderWorkflow`, #143): decided by
  `decideCancellation` in `rules.ts`. While awaiting and before the deadline
  it records `restaurant_rejected`; at or after the deadline the same request
  records `acceptance_timeout` by `system`, the outcome the later timeout
  sweep gives (#144). Accepted work and legacy Orders without a deadline are refused.
  The shared engine in `cancellation.ts` does the work for every
  pre-acceptance cancellation: `commitPreAcceptanceCancellation` calls
  `cancelWithRefundObligation`, which commits the cancellation and the Order's one
  `RefundObligation` in one transaction, guarded like acceptance, before any
  provider call. It has no compensation: a committed cancellation is
  authoritative. `settleCancellation` then runs `attemptFullRefund`
  (`full-refund.ts`) and `syncNativeOrderCancellationWorkflow`
  (`native-cancellation.ts`) under the Order's settlement lock
  (`order-settlement:{order_id}`). Neither can throw past it and both are
  idempotent. Rejection, Customer cancellation and the timeout recovery use this engine;
  there is no second refund path.
  A refund is `succeeded` only when the payment's persisted refund with the
  obligation's key succeeded for its amount. The pure decisions (owed amount,
  failure class, the outcome an attempt records and the native cancellation
  plan) live in `refund-rules.ts`, covered by `refund-rules.unit.spec.ts`. The installed payment module
  soft-deletes a failed refund row, so the obligation is the lasting record.
  An unset `native_cancelled_at` marks native synchronization still to repair.
  `attemptFullRefund` decides from the payment as it is now
  (`refundAttemptPlan`). Only a `pending` obligation is attempted. A refund
  already persisted as succeeded under the obligation's key is recorded
  without calling the provider, which covers a lost response. A payment
  refunded under another key since cancellation is marked `failed` with
  `refund_exceeds_remaining` instead of being over-refunded. A `failed`
  obligation stays owed until an operator retries it (#198, below).

  **Attempt history (#197).** Every real attempt ends in
  `recordRefundAttempt`, which writes the outcome on the obligation and one
  new `RefundAttempt` in one transaction. An attempt the provider still holds
  is `in_progress` with no failure code; a refused over-refund is `failed`
  with `refund_exceeds_remaining`; recording an already persisted refund is
  `succeeded` without contacting the provider. A plan that leaves the
  obligation untouched (anything not `pending`) writes nothing, so repeats and
  sweeps that pass a failed or succeeded refund add no entry. Nothing updates
  or deletes an entry. If the process stops before the outcome commits, that
  attempt leaves no entry, and the sweep that later records it adds its own.
  `attemptFullRefund` takes `attempted_by` explicitly through
  `settleCancellation`: the request that cancelled passes the cancellation's
  recorded actor (staff, Customer, or `system` for a timeout outcome), while the
  recovery sweep, the unassigned timeout and a claim refused at the deadline
  pass `system`. Medusa's refund row keeps crediting `created_by` to the
  cancellation's actor, as before. Each entry also writes one
  `refund.attempted` log record with only `order_id`, `actor_type`/`actor_id`
  (`actor_type` from the id prefix: `user`, `restaurant_staff`, `customer`, or
  `system`) and `outcome`, never the amount, provider text or notes
  (ADR-0019). The pure mappings are `refundAttemptEntry` and
  `refundAttemptActor` in `refund-rules.ts`.

- **Operator retry and the Refunds page** (#198): `retryFullRefundWorkflow`
  (`retryFullRefund` in `refunds.ts`) takes the Order's settlement lock,
  re-reads the obligation and decides with `decideRefundRetry`
  (`refund-rules.ts`): only `failed` is retried, `succeeded` returns the
  current outcome (a retry that waited behind another), `pending` is refused
  with `refund_not_failed` and a missing obligation with `refund_not_found`.
  A retry moves the obligation from `failed` back to `pending` (a write
  guarded on `failed`) and runs the same `attemptFullRefund` with the
  operator as `attempted_by` and `created_by`, so it keeps every guarantee
  above: stored amount and key, a persisted refund recorded without the
  provider, nothing sent on top of money refunded elsewhere. It adds no
  second refund path and no compensation. Should the attempt throw, the
  obligation stays `pending` for the recovery sweep.
  `listOpenRefundsWorkflow` (`listOpenRefunds`) pages `failed` and `pending`
  obligations by `status` then `created_at` (the text order puts `failed`
  first), with each Order's reference, Restaurant, cancellation and attempt
  history, naming operators from the User module and staff from the
  Restaurant module. See `GET /admin/refunds` in
  [the API documentation](../../api/README.md).

- **Customer cancellation** (`cancelCustomerOrderWorkflow`, #145): the owning
  Customer's request runs the same lock, `commitPreAcceptanceCancellation` and
  `settleCancellation` as Reject, requesting `customer_cancelled` with the
  Customer's id as `cancelled_by` and no note. At or after the deadline the
  same request records `acceptance_timeout` by `system`, even before the sweep
  has run; accepted work and legacy Orders are refused for an operator. The
  progress read lists `cancel` in `available_actions` exactly while this would
  be recorded as `customer_cancelled` (`customerActions` in `rules.ts`).

- **Timeout and recovery** (`recoverOrderOperationsWorkflow`, #144): run by
  the `recover-order-operations` job every minute on the worker, so the first
  tick after a worker starts is the startup reconciliation. It uses only
  durable records, never a browser timer or a surviving Redis event. Each
  sweep takes at most `RECOVERY_BATCH_SIZE` (50) records of each kind:
  - awaiting Orders with `acceptance_deadline <= now` are cancelled as
    `acceptance_timeout` by `system`, under the Order's lock with the shared
    `decideCancellation` rule (a timeout request while the window is open is
    refused with `acceptance_window_open`, and accepted Orders are never
    touched);
  - cancelled Orders with `native_cancelled_at` unset, and every `pending`
    obligation, are settled again.

  `cancelled_at` records the processing time and the deadline is never moved,
  so downtime grants no new acceptance window. Reads expose
  `cancellation.effective_at`: the deadline for a timeout, else `cancelled_at`.
  A provider or native-step failure is logged as `upstream.request.failed`;
  any other failure on one Order (a lock held too long, an unexpected error)
  as `request.failed` with the safe error (`recovery-log.ts`). Either way the
  work stays in its durable record for the next sweep. Pending obligations are
  taken least recently updated first, so one that stays in progress cannot
  starve the rest.

- **Unassigned timeout** (#162; ADR-0011): accepted work still unassigned
  at its claim deadline (the durable acceptance time plus thirty minutes,
  stored on the delivery as `claim_deadline`) is cancelled as
  `unassigned_timeout` by `system`. `commitUnassignedCancellation` in
  `unassigned-cancellation.ts` runs under the Order's guard
  (`order-operation:{order_id}`), the key the claim and the operator's
  initial assignment hold while they decide, so one of them is always first:
  an assignment strictly before the deadline prevents the cancellation, and
  no claim survives a committed cancellation. The rule is
  `decideUnassignedCancellation` in `unassigned-cancellation-rules.ts`. The
  write is `cancelWithRefundObligation`, guarded by the revision and the
  accepted, preparing or ready state it read, which commits the
  cancellation, the full-refund obligation and, when `preparation_started_at`
  is recorded strictly before the claim deadline, the one `FoodCredit` in one
  transaction. Mere acceptance is not evidence of prepared food, so it owes no
  credit. The credit is
  `preparedFoodCredit`: the purchased lines' unit price times quantity,
  divided by 1.25 (the assumed 25% VAT included in menu prices), rounded once
  to two decimals with halves away from zero; MTOGO funds it and no
  commission is charged (ADR-0006). Settlement is the shared
  `settleCancellation`.

  It happens at whichever comes first: a claim or operator assignment refused
  with `claim_deadline_passed` commits it under the guard it already holds, a
  kitchen milestone (start preparation, ready) commits it before deciding and
  is refused with `order_cancelled`, or the recovery sweep. The claim settles
  at once; the kitchen request leaves settlement to the next sweep so the
  Order's lock is never held during a provider call. In the same guarded
  section the commit ends the delivery as `cancelled` by `system` through the
  shared terminal boundary (`endDeliveryForOrder`, #161); an Order that had
  already ended by another path has its unassigned delivery ended the same
  way, while work that already ended keeps its outcome. The sweep reads
  deliveries with `assigned_agent_id` and `terminal_outcome` unset and
  `claim_deadline <= now`, earliest first, `RECOVERY_BATCH_SIZE` per tick, so
  a processed deadline is never read again. A lost race or an error (which is
  logged) leaves it for the next tick. `cancelled_at` is the processing
  time and `effective_at` the deadline, so downtime grants no new window.
  Staff reads add `food_credit`; the Customer never sees it. Statements and
  payouts are #52.

- **Operator cancellation** (`cancelAcceptedOrderWorkflow`, #199; ADR-0011):
  after acceptance only an operator may cancel, always with a full refund.
  `commitOperatorCancellation` in `operator-cancellation.ts` runs under the
  Order's guard, the key claim, pickup, handover and the kitchen milestones
  also hold, re-reads the record and its delivery and decides with
  `decideOperatorCancellation` (`operator-cancellation-rules.ts`): `accepted`,
  `preparing` and `ready` Orders are cancelled whether their delivery is
  unassigned, assigned or picked up; an Order awaiting acceptance is refused
  with `order_not_accepted`; an Order whose handover committed (on the
  delivery or already copied to `delivery_outcome`) is refused with
  `order_delivered`; a cancelled Order returns its recorded outcome. The
  write is `cancelWithRefundObligation` with `operator_cancelled`, the
  operator's user id as `cancelled_by` and the required reason as
  `cancellation_note` (control characters removed, trimmed, at most 1000
  characters, like rejection reasons). When `preparation_started_at` is set
  it also commits the one MTOGO-funded `FoodCredit` with #162's calculation.
  Still under the guard the delivery ends as `cancelled` by the operator
  through `endDeliveryForOrder`: the agent's capacity is released, earlier
  milestones stay and open attention is resolved as `order_ended`. Only the
  request that cancelled then runs `settleCancellation` with the operator as
  the attempt's actor and records the delivery end on the Order (#204); a
  provider failure leaves the obligation `failed` for the Refunds page and
  never reactivates the Order. A repeat finds the recorded cancellation and
  ends a delivery an interrupted request left active, as the cancellation's
  actor; the recovery sweep settles whatever settlement is still owed. Staff reads show the category but never the
  operator's reason; the Customer sees neither.

## Delivery end (#204)

`state` ends with the kitchen at `ready`. When the Order's delivery ends,
the delivery workflows copy how and when onto `delivery_outcome` and
`delivery_ended_at`, once, with `revision + 1`, so the kitchen feed announces
it (see the Delivery module README). The fields are never moved. The `active`
view leaves out Orders with a `delivery_outcome`, and `history` holds
cancelled Orders plus Orders whose delivery ended (`VIEWS` in `rules.ts`). A
cancelled Order's cancellation stays the reason it ended, so the
`delivery_outcome` filter leaves cancelled Orders out.
`integration-tests/http/partner-order-delivery-outcome.spec.ts` covers the
handover and a not-delivered end moving an Order from `active` to `history`,
the filters, another Restaurant's staff, the recovery sweep and the backfill.

## Link

`src/links/order-order-operation.ts` is a read-only, one-to-one link from the Order
(`id`) to the record (`order_id`). Query reads it as `order.order_operation`;
there is no link table, so creating the record is the write that places the
Order. The same placement then copies the record id onto the Order as
`metadata.mtogo_paid_placement` (#154), and its compensation removes it again.
The copy exists only so Customer and Admin Order lists can filter on placement
in one query; detail reads and every rule still check the record. The
`order-placement-markers` migration script marks Orders placed before #154,
and is idempotent. Customer and Admin Order reads do not use the link inside Medusa's
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

`readPartnerOrderFeedWorkflow` is one tick of the kitchen feed
(`GET /partner/orders/stream`): it checks the staff record, then
`readOrderFeedStep` reads the `order_id` and `revision` of the Restaurant's
records updated in the last 30 seconds and `advanceOrderFeed` in
`order-feed.ts` turns the revisions the connection has not announced yet into
hints. The route keeps only the announced revisions (by Order id) between ticks.

The feed's limits are deliberate: a read takes at most 200 records, newest
first, and the window assumes the server and worker clocks agree within 30
seconds (they stamp `updated_at`). A change outside either limit is not
hinted, and the partner app's reload every minute picks it up.

## Verification

`integration-tests/http/partner-orders.spec.ts` covers placement and retries, purchased kitchen facts across menu edits,
removal and an interrupted placement, unknown versus empty declarations,
Customer/Admin visibility by state, queue order and pagination, views, closed
and deactivated Restaurants, legacy timing, refusals and the twenty-journey
queue-read target, and acceptance: recorded facts, visibility after acceptance,
retried placement, repeated and competing acceptance, refusals with the
current outcome, closed and deactivated Restaurants, and own, foreign and
revoked access. `src/workflows/order-operations/__tests__/rules.unit.spec.ts`
covers the deadline boundary, the view definitions, the acceptance decision
table (before, at and after the deadline; repeat; cancelled; legacy), the
pre-acceptance cancellation table, the rejection reason and the kitchen
milestone table (legal, out-of-order, repeated, later-milestone and cancelled
cases, and the next available actions per state). The same HTTP suite
covers the kitchen feed: new Orders, a persisted change, Restaurant isolation,
reconnection, refusals, revocation and token expiry during a connection, the
first heartbeat, a failed read closing the stream without `ended`, and that a
closed connection stops reading. `order-feed.unit.spec.ts` covers
duplicate and out-of-order revisions.
`integration-tests/http/partner-order-rejection.spec.ts` covers rejection
with and without a reason, its bounds, refused client fields, repeats and a
competing rejection (one refund, one credit line), an explicitly failing mock
provider (cancellation kept, refund `failed`), an interrupted native
cancellation (Order stays cancelled, `native_cancelled_at` unset), the timeout outcome, accepted
and legacy refusals, history, access, and the Customer progress read.
`integration-tests/http/partner-order-preparation.spec.ts` (#146) covers
preparation and readiness with recorded time, actor and revision and no native
fulfilment, the milestones in the Customer's progress without actors, repeated
and competing milestones, out-of-order and cancelled refusals, closed and
deactivated Restaurants, client-supplied fields and signed-out, Customer,
foreign and revoked callers.
`integration-tests/http/delivery-unassigned-cancellation.spec.ts` (#162)
covers the sweep 1 ms before and exactly at acceptance plus thirty minutes,
the prepared-food credit (amount, evidence, no commission, one record across
repeated sweeps), assigned work never cancelled, recovery after downtime, a
claim exactly at the boundary cancelling before any sweep, an HTTP claim and
an operator assignment racing the sweep (one cancellation, one refund), a
claim 1 ms before the deadline racing the sweep at it, a failing mock
provider, an interrupted refund resumed without a second movement or credit,
and attention, available and unclaimed lists after the cancellation.
`unassigned-cancellation-rules.unit.spec.ts` covers the decision table and
the credit amount.
`integration-tests/http/operator-refunds.spec.ts` (#198) covers the Refunds
list (contents, failed-before-pending and oldest-first order, filter, paging,
query bounds), a retry that succeeds once with the operator's attempt, double
and concurrent retries moving money once, a lost provider response recorded
without the provider, money refunded elsewhere not sent on top, a declined
retry staying listed, a retry whose outcome was lost resumed by the sweep,
the retry's one safe `refund.attempted` record, System, Customer and unnamed
operator actors, pending and unknown refusals, operator-only access and the
`seed-demo-failed-refund.ts` fixture the browser journey uses.
`refund-rules.unit.spec.ts` covers the retry decision and the actor shown.
`integration-tests/http/customer-order-cancellation.spec.ts` (#145) covers
the owning Customer's cancellation and its one refund, foreign, unknown and
signed-out callers without effects, refused client fields, refusal after
acceptance with the current progress, the timeout outcome before any sweep, a
legacy Order, a double tap and retried lost response, a race with acceptance
and an explicitly failing mock provider.

Measured locally in the devcontainer (in-process HTTP runner, disposable
PostgreSQL, one Restaurant with five awaiting Orders, twenty simultaneous
journeys of one queue read plus one detail read), two runs on 18 November
2026: p50 275 and 347 ms, p95 590 and 748 ms,
against the agreed 95% within two seconds.

The kitchen feed's cost per open screen was measured the same day against
`medusa develop` in split mode (separate server and worker processes on
Redis, disposable PostgreSQL), with 0, 10, 25 and 50 feeds open on one
Restaurant. The server process used about 3, 16, 14 and 26% of one CPU with no
other traffic, and 20 simultaneous queue-plus-detail journeys (three rounds)
stayed at p95 1113, 1055, 848 and 837 ms: open feeds did not slow the reads.
The same run confirmed that a change written by a separate Medusa process
reaches an open feed within the one-second tick.
