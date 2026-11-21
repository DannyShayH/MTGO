# Custom API Routes

## Claiming and initial assignment (#157)

`POST /partner/delivery-agent/available/{order_id}/claim` requires an
authorized `delivery_agent` bearer and accepts only `{ request_id }`, a retry
identity of 1-100 characters `A-Z a-z 0-9 . _ : -` that the client keeps for
one intended claim. The agent is the authenticated actor. Success returns the
current-delivery projection below. A repeat by the responsible agent, with
the same or a new `request_id`, returns the original assignment unchanged
while the Order is active. A `request_id` belongs to the actor, agent and
delivery it was first used for; any other reuse is `assignment_request_reused`.
Refusals: `400` with `delivery_not_active`, `claim_deadline_passed` (at or
after acceptance plus thirty minutes) or `delivery_outside_approved_areas`
(both postal codes are checked against the current approved set); `409` with
`delivery_already_assigned`, `delivery_agent_has_active_delivery` or
`assignment_request_reused`; `404` `delivery_not_found`; `403` for revoked
access; `401` without an agent bearer. Refusals carry no Customer or agent
details. Preparation state does not gate claiming.

A claim or operator assignment refused with `claim_deadline_passed` on work
that is still unassigned also cancels the Order at once, under the same Order
guard (#162): `cancellation_category: unassigned_timeout` by `system`, the
Customer's full-refund obligation and, when preparation had started, one
MTOGO-funded prepared-food credit. The outcome therefore never waits for the
recovery sweep, which does the same for work nobody tried to claim. A claim
that wins strictly before the deadline prevents the cancellation; a claim that
loses the race is refused with `delivery_not_active`.

`GET /partner/delivery-agent/current` returns `{ delivery, server_time }`,
where `delivery` is `null` or the agent's one active delivery: intended
delivery and Order IDs, reference, Restaurant, pickup address, preparation
state, acceptance and assignment times, `assignment_source`
(`agent_claim` or `operator_assignment`) and `customer` (name, phone,
`address_1`, `address_2`, postal code, city) from the Order's purchased
shipping address, plus `picked_up_at` (null before pickup), `arrived_at`
(null before the explicit arrival, #164), `contact_attempts`
(`[{ attempted_at }]`, oldest first, #164), `attention`
(`null`, or `{ type, due_at }` while operator attention for unconfirmed pickup,
`assigned_without_pickup`, unconfirmed handover, `in_transit_without_delivery`
(#163), or no handover ten minutes after arrival, `arrived_without_handover`
(#164, shown first), is raised and outstanding; it changes nothing the agent
may do) and `allowed_actions`: `["confirm_pickup"]` while the food is ready and
not yet collected, `["record_arrival", "confirm_handover"]` once collected
(#161), `["record_contact_attempt", "confirm_handover"]` once arrived (#164),
otherwise `[]`. After
handover, cancellation or failure the delivery is no longer current and
`delivery` is `null`. Checkout records no separate delivery
instructions, so none are returned. Responsibility, not the current areas, grants this read;
revoked agents receive `403`.

## Pickup (#160)

### POST /partner/deliveries/{order_id}/pickup

Records that the responsible agent collected the food. The time, agent and
location come from the server. Allowed only for the agent responsible for an
active delivery whose Order the Restaurant has recorded `ready` (#146). A
repeat, with the same or a new `request_id`, returns the original
`picked_up_at` while the Order is active.

**Actor:** authorized Delivery agent (`delivery_agent` bearer)

| Field        | Type   | Required | Rules                                                                                 |
| ------------ | ------ | -------- | ------------------------------------------------------------------------------------- |
| `request_id` | string | yes      | 1-100 characters `A-Z a-z 0-9 . _ : -`; one per intended pickup, kept for its retries |

```json
{ "request_id": "3f0c9d4e-6a51-4f43-9a0b-2c8e5a7d1b90" }
```

**Success:** `200` with the current-delivery projection
`{ "delivery": { ..., "picked_up_at": "...", "allowed_actions": [] }, "server_time": "..." }`

| Status | When                                                                              |
| ------ | --------------------------------------------------------------------------------- |
| `400`  | `food_not_ready`; `delivery_not_responsible` (another agent's or unassigned work) |
| `400`  | `delivery_not_active` (cancelled Order or ended responsibility, even on a repeat) |
| `400`  | Invalid body or unknown fields                                                    |
| `401`  | No `delivery_agent` bearer                                                        |
| `403`  | `delivery_agent_access_revoked`                                                   |
| `404`  | `delivery_not_found` (no accepted delivery for the Order)                         |
| `409`  | `pickup_request_reused` (`request_id` first used for another delivery or agent)   |
| `409`  | `delivery_changed` (the delivery changed between the guarded read and the write)  |

A recorded pickup also creates and ships one native Order fulfillment of every
item through Medusa's `createOrderFulfillmentWorkflow` and
`createOrderShipmentWorkflow`, at the stock location the Order's delivery
option is configured with. The Order's `fulfillment_status` becomes `shipped`,
not `delivered`. A failure there never fails the request: the delivery module
keeps the obligation and the `recover-delivery-fulfillments` job finishes it.

## Arrival and contact attempts (#164)

### POST /partner/deliveries/{order_id}/arrive

Records that the responsible agent reached the destination. The time and
agent come from the server; no coordinate is accepted, and no location ever
records arrival. Allowed only for the agent responsible for an active delivery
with a recorded pickup. A repeat, with the same or a new `request_id`, returns
the original `arrived_at`. Arrival starts the unreachable-Customer clock: the
same commit stores `arrived_without_handover` attention due at arrival plus
ten minutes. It is never handover, and handover never requires it.

**Actor:** authorized Delivery agent (`delivery_agent` bearer)

| Field        | Type   | Required | Rules                                                                                  |
| ------------ | ------ | -------- | -------------------------------------------------------------------------------------- |
| `request_id` | string | yes      | 1-100 characters `A-Z a-z 0-9 . _ : -`; one per intended arrival, kept for its retries |

**Success:** `200` with the current-delivery projection
`{ "delivery": { ..., "arrived_at": "...", "allowed_actions": ["record_contact_attempt", "confirm_handover"] }, "server_time": "..." }`

| Status | When                                                                              |
| ------ | --------------------------------------------------------------------------------- |
| `400`  | `pickup_not_recorded`; `delivery_not_responsible` (another agent's or unassigned) |
| `400`  | `delivery_not_active` (cancelled, failed or ended work, even on a repeat)         |
| `400`  | Invalid body or unknown fields (a time, coordinate or agent)                      |
| `401`  | No `delivery_agent` bearer                                                        |
| `403`  | `delivery_agent_access_revoked`                                                   |
| `404`  | `delivery_not_found` (no accepted delivery for the Order)                         |
| `409`  | `arrival_request_reused` (`request_id` first used for another delivery or agent)  |
| `409`  | `delivery_changed` (the delivery changed between the guarded read and the write)  |

### POST /partner/deliveries/{order_id}/contact-attempts

Records one attempt by the responsible agent to reach the Customer after
arrival, with the server's time. An attempt has no outcome: it never says the
Customer was reached, and opening the phone's dialer records nothing. Each new
`request_id` is a new attempt; repeating one returns the view without adding
another. At most 20 attempts are kept per delivery.

**Actor:** authorized Delivery agent (`delivery_agent` bearer)

| Field        | Type   | Required | Rules                                                                         |
| ------------ | ------ | -------- | ----------------------------------------------------------------------------- |
| `request_id` | string | yes      | 1-100 characters `A-Z a-z 0-9 . _ : -`; one per attempt, kept for its retries |

**Success:** `200` with the current-delivery projection, its
`contact_attempts` including this one.

| Status | When                                                                                     |
| ------ | ---------------------------------------------------------------------------------------- |
| `400`  | `arrival_not_recorded`; `delivery_not_responsible`; `contact_attempt_limit_reached`      |
| `400`  | `delivery_not_active` (cancelled, failed or ended work, even on a repeat)                |
| `400`  | Invalid body or unknown fields (a time or an outcome)                                    |
| `401`  | No `delivery_agent` bearer                                                               |
| `403`  | `delivery_agent_access_revoked`                                                          |
| `404`  | `delivery_not_found` (no accepted delivery for the Order)                                |
| `409`  | `contact_attempt_request_reused` (`request_id` first used for another delivery or agent) |

## Handover and completed history (#161)

### POST /partner/deliveries/{order_id}/deliver

Records that the responsible agent handed the food over to the Customer or
their designated recipient, ends the delivery as `delivered` and frees the
agent for new work. Allowed only for the agent responsible for an active
delivery with a recorded pickup. The time and agent come from the server; no
arrival, coordinate, photo, signature or code is accepted or required. A
repeat, with the same or a new `request_id`, returns the original entry.

**Actor:** authorized Delivery agent (`delivery_agent` bearer)

| Field        | Type   | Required | Rules                                                                                   |
| ------------ | ------ | -------- | --------------------------------------------------------------------------------------- |
| `request_id` | string | yes      | 1-100 characters `A-Z a-z 0-9 . _ : -`; one per intended handover, kept for its retries |

**Success:** `200` with the completed entry
`{ "delivery": { ..., "outcome": "delivered", "ended_at": "..." }, "server_time": "..." }`
(fields as in the history below).

| Status | When                                                                              |
| ------ | --------------------------------------------------------------------------------- |
| `400`  | `pickup_not_recorded`; `delivery_not_responsible` (another agent's or unassigned) |
| `400`  | `delivery_not_active` (cancelled, failed or ended Order)                          |
| `400`  | Invalid body or unknown fields                                                    |
| `401`  | No `delivery_agent` bearer                                                        |
| `403`  | `delivery_agent_access_revoked`                                                   |
| `404`  | `delivery_not_found` (no accepted delivery for the Order)                         |
| `409`  | `handover_request_reused` (`request_id` first used for another delivery or agent) |
| `409`  | `delivery_changed` (the delivery changed between the guarded read and the write)  |

A handover also marks the native fulfillment delivered through
`markOrderFulfillmentAsDeliveredWorkflow`; the Order's `fulfillment_status`
becomes `delivered`. A failure there never fails the request; the
`recover-delivery-fulfillments` job finishes it.

### GET /partner/delivery-agent/history

`?limit=20&offset=0` (limit 1-50, offset nonnegative) returns
`{ deliveries, has_more, limit, offset, server_time }`: the caller's own ended
deliveries, newest end first. Each entry has `id`, `order_id`,
`order_reference`, `restaurant_name`, `pickup_address`, `accepted_at`,
`assigned_at`, `assignment_source`, `picked_up_at` (null when never
recorded), `ended_at` and `outcome` (`delivered`, `cancelled` or `failed`). No
Customer name, phone, address or instructions. `GET
/partner/delivery-agent/history/{order_id}` returns `{ delivery, server_time }`
for one of them; another agent's, still active or unknown work is a generic
`404`. Both require an authorized agent: `401` without the bearer, `403` when
revoked.

`GET /admin/deliveries/unclaimed?limit=20&offset=0` (limit 1-50) returns
`{ deliveries, has_more, limit, offset, server_time }` with the same safe
fields as the agents' list plus `pickup_postal_code` and
`eligible_agents: [{ id, name }]`: authorized agents approved for both codes
with no active delivery. `POST /admin/deliveries/{order_id}/assign` accepts
`{ agent_id, request_id }` and runs the same guarded capability for the
selected agent, recording the operator as `assigned_by`. It returns
`{ assignment: { order_id, agent: { id, name }, assigned_at, assigned_by,
source } }` with the claim's refusal codes; a revoked or pending agent is
`400` `delivery_agent_not_authorized`, an unknown agent `404`. There is no
release, replacement or reassignment route.

`GET /admin/deliveries/attention?limit=20&offset=0` (limit 1-50, offset
at most 500, #158, #163, #164)
returns `{ attention, has_more, limit, offset, server_time }`: raised,
unresolved operator attention on active Orders, oldest `due_at` first. Each
item has `id`, `type` (`unassigned`, `access_revoked`,
`assigned_without_pickup` at acceptance plus thirty minutes without pickup, or
`in_transit_without_delivery` at pickup plus thirty minutes without delivery,
or `arrived_without_handover` at the explicit arrival plus ten minutes without
handover: an unreachable Customer that requires operator escalation),
`order_id`, `order_reference`, `restaurant_name`, `pickup_postal_code`,
`destination_postal_code`, `preparation_status`, the real `accepted_at`,
`picked_up_at` and `arrived_at` (or `null`), `contact_attempts`
(`{ count, last_attempted_at }`), the effective deadline `due_at`,
the processing time `raised_at`, `claim_deadline` and `assignment` (`null`, or
`{ agent: { id, name, agent_access: "authorized" | "revoked" }, assigned_at,
source }`). It omits Customer details and
only reads: attention never cancels, releases or assigns work.

## Distances (#191)

The available list, the detail route and the current delivery include
`trip_distance_km`: the cycling route from pickup to the Customer, measured
once at acceptance, to one decimal, or `null` when unavailable. No projection
contains coordinates.

### POST /partner/delivery-agent/pickup-distances

Returns route distances from the agent's position to the pickups of the
listed deliveries that are in the agent's view: their current delivery and
work available to them now. Other IDs are left out without saying why. The
position is used for one openrouteservice call and is never stored, logged or
linked to the agent record. The body is limited to 2 KB.

**Actor:** authorized Delivery agent (`delivery_agent` bearer)

| Field       | Type     | Required | Rules                                   |
| ----------- | -------- | -------- | --------------------------------------- |
| `latitude`  | number   | yes      | −90 to 90                               |
| `longitude` | number   | yes      | −180 to 180                             |
| `order_ids` | string[] | yes      | 1 to 25 Order IDs of 1 to 64 characters |

No other field is accepted.

```json
{
  "latitude": 55.6812,
  "longitude": 12.5712,
  "order_ids": ["order_01JQ8ZK3W7", "order_01JQ8ZM5R2"]
}
```

**Success:** `200` with
`{ "distances": [{ "order_id": "order_01JQ8ZK3W7", "distance_km": 0.8 }] }`,
in the order asked. `distance_km` is `null` without a provider key, on a
provider error, timeout or over-quota answer, and for work without pickup
coordinates.

| Status | When                                                                             |
| ------ | -------------------------------------------------------------------------------- |
| `400`  | `position_invalid`: a field is missing, out of range, of the wrong type or extra |
| `401`  | No `delivery_agent` bearer                                                       |
| `403`  | `delivery_agent_access_revoked`                                                  |
| `413`  | `position_too_large`: the body is over 2 KB                                      |

Refusals never repeat the submitted values.

## Available deliveries (#156)

`GET /partner/delivery-agent/available?limit=20&offset=0&postal_codes=2200`
requires an authorized `delivery_agent` bearer. It returns `{ deliveries,
has_more, limit, offset, server_time }`. Each entry contains the intended delivery
ID, Order ID/reference, Restaurant name, pickup address, destination postal
code, preparation state, acceptance time and claim deadline. The optional
postal-code filter only narrows the agent's approved areas. Limits are 1–50;
offset is nonnegative. Malformed parameters return 400. Missing/wrong actor
tokens receive 401; revoked agents receive 403. Expired, unassigned and
ineligible Orders are excluded before pagination. `GET
/partner/delivery-agent/available/{order_id}` returns `{ delivery,
server_time }` with the same safe fields or a generic 404. Customer name,
full address, phone and instructions never appear in either projection.

## Delivery agent access and approved areas (#155)

Admin routes require an operator session or bearer. `GET /admin/delivery-agents`
returns `{ agents, count, limit, offset }`, with bounded `limit` and `offset`.
`POST /admin/delivery-agents` accepts `{ name, email }` and sends a 24-hour
invitation to the private mailbox or configured email provider.
`POST /admin/delivery-agents/:id/revoke` revokes an invitation or access while
retaining the agent identity and returns `{ agent: { id } }` (a repeat changes
nothing; an unknown agent is `404`). From the next call the agent's reads,
claims and pickups are `403 delivery_agent_access_revoked`. An active delivery
stays assigned and keeps the agent's capacity, and an already raised
`access_revoked` attention (#159) appears in the attention list until the Order
ends. `GET /admin/delivery-agents/:id/areas` returns
`{ agent_id, authorization_revision, postal_codes, areas }`, where `areas` is
`[{ postal_code, name }]` with the register's town name (`null` when the register
no longer names the code); `POST` replaces the
complete set with `{ postal_codes: string[] }`. Invalid or unregistered Danish
codes return `400`. An empty list is permitted and grants no operating area.

`POST /partner/delivery-agent-invitations/open` accepts `{ token }` and returns
the pending invited identity; `POST /partner/delivery-agent-invitations/accept`
requires a delivery-agent registration bearer and the same body. Expired,
revoked, consumed and invalid invitations receive `400 invitation_invalid`.
The token is sent in the body so it is not included in backend request paths.
Registration at `/auth/delivery_agent/delivery-agent-emailpass/register` also
requires `invitation_token` matching the invited email. `GET
/partner/delivery-agent/me` requires a delivery-agent bearer and checks durable
authorization on every request; revoked or missing agents receive `403`. Other
actor types cannot use the route. The partner website holds the bearer in its
httpOnly cookie and does not send it to browser JavaScript.

## Customer profile edits (#88)

### POST /store/customers/me

An authenticated Customer may update `first_name`, `last_name`, `phone` and
`metadata.preferred_language`. The endpoint updates only the Customer selected
by the authenticated actor; an `id` in the request body is rejected. Name edits
must include both nonblank names. A supplied phone must be an international,
country-code-prefixed number in display format; omission is allowed for partial
metadata updates. Existing Orders keep their confirmed contact details.

Successful edits return `200` with the updated `customer`. Invalid input returns
`400` with `code` and `message` set to one of
`customer_name_required`, `customer_phone_invalid` or
`customer_profile_input_invalid`.

## Customer cart ownership (#87)

### `/store/carts/:id*`

Cart reads and mutations keep anonymous carts public but require the signed-in
Customer to own a Customer-owned cart. Submission additionally requires a
signed-in, verified Customer to own the cart; anonymous carts cannot be
submitted. An expired session and a different Customer receive `401
cart_customer_access_denied`; the cart ID is not disclosed. The ownership check
runs before the built-in Medusa cart route, so it applies consistently to
nested cart actions, including `complete`.

## One Restaurant basket (#131)

### POST /store/carts/:id/line-items and POST /store/carts/:id/complete

The `validate` hooks of `addToCartWorkflow` and `completeCartWorkflow` enforce
the basket rules for every Store API caller. Adding a line returns `400
basket_other_restaurant` (with `current_restaurant_id` and
`requested_restaurant_id`) or `400 basket_not_a_dish`. Completion returns `400
basket_review_required` with `restaurant_id` and `issues` when the basket no
longer matches the current menu, the Restaurant cannot take the Order, or the
amount is not the plain DKK menu total.

When the review passes, completion freezes the purchased kitchen facts under
the cart lock (#141): for each dish, its Danish and English names, allergen
declaration and food labels at the revision the Customer reviewed. Placement,
including a retried or delayed one, copies them onto the Order and never
rereads the menu. See `GET /partner/orders`.

### GET /store/carts/:id/basket-review

Runs the same review read-only for the signed-in Customer who owns the cart
(`401` otherwise) and returns `{ restaurant_id, issues }`. An empty or
completed cart returns `{ restaurant_id: null, issues: [] }`. Each issue is
one of:

| Code                              | Fields                                                                                                                                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dish_changed`                    | `variant_id` and the current `revision` and `price`                                                                                                                                                       |
| `dish_unavailable`                | `variant_id`                                                                                                                                                                                              |
| `dish_sold_out`                   | `variant_id`                                                                                                                                                                                              |
| `restaurant_not_receiving_orders` | `reason`, such as `restaurant_closed`                                                                                                                                                                     |
| `amount_not_allowed`              | `reason`: `currency_not_dkk`, `adjustment_not_allowed`, `delivery_charge_not_allowed`, `payment_amount_mismatch`, `payment_session_missing`, `payment_session_unusable` or `payment_provider_not_allowed` |

## Paid Restaurant Orders (#132)

`POST /store/carts/:id/complete` requires an authenticated, verified Customer,
their own cart, and the checkout review. The core Medusa completion workflow
checks the current Restaurant basket under the cart lock. The payment collection
and its single `pp_system_default` session must both equal the current DKK cart
total; a stale or missing session returns `400 basket_review_required` with an
`amount_not_allowed` issue and no charge. Before completion, a payment
collection whose amount or currency no longer matches the cart is refreshed
through Medusa's workflow and given a new `pp_system_default` session; the
amount is then verified again under the cart lock. Without any payment
collection the Customer must start payment first.

On successful core authorization, the Store completion route captures the mock
payment, links exactly one Restaurant to the Order, and records the Order's
paid placement in the Order Operations module (#140): one record with the paid
placement time, the acceptance deadline (placement plus five minutes) and the
Restaurant that owns it. Its response is `{ type: "order", order }` only after
those steps finish, with `order_operation.placed_at` and
`order_operation.acceptance_deadline`. The Order retains the cart's
`mtogo_checkout_review` metadata, including destination, contact and Order
language. A repeated completion returns the same Order ID, placement time and
deadline without capturing again, even if the Restaurant later closes. If
post-completion work fails, the Order without a placement record remains
hidden from Customer and operator list and direct reads; retrying the same
cart resumes capture, linking or recording. Order list rows carry
`order_operation.state`, so Order history can label an awaiting Order. Placement failures use
`order_not_found`, `order_placement_incomplete` (no single Restaurant or
payment) and `order_restaurant_mismatch` (a different Restaurant is already
linked), all returned as the error `code`.

Orders placed before #140 carry `metadata.mtogo_order_state =
awaiting_restaurant_acceptance` instead and stay placed. New placements no
longer write that marker.

The Order-to-Restaurant link table is created by `db:migrate` (it runs
`db:sync-links`); no separate step is needed.

`GET /store/orders` and `GET /store/orders/:id` keep the existing Customer
ownership protection and suppress provisional Restaurant Orders until their
paid placement is recorded. Placement is an immutable fact, so an Order stays
visible whatever its later operational state (accepted, cancelled and so on). Admin list and detail reads apply the same visibility rule.
Orders without a checkout review, and older Orders carrying the legacy
`mtogo_order_state` placement marker, are always visible.

Both list reads exclude provisional rows in the list query itself (#154): an
Order is listed when it has no checkout review, the legacy marker, or the
`mtogo_paid_placement` copy of its placement record id in `metadata`. So
`count` is the number of visible Orders on every page, `limit` pages stay full
except the last, and the requested `order` is kept. For example, a Customer
with two paid Orders and one provisional Order gets `count: 2` from
`GET /store/orders?limit=1&offset=0`, and `offset=2` returns no Orders.
The built-in Admin Orders export returns `400 order_export_unavailable`
because it cannot apply the provisional-row filter; a filtered export can
restore that capability.

`GET /store/orders/:id` returns the Order's `metadata` (the checkout review) only
when the request asks for it with `fields=+metadata`.
Likewise `fields=+restaurant.id` adds `restaurant: { id }`, nothing else of
the Restaurant (#147). The Order page uses it to show each dish's menu photo,
because a line item's `thumbnail` is the Admin-only dish photo route, which a
Customer cannot open.

The zero-cost `MTOGO delivery included` shipping option is created by the
`menu-delivery` migration script and linked to the menu sales channel. It can be
run again without adding another option. The option is internal fulfillment
data; the Customer's delivery charge remains zero.

### GET /store/orders/:id/progress

Since #161 `progress.delivery` carries the committed delivery milestones
that the #50 timeline reads. It is `null` before acceptance, otherwise
`{ assigned_at, picked_up_at, delivered_at, outcome }`, each `null` until
recorded. `delivered_at` is set only for a confirmed handover. The agent's
identity is never included.

**Actor:** the owning Customer (`customer`, bearer or session), with the same
ownership and placed-Order checks as `GET /store/orders/:id` (#143). Another
Customer's Order, an unpaid provisional row and an unknown id are all `404`;
signed out is `401`.

```json
{
  "progress": {
    "order_id": "order_01...",
    "state": "cancelled",
    "placed_at": "2026-11-18T12:00:00.000Z",
    "accepted_at": null,
    "preparation_started_at": null,
    "ready_at": null,
    "available_actions": [],
    "cancellation": {
      "category": "restaurant_rejected",
      "cancelled_at": "2026-11-18T12:02:10.000Z",
      "effective_at": "2026-11-18T12:02:10.000Z"
    },
    "refund": {
      "status": "failed",
      "amount_including_vat": 190,
      "currency_code": "dkk",
      "last_attempted_at": "2026-11-18T12:02:10.000Z",
      "succeeded_at": null
    },
    "delivery": null
  },
  "server_time": "2026-11-18T12:03:00.000Z"
}
```

The Customer sees the cancellation's category (`restaurant_rejected`,
`acceptance_timeout`, `customer_cancelled` or `unassigned_timeout`), never
the Restaurant's free-text reason, a staff identity or the Restaurant's food
credit. A `failed` refund is still owed.
`cancellation` and `refund` are `null` while the Order is active.
`cancelled_at` is when the server processed the cancellation and
`effective_at` when it took effect. They differ only for an automatic
cancellation that recovery processed later (#144, #162): `effective_at` is
then the acceptance deadline for an `acceptance_timeout`, or acceptance plus
thirty minutes for an `unassigned_timeout`; neither is ever moved.
`preparation_started_at` and `ready_at` (#146) are the recorded kitchen
milestone times, `null` until recorded, for the Customer's food-progress
timeline; readiness never implies pickup or delivery.
`available_actions` (#145) is what the Customer may do now, decided at the
server's time: `["cancel"]` while the Order awaits acceptance strictly before
its deadline, otherwise `[]` (accepted, cancelled, at or past the deadline, or
a legacy Order without one). Offer Cancel only while it is listed.
`server_time` is when this read was made; the Order timeline (#147) shows it
as when the progress was last confirmed.

### POST /store/orders/:id/cancel

**Actor:** the owning Customer (`customer`, bearer or session), with the same
ownership and placed-Order checks as `GET /store/orders/:id/progress` (#145).
Another Customer's Order, an unpaid provisional row and an unknown id are all
`404` without effects; signed out is `401`. The body must be `{}`: actor,
time, outcome and refund amount come from the token and the server, and any
field is `400 invalid_data`.

Under the Order's lock the server re-reads the record and decides with the
same rule as staff rejection and the timeout sweep (`decideCancellation`):

- awaiting and strictly before the deadline: the cancellation is recorded as
  `customer_cancelled` by the Customer;
- at or after the deadline, even before the sweep has run: the Order receives
  the `acceptance_timeout` outcome by `system`, and the request still answers
  `200` with it;
- already cancelled (a double tap, a retried lost response, or a competing
  rejection or timeout): `200` with the recorded outcome and no new effects.

The cancellation and the Order's one full-refund obligation commit together
before the provider is contacted; the refund attempt and native Medusa
cancellation then run through the same settlement as rejection, so a refund
is never duplicated. The response has the same shape as
`GET /store/orders/:id/progress`:

```json
{
  "progress": {
    "order_id": "order_01...",
    "state": "cancelled",
    "available_actions": [],
    "cancellation": {
      "category": "customer_cancelled",
      "cancelled_at": "2026-11-18T12:02:10.000Z",
      "effective_at": "2026-11-18T12:02:10.000Z"
    },
    "refund": {
      "status": "succeeded",
      "amount_including_vat": 190,
      "...": "..."
    }
  },
  "server_time": "2026-11-18T12:02:11.000Z"
}
```

A `failed` refund is still owed (the Order stays cancelled; the operator's
retry is #49). Refusals carry `code` (also as `message`) and the current
`progress`, so the page can show the truth:

| Status | `code`                          | When                                                               |
| ------ | ------------------------------- | ------------------------------------------------------------------ |
| `400`  | `order_not_awaiting_acceptance` | The Restaurant has accepted it; the Customer must contact MTOGO.   |
| `400`  | `acceptance_timing_unavailable` | A legacy Order without a recorded deadline is left to an operator. |
| `409`  | `order_changed`                 | The record changed between read and write (a lost race).           |

## Partner dish availability (#108)

### POST /partner/restaurants/:id/dishes/:dish_id/availability

Authorized staff for `:id` send only `request_id`, the displayed positive
`revision`, and boolean `is_sold_out`. The request changes the manual sold-out
state alone; names, descriptions, prices, Restaurant participation and opening
stay as saved. A successful change returns `200` with the updated `dish` and
increments its revision. Repeating the same request identity and body returns
the saved dish without another history entry. A no-op returns the current dish.

`400 dish_input_invalid` rejects extra or invalid fields. `404 dish_not_found`
or `restaurant_not_found` hides foreign dishes and Restaurants. `409 dish_stale`
includes the current `dish`; `409 dish_retry_conflict` rejects a reused retry
identity with different values. Authentication and revocation are checked on
every request. `503 dish_publication_uncertain` means the write could not be
confirmed; refresh and retry with the same request identity.

The dish row keeps successful availability entries with actor, time, resource
and state. The next Customer menu fetch includes the saved `is_sold_out` and
revision. Sold-out dishes remain visible and count as a published menu, even
when one is the last dish. They cannot be ordered; ordering must revalidate
this menu contract before payment.

## Partner dish editing (#107)

### POST /partner/restaurants/:id/dishes/:dish_id

Changes a published dish's bilingual content, inclusive DKK price, allergen declaration and
halal/chili/garlic declaration. The
Restaurant menu uses the next revision on its next fetch. The product and
variant identities remain stable; historical Order lines are untouched.

**Actor:** authorized Restaurant staff belonging to `:id` (bearer token).

| Field                | Type             | Required | Rules                                                                                                  |
| -------------------- | ---------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `request_id`         | string           | yes      | Stable retry identity, 1–100 ASCII letters, digits, `_` or `-`                                         |
| `revision`           | integer          | yes      | Positive revision displayed when the form was opened                                                   |
| `name.da`, `name.en` | string           | yes      | Both nonblank plain-text names, at most 120 characters each                                            |
| `description`        | object or `null` | yes      | `null` removes it; otherwise both `da` and `en` are nonblank plain text, at most 2,000 characters each |
| `price`              | string           | yes      | Positive DKK display amount with at most two decimals, dot or comma separator                          |
| `allergens`          | object           | yes      | `unknown`, or `supplied` with `contains`, `may_contain` and `none_declared`                            |
| `food_labels`        | array            | yes      | Exactly one stable seeded `halal`, `chili` and `garlic` ID, each with state `yes`, `no` or `unknown`   |

```json
{
  "request_id": "edit-2026-11-14-1",
  "revision": 1,
  "name": { "da": "Dagens ret", "en": "Dish of the day" },
  "description": { "da": "Tomat", "en": "Tomato" },
  "price": "105,50",
  "allergens": { "status": "unknown" },
  "food_labels": [
    { "food_label_id": "fl_halal", "state": "unknown" },
    { "food_label_id": "fl_chili", "state": "unknown" },
    { "food_label_id": "fl_garlic", "state": "unknown" }
  ]
}
```

**Success:** `200` with `{ "categories": [ ... ] }`, the current published
menu including dish `revision: 2` and price `amount: 105.5`. Repeating the
same identity and payload returns the saved version.

| Status | Code                                       | When                                                                                      |
| ------ | ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `400`  | `dish_input_invalid`                       | A field fails validation                                                                  |
| `400`  | `dish_allergens_invalid`                   | A catalogue ID, subordinate detail or declaration combination is invalid                  |
| `400`  | `dish_food_labels_invalid`                 | The fixed halal/chili/garlic declaration is incomplete or uses another catalogue ID       |
| `401`  | authentication error                       | No valid staff token                                                                      |
| `403`  | `staff_access_revoked`                     | Access was revoked before this request                                                    |
| `404`  | `restaurant_not_found` or `dish_not_found` | Another Restaurant or no current published dish                                           |
| `409`  | `dish_stale`                               | Revision changed; response includes the latest `dish` for review                          |
| `409`  | `dish_retry_conflict`                      | A saved retry identity has different values                                               |
| `503`  | `dish_publication_uncertain`               | A commit acknowledgement or compensation could not be confirmed; retry with the same body |

`GET /partner/restaurants/:id/dishes` remains the ownership-checked,
`no-store` read used to refresh the menu after a save or conflict. Dish creation
requires the same `allergens` field. For supplied data, each list entry is
`{ "allergen_id": "alg_…", "detail_ids": ["ald_…"] }`, using IDs from
`GET /partner/food-catalogue`. The same allergen cannot appear twice or in both
lists; detail IDs must belong to their selected cereal or nut group. When both
lists are empty, `none_declared` must be `true`; otherwise it must be `false`.
Unknown accepts no lists. The complete declaration is saved with the guarded
dish revision and successful-change record. Food labels use the fixed seeded IDs from
`GET /partner/food-catalogue`; they are separate from allergens, and halal is not a
certification claim.

An API Route is a REST API endpoint.

An API Route is created in a TypeScript or JavaScript file under the `/src/api` directory of your Medusa application. The file’s name must be `route.ts` or `route.js`.

> Learn more about API Routes in [this documentation](https://docs.medusajs.com/learn/fundamentals/api-routes)

For example, to create a `GET` API Route at `/store/hello-world`, create the file `src/api/store/hello-world/route.ts` with the following content:

```ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json({
    message: "Hello world!",
  })
}
```

## Supported HTTP methods

The file based routing supports the following HTTP methods:

- GET
- POST
- PUT
- PATCH
- DELETE
- OPTIONS
- HEAD

You can define a handler for each of these methods by exporting a function with the name of the method in the paths `route.ts` file.

For example:

```ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  // Handle GET requests
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  // Handle POST requests
}

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  // Handle PUT requests
}
```

## Parameters

To create an API route that accepts a path parameter, create a directory within the route's path whose name is of the format `[param]`.

For example, if you want to define a route that takes a `productId` parameter, you can do so by creating a file called `/api/products/[productId]/route.ts`:

```ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { productId } = req.params

  res.json({
    message: `You're looking for product ${productId}`,
  })
}
```

To create an API route that accepts multiple path parameters, create within the file's path multiple directories whose names are of the format `[param]`.

For example, if you want to define a route that takes both a `productId` and a `variantId` parameter, you can do so by creating a file called `/api/products/[productId]/variants/[variantId]/route.ts`.

## Using the container

The Medusa container is available on `req.scope`. Use it to access modules' main services and other registered resources:

```ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const productModuleService = req.scope.resolve("product")

  const [, count] = await productModuleService.listAndCount()

  res.json({
    count,
  })
}
```

## Middleware

You can apply middleware to your routes by creating a file called `/api/middlewares.ts`. This file must export a configuration object with what middleware you want to apply to which routes.

For example, if you want to apply a custom middleware function to the `/store/custom` route, you can do so by adding the following to your `/api/middlewares.ts` file:

```ts
import { defineMiddlewares } from "@medusajs/framework/http"
import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"

async function logger(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
) {
  console.log("Request received")
  next()
}

export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/custom",
      middlewares: [logger],
    },
  ],
})
```

The `matcher` property can be either a string or a regular expression. The `middlewares` property accepts an array of middleware functions.

## Restaurant registration and setup

Every `/admin/restaurants` route requires a `user` actor (MTOGO operator), using
session or bearer authentication. Missing authentication returns `401`; Customer
and Restaurant staff tokens are refused (`401` or `403`). All mutations run
compensated workflows. Admin turns warning and eligibility codes into English.

### POST /admin/restaurants

Registers an Inactive, Closed Restaurant. All fields are required.

| Field                 | Type   | Required | Rules                                |
| --------------------- | ------ | -------- | ------------------------------------ |
| `name`                | string | yes      | Trimmed, nonblank, at most 255 chars |
| `address_street`      | string | yes      | Trimmed, nonblank, at most 255 chars |
| `address_postal_code` | string | yes      | Exactly four ASCII digits            |
| `address_city`        | string | yes      | Trimmed, nonblank, at most 255 chars |
| `contact_phone`       | string | yes      | Trimmed, nonblank, at most 255 chars |
| `contact_email`       | string | yes      | Valid email, at most 255 chars       |

```json
{
  "name": "Pizzeria Nørrebro",
  "address_street": "Nørrebrogade 1",
  "address_postal_code": "2200",
  "address_city": "København N",
  "contact_phone": "+45 12 34 56 78",
  "contact_email": "kontakt@pizzeria.example"
}
```

**Success:** `200` with `{ "restaurant": { ... }, "warnings": [] }`. Restaurant
includes `id`, the registration fields, `is_active`, `is_open`, timestamps,
`receiving_new_orders` and `reason` (`restaurant_inactive` initially). The internal
address-comparison key is never returned. No delivery area is inferred from the
pickup address. Participation/opening fields are rejected in request bodies.

A matching address still saves successfully, with:

```json
{
  "warnings": [
    { "code": "same_pickup_address", "restaurant_ids": ["res_existing"] }
  ]
}
```

**Failures:** `400` for invalid/missing fields or unknown properties. Validation
messages name the field; email and postal-code errors include
`contact_email:email_invalid` or `address_postal_code:postal_code_invalid`.

### GET /admin/restaurants

**Actor:** MTOGO operator. **Success:** `200` with
`{ "restaurants": [...], "count": 1, "limit": 20, "offset": 0 }`.

| Query    | Type    | Default | Rules                                     |
| -------- | ------- | ------- | ----------------------------------------- |
| `q`      | string  | absent  | Name or pickup postal code, max 255 chars |
| `limit`  | integer | 20      | 1–100                                     |
| `offset` | integer | 0       | Zero or greater                           |

Results are newest first, with ID as the tie breaker. Each result includes
participation, opening and Receiving new Orders status as above. **Failure:**
`400` for invalid pagination or query input.

### GET /admin/restaurants/{id}

**Actor:** MTOGO operator. **Success:** `200` with `{ "restaurant": { ... } }`:
the registration fields and status, plus the setup below. **Failure:** `404` if
unknown. Create, update and every setup route return this same Restaurant.

```json
{
  "restaurant": {
    "id": "res_01...",
    "name": "Pizzeria Nørrebro",
    "is_active": false,
    "is_open": false,
    "receiving_new_orders": false,
    "reason": "restaurant_inactive",
    "delivery_area_postal_codes": ["2100", "2200"],
    "delivery_area": [
      { "postal_code": "2100", "name": "København Ø" },
      { "postal_code": "2200", "name": "København N" }
    ],
    "commercial_terms": {
      "terms_version": "common_mvp_v1",
      "amounts_exclude_vat": true,
      "commission_tiers": [
        { "from_amount": 0, "to_amount": 100, "rate_percent": 6 },
        { "from_amount": 100, "to_amount": 500, "rate_percent": 5 },
        { "from_amount": 500, "to_amount": 1000, "rate_percent": 4 },
        { "from_amount": 1000, "to_amount": null, "rate_percent": 3 }
      ],
      "monthly_service_fee": { "amount": 100, "currency_code": "dkk" },
      "agreement": {
        "terms_version": "common_mvp_v1",
        "agreed_at": "2026-11-11T20:30:00.000Z",
        "recorded_by": { "id": "user_01...", "email": "operator@example.test" }
      }
    },
    "staff": {
      "pending": [
        {
          "id": "rstf_01...",
          "name": "Mette Jensen",
          "email": "mette@pizzeria.example",
          "status": "pending",
          "invited_by": "user_01...",
          "created_at": "2026-11-12T09:00:00.000Z",
          "accepted_at": null,
          "revoked_at": null,
          "revoked_by": null,
          "invitation": {
            "expires_at": "2026-11-13T09:00:00.000Z",
            "invite_link": "http://localhost:8100/invite?token=eyJ..."
          }
        }
      ],
      "authorized": [
        {
          "id": "rstf_02...",
          "name": "Jonas Holm",
          "email": "jonas@pizzeria.example",
          "status": "authorized",
          "invited_by": "user_01...",
          "created_at": "2026-11-11T09:00:00.000Z",
          "accepted_at": "2026-11-11T09:30:00.000Z",
          "revoked_at": null,
          "revoked_by": null,
          "invitation": null,
          "revoke_warnings": ["last_authorized_staff"]
        }
      ],
      "former": []
    },
    "menu": { "published_dish_count": 0 },
    "readiness": {
      "can_activate": false,
      "requirements": [
        { "code": "pickup_address_missing", "missing": false },
        { "code": "contacts_missing", "missing": false },
        { "code": "authorized_staff_missing", "missing": true },
        { "code": "commercial_terms_missing", "missing": false },
        { "code": "published_menu_missing", "missing": true },
        { "code": "delivery_area_missing", "missing": false }
      ]
    }
  }
}
```

Postal codes are sorted. `delivery_area` names each code from the postal code
register; `name` is `null` for a code the register no longer has. `agreement` is `null` until terms are recorded; the
tiers and fee are always present for display. `recorded_by.email` is `null` if
the operator no longer exists. `readiness.requirements` always lists all six
requirements in this order. `staff` groups staff oldest first: `pending` with
their invitation's expiry and link, `authorized`, and `former` (revoked).
`invitation` is `null` for authorized and former staff. Each authorized staff
member carries `revoke_warnings`, the warnings Admin confirms before revoking
them: `["last_authorized_staff"]` when they are the only authorized staff
member, otherwise `[]`. Former staff have `revoked_at` and `revoked_by`
(`{ "id", "email" }`, with `email` `null` if the operator no longer exists).
Only authorized staff meet `authorized_staff_missing`. `menu.published_dish_count`
counts the products linked to the Restaurant with status `published`; sold-out
dishes count.

### POST /admin/restaurants/{id}

**Actor:** MTOGO operator. Updates any subset of the six registration fields;
at least one is required, and supplied fields follow the creation rules.
Omitted fields remain unchanged. **Success:** `200` with
`{ "restaurant": { ... }, "warnings": [] }`. Address warnings exclude the edited
Restaurant itself. **Failures:** `400` for invalid, empty or unknown fields;
`404` for an unknown Restaurant. Participation and opening cannot be changed here.

### POST /admin/restaurants/{id}/delivery-area-postal-codes

**Actor:** MTOGO operator. Adds one postal code to the delivery area. The code
must exist in the Danish postal code register. Adding one the Restaurant already
serves changes nothing.

| Field         | Type   | Required | Rules                                    |
| ------------- | ------ | -------- | ---------------------------------------- |
| `postal_code` | string | yes      | Exactly four ASCII digits, no whitespace |

```json
{ "postal_code": "2200" }
```

**Success:** `200` with `{ "restaurant": { ... } }` as in the GET above.

| Status | When                                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------- |
| `400`  | Not four digits or not in the register (message contains `postal_code_invalid`), missing or unknown field |
| `404`  | Unknown Restaurant                                                                                        |

### POST /admin/restaurants/{id}/delivery-area-postal-codes/batch

**Actor:** MTOGO operator. Adds and removes postal codes in one all-or-nothing
change, for example a whole town. Codes already served are not added twice, and
codes the Restaurant does not serve are ignored on removal.

| Field    | Type     | Required              | Rules                                                |
| -------- | -------- | --------------------- | ---------------------------------------------------- |
| `add`    | string[] | one of `add`/`remove` | At most 1,100 four-digit codes, each in the register |
| `remove` | string[] | one of `add`/`remove` | At most 1,100 four-digit codes; none also in `add`   |

```json
{ "add": ["1050", "1051", "2100"], "remove": ["2200"] }
```

**Success:** `200` with `{ "restaurant": { ... } }` as in the GET above.

An active Restaurant always keeps at least one postal code: a change that
would leave it none is refused and changes nothing. Replacing every code in one
change (`add` and `remove` together) is allowed.

| Status | When                                                                                                                                               |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | Both lists empty, a code in both, too many codes, unknown field, or codes not in the register (`postal_code_invalid: 0000, 9999`, nothing changes) |
| `400`  | `not_allowed` with `last_postal_code_while_active`: the change would leave an active Restaurant without a delivery area                            |
| `404`  | Unknown Restaurant                                                                                                                                 |

### GET /admin/postal-codes

**Actor:** MTOGO operator. Searches the Danish postal code register, which the
`postal-code` module documents. Without `q` it returns the whole register.

| Query | Type   | Default | Rules                                                                                   |
| ----- | ------ | ------- | --------------------------------------------------------------------------------------- |
| `q`   | string | absent  | At most 255 chars. Matches the phrase in a town or municipality name, or a code's start |

**Success:** `200` with every match, sorted by code:

```json
{
  "postal_codes": [
    {
      "postal_code": "2200",
      "name": "København N",
      "municipality": "Københavns Kommune, Frederiksberg Kommune"
    }
  ]
}
```

**Failure:** `400` for a `q` over 255 characters.

### DELETE /admin/restaurants/{id}/delivery-area-postal-codes/{postal_code}

**Actor:** MTOGO operator. Removes one postal code. Removing one the Restaurant
does not serve changes nothing. **Success:** `200` with
`{ "restaurant": { ... } }`.

| Status | When                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------- |
| `400`  | `postal_code` in the path is not four digits (`postal_code_invalid`)                            |
| `400`  | `not_allowed` with `last_postal_code_while_active`: it is the last code of an active Restaurant |
| `404`  | Unknown Restaurant                                                                              |

### POST /admin/restaurants/{id}/commercial-terms

**Actor:** MTOGO operator. Records that the Restaurant agreed to the Common MVP
terms v1, with the current time as `agreed_at` and the signed-in operator as
`recorded_by`. Recording again while an agreement exists changes nothing.

| Field           | Type   | Required | Rules                   |
| --------------- | ------ | -------- | ----------------------- |
| `terms_version` | string | yes      | Exactly `common_mvp_v1` |

```json
{ "terms_version": "common_mvp_v1" }
```

**Success:** `200` with `{ "restaurant": { ... } }`.

| Status | When                                       |
| ------ | ------------------------------------------ |
| `400`  | Missing or other version, or unknown field |
| `404`  | Unknown Restaurant                         |

### DELETE /admin/restaurants/{id}/commercial-terms

**Actor:** MTOGO operator. Removes the current agreement; it stays soft-deleted
in the database. Removing when none is recorded changes nothing. An active
Restaurant always keeps agreed terms, so deactivate it first. **Success:** `200`
with `{ "restaurant": { ... } }`.

| Status | When                                                                      |
| ------ | ------------------------------------------------------------------------- |
| `400`  | `not_allowed` with `commercial_terms_required_while_active`: it is active |
| `404`  | Unknown Restaurant                                                        |

### POST /admin/restaurants/{id}/staff-invitations

**Actor:** MTOGO operator. Invites a person as pending staff and returns a
one-time invite link to the partner app, valid for 24 hours. The operator sends
the link themselves; no email is sent. `invited_by` is the signed-in operator.

| Field   | Type   | Required | Rules                                |
| ------- | ------ | -------- | ------------------------------------ |
| `name`  | string | yes      | Trimmed, nonblank, at most 255 chars |
| `email` | string | yes      | Trimmed, valid email, max 255 chars  |

```json
{ "name": "Mette Jensen", "email": "mette@pizzeria.example" }
```

**Success:** `200` with the pending staff member, the invitation and the
Restaurant as in the GET above:

```json
{
  "staff": {
    "id": "rstf_01...",
    "name": "Mette Jensen",
    "email": "mette@pizzeria.example",
    "status": "pending"
  },
  "invitation": {
    "staff_id": "rstf_01...",
    "expires_at": "2026-11-13T09:00:00.000Z",
    "invite_link": "http://localhost:8100/invite?token=eyJ..."
  },
  "restaurant": { "...": "..." }
}
```

The link is `<PARTNER_PUBLIC_URL>/invite?token=<token>`; see the backend
environment template.

| Status | When                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `400`  | `code: "email_has_login"`: the email (ignoring case) has an MTOGO login of any kind, or belongs to pending or authorized staff of any Restaurant |
| `400`  | Missing or blank name, missing or invalid email (`email:email_invalid`), or unknown field                                                        |
| `404`  | Unknown Restaurant                                                                                                                               |

### POST /admin/restaurants/{id}/staff-invitations/{staff_id}/resend

**Actor:** MTOGO operator. Issues a new token and a new 24-hour expiry for a
pending invitation. The previous link stops working. No body. **Success:** `200`
with `{ "staff": { ... }, "invitation": { ... }, "restaurant": { ... } }` as
above.

| Status | When                                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------- |
| `404`  | Unknown Restaurant, or `code: "staff_invitation_not_found"`: no pending staff with that id at this Restaurant |

### DELETE /admin/restaurants/{id}/staff-invitations/{staff_id}

**Actor:** MTOGO operator. Cancels a pending invitation: the pending staff
member is deleted with the invitation and its token, so the link stops working
and the email can be invited again. **Success:** `200` with
`{ "restaurant": { ... } }`. **Failure:** `404` as for resend.

### POST /admin/restaurants/{id}/staff/{staff_id}/revoke

**Actor:** MTOGO operator. Revokes an authorized staff member's access. It takes
effect on their next partner request, even with an unexpired token, and signing
in again is refused the same way (`403 staff_access_revoked`). The staff member
moves to `former` with `revoked_at` and `revoked_by`, and no longer counts for
readiness. Revoking the last authorized staff member is allowed; Admin first
shows the `last_authorized_staff` warning from the Restaurant detail. The
Restaurant's `is_active` and `is_open` do not change. Revoking staff that is
already revoked changes nothing and keeps the first revocation. No body.

```bash
curl -X POST http://localhost:9000/admin/restaurants/$ID/staff/$STAFF_ID/revoke \
  -H "Authorization: Bearer $TOKEN"
```

**Success:** `200` with `{ "restaurant": { ... } }`, the Restaurant detail.

| Status | When                                                                                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `401`  | Not signed in as an operator (no token, a Customer token or a staff token)                                                                                        |
| `404`  | Unknown Restaurant, or `code: "authorized_staff_not_found"`: no authorized or revoked staff with that id at this Restaurant (pending staff are cancelled instead) |

### POST /admin/restaurants/{id}/activate

**Actor:** MTOGO operator. Activates the Restaurant after checking the six
activation requirements again on the server, so a stale page cannot activate an
incomplete Restaurant (ADR-0008). Takes no body. The Restaurant becomes
`is_active: true` and stays `is_open: false` until its staff open it. Under the
Restaurant's lock it records an `activated` history entry with the operator and
emits `restaurant.activated` with `{ "id": "res_..." }`. Activating an active
Restaurant returns the current state, records nothing and emits nothing.

**Success:** `200` with `{ "restaurant": { ... } }` as in the GET above.

**Refusal:** `400` `not_allowed` when requirements are missing. The message
names the missing codes in checklist order, and `missing` lists them for the UI:

```json
{
  "type": "not_allowed",
  "message": "activation_requirements_missing: published_menu_missing",
  "missing": ["published_menu_missing"]
}
```

| Status | When                                 |
| ------ | ------------------------------------ |
| `400`  | One or more requirements are missing |
| `401`  | Not signed in as an operator         |
| `404`  | Unknown Restaurant                   |

### POST /admin/restaurants/{id}/deactivate

**Actor:** MTOGO operator. Stops the Restaurant's participation: it becomes
`is_active: false` and `is_open: false`, so reactivating it later never brings
Orders by surprise. Under the Restaurant's lock it records a `deactivated`
history entry with the operator and the reason, and emits
`restaurant.deactivated` with `{ "id": "res_..." }`. When the Restaurant was
open it first records `closed` with the operator as actor, so newest first
shows `deactivated` on top, and also emits `restaurant.closed`. Deactivating an inactive Restaurant returns the
current state, records nothing and emits nothing. Existing Orders are not
touched.

| Field    | Type   | Required | Rules                                                              |
| -------- | ------ | -------- | ------------------------------------------------------------------ |
| `reason` | string | yes      | Not blank after trimming, at most 1,000 characters; stored trimmed |

```json
{ "reason": "Hygiene inspection pending" }
```

**Success:** `200` with `{ "restaurant": { ... } }` as in the GET above.
Reactivation is `POST /admin/restaurants/{id}/activate`: it checks the
activation requirements again and leaves the Restaurant Closed.

| Status | When                                                                                                                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | `invalid_data`: the reason is missing, empty, blank or not text (`reason:deactivation_reason_required`), too long, or an unknown field |
| `401`  | Not signed in as an operator                                                                                                           |
| `404`  | Unknown Restaurant                                                                                                                     |

### GET /admin/restaurants/{id}/history

**Actor:** MTOGO operator. Lists one page of the Restaurant's history entries,
newest first. Query: `limit` (1–100, default 20) and `offset` (0 or more,
default 0); `count` is the total number of entries. Entries recorded together
share their time and keep their order by `id`.
Entries are append-only. `actor_name` is the actor's name when the entry was
recorded: an operator's first and last name, or their email when Admin has no
name for them. `reason` is set only for `deactivated`.

```json
{
  "history": [
    {
      "id": "rshe_01...",
      "kind": "activated",
      "occurred_at": "2026-11-13T09:30:00.000Z",
      "actor_type": "user",
      "actor_id": "user_01...",
      "actor_name": "Lene Holm",
      "reason": null
    }
  ],
  "count": 1,
  "limit": 20,
  "offset": 0
}
```

`kind` is `activated`, `deactivated`, `opened` or `closed`; `actor_type` is
`user` or `restaurant_staff`.

| Status | When                         |
| ------ | ---------------------------- |
| `400`  | `limit` or `offset` invalid  |
| `401`  | Not signed in as an operator |
| `404`  | Unknown Restaurant           |

### POST /admin/restaurants/check-pickup-address

**Actor:** MTOGO operator. Previews a duplicate warning before saving. Takes
`address_street`, `address_postal_code`, `address_city` with the rules above and
optional `exclude_id` for edits. **Success:** `200` with `{ "warnings": [] }` or
the `same_pickup_address` warning shown above. **Failure:** `400` for invalid input.
The create/update response checks again; a preview never reserves an address.

## Partner app: Restaurant staff

`/partner/*` is the namespace for the partner app (ADR-0017). Medusa gives it no
default authentication, CORS or publishable-key check, so each route declares its
actor in `middlewares.ts`. The partner app calls these routes only from its
server side, with the staff member's token as a bearer token; it never uses
Medusa's session cookie.

Restaurant staff use Medusa's own auth routes with the `restaurant_staff` actor
type and the email and password provider. They are not documented again here;
see the [Medusa auth API reference](https://docs.medusajs.com/api/store#auth):

- `POST /auth/restaurant_staff/emailpass` with `email` and `password` returns
  `{ "token": "..." }`, or `401` for a wrong email or password. The token carries
  the staff id only when the login belongs to staff; a login without staff gets
  `401` from every partner route.

### GET /partner/me

Returns the signed-in staff member and their Restaurant. Every partner request
checks that the staff member is still authorized, so a revocation takes effect
on the next request instead of when the token expires.

**Actor:** Restaurant staff (`restaurant_staff`, bearer token only)

```bash
curl http://localhost:9000/partner/me -H "Authorization: Bearer $TOKEN"
```

**Success:** `200` with

```json
{
  "staff": {
    "id": "rstf_01...",
    "name": "Sofie Jensen",
    "email": "sofie@pizzeria.example",
    "status": "authorized",
    "restaurant_id": "res_01..."
  },
  "restaurant": { "id": "res_01...", "name": "Pizzeria Nørrebro" }
}
```

| Status | When                                                                                                       |
| ------ | ---------------------------------------------------------------------------------------------------------- |
| `401`  | No token, an invalid or expired token, an Admin user or Customer token, or a login that never became staff |
| `403`  | `code: "staff_access_revoked"`: the staff member was revoked or no longer exists                           |

For revoked staff the `403` also names the Restaurant whose access ended, so
the partner app can say "Your access to Pizzeria Nørrebro has ended". A token
for staff that no longer exists gets the refusal without `restaurant`.

```json
{
  "code": "staff_access_revoked",
  "type": "forbidden",
  "message": "staff_access_revoked",
  "restaurant": { "name": "Pizzeria Nørrebro" }
}
```

### GET /partner/staff-invitations/{token}

**Actor:** none. The invite link's token is the credential, as in Medusa's admin
invite. Returns what the invitation page shows.

```bash
curl http://localhost:9000/partner/staff-invitations/$INVITE_TOKEN
```

**Success:** `200` with

```json
{
  "invitation": {
    "restaurant": { "name": "Pizzeria Nørrebro" },
    "staff": { "name": "Mette Jensen", "email": "mette@pizzeria.example" }
  }
}
```

| Status | When                                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------- |
| `400`  | `code: "invitation_invalid"`: the token expired, was replaced by a resend, was used, was cancelled or is unknown |

### POST /partner/staff-invitations/accept

**Actor:** a `restaurant_staff` email and password login that is not staff yet
(bearer token from `POST /auth/restaurant_staff/emailpass/register`). Makes the
invited person authorized staff: the staff id is stored in the login's app
metadata and the invitation is deleted, so the link stops working. Sign in again
afterwards to get a token that carries the staff id.

| Field   | Type   | Required | Rules                             |
| ------- | ------ | -------- | --------------------------------- |
| `token` | string | yes      | The invite link's token, nonempty |

```bash
curl -X POST http://localhost:9000/partner/staff-invitations/accept \
  -H "Authorization: Bearer $REGISTRATION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "token": "'"$INVITE_TOKEN"'" }'
```

**Success:** `200` with the staff member and Restaurant as in `GET /partner/me`.

| Status | When                                                                                                                             |
| ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | `code: "invitation_invalid"`: as above, the login's email is not the invited email (case ignored), or the login is already staff |
| `400`  | Missing or empty `token`, or an unknown field                                                                                    |
| `401`  | No token, or a token for another actor type                                                                                      |

### GET /partner/restaurants/{id}

**Actor:** Restaurant staff (`restaurant_staff`, bearer token only). Returns the
staff member's own Restaurant, read-only, for the Overview.

```bash
curl http://localhost:9000/partner/restaurants/$RESTAURANT_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Success:** `200` with

```json
{
  "restaurant": {
    "id": "res_01...",
    "name": "Pizzeria Nørrebro",
    "address_street": "Nørrebrogade 1",
    "address_postal_code": "2200",
    "address_city": "København N",
    "contact_phone": "+45 12 34 56 78",
    "contact_email": "kontakt@pizzeria.example",
    "delivery_area": [{ "postal_code": "2200", "name": "København N" }],
    "is_active": false,
    "is_open": false,
    "receiving_new_orders": false,
    "reason": "restaurant_inactive"
  }
}
```

| Status | When                                                                                       |
| ------ | ------------------------------------------------------------------------------------------ |
| `401`  | As for `GET /partner/me`                                                                   |
| `403`  | `code: "staff_access_revoked"`: as for `GET /partner/me`                                   |
| `404`  | `code: "restaurant_not_found"`: another Restaurant or an unknown one, answered identically |

### GET /partner/orders

**Actor:** Restaurant staff (`restaurant_staff`, bearer token only). Returns one
page of the staff member's own Restaurant's paid Orders (#140). The Restaurant
comes from the staff record, never from the request. Ownership is the
Restaurant recorded at placement, so a closed or deactivated Restaurant's staff
still see its existing Orders.

| Query    | Values                                      |
| -------- | ------------------------------------------- |
| `view`   | `awaiting` (default), `active` or `history` |
| `limit`  | 1 to 50, default 20                         |
| `offset` | 0 or more, default 0                        |

| View       | Operational states               | Order                                                                      |
| ---------- | -------------------------------- | -------------------------------------------------------------------------- |
| `awaiting` | `awaiting_acceptance`            | Earliest `acceptance_deadline` first, then `id`; no deadline (legacy) last |
| `active`   | `accepted`, `preparing`, `ready` | Oldest `placed_at` first, then `id`                                        |
| `history`  | `cancelled`                      | Newest `placed_at` first, then `id`                                        |

```bash
curl "http://localhost:9000/partner/orders?view=awaiting&limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

**Success:** `200` with

```json
{
  "orders": [
    {
      "id": "order_01...",
      "display_id": 42,
      "state": "awaiting_acceptance",
      "placed_at": "2026-11-18T12:00:00.000Z",
      "acceptance_deadline": "2026-11-18T12:05:00.000Z",
      "acceptance_window": "open",
      "accepted_at": null,
      "preparation_started_at": null,
      "ready_at": null,
      "available_actions": ["accept", "reject"],
      "currency_code": "dkk",
      "total_including_vat": 218,
      "items": [
        {
          "id": "ordli_01...",
          "name": "Margherita",
          "quantity": 2,
          "unit_price_including_vat": 109,
          "total_including_vat": 218,
          "purchased": {
            "status": "preserved",
            "name": { "da": "Margherita", "en": "Margherita" },
            "allergens": {
              "status": "supplied",
              "contains": [
                {
                  "number": 1,
                  "code": "cereals",
                  "name": {
                    "da": "Korn, der indeholder gluten",
                    "en": "Cereals containing gluten"
                  },
                  "details": [
                    {
                      "code": "wheat",
                      "name": { "da": "Hvede", "en": "Wheat" }
                    }
                  ]
                }
              ],
              "may_contain": [],
              "none_declared": false
            },
            "labels": [
              {
                "code": "halal",
                "name": { "da": "Halal", "en": "Halal" },
                "description": {
                  "da": "Restaurantens egen angivelse af halal. MTOGO certificerer ikke maden.",
                  "en": "Halal as declared by the Restaurant. MTOGO does not certify the food."
                },
                "state": "unknown"
              }
            ]
          }
        }
      ]
    }
  ],
  "count": 1,
  "offset": 0,
  "limit": 20,
  "server_time": "2026-11-18T12:01:00.000Z"
}
```

`acceptance_window` is the backend's decision at `server_time`: `open` before
the deadline, `elapsed` at or after it, and `unavailable` when the Order has no
recorded placement time (placed before #140) or is no longer awaiting
acceptance. It is a display fact only: reading never accepts, cancels or
expires an Order. `accepted_at`, `preparation_started_at` and `ready_at` are the
recorded milestone times, `null` until recorded; the actors stay in the record.
`available_actions` lists what staff may do at `server_time`: `["accept",
"reject"]` while awaiting and the window is open, `["start_preparation"]` once
accepted, `["ready"]` while preparing, otherwise `[]`. The action routes decide
again when they receive the request. Amounts include VAT, as menu prices do (ADR-0012). Item
`name`, quantities and prices are Medusa's purchase snapshot (`name` is the
retained English title).

`purchased` holds the kitchen facts frozen when the Customer's basket passed
its last review before payment (#141); later menu edits, removals and
declaration changes never alter them. Both languages are returned, and the
partner app shows the staff member's language, not the Customer's Order
language. `allergens` is `{ "status": "unknown" }` when the Restaurant gave no
declaration, which is different from a `supplied` declaration with
`none_declared: true`. Only `none_declared: true` means allergen-free: the
partner app shows a `supplied` declaration with empty lists but no
`none_declared` as unknown, never as safe. Allergens keep their Annex II `number`
and `code` and any specific types (`details`); each food label keeps its
`code`, names and description and is `yes`, `no` or `unknown`. An Order placed before these facts were
recorded, or whose stored entry for that line is damaged, has
`{ "status": "unavailable" }`: nothing is filled in from today's menu, and
the Order's other well-formed lines keep their facts. The response carries no Customer account or contact details.

| Status | When                                                         |
| ------ | ------------------------------------------------------------ |
| `400`  | An unknown `view`, a `limit` above 50 or a negative `offset` |
| `401`  | As for `GET /partner/me`                                     |
| `403`  | `code: "staff_access_revoked"`: as for `GET /partner/me`     |

### GET /partner/orders/{id}

**Actor:** Restaurant staff (`restaurant_staff`, bearer token only). One Order of
the staff member's own Restaurant, `{ "order": { ... }, "server_time": "..." }`
with the same Order fields as the list, including `available_actions`.

| Status | When                                                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------- |
| `401`  | As for `GET /partner/me`                                                                              |
| `403`  | `code: "staff_access_revoked"`: as for `GET /partner/me`                                              |
| `404`  | `code: "order_not_found"`: another Restaurant's Order, an unpaid or unknown one, answered identically |

### POST /partner/orders/{id}/accept

**Actor:** Restaurant staff (`restaurant_staff`, bearer token only). Accepts an
awaiting Order of the staff member's own Restaurant (#142, spec #47 stories 9,
10, 12-14). The body is empty (`{}`). Any field, such as a time or an actor, is
refused with `400`. The time is the server's when it decides, and the actor is
the authenticated staff member.

```bash
curl -X POST http://localhost:9000/partner/orders/$ORDER_ID/accept \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'
```

The workflow checks the staff record, takes the Order's lock
(`order-operation:{order_id}`), reads the record again and decides with
the current server time. It writes `state: accepted`, `accepted_at`,
`accepted_by` (the staff id) and `revision + 1` in one update that only matches
the revision it read. Acceptance is allowed strictly before
`acceptance_deadline`. An Order placed at 18:00:00 cannot be accepted at
18:05:00, whatever the browser's clock or a later background job. Acceptance
starts no preparation, assigns no Delivery agent, creates no pickup milestone
and leaves the native Order `pending`. A closed or deactivated Restaurant's
staff can still accept its existing paid Orders.

**Success:** `200` with `{ "order": { ... }, "server_time": "..." }`, the Order
as `GET /partner/orders/{id}` returns it. A repeated or competing acceptance
of an Order that is already accepted (or further along) also returns `200`
with the original `accepted_at` and actor. The milestone is never recorded
twice.

| Status | When                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------ |
| `400`  | A non-empty body (`invalid_data`)                                                                            |
| `401`  | As for `GET /partner/me`                                                                                     |
| `403`  | `code: "staff_access_revoked"`: as for `GET /partner/me`                                                     |
| `404`  | `code: "order_not_found"`: another Restaurant's Order or an unknown one, answered identically                |
| `400`  | `code: "acceptance_window_elapsed"`: at or after the deadline                                                |
| `400`  | `code: "acceptance_timing_unavailable"`: a legacy Order without a recorded deadline; none is invented        |
| `400`  | `code: "order_not_awaiting_acceptance"`: the Order is cancelled                                              |
| `409`  | `code: "order_changed"`: the record changed between the guarded read and the write; read the Order and retry |

The `400` refusals come from the Order's current state (`not_allowed`), and the
`409` from a concurrent change (`conflict`), as the coding standard maps them.
Each also carries `order` and `server_time`, the Order as it is now, so the
screen can show the current outcome.

### GET /partner/orders/stream

**Actor:** Restaurant staff (`restaurant_staff`, bearer token only). The kitchen
feed (#148): a Server-Sent Events stream of small invalidation hints for the
staff member's own Restaurant. It carries no Order details; on a hint, staff
reread `GET /partner/orders` or `GET /partner/orders/{id}`. Hints are not proof
of anything: the durable records stay authoritative, and the partner app also
reloads on connect, on focus and every minute.

Access is checked before the stream opens, so a refusal is an ordinary JSON
error response. Once open, the response is `200` with
`Content-Type: text/event-stream` and `Cache-Control: no-cache, no-transform`
(proxies such as Caddy then neither compress nor buffer it).

| Event       | Data                                                      | When                                                                                  |
| ----------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `ready`     | `{ "server_time": "..." }`                                | Once, when the feed opens; the screen then rereads its Orders                         |
| `orders`    | `{ "orders": [{ "id": "order_...", "revision": 2 }] }`    | A paid Order was placed, or a persisted operational change raised an Order's revision |
| `heartbeat` | `{ "server_time": "..." }`                                | After the first read once open, then after 15 seconds without another event           |
| `ended`     | `{ "code": "staff_access_revoked" \| "session_expired" }` | Access was revoked or the token expired; the stream then closes                       |

The first heartbeat (or hint) proves that a read after `ready` went through,
so the partner app shows "Live" only then. Every second the feed rechecks the
staff record and the token's expiry (kept by the `recordSessionExpiry`
middleware in `src/api/session-expiry.ts`), then
reads the Restaurant's records changed in the last 30 seconds (at most 200,
indexed on `restaurant_id, updated_at`). Each Order revision is announced once
per connection. More than 200 changes in 30 seconds, or server and worker
clocks more than 30 seconds apart, can drop a hint; the partner app's
reconciliation every minute covers that. Because it reads durable records, writes from the Medusa
server and from a separate worker process both appear, without pub/sub. A
failed read closes the stream without `ended`, so the client reconnects or
falls back to polling. Closing the connection stops the reads. On `SIGTERM`
or `SIGINT` every open feed closes (without `ended`): Medusa's graceful
shutdown waits for open connections, so otherwise a deploy would hang while
the old process kept streaming and refusing every other request. Screens
reconnect to the new process.

```bash
curl -N http://localhost:9000/partner/orders/stream \
  -H "Authorization: Bearer <token>"
```

| Status | When                                                            |
| ------ | --------------------------------------------------------------- |
| `401`  | As for `GET /partner/me`                                        |
| `403`  | `code: "staff_access_revoked"`: revoked before the stream opens |

### POST /partner/orders/{id}/start-preparation and POST /partner/orders/{id}/ready

**Actor:** Restaurant staff (`restaurant_staff`, bearer token only). Records a
kitchen milestone on the staff member's own Restaurant's Order (#146, spec #47
stories 15-18): `start-preparation` on an `accepted` Order, `ready` on a
`preparing` Order. The body is empty (`{}`); any field, such as a time or an
actor, is refused with `400`.

```bash
curl -X POST http://localhost:9000/partner/orders/$ORDER_ID/start-preparation \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'
curl -X POST http://localhost:9000/partner/orders/$ORDER_ID/ready \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'
```

Both use the same guarded transition as acceptance: staff check, the Order's
lock, a fresh read and one update guarded by the revision and state it read.
`start-preparation` writes `state: preparing`, `preparation_started_at`,
`preparation_started_by` and `revision + 1`; `ready` writes `state: ready`,
`ready_at`, `ready_by` and `revision + 1`. Acceptance never starts preparation,
and readiness never fills in a missing preparation start. Neither waits for or
creates a Delivery agent assignment, and readiness records no pickup, delivery
or native Order completion (the native Order stays `pending` and unfulfilled).
A closed or deactivated Restaurant's staff can still progress its existing paid
Orders. Staff cannot undo a milestone or reject an accepted Order; inability to
fulfil goes to an MTOGO operator with the Order reference (#49). The new
revision of each milestone is announced on the kitchen feed (#148).

**Success:** `200` with `{ "order": { ... }, "server_time": "..." }`, as
`GET /partner/orders/{id}` returns it. A repeated or competing request for a
milestone that is already recorded (or an Order already further along) also
returns `200` with the first recorded time and actor; nothing is recorded twice.

| Status | When                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------- |
| `400`  | A non-empty body (`invalid_data`)                                                                 |
| `401`  | As for `GET /partner/me`                                                                          |
| `403`  | `code: "staff_access_revoked"`: as for `GET /partner/me`                                          |
| `404`  | `code: "order_not_found"`: another Restaurant's Order or an unknown one, answered identically     |
| `400`  | `code: "order_not_accepted"`: the Order still awaits acceptance                                   |
| `400`  | `code: "preparation_not_started"`: `ready` on an accepted Order whose preparation has not started |
| `400`  | `code: "order_cancelled"`: the Order is cancelled                                                 |
| `409`  | `code: "order_changed"`: as for acceptance                                                        |

Refusals carry `order` and `server_time` as for acceptance.

### POST /partner/orders/{id}/reject

**Actor:** Restaurant staff (`restaurant_staff`, bearer token only). Rejects an
awaiting Order of the staff member's own Restaurant, cancels it and attempts
its full refund (#143, spec #47 stories 11, 13, 14, 32, 33). The body is `{}`
or `{ "reason": "..." }`. The reason is optional, at most 1000 characters
(the shared reason bound, as for Restaurant deactivation), stored trimmed and
without control characters; a blank one counts as none. Any other field, such
as an actor, time or amount, is refused with `400`.

```bash
curl -X POST http://localhost:9000/partner/orders/$ORDER_ID/reject \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"reason":"The oven is broken"}'
```

Under the Order's lock the workflow re-reads the record and decides with the
server's time. Before the deadline it records `cancellation_category:
restaurant_rejected`, `cancelled_by` (the staff id) and the reason. At or after
the deadline the same request records the timeout outcome instead
(`acceptance_timeout`, `cancelled_by: "system"`, no reason). In the same
transaction it creates the Order's one `RefundObligation` (captured minus
already refunded, with a stable idempotency key), so both are committed before
the provider is contacted.

After the lock, the refund is attempted through Medusa's
`refundPaymentWorkflow` with that amount and key, and the obligation records
`pending`, `failed` or `succeeded`. Success is claimed only from the persisted
refund row. Native cancellation then runs Medusa's own core steps: reservations
released, uncaptured payments cancelled, the payment collection marked
`canceled`, `order.canceled` emitted and the Order `canceled`. Medusa's
`cancelOrderWorkflow` is not used, because it refunds without our key before
it cancels. A provider failure, or an interrupted native step, never
reactivates the Order. The obligation stays `failed` (owed) for operator
handling (#49). Only the request that cancelled settles: a repeated or
competing rejection returns the recorded cancellation and refund without
retrying the refund or emitting events again.

**Success:** `200` with `{ "order": { ... }, "server_time": "..." }`, the Order
as `GET /partner/orders/{id}` returns it, now with:

```json
{
  "state": "cancelled",
  "available_actions": [],
  "cancellation": {
    "category": "restaurant_rejected",
    "cancelled_at": "2026-11-18T12:02:10.000Z",
    "effective_at": "2026-11-18T12:02:10.000Z",
    "note": "The oven is broken"
  },
  "refund": {
    "status": "succeeded",
    "amount_including_vat": 190,
    "currency_code": "dkk",
    "last_attempted_at": "2026-11-18T12:02:10.000Z",
    "succeeded_at": "2026-11-18T12:02:11.000Z"
  }
}
```

`cancellation` and `refund` are `null` until the Order is cancelled, on every
partner Order read. `note` is shown to the Restaurant's own staff only.
`effective_at` is the acceptance deadline for an `acceptance_timeout`,
acceptance plus thirty minutes for an `unassigned_timeout` (#162) and
`cancelled_at` otherwise; `cancelled_at` is always the processing time (#144).
`food_credit` (#162) is `null` unless the Order owes the Restaurant a
prepared-food credit: `{ amount_excluding_vat, currency_code, funded_by:
"mtogo" }`, the full purchased food value excluding the assumed 25% VAT, with
no commission. It is an obligation for the later monthly statement, not a
bank payout.

| Status | When                                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------- |
| `400`  | An unknown field, a non-text reason or one over 1000 characters (`invalid_data`); nothing changes                |
| `401`  | As for `GET /partner/me`                                                                                         |
| `403`  | `code: "staff_access_revoked"`: as for `GET /partner/me`                                                         |
| `404`  | `code: "order_not_found"`: another Restaurant's Order or an unknown one, answered identically                    |
| `400`  | `code: "order_not_awaiting_acceptance"`: the Order is accepted or further along; staff contact an operator (#49) |
| `400`  | `code: "acceptance_timing_unavailable"`: a legacy Order without a recorded deadline is left to an operator       |
| `409`  | `code: "order_changed"`: the record changed between the guarded read and the write; read the Order and retry     |

Each refusal carries `order` and `server_time`, as for acceptance.

### POST /partner/restaurants/{id}/open and POST /partner/restaurants/{id}/close

**Actor:** Restaurant staff (`restaurant_staff`, bearer token only). Opens or
closes the staff member's own Restaurant (spec stories 49-52). Operators have
no route for either; they close a Restaurant only by deactivating it. Neither
route takes a body.

```bash
curl -X POST http://localhost:9000/partner/restaurants/$RESTAURANT_ID/open \
  -H "Authorization: Bearer $TOKEN"
```

Opening sets `is_open: true`, records an `opened` history entry with the staff
member as actor and emits `restaurant.opened` (`{ id }`). Closing sets
`is_open: false`, records `closed` and emits `restaurant.closed`. Asking for
the state the Restaurant is already in returns it unchanged, records nothing
and emits nothing. Closing an inactive Restaurant is allowed and changes
nothing.

**Success:** `200` with the same `{ "restaurant": { ... } }` as
`GET /partner/restaurants/{id}`, for example after opening:

```json
{
  "restaurant": {
    "id": "res_01...",
    "is_active": true,
    "is_open": true,
    "receiving_new_orders": true,
    "reason": null
  }
}
```

(The other fields are as in `GET /partner/restaurants/{id}`.)

| Status | When                                                                                       |
| ------ | ------------------------------------------------------------------------------------------ |
| `400`  | `code: "restaurant_inactive_cannot_open"` (`not_allowed`): opening an inactive Restaurant  |
| `401`  | As for `GET /partner/me`                                                                   |
| `403`  | `code: "staff_access_revoked"`: as for `GET /partner/me`                                   |
| `404`  | `code: "restaurant_not_found"`: another Restaurant or an unknown one, answered identically |

## Food reference catalogue

### GET /store/food-catalogue

Reads the fixed global database catalogue for Customer declarations. No Customer
login is needed; Medusa requires `x-publishable-api-key`. No Restaurant identifier
or locale parameter is needed. Both languages are returned together; clients
choose `name.da`/`name.en` and `description.da`/`description.en` without replacing
stable identities. Records are ordered by EU number; food labels are ordered
halal, chili, garlic. Reads use `Cache-Control: no-store`.

**Success:** `200`, with `allergens` and `food_labels` arrays. An allergen has
`id`, `code`, `number`, `name: { da, en }`, `description: { da, en }` and `details`.
Each detail has `id`, `code` and `name: { da, en }`; its containing group supplies
the parent. A food label has `id`, `code`, bilingual `name` and `description`,
with no number or details. Example group identity: `code: "cereals", number: 1`;
example detail: `code: "wheat"`. Generated internal IDs are distinct from EU
numbers. This is a reference response, not a dish's declaration.

**Failure:** `400` for a missing or invalid publishable key, using Medusa's
standard error response. There are no create/update/delete catalogue routes.

The response contains no icon markup or URLs. Clients use a trusted static
code-to-symbol mapping and retain readable labels even for an unrecognized code.
Keep halal/chili/garlic separate from allergens. Declarations must retain
Contains/May contain/Unknown and explicitly none declared; absent information
must never become an allergen-free claim. Halal does not imply certification.

### GET /partner/food-catalogue

The same read contract for authorized `restaurant_staff` bearer tokens. The
workflow checks the current staff record, including revocation, on every read.
Inactive or closed Restaurants may read the catalogue. It is global reference
data; no other Restaurant's private menu data is returned.

**Success:** `200` with the same bilingual response and `no-store` header.

| Status | When                                                     |
| ------ | -------------------------------------------------------- |
| `401`  | Missing, expired or wrong-actor bearer token             |
| `403`  | Missing or revoked staff record (`staff_access_revoked`) |

## Restaurant menu

### GET /store/restaurants/{id}/menu

Reads the current menu of one active Restaurant for Customers and signed-out
visitors. No login is needed; Medusa requires `x-publishable-api-key`. There is
no locale parameter: every name and description carries both languages and the
client chooses `da` or `en`. The response is never cached
(`Cache-Control: no-store`), so a saved change shows on the next fetch.

```json
{
  "restaurant": {
    "id": "res_01…",
    "name": "Pizzeria Nørrebro",
    "cover": null,
    "is_open": false,
    "receiving_new_orders": false,
    "reason": "restaurant_closed"
  },
  "categories": [
    {
      "id": "mcat_01…",
      "revision": 1,
      "name": { "da": "Pizza", "en": "Pizza" },
      "dishes": [
        {
          "id": "prod_01…",
          "variant_id": "variant_01…",
          "revision": 1,
          "name": { "da": "Pizza Margherita", "en": "Pizza Margherita" },
          "description": {
            "da": "Tomat og mozzarella",
            "en": "Tomato and mozzarella"
          },
          "price": {
            "amount": 109.5,
            "currency_code": "dkk",
            "includes_tax": true
          },
          "is_sold_out": false,
          "photo": null,
          "food_information": {
            "allergens": { "status": "unknown" },
            "labels": [
              { "code": "halal", "state": "unknown" },
              { "code": "chili", "state": "unknown" },
              { "code": "garlic", "state": "unknown" }
            ]
          }
        }
      ]
    }
  ]
}
```

| Field                             | Meaning                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `restaurant.cover`                | `null` before a cover is attached, otherwise a read URL for the validated Restaurant cover. Staging issues a fresh signed URL on each menu read                                                                                                                                                                                                                                       |
| `restaurant.is_open`              | Whether staff have opened the Restaurant. A Closed Restaurant's menu stays readable                                                                                                                                                                                                                                                                                                   |
| `restaurant.receiving_new_orders` | Whether a new Order could be placed now. `reason` is `restaurant_closed` or `delivery_area_missing` when it is `false`, otherwise `null`                                                                                                                                                                                                                                              |
| `categories`                      | The Restaurant's own categories in its order. A category without a valid dish is left out                                                                                                                                                                                                                                                                                             |
| `categories[].id`, `revision`     | Stable category identity and the revision of its published names                                                                                                                                                                                                                                                                                                                      |
| `dishes`                          | The category's valid published dishes in the Restaurant's order, sold-out ones included                                                                                                                                                                                                                                                                                               |
| `dishes[].id`                     | Stable dish identity (the product id). It does not change when the dish is edited                                                                                                                                                                                                                                                                                                     |
| `dishes[].variant_id`             | The dish's one sellable variant, which an Order line refers to                                                                                                                                                                                                                                                                                                                        |
| `dishes[].revision`               | Revision of the dish's published version. Every later change to its content, price or availability must raise it                                                                                                                                                                                                                                                                      |
| `dishes[].description`            | Both languages, or `null` when the Restaurant gave none                                                                                                                                                                                                                                                                                                                               |
| `dishes[].price`                  | Current price in kroner including VAT and delivery. `amount` is in display units with at most two decimals (`109.5` is DKK 109.50); nothing is added to it and it is not in øre                                                                                                                                                                                                       |
| `dishes[].is_sold_out`            | The manual availability switch. A sold-out dish is shown but cannot be ordered                                                                                                                                                                                                                                                                                                        |
| `dishes[].photo`                  | `null` until dish photos are stored; clients show their placeholder                                                                                                                                                                                                                                                                                                                   |
| `dishes[].food_information`       | Allergen status is `unknown` or `supplied` with distinct `contains`, `may_contain` and `none_declared`. Entries include stable EU number, code, bilingual name and specific cereal/nut details. Unknown is never an allergen-free claim. Food labels are a separate ordered array of bilingual seeded labels with `yes`, `no` or `unknown` state; legacy dishes default to `unknown`. |

A dish can be ordered only when `restaurant.receiving_new_orders` is `true` and
`is_sold_out` is `false`.

**Ordering handoff (#46).** A basket keeps `dishes[].id`, `variant_id`,
`revision` and `price.amount` as the Customer saw them. Before payment it reads
this route again: a dish that is missing was removed or is no longer valid, and
a different `revision`, `price.amount`, `is_sold_out` or
`receiving_new_orders` means the Customer must review the basket. Nothing is
substituted or charged at a higher price silently. This slice adds no basket or
payment behavior.

| Status | When                                                                                          |
| ------ | --------------------------------------------------------------------------------------------- |
| `200`  | The Restaurant is active, Open or Closed                                                      |
| `400`  | Missing or invalid publishable key (Medusa's standard response)                               |
| `404`  | `restaurant_not_found`: the Restaurant does not exist or is inactive. Both answer identically |

Only valid published dishes appear; the Restaurant module README defines valid.
The same definition gives Admin's `menu.published_dish_count` and the
`published_menu_missing` activation requirement.

## Restaurant browsing (#119)

The Customer homepage lists participating Restaurants and filters them by
where they deliver. Both routes are public store reads: no login, only
Medusa's `x-publishable-api-key`. Neither changes a delivery area, a saved
address or a basket; the storefront never calls `/admin/postal-codes`.

### GET /store/restaurants

Lists the active Restaurants in name order, Open or Closed, with the shared
eligibility rule's `receiving_new_orders` and `reason`. Inactive Restaurants
are absent, exactly as their menus are. With a location, only the Restaurants
whose **delivery area** contains one of its codes are listed, each once; the
pickup address plays no part. The response is never cached
(`Cache-Control: no-store`), so activation, opening and delivery-area changes
show on the next fetch.

**Actor:** Customer or signed-out visitor

| Query         | Type   | Required | Rules                                                                   |
| ------------- | ------ | -------- | ----------------------------------------------------------------------- |
| `postal_code` | string | no       | Four digits, in the Danish register; matches by delivery-area code      |
| `town`        | string | no       | A whole town name from the lookup, case ignored; resolves all its codes |

At most one of the two. A code and a town together answer `location_ambiguous`.

```json
{
  "restaurants": [
    {
      "id": "res_01…",
      "name": "Pizzeria Nørrebro",
      "address_city": "København N",
      "is_open": true,
      "receiving_new_orders": true,
      "reason": null,
      "cover": null,
      "delivery_area_match": {
        "served_postal_codes": 2,
        "location_postal_codes": 213
      }
    }
  ],
  "count": 1,
  "location": { "kind": "town", "name": "København K", "postal_codes": 213 }
}
```

| Field                               | Meaning                                                                                                                                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `restaurants[]`                     | An explicit public allowlist: identity, name, pickup city, opening and eligibility. Staff, contacts, terms, history and internal keys are never included                               |
| `restaurants[].cover`               | `null` before a cover is attached; otherwise the registered cover's read URL. Clients show the name placeholder when missing                                                           |
| `restaurants[].delivery_area_match` | Only with a location: how many of the location's codes the delivery area contains. Below `location_postal_codes` means part of the town; exact eligibility needs the destination code  |
| `location`                          | `null` without a filter. For a code: `kind` `postal_code`, `postal_code`, the town `name` and `postal_codes` `1`. For a town: `kind` `town`, `name` and the number of registered codes |

| Status | When                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------ |
| `200`  | The list, possibly empty                                                                               |
| `400`  | Missing or invalid publishable key; `postal_code` not four digits; `town` blank or over 255 characters |
| `400`  | `postal_code_unknown`: the code is not in the register                                                 |
| `400`  | `town_unknown`: no registered town has exactly that name                                               |
| `400`  | `location_ambiguous`: both parameters given                                                            |

A refused location is never answered with the unfiltered list.

### GET /store/postal-codes

The register search that operators use to pick a delivery area
(`searchPostalCodesWorkflow`), read-only for Customers: towns and
municipalities by text, any case, and postal codes by prefix. The storefront
groups the rows by town, so København K is one choice holding all 213 codes.

**Actor:** Customer or signed-out visitor

| Query | Type   | Required | Rules               |
| ----- | ------ | -------- | ------------------- |
| `q`   | string | yes      | 1 to 255 characters |

**Success:** `200` with `{ "postal_codes": [{ "postal_code", "name", "municipality" }] }`
in postal-code order, as `GET /admin/postal-codes` answers.

| Status | When                                                     |
| ------ | -------------------------------------------------------- |
| `400`  | Missing or invalid publishable key; `q` missing or blank |

Evidence: `integration-tests/http/restaurant-browsing.spec.ts`.

### Customer account language

Issue #85 uses the existing Medusa Customer boundary and core workflows:
`POST /store/customers` accepts the registration language in
`metadata.preferred_language`; authenticated Customers read it with
`GET /store/customers/me` and explicitly change it with
`POST /store/customers/me`. The field accepts only `"da"` or `"en"`; unsupported,
empty, non-string and null language values, null metadata and unknown top-level
fields return `400`. Omit metadata to leave it unchanged. Other metadata keys
retain Medusa's merge behavior. These routes still require a publishable key.

```json
{ "metadata": { "preferred_language": "en" } }
```

Success is `200` with the usual `{ "customer": { ... } }` response, including
`customer.metadata.preferred_language`. Updates always target the authenticated
Customer; another Customer ID in the request is refused. Signed-out and wrong-role
updates return `401`. Medusa Admin remains English only.

Security-message generation can read the current preference from the Customer
module's `metadata.preferred_language` (or the existing Customer HTTP boundary),
using the registration value for initial verification. It must not derive a
security-message language from an Order. This issue supplies the preference;
message generation belongs to the account-security work items. No Order is
updated, and no custom persistence model or migration is needed.

## Partner menu arrangement (#111)

`GET /partner/restaurants/{id}/menu-arrangement` requires current Restaurant staff
access and ownership. Returns `{ revision, categories }`, including empty
categories, bilingual names, category revisions and published dishes in saved
order. Attached dish photos carry a current read URL; dishes without photos
omit the `photo` field. Responses use `Cache-Control: no-store`.

`POST` at the same path accepts one strict body:

- `{ kind: "categories", revision, ids }`: complete category IDs in desired order.
- `{ kind: "dishes", revision, category_id, ids }`: complete dish IDs for that category.
- `{ kind: "move", revision, dish_id, source_id, target_id }`: append a dish to another owned category.

`revision` is the opaque GET revision. Successful requests return the new GET
shape. `409 menu_order_stale` includes `{ menu: { revision, categories } }` with
the actual state; `409 menu_order_invalid` rejects incomplete, duplicated or
foreign identifiers, including another Restaurant's source or target. Malformed
bodies return `400 menu_order_invalid`. Access follows the existing `401`/`403`
partner contract. Membership, positions, revisions and attribution are atomic;
refusals leave data unchanged. See the Restaurant module README for migration,
synchronization and HTTP evidence. No commerce identity or historical Order data
changes.

## Partner dish removal (#112)

### DELETE /partner/restaurants/:id/dishes/:dish_id

Authorized staff for the Restaurant send `{ "revision": 1 }` using the
currently displayed dish revision after confirming removal. Success returns
`200` with `{ "id": "prod_…" }`. The product and variant identities are
retained, while the dish no longer appears in current menus. The menu is
the source of availability for ordering; the underlying product remains stored. Ordering consumers must compare their saved
identities and revisions with the current menu and require Customer review
when a dish is missing or changed. Native Medusa product and cart endpoints
do not perform this menu check, so they alone cannot enforce the handoff.
Before-payment reconciliation belongs to the ordering feature. Existing Order
lines remain snapshots.

Invalid input returns `400 dish_input_invalid`; absent or foreign resources
return `404`, revoked staff receive `403 staff_access_revoked`, and stale
revisions return `409 dish_stale` with the current dish. Removing the last
valid published dish of an active Restaurant returns
`409 last_published_dish_while_active`, including when it is sold out.
Deactivate the Restaurant before removing that dish.

## Restaurant and dish photos (#113, #114)

Current staff may `POST /partner/restaurants/:id/cover` or
`POST /partner/restaurants/:id/dishes/:dish_id/photo` for their own Restaurant.
Both accept JSON `{ "request_id": "<UUID>", "revision": 1, "content": "<base64>" }`.
The revision comes from the partner Restaurant or dish read. `content` is the
actual JPEG, PNG or WebP bytes encoded as base64, not a URL or file ID. Success
returns `200` with `{ "cover": { "url": "…", "revision": 2 } }` or the same
shape under `photo`. The client never chooses a published URL or filename.
On staging, response and Customer read URLs are presigned for one hour from
registered, processed files in the private Tigris bucket. A new read issues a
fresh URL. The unsigned `PHOTO_S3_FILE_URL` base is never returned to guests.

The request body is limited to 7 MB and decoded input to 5 MiB and 20 million
pixels. Processing times out after 10 seconds and permits two active decodes
per backend process. Output is metadata-free WebP, at most 2048 pixels on its
longest side and 1 MiB. Each Restaurant may have 100 attachments or 50 MiB of
processed output and upload 20 photos per UTC day. POST replaces an existing
photo after validating and storing the new output. DELETE on either path takes
`{ "request_id": "<UUID>", "revision": 1 }` and returns the same shape with
`url: null`. Every successful action increments the resource revision. Reads
after removal use the existing placeholder.

Invalid images return `400 photo_invalid`; quotas return `400 photo_quota` or
`400 photo_rate_limit`; stale revisions return `409 photo_stale`. Foreign targets return `404
photo_target_not_found`, revoked staff `403 staff_access_revoked`, and storage
failure `503 photo_storage_failed`. A retry with the same request ID and target
returns its result while it is still current; a superseded retry returns `409
photo_stale`. Reuse for another target or action returns `409
photo_retry_conflict`. Failed processing leaves published state untouched.

## Customer email-change notices (#93)

### GET /admin/customer-email-change-notices

**Actor:** MTOGO operator (authenticated admin user).

Returns `200` with `notices`, containing the Customer ID, masked old and new
addresses and language for the oldest failed notice of each Customer. No
confirmation link is returned. After a retry, the next notice becomes visible.
An unauthenticated or unauthorized caller cannot access this endpoint.

### POST /admin/customer-email-change-notices/:customer_id/retry

**Actor:** MTOGO operator (authenticated admin user). No request body is needed.

Retries the Customer's oldest failed notice. Success returns `200` with
`{ "delivered": true }`. A Customer without a pending notice receives a
`customer_old_email_notice_not_pending` error. Delivery errors leave the notice
pending for a later retry. An unauthenticated or unauthorized caller cannot
access this endpoint.

## Operator dish inspection (#136)

### GET /admin/products/:id/dish

Requires an authenticated Medusa `user` (session, bearer or API key).
Restaurant staff and Customers cannot use their actor credentials here.
Returns `200 { dish }` with `restaurant: { id, name }`,
`category: { id, name: { da, en } }`, `name: { da, en }`,
`description: { da, en } | null`, `is_sold_out`
and `photo: { url } | null`. The category must belong to the linked Restaurant.
Descriptions come from the Restaurant-owned menu content, with nullable language
values retained for operator inspection of incomplete data. Both absent returns
`description: null`. Inactive Restaurants remain available for inspection. An ordinary Product without a linked
dish returns `200 { dish: null }`; a missing Product returns `404
product_not_found`. No mutation is exposed.

Photo reads resolve only the current registered attachment belonging to this
Restaurant and Product, through Medusa's File Module. Stored unsigned photo
URLs and generic Product images are not exposed as dish photos. Staging uses
short-lived signed URLs; the local provider uses its development static URL.
Responses use `Cache-Control: no-store`. A failed photo-provider read returns `photo: null` while preserving dish
details. The widget shows a named placeholder; general API failures still offer
Retry. Product and Restaurant menu reads share the same registered-photo reader.

### GET /admin/restaurants/:id/menu

Requires the existing authenticated operator access to `/admin/restaurants*`.
Returns `200 { restaurant_id, categories }` for an existing Restaurant, including
an inactive one. Each category contains `id`, bilingual `name` and `dishes`;
each dish contains its Product `id`, bilingual `name`, DKK `price`, manual
`is_sold_out` and current registered `photo: { url } | null`. Only that
Restaurant's valid published dishes are included, in the existing menu order.
A missing Restaurant returns `404 restaurant_not_found`. Responses use
`Cache-Control: no-store`. This read reuses the existing menu and photo
projection; it exposes neither menu editing nor stock quantities.

## GET /admin/products/{id}/dish/photo (#150)

Operator-only (Admin session, bearer or API key). Redirects (302, `no-store`)
to a fresh read URL of the registered dish photo owned by the Product's linked
Restaurant. With no photo, a removed or unreadable photo, an unlinked, deleted
or unknown Product, it returns 200 with a placeholder SVG so the native Admin
row keeps rendering. It is the `thumbnail` value stored on dish Products; see
[Admin customizations](../admin/README.md).
