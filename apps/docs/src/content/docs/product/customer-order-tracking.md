---
title: Customer Order timeline and delivery map
description: Feature 50 discovery decisions, integration evidence and remaining questions.
---

Discovery [#208](https://github.com/DannyShayH/MTGO/issues/208) for
[Feature #50](https://github.com/DannyShayH/MTGO/issues/50) was confirmed by the
team on 24 November 2026. The team accepted all fourteen recommendations across
two rounds and explicitly confirmed shared understanding. The grill is complete;
specification and ticket splitting follow separately at the team's request.

## Existing agreements

ADR-0004 and ADR-0013, revised by discovery #152, replace mocked SMS with browser
SSE. Feature #48 captures the assigned agent's foreground phone location after
pickup; #50 presents the ordering Customer's timeline and map. Location becomes
stale at exactly sixty seconds after measurement. Keep only the latest active
coordinate and remove it at delivery end. Location failure never blocks delivery;
coordinates never establish pickup, arrival or handover. Reads and subscriptions
enforce Customer ownership. Reconnects reconcile durable progress, and stream
failure uses periodic status requests with a visible connection indicator.

The Order language survives changes to account preferences. Preparation and agent
assignment proceed independently. Business milestones survive delivery end and
follow-up failures, as required by ADR-0021.

## Agreed Customer journey

Customers track an Order from its existing confirmation/details page immediately
after successful payment and revisit the same tracking view from account Order
history. There is one tracking view per Order.

The smallest map shows the agent's actual shared position. Restaurant and delivery
addresses remain available as text. Restaurant and destination map markers,
route lines and arrival estimates are deferred. Addresses do not establish
accurate coordinates, and a route line could imply a planned route the product
does not provide. Optional arrival estimates belong to Feature #56.

The timeline distinguishes completed milestones, current progress and future
stages. Only recorded events have timestamps, displayed in Copenhagen time.
Preparation and assignment remain independent: preparing food without an assigned
agent must not appear blocked. Cancellation retains actual history and must not
suggest the remaining stages happened. GPS never supplies milestone timestamps.

Terminal outcomes have translated Customer-facing explanations based on the
recorded outcome. Show recorded refund outcomes separately: pending or failed
refunds must not appear completed. Operational alerts, Problem reports and
operator notes stay private. Do not expose free-text internal reasons or turn
a delivery problem into cancellation without a recorded cancellation outcome.

Feature #50 displays the recorded Feedback invitation after successful delivery.
Feature #51 owns the durable invitation, form, submission and eligibility
information that #50 consumes. Link to that
journey when available; do not offer a working submission action before it exists
or invent an invitation milestone from delivery completion alone.
Feature #50's invitation acceptance remains outstanding until this integration
works, even when delivered food is already correctly shown as delivered.

Assignment is a separate delivery status alongside food preparation, without
agent identity. Finding an agent can coincide with preparing food; assignment
never implies pickup. Explicit arrival and contact-attempt details remain in the
operational journey rather than this first Customer timeline.

Cancellation shows its effective time, not the time a delayed recovery process
noticed it. Failed delivery shows its recorded end time. Customer-safe projection
extensions must supply missing business timestamps; browser receipt time is not
a substitute.

## Agreed map behavior

Before pickup, explain that location sharing starts after pickup. After pickup
without a coordinate, show location unavailable without guessing the cause.
With coordinates, show the actual measured position, its age and reported
accuracy. At exactly sixty seconds after measurement, mark the position stale
and retain it without moving or extrapolating it. A stationary marker does not
establish that the agent stopped moving.

After a confirmed terminal outcome, remove the position. If the map cannot load,
retain the textual timeline and location freshness information. Restaurant and
delivery addresses remain readable without the map.

## Agreed connection behavior

If SSE fails, request status every ten seconds while the page is visible.
Refresh immediately when the Customer returns to the page. Distinguish live
updates, periodic checking and inability to refresh. Keep the last confirmed
information during failure and show when it was checked. Reconnects reconcile
recorded progress. Connection health and GPS freshness are separate indicators.

Missed, repeated and out-of-order updates must not duplicate milestones, reverse
progress or restore a coordinate after a terminal outcome. If delivery completes
during an outage, the browser retains explicitly last-confirmed information and
lets its location age become stale. On recovery it shows completion and removes
the marker immediately. A disconnected browser cannot promise instant knowledge
of a terminal transition.

Terminal Orders stop location updates but continue status checking while a refund
is unresolved or a Feedback invitation is expected. During SSE failure this uses
the agreed ten-second visible-page fallback. Stop automatic checking when the
outcome and required follow-up are settled; reopening always fetches current
information. Readiness alone never stops tracking.

Sign-out or detected session expiry closes tracking, clears displayed private
tracking data and requests sign-in with a return link to the Order. Recheck
authorization after sign-in and on subscriptions. Refuse another Customer's
Order without disclosing whether it exists.

## Refined Customer stories

- As a Customer, I want to open and revisit one tracking view for my own paid
  Order, in its preserved Order language, so I can understand its recorded food
  and delivery progress.
- As a Customer, I want my assigned agent's measured location, age and accuracy,
  so I can distinguish fresh information from stale or unavailable information.
- As a Customer, I want explicit connection status and recovery of missed
  progress, so an interrupted browser does not appear to confirm delivery or a
  current position.
- As a Customer, I want the recorded terminal outcome, separate refund status
  and real Feedback invitation, so I understand what ended and what remains owed.

## Acceptance examples

| Situation                                                       | Expected Customer experience                                                                                      |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Food is preparing and no agent is assigned                      | Show preparation and finding an agent independently, without blocking the kitchen stage.                          |
| Agent is assigned before readiness                              | Show recorded assignment; do not imply pickup or skip food stages.                                                |
| Order has not been picked up                                    | Explain when location sharing starts; show no invented position.                                                  |
| Pickup is recorded but no coordinate exists                     | Show location unavailable; do not assert permission denial or a locked phone.                                     |
| A measured position reaches sixty seconds old                   | Mark it stale at the boundary even without another network update; retain the measured position and age.          |
| Browser disconnects before handover                             | Show last-confirmed information and connection failure; on recovery show recorded delivery and remove the marker. |
| A delayed location update arrives after terminal reconciliation | Keep the terminal outcome and absent marker; do not resurrect the old coordinate.                                 |
| Acceptance expires at 18:05 and recovery runs at 18:08          | Show cancellation effective at 18:05, with the actual refund outcome separately.                                  |
| Refund fails after cancellation                                 | Keep cancellation and refund still owed visible; keep checking for recorded follow-up.                            |
| Delivery is recorded but no Feedback invitation exists          | Show delivered without inventing an invitation; invitation integration remains outstanding.                       |
| Customer changes account language after ordering                | Confirmation and account revisits continue showing status communications in the Order language.                   |
| Session expires or another Customer's Order is requested        | Stop exposing private tracking data and require authorization; do not reveal another Order's existence.           |
| Map fails to load                                               | Keep readable progress, addresses and location freshness information.                                             |

## Required validation evidence

Verify Danish and English using the preserved Order language, narrow and wide
layouts, long text, keyboard access, readable screen-reader updates and a useful
journey without the map. Use focused tests for ownership, exact freshness
boundaries, terminal cleanup, duplicate/delayed updates and reconnect recovery.
Demonstrate the relevant shared baseline of twenty simultaneous journeys and
95% of ordinary status requests within two seconds. Existing browser journeys
may need updates; this discovery does not request a new Playwright suite.

These are later implementation requirements. No product runtime, device or
performance verification has been performed by this documentation-only discovery.

## Existing behavior and integration gaps

Read-only inspection on 24 November 2026 found the following. These are source
observations, not runtime verification or proof that Feature #50 is delivered.

The later delivery-outcome slice extends the tracking read with the recorded
delivery end time and shows assignment independently of kitchen progress. The
timeline retains recorded milestones when delivery ends, and the refund outcome
remains separate from that outcome. While visible, the page checks every ten
seconds and refreshes on return; an unresolved or unknown follow-up continues
checking. A delivered Order's Feedback follow-up remains unknown until the
invitation integration supplies its own state. The Customer read does not expose
refund retry timestamps or delivery actors.

- The delivered #147 food-progress panel distinguishes completed, current and
  upcoming stages. It polls every fifteen seconds, stops at readiness and pauses
  after forty automatic reads. It needs delivery-aware continuation and recovery
  to meet the agreed #50 journey.
- Confirmation currently supplies no progress projection to its details template.
  Account Order details use the current Customer language, whereas confirmation
  reads the recorded Order language. Both entry points need consistent tracking
  and Order-language behavior.
- Backend Order progress already includes assignment, pickup, confirmed delivery
  and terminal outcome. The storefront progress type omits delivery. Public
  delivery progress does not yet include the terminal time for failed or cancelled
  deliveries; arrival is recorded internally but is not Customer-visible.
- The Customer delivery read already distinguishes location not started,
  unavailable, fresh, stale and ended. It includes measurement and receipt times,
  accuracy, stale time, revision and server time. Permission denial, an interrupted
  phone and no position are not distinguished for the Customer.
- No Customer SSE route or Customer map implementation was found. Partner streams
  provide patterns for fresh durable reads, heartbeats, invalidation hints and
  access/session rechecks; their existence does not deliver the Customer stream.
- Destination coordinates are explicitly backend-only. The agreed map scope does
  not require exposing them.
- No Feedback-invitation producer or record was found in the inspected delivery
  and Order-operation workflows or models. The #50/#51 integration must provide
  the real invitation before displaying it as a recorded milestone.
- Cancellation distinguishes its effective deadline from when recovery processed
  it. The agreed Customer view uses the effective cancellation time.

Relevant source locations include the storefront Order progress component and
Order templates, `apps/storefront/src/lib/data/orders.ts`, backend
`read-order-progress.ts`, `delivery/location-rules.ts`, Order-operation
`outcomes.ts`, and the partner delivery stream route.

The [recipe compatibility review](/MTGO/architecture/restaurant-recipe-review/)
requires paid Orders before assignment and independent preparation, adapting the
example's sequence. The pinned Medusa Eats status component from #136 supplies
visual inspiration, not GPS, arrival estimates or required decorative animation.
Older SMS/GPS exclusions in the #136 handoff and recipe gap audit are superseded
by discovery #152 and revised ADR-0013.

## Delivery map (#214)

The Customer's location section on the Order page shows a small map of the
agent's latest measured position, inside the existing textual status. It reads
the same Customer-safe delivery projection as the text and draws nothing else:
no Restaurant or destination marker, route, track, geocoding or estimate.

**Provider.** OpenStreetMap's standard raster tiles through Leaflet 1.9.4
(`apps/storefront/src/modules/order/components/delivery-map/`). On
24 November 2026 the
[OpenStreetMap Foundation tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
and [attribution guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines)
were checked. They need no key or account. They require the HTTPS URL
`https://tile.openstreetmap.org/{z}/{x}/{y}.png`, a visible
"© OpenStreetMap contributors" credit linking to the copyright page, a Referer
header and the browser's own caching. They forbid prefetching or offline use.
They promise no availability, and access can be withdrawn without notice. The
map honours all of this. Leaflet requests only the visible tiles and shows the
credit bottom right. A failed or withdrawn service falls back to the text.

**What leaves the site.** Only tile requests, which reveal the area around the
agent's measured position. The tile images use the referrer policy
`strict-origin-when-cross-origin`, so the Referer is the site
origin and never the Order page URL with its Order ID. No Customer details,
destination or secret are sent; the provider has no key to protect. Near the
end of a delivery the tiles around the agent necessarily cover the area of the
destination, but nothing marks it.

**Configuration.** None: no key, account or environment variable, locally or
on staging. The tile URL, credit and referrer policy live in `provider.ts`, so
switching provider changes only that file. A future provider that needs a key
must restrict that public key to the site's origins, as its terms require.

**States.** `deliveryMapView` (`map-view.ts`) decides what is drawn, tested in
`__tests__/map-view.unit.spec.ts`:

- Before pickup, without a coordinate or measurement time, or once the
  delivery ended: no map, only the existing text. A terminal outcome removes
  the map, and the newer-read rule keeps a delayed read from bringing it back.
- Reported accuracy of 50 metres or less: a dot inside its accuracy circle.
  Coarser accuracy: only its circle, never a dot, with a caption saying so.
  Unreported accuracy: a dashed 500-metre ring on the ground, which grows with
  zoom, so it cannot read as an exact spot at any zoom level.
- Fresh positions use the primary colour. The text and the map take their
  state from one rule, `shownLocationState` in
  `order-progress/location-age.ts`. At sixty seconds after measurement, on the
  same local timer as the text, the position turns grey and dashed in place,
  and the caption, a polite live region, tells screen readers it is no longer
  current. The map recentres only when a new measurement leaves the view,
  without animation.
- While the library and tiles load, the map says so. A failed import, four
  failed tiles before any loads, or fifteen seconds without a tile show a
  warning that the map could not load. A failure is final for that page view,
  so a late tile cannot bring back an empty frame. The timeline, addresses, age
  and accuracy stay readable.

**Manual evidence (24 November 2026, local dev servers).** Picked-up test
Orders received samples through `shareDeliveryLocationWorkflow`, and a signed-in
test Customer opened them in Chromium:

- Danish at 1280 px, 375 px and 320 px, and English at 1440 px and 375 px: the
  map, credit and captions fit inside the location section.
- Long text: long unbroken Danish words in the heading, status, caption and
  age lines wrap inside the section at 320 px, and the map keeps its width.
- Keyboard: Tab reaches the map region with a visible focus ring, announced as
  "Kort over buddets senest målte position" in Danish and "Map of the delivery
  agent's last measured location" in English. The caption is a polite live
  region.
- An 8 m sample showed a dot that turned grey with the stale caption after
  sixty seconds while the page stayed open. A sample without accuracy showed
  only the dashed 500-metre area, with no dot.
- Every tile request carried `Referer: http://localhost:8000/`.
- With tile requests blocked, the map switched to the failure notice and the
  textual status, age and accuracy remained.
- Terminal outcome: with the page open, `confirmHandoverWorkflow` recorded the
  handover. At the next ten-second check the map disappeared and the status
  read "Positionsdeling er afsluttet." A later sample was refused with
  `delivery_not_active`, and the map stayed gone.

## Specification handoff and deferred scope

The [Customer Order tracking specification](/MTGO/product/customer-order-tracking-spec/)
records the subsequent `/to-spec` synthesis and confirmed testing boundaries.

The team invokes specification and ticket splitting separately. Preserve the
#47 food-progress, #48 delivery/location, #49 operator/refund and #51 invitation
ownership boundaries. Implementation must extend the Customer entry points,
safe projections and live updates described above; existing source is not proof
that the complete journey works.

Map provider selection, exact translated copy, transport wiring, heartbeat and
retry mechanics, coherent reads and stale-response guards belong to specification
and must preserve the agreed behavior. Restaurant/destination markers, route
lines, arrival estimates, Customer-visible arrival and contact attempts remain
outside the smallest scope for the reasons recorded above. No existing business
decision is reopened. No unresolved business questions remain from this grill;
the implementation choices above are reserved for specification.

No Feature implementation, implementation-ticket breakdown, board movement or
Feature closure is part of this discovery.
