# Delivery module

`IntendedDelivery` stores one record per accepted paid Order. Its unique Order
identity preserves the original acceptance time and thirty-minute claim
deadline across retries. It retains the pickup address and historical destination
postal code, but no Customer name, street, phone or instructions. The available
read checks agent authorization, both approved postal codes and the deadline.
Unrecorded legacy acceptance stays unavailable.

The accepted-order backfill runs during `db:migrate`; fresh acceptance establishes
the record in the same workflow. Available reads traverse bounded candidate
batches and check current Order operation state before returning each page.

`GET /partner/delivery-agent/available` returns a bounded page with `limit`,
`offset`, optional comma-separated `postal_codes`, `has_more` and `server_time`.
The detail route accepts an Order ID and returns the same protected projection.

Owns Delivery agent identity and authorization, the current invitation, and the
operator-approved Danish postal codes. The generated migration creates these
records without changing Restaurant staff identities. Revocation keeps the agent
record and increments its authorization revision. Invitation consumption and
area replacement lock the agent row; area replacement changes the codes and
revision and constructs the response in one transaction. Area workflow compensation
restores the previous codes only if no later authorization change has occurred.
The Admin editor requires a successful area read before enabling edits. Future claim checks must use the same row and
revision, and must retain responsibility-based access for assigned work after
an area change.

A distinct `delivery_agent` actor uses the `delivery-agent-emailpass` provider.
Credentials alone never grant access: each workspace request checks the durable
agent status. An invitation expires after 24 hours, is single-use, and can be
revoked. Invitation tokens are sent through the notification provider and
looked up in a request body, not an HTTP path. The private mailbox captures
messages in disposable tests. Approval is limited to four-digit codes in the
postal-code register; an empty list grants no operating area.

## API

### Problem reports (#200)

An authorized agent holding an assigned or picked-up Delivery may report one
problem. The guarded write takes the agent and Order locks, checks the Delivery
row and Order state, then inserts `agent_reported_problem` attention with
`due_at` and `raised_at` set to the server's report time. Its unique Order/type
index keeps the first category, cleaned note and reporter on concurrent or
repeated requests. Reporting never updates responsibility or milestones. The
existing terminal boundary resolves the attention when the Order ends.

The four categories are `restaurant_unavailable`, `food_missing_or_wrong`,
`address_not_found` and `other`. The optional note is at most 280 characters;
control characters are removed and an empty note is stored as `null`. It is
never included in application logs. Admin's existing attention list shows the
category, note, reporter and age.

- `GET /admin/delivery-agents` lists agents; `POST` accepts `{ name, email }`
  and sends an invitation.
- `POST /admin/delivery-agents/{id}/revoke` revokes access or a pending invite.
- `GET /admin/delivery-agents/{id}/areas` reads codes and authorization revision;
  `POST` replaces them using `{ postal_codes: string[] }`.
- `POST /partner/delivery-agent-invitations/open` accepts `{ token }` and
  returns the invited identity. `POST /partner/delivery-agent-invitations/accept`
  accepts the same body with an unregistered delivery-agent bearer identity.
