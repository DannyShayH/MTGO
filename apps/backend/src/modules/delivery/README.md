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

The partner website keeps the bearer in its httpOnly cookie. Its saved area
filter is intersected with current permissions and cannot grant access. Progress after
assignment (pickup, arrival, handover) and terminal release of capacity are
later slices of Feature #48; pickup is described below.

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

## Operator attention (#158)

`DeliveryAttention` is the reusable durable obligation behind operator
attention: one record per Order and condition (unique `order_id, type`), with
the effective deadline `due_at`, the sweep's processing time `raised_at`, and
`resolved_at` with a `resolution` (`assigned` or `order_ended`). Later
conditions (assigned without pickup, in transit, unreachable recipient) add a
`type` and the moment that schedules them; they reuse the same sweep, rule
and list.

Acceptance creates the delivery record and its `unassigned` attention, due at
the durable acceptance time plus ten minutes, in one transaction
(`establishDelivery`), so no committed delivery lacks its obligation. The
`schedule-delivery-attention` migration script schedules it for work accepted
before #158. The `recover-delivery-attention` job runs
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
`assignDelivery` resolves the unassigned attention in its own transaction after
the same delivery-row lock, so a sweep racing an assignment cannot leave
attention outstanding on assigned work. Attention never cancels, releases or
assigns work, and the list does not investigate or correct (#49).

`integration-tests/http/delivery-attention.spec.ts` covers 1 ms before and
exactly at acceptance plus ten minutes, downtime and repeated or concurrent
sweeps, claims and operator assignments before and after raising, a sweep
racing an assignment, ended Orders, paging, operator-only access and the
backfill. `src/workflows/delivery/__tests__/attention-rules.unit.spec.ts`
covers the decision table.

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
for the pickup (`settleNativePickup` in `src/workflows/delivery/pickup.ts`).
Null after pickup means that synchronization is still owed. The fulfillment
carries `metadata.intended_delivery_id`, so a retry after a lost write finds it
instead of fulfilling twice. The location is the one the Order's shipping
option's fulfillment set belongs to, never a fixed id; a missing one is logged
as `pickup_location_missing` and stays owed. For the MVP that is one
platform-wide location shared by every Restaurant, because no Restaurant is
linked to its own stock location yet. Shipping each pickup from its
Restaurant's own location is #192. Nothing undoes a recorded pickup, and the
native work it owes is retried, not compensated (ADR-0021). The request and the
`recover-delivery-pickups` job (every minute, 50 per sweep) serialize on
`delivery-native-pickup:{order_id}`. `native_sync_queued_at` starts at the
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
configured) and recovery after an interruption and after a lost record.
`src/workflows/delivery/__tests__/pickup-rules.unit.spec.ts` covers the
decision table.