- `GET /partner/delivery-agent/me` requires an authorized agent bearer and
  returns the current approved codes as `postal_codes` and, with their
  register town names, `areas: [{ postal_code, name }]` (#157).
- `POST /partner/delivery-agent/pickup-distances` accepts the agent's
  position and the listed Order IDs and returns route distances to their
  pickups (#191; see Distances below).

The partner website keeps the bearer in its httpOnly cookie. Its saved area
filter is intersected with current permissions and cannot grant access. Progress after
assignment (pickup, arrival, contact attempts, handover) and the terminal release of
capacity are described below.

## Demo login (#157)

`src/scripts/seed-demo-delivery-agent.ts` makes an authorized agent login
without the invitation email, for local or disposable databases only:

```bash
SEED_AGENT_EMAIL=agent@mtogo.local SEED_AGENT_PASSWORD=<8+ chars> \
  NODE_ENV=development npx medusa exec ./src/scripts/seed-demo-delivery-agent.ts
```

It approves every Restaurant's own postal code and delivery-area codes, or
`SEED_AGENT_POSTAL_CODES` (comma-separated) instead. A rerun sets the password
and areas again.

## Assignment (#157)

`IntendedDelivery` also records the one responsibility: `assigned_agent_id`
(historical, never changed once set), `active_agent_id` (the active-capacity
hold), `assigned_at`, `assigned_by` (the claiming agent, or the operator's
user ID), `assignment_source` (`agent_claim` or `operator_assignment`) and
`assignment_request_id` (the retry identity). Partial unique indexes on
`active_agent_id` and `assignment_request_id` make one active delivery per
agent and one assignment per retry identity database guarantees.

`assignDelivery` is the only write. In one transaction it locks the agent row,
then the delivery row, re-reads the agent's current areas, active hold and
retry identity, applies the rule passed in by the workflow
(`decideAssignment` in `src/workflows/delivery/assignment-rules.ts`) and
writes responsibility and hold in one update whose selector requires the
delivery to be unassigned. `assignDeliveryStep` calls it while holding the
locking-module keys `delivery-agent:{agent_id}` then
`order-operation:{order_id}`, the Order's authoritative guard, in that order,
and reads the Order's state under them. With Redis configured these locks and
the row locks serialize separate server and worker processes. The deadline is
decided with the server's time taken under those locks, and an inactive Order
is refused before a repeat is recognized, so no claim survives a committed
terminal outcome. Nothing
releases a committed assignment: there is no compensation, release or
reassignment; alerts and repeats leave it in place. Revocation keeps it.

A claim or assignment refused with `claim_deadline_passed` on unassigned work
cancels the Order under the same held guard (#162; see the Order Operations
module). In the same guarded section the unassigned delivery ends as
`cancelled` through `endDeliveryForOrder`, the terminal boundary below, so
the recovery sweep reads each expired delivery once (partial index on
`claim_deadline, id` where unassigned and not ended). It held no capacity,
and the ended Order resolves its attention as `order_ended`.

`integration-tests/http/delivery-assignment.spec.ts` covers claims and their
Customer-contact privacy, retries and reused retry identities, two agents
racing for one delivery and one agent for two, refusals (areas, deadline,
inactive Order, unaccepted work, other actors, revocation), the deadline at
exactly and 1 ms before acceptance plus thirty minutes through the workflow's
server-time input, responsibility after an area change, the operator list and
assignment, operator races with a claim, another operator, an area change and
revocation, and twenty concurrent current-delivery reads (measured locally
on 19 November 2026 with the in-process runner: p95 223 ms, against the
agreed 95% within two seconds).
`src/workflows/delivery/__tests__/assignment-rules.unit.spec.ts` covers the
decision table.

## Revoking agent access (#159)

`POST /admin/delivery-agents/{id}/revoke` holds the agent's capacity key
`delivery-agent:{agent_id}` (the key claims, initial assignments and pickups
take first), locks the agent row, marks the agent `revoked` and advances
`authorization_revision`. Every agent route rechecks `status` on each request,
so reads, claims and pickups are refused with `delivery_agent_access_revoked`
(403) from the next call; a claim that raced the revocation either committed
first (and is then kept and flagged) or is refused. Identity and historical
assignments are kept.

Revocation never changes the delivery: `assigned_agent_id` and the
active-capacity hold `active_agent_id` stay, so no capacity is freed and
responsibility is not transferred. If the agent holds an active delivery, the
same transaction stores an `access_revoked` `DeliveryAttention`, already
raised (`due_at` and `raised_at` are the revocation time). It has no condition
of its own that ends it; it resolves as `order_ended` when the Order ends. The
operator list shows it with the agent's `agent_access`. Removing approved
areas alone does not revoke: the responsible agent keeps the current
delivery and no attention is raised. Every agent read authorizes through
`requireAuthorizedDeliveryAgent` in `workflows/delivery/agent-access.ts`, and
later stream and location consumers must call the same guard.

On the phone, any 403 from the agent routes sends the agent to
`/delivery-sign-in?message=access_ended`, which says in Danish or English that
access has ended and that any delivery stays assigned and MTOGO has been alerted.
`integration-tests/http/delivery-agent-revocation.spec.ts` covers it.

## Agent feed (#165)

`GET /partner/deliveries/stream` reads only durable records already in this
module and `order-operation`: it adds no model and no migration.
`readDeliveryFeedWorkflow` (`workflows/delivery/feed.ts`) calls
`requireAuthorizedDeliveryAgent` on every tick, so a revocation ends the
stream, then fingerprints the agent's approved areas with the available page
(`scanAvailablePage`) and the agent's active delivery. `advanceDeliveryFeed`
(`workflows/delivery/delivery-feed.ts`) turns a changed fingerprint into a
`available` or `current` hint. Hints carry no identity, Customer detail or
location. See the route in [the API README](../../api/README.md).

## Operator attention (#158, #163, #164)

`DeliveryAttention` is the reusable durable obligation behind operator
attention: one record per Order and condition (unique `order_id, type`), with
the effective deadline `due_at`, the sweep's processing time `raised_at`, and
`resolved_at` with a `resolution` (`assigned`, `picked_up`, `delivered` or
`order_ended`). Each `type` has the moment that schedules it and reuses the
same sweep, rule and list.

| `type`                        | Scheduled by                     | Due at                       | Ends with                    |
| ----------------------------- | -------------------------------- | ---------------------------- | ---------------------------- |
| `unassigned`                  | acceptance (`establishDelivery`) | acceptance plus ten minutes  | assignment                   |
| `access_revoked`              | revocation of an agent with work | at once (raised immediately) | the Order or delivery ending |
| `assigned_without_pickup`     | assignment (`assignDelivery`)    | acceptance plus thirty min   | pickup                       |
| `in_transit_without_delivery` | pickup (`recordPickup`)          | pickup plus thirty minutes   | handover or another terminal |
| `arrived_without_handover`    | arrival (`recordArrival`)        | arrival plus ten minutes     | handover or another terminal |

The two stalled-work conditions (#163) are attention thresholds, not promised
times: they never cancel, free, reassign or mark handover. Each is created in
the same transaction as the milestone that begins it, and pickup resolves
`assigned_without_pickup` in that same commit. `endDelivery` resolves every
outstanding attention of the Order in the terminal transaction (`delivered`
for a handover, `order_ended` for cancellation or failure), and the rule
resolves the same way for any record a sweep reaches after a terminal
outcome.

Acceptance creates the delivery record and its `unassigned` attention, due at
the durable acceptance time plus ten minutes, in one transaction
(`establishDelivery`), so no committed delivery lacks its obligation. The
`schedule-delivery-attention` migration script schedules it for work accepted
before #158; `schedule-stalled-delivery-attention` schedules the owed
stalled-work condition for assigned, unended work from before #163, from its
recorded acceptance or pickup time. The `recover-delivery-attention` job runs
`recoverDeliveryAttentionWorkflow` every minute, so its first tick after a
worker starts is the startup reconciliation. A sweep reads at most ten pages
of fifty per phase. Phase one raises or resolves obligations due at or before
its time, earliest deadline first; phase two resolves raised attention whose
Order ended, continuing on the next tick where it stopped. `decideAttention`
in `src/workflows/delivery/attention-rules.ts` is the one rule, with one end
condition per type: due exactly at the deadline, never re-raised, and `due_at`
never moves, so downtime only delays processing.
`GET /admin/deliveries/attention` hides ended Orders at once and scans at most
twenty pages; `offset` is limited to 500.

`reconcileAttention` locks the delivery row and then the attention row, and
`assignDelivery`, `recordPickup` and `endDelivery` resolve attention in their
own transactions after the same delivery-row lock, so a sweep racing a
milestone cannot leave obsolete attention outstanding. Attention never cancels, releases or
assigns work, and the list does not investigate or correct (#49).

`integration-tests/http/delivery-attention.spec.ts` covers 1 ms before and
exactly at acceptance plus ten minutes, downtime and repeated or concurrent
sweeps, claims and operator assignments before and after raising, a sweep
racing an assignment, ended Orders, paging, operator-only access and the
backfill; for #163 it covers 1 ms before, exactly at and after acceptance or
pickup plus thirty minutes, repeat sweeps, operator assignment, pickup,
handover and failure resolving attention, a sweep racing pickup, the agent's
current view and the stalled-work backfill. `src/workflows/delivery/__tests__/attention-rules.unit.spec.ts`
covers the decision table.

## Distances (#191)

Acceptance measures the trip once, after the Order's lock is released
(`measureTripStep` in `src/workflows/delivery/trip.ts`): it geocodes the
Restaurant's address and the Order's shipping address through the routing
module and asks for the cycling route between them. `recordTrip` stores
`pickup_latitude`, `pickup_longitude`, `destination_latitude`,
`destination_longitude`, `trip_distance_m` (rounded to 100 m) and
`trip_measured_at` in one update whose selector requires
`trip_measured_at IS NULL`. So a retried acceptance never calls the provider
again or changes the trip, and a failed attempt stays without a distance.
Without `ORS_API_KEY` nothing is called or recorded. Legacy work and the
`db:migrate` backfill are not measured. The step never fails acceptance.

The available list, the detail route and the current delivery add
`trip_distance_km` (one decimal, or `null`). No projection contains
coordinates; destination coordinates never leave the backend.

`POST /partner/delivery-agent/pickup-distances` takes
`{ latitude, longitude, order_ids }` (−90 to 90, −180 to 180, 1 to 25 IDs of
at most 64 characters, no other fields, a 2 KB body) from an authorized agent
and returns `{ distances: [{ order_id, distance_km }] }` for the requested
deliveries in the agent's view only: their current delivery and work that is
available to them now (unassigned, before the deadline, active, both postal
codes approved). Others are left out without saying why. One matrix call
measures them all; `distance_km` is `null` on a provider failure or for work
without pickup coordinates. `listPickupPointsWorkflow` authorizes and finds the
pickups without seeing the position; the route uses the position for the one
provider call and drops it, so it is never stored, logged, part of a workflow's
input or linked to the agent record. Refusals answer `position_invalid` (400)
or `position_too_large` (413) without echoing or logging the body. A revoked
agent is refused with `delivery_agent_access_revoked` (403).

`integration-tests/http/delivery-distance.spec.ts` covers the stored trip, a
retried acceptance, provider errors and over-quota answers, legacy work, the
distance endpoint's view restriction, actors, validation and size limit, and
that no coordinate appears in a log, a record or a refusal.

## Pickup (#160)

`IntendedDelivery` records the pickup milestone: `picked_up_at` (server
time), `picked_up_by` (the agent) and `pickup_request_id` (the retry identity,
unique when set). Readiness is not copied: the rule reads the Order
operation's `state` and `ready_at` (#146) at the guarded moment, so
preparation and assignment stay independent and pickup needs both.

`recordPickup` is the only pickup write. `recordPickupStep` holds the same
locking-module keys as assignment, `delivery-agent:{agent_id}` then
`order-operation:{order_id}`, reads the Order's state and readiness under
them, and the service locks the delivery row, applies `decidePickup`
(`src/workflows/delivery/pickup-rules.ts`) and writes in one update whose
selector requires the milestone to be unrecorded and the agent to still hold
the active capacity. A repeat returns the original milestone; a cancelled
Order or ended responsibility is refused even on a repeat. Nothing undoes a
recorded pickup.

`native_fulfillment_id` is the native Order fulfillment created and shipped
for the pickup (`settleNativeFulfillment` in
`src/workflows/delivery/native-fulfillment.ts`).
Null after pickup means that synchronization is still owed. The fulfillment
carries `metadata.intended_delivery_id`, so a retry after a lost write finds it
instead of fulfilling twice. The location is the stock location linked to the
Order's Restaurant, never a fixed id or the delivery shipping option's shared
location. A missing Restaurant location is logged as `pickup_location_missing`
and stays owed. Recovery uses the same Restaurant link; if a fulfillment was
already created, recovery keeps that fulfillment and its original location.
Nothing undoes a recorded pickup, and the native work it owes is retried, not
compensated (ADR-0021). The request and the
`recover-delivery-fulfillments` job (every minute, 50 per sweep) serialize on
`delivery-native-fulfillment:{order_id}`. `native_sync_queued_at` starts at the
pickup time and moves to the start of each attempt; the sweep takes the oldest
first, so a lasting failure goes to the back and cannot hold back newer
pickups.

`integration-tests/http/delivery-pickup.spec.ts` covers pickup of ready food
with its native fulfillment, double taps and retries, refusals before
readiness (accepted and preparing), other agents, unassigned work, staff,
forged bodies, cancelled work, revoked agents, a reused retry identity, a stale
decision refused by the guarded write (`delivery_changed`), three
competing requests (one milestone, one fulfillment), a missing pickup
location (pickup stands, the obligation is requeued and finished once
configured), recovery after an interruption and after a lost record without
replacing the existing fulfillment.
`src/workflows/delivery/__tests__/pickup-rules.unit.spec.ts` covers the
decision table.

## Handover and terminal outcome (#161)

`IntendedDelivery` records how the work ended: `terminal_outcome`
(`delivered`, `cancelled` or `failed`), `terminal_at` (server time),
`terminal_by` (the delivering agent, an operator, a Customer or `system`) and,
for a handover, `handover_request_id` (the retry identity, unique when set).
They are written once and never replaced. The same write sets
`active_agent_id` to null, so the agent can take new work; `assigned_agent_id`,
`assigned_by`, the pickup and every earlier milestone stay as they were.

`endDelivery` is the only terminal write. It locks the delivery row, re-reads
it with the agent and the retry identity, applies the caller's rule and
writes in one update whose selector requires an unended delivery (and, for a
handover, the agent still holding the capacity). A stale decision is refused
as `delivery_changed`. Callers:

- **Handover.** `recordHandoverStep` (`src/workflows/delivery/terminal.ts`)
  holds `delivery-agent:{agent_id}` then `order-operation:{order_id}`, reads
  whether the Order is still active and applies `decideHandover`
  (`terminal-rules.ts`): the responsible, authorized agent of an active
  delivery with a recorded pickup. No arrival, location, permission or timer
  is read, so nothing but the confirmation marks work delivered. A repeat by
  that agent, with any `request_id`, returns the original outcome; cancelled
  or failed work is refused.
- **Cancellation and failure.** `endDeliveryForOrder` applies
  `decideTermination` for an authoritative cancellation (#162) or an
  operator-confirmed failure (#49). The caller already holds the Order's
  guard; `endDeliveryWorkflow` takes it for callers that do not. Work that
  already ended keeps its outcome, so a delivered Order is never rewritten as
  cancelled. An Order without accepted work has no delivery and is left
  alone. The same write deletes the latest location (#166).

After a handover `settleNativeFulfillment` also marks the native fulfillment
delivered through `markOrderFulfillmentAsDeliveredWorkflow`, so the Order's
`fulfillment_status` becomes `delivered`, and records `native_delivered_at`.
A failure never fails the request; the recovery sweep reads delivered work
without `native_delivered_at` as well as pickups without a fulfillment.
Cancelled or failed work is never marked delivered.

Every ended delivery is also recorded on the Order's kitchen record (#204):
`recordDeliveryEndOnOrder` (`src/workflows/delivery/order-outcome.ts`) copies
the outcome (`delivered`, or `not_delivered` for cancelled and failed work)
and `terminal_at` onto the Order Operations record under the Order's guard,
with a newer revision, then sets `order_outcome_recorded_at`. The handover and
`endDeliveryWorkflow` run it right after the terminal write; it has no
compensation and never fails their request (ADR-0021). Ended work without
`order_outcome_recorded_at`, including cancellations ended inside the Order's
own guard, is recorded by the `recover-order-delivery-outcomes` job (every
minute, 50 per sweep, oldest `terminal_at` first). The
`order-delivery-outcomes` migration script runs the same sweep until nothing
is owed, so work that ended before #204 leaves the kitchen's In progress view
on deploy. Neither module imports the other: the workflow writes to both.

The pickup is recorded on the kitchen record the same way (#254):
`recordPickupOnOrder` (`src/workflows/delivery/order-pickup.ts`) copies
`picked_up_at`, only the time, onto the Order Operations record under the
Order's guard with a newer revision, then sets `order_pickup_recorded_at`.
`confirmPickupWorkflow` runs it right after the pickup commits, as owed work
without compensation. The `recover-order-delivery-pickups` job (every minute,
50 per sweep, oldest `picked_up_at` first) records pickups still owed, and the
`order-delivery-pickups` migration script backfills pickups made before #254.

A delivered handover is also the authoritative source of the Restaurant's
delivered food credit and commission (#227): `terminal_at` dates the
recognition, never a later synchronization. Restaurant finance reads delivered
work through two partial indexes on `terminal_outcome = 'delivered'`, by
`terminal_at` for its recovery sweep and by `restaurant_id, terminal_at` for
one Restaurant's month; this module knows nothing of finance.

The agent's own history (`src/workflows/delivery/history.ts`) reads ended
work by `assigned_agent_id`, newest `terminal_at` first, filtered and paged
in the module query. Each entry has only the Order reference, Restaurant,
pickup address, acceptance, assignment, pickup and end times and the outcome.
Customer contact and destination stay on the Order for separately authorized
Customer and operator access. A milestone that was never recorded is `null`.

`integration-tests/http/delivery-handover.spec.ts` covers handover with
capacity release and the native delivered marking, retries, refusals before
pickup, by other agents and actors, unknown Orders, forged bodies (time,
coordinates, photo), revoked agents, a reused retry identity, three competing
requests, a stale decision, the cancellation boundary (release, repeat,
never over a delivered outcome, no delivery), recovery after an interruption,
history paging, privacy and ownership, and the Customer's progress
milestones. `src/workflows/delivery/__tests__/terminal-rules.unit.spec.ts`
covers the decision tables.

## Arrival and contact attempts (#164)

`IntendedDelivery` records the arrival milestone: `arrived_at` (server time),
`arrived_by` (the agent) and `arrival_request_id` (the retry identity, unique
when set). Only the agent's explicit action records it; no location, distance
or timer does. It is the origin of the unreachable-Customer clock and nothing
else: handover never requires it and it never marks anything delivered.

`recordArrival` is the only arrival write. `recordArrivalStep`
(`src/workflows/delivery/arrival.ts`) holds `delivery-agent:{agent_id}` then
`order-operation:{order_id}`, as pickup and handover do, reads whether the
Order is still active and takes the server's time under them. The service
locks the delivery row, applies `decideArrival`
(`src/workflows/delivery/arrival-rules.ts`): the responsible, authorized agent
still holding active, collected work. It writes in one update whose selector
requires the arrival unrecorded, the work unended and the agent still holding
the capacity. The same commit stores `arrived_without_handover` attention due
at arrival plus ten minutes, so no committed arrival lacks its obligation. A
repeat returns the original arrival; ended work refuses even a repeat.

`DeliveryContactAttempt` stores one attempt to reach the Customer: `order_id`,
`agent_id`, `request_id` (unique) and `attempted_at` (server time). It has no
outcome field, so an attempt never claims that the Customer was reached, and
the phone's call link records nothing. `recordContactAttempt` takes the same
locks and the delivery row lock, re-reads the retry identity and the number of
attempts and applies `decideContactAttempt`: after arrival, by the responsible
agent of active work, at most `CONTACT_ATTEMPT_LIMIT` (20) per delivery. The
same `request_id` returns the existing attempt; on another delivery or agent
it is refused.

The unreachable-Customer attention follows the shared attention rule: due
exactly at arrival plus ten minutes, raised once by the recovery sweep
whenever it runs (so the clock survives a restart), and resolved only by the
terminal outcome (`delivered` for the handover, `order_ended` otherwise).
Contact attempts and elapsed time never resolve it, and it never cancels,
frees, reassigns or delivers work. Operator exception resolution is #49. The
agent's current view and the operator attention list show it, the list with
`arrived_at` and the contact-attempt count and latest time. Arrival does not
end `in_transit_without_delivery`, because the food is still undelivered, so
an Order that is late in both ways appears in the list once per condition.
Arrival is new
in #164, so no earlier work owes this obligation and there is no backfill.

`integration-tests/http/delivery-arrival.spec.ts` covers arrival with its
server time, double taps and retries, forged bodies (time, coordinates,
agent), refusals before pickup, by other agents and actors, on unknown Orders,
for revoked agents, a reused retry identity and ended work, three competing
arrivals (one milestone, one obligation), distinct and repeated contact
attempts under competing requests, an attempt racing the handover, their
refusals, and the attention 1 ms
before, exactly at and after arrival plus ten minutes, after downtime, its
resolution by handover and failure, a handover before the deadline and a
sweep racing the handover. `src/workflows/delivery/__tests__/arrival-rules.unit.spec.ts`
and `attention-rules.unit.spec.ts` cover the decision tables.

## Latest location (#166)

`DeliveryLocation` holds the responsible agent's latest shared position for one Order: `latitude`, `longitude`, `accuracy_m` (nullable), `observed_at` (the phone's measurement, never later than receipt), `received_at` (server time) and `revision` (accepted samples so far). It keeps no agent identity, since responsibility is read from the delivery, and stores coordinates as `real`, about a meter of resolution, below a phone's accuracy radius. A unique `order_id` keeps at most one per Order: each accepted sample replaces it, so there is no route history. It is separate from the permanent milestones on `IntendedDelivery`, and `endDelivery` hard-deletes it in the terminal transaction, for a handover, a cancellation and an operator-confirmed failure alike. Milestones stay. `recordLocation` is the only write. `recordDeliveryLocationStep` (`src/workflows/delivery/location.ts`) holds `delivery-agent:{agent_id}` then `order-operation:{order_id}`, like the other milestones (`underDeliveryGuard` in `delivery-guard.ts`), and takes the server's time under them. The service locks the delivery row, the lock `endDelivery` takes, re-reads responsibility and the kept sample and applies `decideLocationSample` (`src/workflows/delivery/location-rules.ts`): the responsible, authorized agent of active work after pickup; an observation at most 5 s in the future (capped at receipt), at most ten minutes old and newer than the kept one; a newer sample within 5 s of the kept receipt is coalesced. The update's selector also requires the kept observation to be older; a write that loses that race returns `superseded`, which the step answers as `location_out_of_order`. So an upload racing the terminal outcome is either stored first and deleted by it, or refused after it, and every Customer read after the terminal commit shows `ended`: the projection is derived from the committed rows, so the deletion is its invalidation; another agent's or unassigned work answers `delivery_not_found` (404), exactly like an Order without a delivery, so the route never reveals that one exists; a revoked agent is refused (`delivery_agent_access_revoked`) while the delivery and its kept sample stay until it ends. A sample is not a business milestone, so the step keeps a compensation (ADR-0021): `restoreLocation` brings back the replaced sample, or removes the first one, only while the kept sample is still that write's `revision`, so it never restores a coordinate after a newer sample or the terminal deletion. The workflow is not stored and Medusa's workflow checkpoints keep no step input or output, so the coordinate exists only in the one row. It is not logged: validation refusals on the route answer `location_invalid` or `location_too_large` without the body. `retrieveOrderDeliveryWorkflow` builds the Customer's projection (`GET /store/orders/:id/delivery`): the progress milestones and `deliveryLocationView` with the kept sample's `revision`, which labels the sample `stale` from exactly sixty seconds after `observed_at`, independently of receipt or any heartbeat. `integration-tests/http/delivery-location.spec.ts` covers the first and a replacing sample, a delayed upload of an old observation, future, too old, out-of-order and coalesced samples, refusals before pickup, by another agent, other actors and a revoked agent, malformed and oversized bodies without logging the coordinate, deletion with the handover, an operator-confirmed failure and a cancellation, the compensation's undo of a replacing and a first sample before and after the end, a write that loses to a newer sample, uploads racing the handover, competing uploads, the Customer's ownership and states, and twenty simultaneous Customer reads (measured locally on 22 November 2026 with the in-process runner: p95 414 ms, against the agreed 95% within two seconds). `src/workflows/delivery/__tests__/location-rules.unit.spec.ts` covers the decision table and freshness 1 ms before, exactly at and after sixty seconds.

The Feedback statistics read groups delivered Orders by Restaurant and assigned
Delivery agent over the same half-open handover-time range as Feedback, where a `null` bound is
open (`all_time`). It counts recorded handovers, including Orders without Feedback, and excludes other
terminal outcomes.

### Agent Bonus points (#236)

`GET /partner/delivery-agent/bonus` is available when the backend-owned
`agent_bonus` flag is on (`MTOGO_FF_AGENT_BONUS=true`). It authenticates the
Delivery agent and rechecks authorization on every request. The workflow reads
only that agent's successfully delivered work in the current Copenhagen month,
using the recorded handover and pickup, the purchased financial basis and the
agent Feedback rating. It returns the month, calculation time, provisional
status and each delivery's reference, milestone times, exact food value and
points, and time/rating multiplier flags. If the purchase basis or pickup is
unavailable, the calculation is null. No Customer data, ratings or other agents'
figures are returned. Flag off returns 404; signed-out and other roles are
refused, and revoked agents receive 403. `GET /partner/delivery-agent/me`
answers `features.agent_bonus`, so the partner workspace shows the Bonus link
without asking this route on every render (#252). No points or provisional results are
persisted, and cancellation after pickup never earns points.

The estimate (#237) is calculated when read and never stored. Funding reads
only the Restaurant Finance module's journal entries whose original month is
the current month: commission, negative commission (reversals) and
MTOGO-funded food credits (compensation). Service fees, Customer-funded food
credits and refund obligations are never read, so a refund reduces funding
only through the commission reversal it causes. The carried loss is zero until
finalization exists. The rules live in `src/workflows/agent-bonus/calculation.ts`
(`calculateBonusFunding`, `calculateBonusAmount`): a positive balance funds a
pool of 20%; the agent's estimate is pool x own points / all agents' points so
far, rounded down to DKK 0.01, and each delivery's `amount` is its points at the
same exact DKK per point, rounded down, so the per-delivery amounts can add up
to a few øre less than the estimate. MTOGO retains what rounding leaves. `pool` is `none` when funding so far is
zero or negative; `estimate` is null then or when the agent has no points, and
every `amount` is null. Other agents' points and the funding inputs are never
returned.

**Actor:** authorized Delivery agent. No request parameters are required.

**Success:** `200` with, for example:

```json
{
  "month": "2026-11",
  "calculated_at": "2026-11-25T12:00:00.000Z",
  "status": "provisional",
  "pool": "funded",
  "estimate": { "amount": "1.58", "delivery_count": 1 },
  "deliveries": [
    {
      "id": "del_123",
      "order_reference": 42,
      "handover_at": "2026-11-24T22:30:00.000Z",
      "picked_up_at": "2026-11-24T22:00:00.000Z",
      "calculation": {
        "food_value": "200",
        "time_bonus": true,
        "rating_bonus": true,
        "points": "275"
      },
      "amount": "1.58"
    }
  ]
}
```

Food value, points and amounts are exact decimal strings in DKK. `picked_up_at` and
`calculation` may be null when the underlying facts are unavailable.

| Status | When                                                 |
| ------ | ---------------------------------------------------- |
| `401`  | Signed out or an actor that cannot access the route. |
| `403`  | Delivery agent access has been revoked.              |
| `404`  | The feature flag is off.                             |
