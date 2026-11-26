---
title: Customer Order tracking specification
description: Feature 50 specification for the confirmed live timeline, delivery map and recovery journey.
---

Specification for [Feature #50](https://github.com/DannyShayH/MTGO/issues/50),
synthesized on 24 November 2026 from [discovery #208](https://github.com/DannyShayH/MTGO/issues/208)
and the [confirmed discovery record](/MTGO/product/customer-order-tracking/).
The specification lives in the docs; the seven implementation slices are
[#211](https://github.com/DannyShayH/MTGO/issues/211) through
[#217](https://github.com/DannyShayH/MTGO/issues/217), directly under Feature #50.
The team confirmed shared understanding after fourteen recommendations and
subsequently confirmed the testing boundaries during `/to-spec`. This specifies
required behavior; implementation and runtime verification remain outstanding.

## Problem Statement

Customers need to know what has actually happened to their paid Order, where its
assigned Delivery agent was last located and whether that information is current.
An interrupted connection, missing position or delayed refund must not look like
successful delivery, live GPS or money already returned. Reopening an Order must
recover its history in the language confirmed for that Order without exposing
another Customer's information.

Existing food progress ends at readiness, confirmation lacks a progress feed and
account revisits use the current account language. Delivery and location reads
exist, but the Customer live stream, map and complete follow-up integration do not.

## Solution

Provide one Customer tracking view on Order confirmation and details, revisitable
from account Order history. Show recorded food and delivery milestones alongside
the agent's latest shared position, age and accuracy. Preserve the Order language,
make connection health and location freshness independently visible, recover
current recorded progress after interruptions and display terminal outcomes,
refund status and genuine Feedback invitations separately.

## User Stories

1. As a Customer, I want tracking immediately after successful payment, so that I know my paid Order exists and awaits acceptance.
2. As a Customer, I want to revisit the same tracking view from my Order history, so that I can recover progress after leaving the website.
3. As a Customer, I want each Order's tracking in its preserved Order language, so that account preference changes do not change its status communications.
4. As a Customer, I want to see recorded placement and acceptance, so that I know whether the Restaurant committed to my Order.
5. As a Customer, I want preparation starting and food readiness shown separately, so that acceptance does not imply cooking or completed food.
6. As a Customer, I want completed, current and upcoming stages distinguished, so that future stages never look completed.
7. As a Customer, I want timestamps only for recorded events in Copenhagen time, so that I understand when milestones actually happened.
8. As a Customer, I want assignment status alongside food progress, so that preparing food without an agent does not appear blocked.
9. As a Customer, I want assignment distinguished from pickup, so that responsibility never implies that food has left the Restaurant.
10. As a Customer, I want explicit recorded pickup and confirmed handover, so that GPS proximity never establishes delivery.
11. As a Customer, I want cancellation and failed delivery to preserve preceding milestones, so that a terminal outcome does not rewrite history.
12. As a Customer, I want cancellation's effective time, so that delayed recovery does not misstate when my Order ended.
13. As a Customer, I want a failed Delivery's recorded end time, so that the browser's refresh time does not masquerade as a milestone.
14. As a Customer, I want a translated explanation of the recorded terminal outcome, so that I understand whether food will arrive.
15. As a Customer, I want refund status separately from cancellation, so that a pending or failed refund never looks like money returned.
16. As a Customer, I want private operational notes excluded, so that tracking reveals only information appropriate to my Order.
17. As a Customer, I want Restaurant and confirmed destination addresses readable as text, so that the journey remains useful without a map.
18. As a Customer, I want an explanation before pickup that sharing starts afterward, so that no marker is mistaken for a tracking failure.
19. As a Customer, I want an honest unavailable-location state after pickup without a coordinate, so that the website does not invent a position or a cause.
20. As a Customer, I want the agent's actual measured position during delivery, so that the marker represents a shared observation.
21. As a Customer, I want measurement age and reported accuracy, so that I can judge the position's freshness and precision.
22. As a Customer, I want a position marked stale at exactly sixty seconds, so that an old observation never looks live.
23. As a Customer, I want stale positions retained without extrapolation, so that a moving marker does not invent travel.
24. As a Customer, I want location removed after a confirmed terminal outcome, so that completed work does not retain active tracking.
25. As a Customer, I want readable progress and freshness information when the map fails, so that map loading does not block understanding my Order.
26. As a Customer, I want prompt browser updates while tracking is open, so that recorded progress appears without a manual reload.
27. As a Customer, I want connection status separate from location freshness, so that a healthy stream does not imply a recent GPS position.
28. As a Customer, I want ten-second status checking when streaming fails while my page is visible, so that a stream outage does not abandon tracking.
29. As a Customer, I want the last confirmed information and its checked time retained during an outage, so that failure does not erase history or imply currency.
30. As a Customer, I want immediate reconciliation when returning to the page or reconnecting, so that missed events do not leave my view behind.
31. As a Customer, I want repeated and delayed updates to preserve one consistent history, so that milestones do not duplicate or regress.
32. As a Customer, I want completion during an outage to remove the marker on recovery, so that delayed coordinates cannot resurrect ended tracking.
33. As a Customer, I want unresolved refunds and expected invitations checked after food delivery ends, so that follow-up work remains visible independently of location.
34. As a Customer, I want automatic checking to end when the outcome and required follow-up settle, so that a completed Order does not need an endless connection.
35. As a Customer, I want a genuine recorded Feedback invitation, so that delivery completion alone does not claim an invitation was offered.
36. As a Customer, I want a Feedback link only when the journey exists and permits it, so that tracking does not offer a broken or misleading action.
37. As a Customer, I want sign-out or detected expiry to stop tracking and clear private displayed data, so that another browser user cannot keep seeing my Delivery.
38. As a Customer, I want sign-in recovery to return to my Order after authorization, so that session expiry does not lose my place.
39. As a Customer, I want reads and subscriptions restricted to my own Orders, so that a guessed reference cannot expose another Customer's purchase or position.
40. As a Customer, I want keyboard access, readable screen-reader updates and usable narrow and wide layouts in Danish and English, so that tracking does not require a mouse, map interaction or English proficiency.
41. As Restaurant staff or a Delivery agent, I want Customer stream and location failures to leave fulfilment available, so that a presentation failure cannot stop real work.

## Implementation Decisions

### Architecture and existing capabilities

- Keep installed Medusa dependencies and the existing storefront, backend and
  shared translation/design packages. Extend the delivered food-progress view
  and existing Order-operation and Delivery read workflows. Do not create another
  Order lifecycle, location history or fulfilment workflow.
- Preserve the Module → Workflow → API route layering. Compose cross-module
  reads in workflows; modules do not import one another. Thin authenticated
  routes execute the projection workflow. This feature does not mutate commerce
  milestones, issue refunds or confirm handover.
- Existing authenticated progress and delivery reads remain supported. Extend
  safe delivery progress with the recorded terminal time for failed/cancelled
  work without exposing actor identities, internal reasons or retry identities.
- Introduce one Customer tracking projection, composed from existing recorded
  progress, delivery/location and the Feedback-owned invitation contract. Use it
  for initial rendering, polling, reconciliation and stream change detection.
  This is a read contract, not another persistent business model.

### Feedback eligibility revision

For #217, show a Feedback action based on the existing
Feedback feature flag and eligibility decision. This supersedes the recorded
invitation and invitation-producer requirements below. The action does not
claim that an invitation was recorded; Feedback submission remains independent
of tracking and stream delivery. The existing Feedback workflow owns eligibility
and the seven-day window.

### Customer tracking and subscription contracts

- Provide an authenticated `GET /store/orders/:id/tracking` returning the Order
  identity/language, food milestones, separate assignment and pickup milestones,
  terminal outcome and time, safe cancellation category/effective time, recorded
  refund outcome, latest permitted location and Feedback follow-up information.
  Include server read time; preserve location measurement/receipt times, accuracy,
  stale time and sample revision from the existing location projection.
- Missing milestones and unavailable location stay explicitly absent. Distinguish
  invitation not yet recorded, invitation expected, available, and settled as
  supported by #51's authoritative contract. An unavailable #51 integration is
  not evidence of an invitation or settled follow-up. Do not invent a durable
  invitation store in #50.
- Give the projection a deterministic change token for the safe recorded values,
  excluding read time and continuously changing display age. Coordinate revision
  alone is not an ordering token for the entire Order. A change token is an
  invalidation aid, not authority to accept an old response.
- Provide `GET /store/orders/:id/tracking/stream`, authorized before headers open.
  SSE carries readiness, heartbeat, tracking invalidation and session-ended
  information. Invalidation hints contain no coordinates, private Order details
  or internal notes; they cause an authorized projection reread. Durable reads,
  rather than replaying every SSE message, recover missed progress.
- Follow existing partner-feed behavior: recheck current authorization/session
  validity and durable change state every two seconds, send a heartbeat within
  fifteen seconds while quiet, and release timers/connections on disconnect and
  process shutdown. Validate this cost under the agreed workload. A server read
  failure closes the feed for recovery instead of advertising healthy updates.
- Unknown, unpublished or other-Customer Orders return the same not-found
  response. Missing/expired authentication returns an authentication refusal.
  Every read and subscription enforces existing Customer ownership/session rules;
  an open stream does not outlive detected expiry or revocation.
- Use `no-store` for private snapshots and disable stream caching, transformation
  and buffering. Preserve ordinary purchase details if an authorized tracking
  read temporarily fails; an authorization failure instead clears private data.

### Storefront transport and reconciliation

- Both confirmation and account Order details use the same tracking component
  and recorded Order language. Account history links to the existing details
  surface. Preserve original purchased food, contact and destination facts.
- Keep Customer tokens server-side in the existing session boundary. Use the
  existing Medusa SDK for ordinary reads; a same-origin streaming proxy forwards
  authenticated SSE without exposing bearer tokens in JavaScript or query strings.
  Installed SDK guidance supports a raw response with a non-JSON Accept header.
  Forward cancellation, failures and streaming headers without buffering.
- Immediately fetch current tracking on mount, stream readiness, reconnection,
  visibility return and explicit refresh. Serialize or coalesce reads within the
  current Order/session generation; discard responses from older requests,
  previous sessions or abandoned views. Update the displayed snapshot together.
- Treat terminal facts as dominant over retained location. The read workflow
  must not combine a confirmed terminal outcome with an active coordinate.
  Reread/reconcile when underlying records change during assembly. Once terminal
  state is accepted, delayed active snapshots never restore the marker or remove
  recorded milestones. Preserve existing milestone times on every reread.
- Show live updates only after a successful reconciliation and proof of feed
  activity, not merely EventSource opening. Use a forty-second heartbeat watchdog
  consistent with existing connection prior art. On loss or silence, start the
  ten-second visible-page fallback immediately; retry SSE at bounded intervals,
  initially one second and backing off to at most sixty seconds.
- Keep fallback checks at ten-second cadence while visible without overlapping
  slow reads. Distinguish periodic checking from inability to refresh and retain
  the last successful checked time. While SSE is healthy, reconcile at least
  once a minute to recover missed hints. Hide technical retry counters from the
  Customer. Avoid reconnect storms and unbounded simultaneous work.
- Suspend automatic work for hidden pages and close unnecessary streams. On
  return, reread immediately and re-establish tracking if still needed. Location
  age continues to represent elapsed time; returning to a page never makes a
  sample fresh again.
- Stop location tracking at a confirmed terminal outcome. Continue status
  checking while a refund is unresolved or an invitation is expected. Stop
  automatic work once terminal outcome and required follow-up are settled;
  reopening always fetches current state. Remove the old readiness stop and
  forty-read pause from the complete tracking journey.
- Detected sign-out, session expiry or refusal closes transports, invalidates
  in-flight work and clears private displayed tracking data. Preserve only the
  local return destination needed for fresh sign-in and authorization.

### Timeline, map and language

- Preserve placement, acceptance, preparation starting, readiness, pickup,
  delivery, cancellation and the genuine Feedback invitation. Show assignment
  independently alongside kitchen progress. Arrival, contact attempts, Problem
  reports and operator notes stay outside the Customer timeline.
- Use completed/current/upcoming presentation and actual recorded timestamps in
  Copenhagen time, with a date when necessary to distinguish days. Effective
  cancellation time takes precedence over delayed processing time. Failed
  delivery uses its recorded terminal time; refund success remains separate.
- Map states are before pickup, unavailable after pickup without a sample, fresh,
  stale and ended. Unknown causes remain generic. Display measured position, age
  and reported accuracy without interpolation or route prediction. Poor accuracy
  must not look like a precise pin or establish progress.
- Compute freshness from measurement time and server time, not just the receipt
  of a browser update. A local timer marks the sample stale at age sixty seconds
  even while offline. Do not let device-clock skew reset freshness; reconcile the
  time reference on successful reads.
- Remove active coordinates after terminal reconciliation. Keep textual progress,
  addresses and freshness available if map loading fails. Loading, empty and
  failed map states must be distinguishable from fulfilled milestones.
- The first map contains only the shared agent position. Keep the mapping service
  behind a presentation adapter; select its provider during the map work item's
  implementation after checking current official terms, attribution, configuration
  and loading behavior. Send no Order reference, Customer contact details or
  destination to it. Do not introduce route/geocoding or historical-track storage.
  Provider unavailability must exercise the agreed textual fallback.
- Use shared Danish/English text and existing Medusa UI/design tokens. Keep status
  content in the Order language even if surrounding account navigation uses a
  different current preference. Announce meaningful progress/connection changes
  accessibly without announcing each age tick or stealing keyboard focus.

### Cross-Feature ownership and persistence

- #47 owns food milestones and pre-acceptance cancellation; #48 owns assignment,
  pickup, handover, location capture and coordinate deletion; #49 owns operator
  cancellation and refund handling. #50 projects those facts without changing
  their guards, responsibility or financial rules.
- #51 owns the durable Feedback invitation and eligibility information. #50
  displays a recorded invitation and available action without owning the form,
  submission, seven-day eligibility or rating effects. This confirmed discovery
  revises older #51 wording attributing the invitation to timeline/SMS.
- Full #50 invitation acceptance depends on the #51 integration. Other timeline
  and map behavior can be demonstrated first, but an absent producer must be
  reported as an outstanding dependency rather than counted as completed scope.
- Reuse current durable business records and latest-coordinate retention. No new
  #50 persistence model is required by this specification. Any later model change
  needs its migration and justification; event delivery must not become the only
  copy of progress. Stream, map or notification failures never undo milestones.

## Testing Decisions

- The team confirmed the principal seam: authenticated Customer HTTP reads and
  subscriptions, backed by real recorded progress. Prefer this boundary to
  mocking internal workflow steps. Test observable authorization, payloads,
  milestone consistency, freshness, cleanup and recovery, not implementation
  call counts or component structure.
- Extend existing Customer Order-progress and Delivery-location HTTP suites and
  reuse their paid-Order/Restaurant/agent harness. Existing Delivery feed HTTP
  tests supply SSE prior art for authorization before opening, heartbeat,
  expiry/revocation, shutdown, recovery and safe invalidation messages.
- Exercise initial placement, independent preparation/assignment, readiness,
  pickup, handover, cancellation and failed delivery. Assert original milestone
  timestamps survive retries/reconnects, effective timeout cancellation differs
  truthfully from recovery processing, and safe failed-delivery end time exists.
- Test anonymous, expired/revoked and other-Customer reads/subscriptions. Assert
  no coordinates or other private data leak through refused calls, hints, errors,
  logs, cache reuse or account switching. An authenticated caller must not
  distinguish an unknown Order from another Customer's.
- Test no sample before/after pickup, reported accuracy, freshness immediately
  before and at sixty seconds, stale retained coordinates, new sample revision,
  and all terminal outcomes removing location. Keep exact-time calculations in
  focused unit tests rather than long wall-clock sleeps.
- Test stream loss, missed hints, duplicates, restart/reconnect and completion
  during an outage through the public contracts. Add small pure client tests
  only where needed for the forty-second watchdog, ten-second fallback,
  visibility return, skew-safe aging, stale-response rejection and settled-stop
  decisions. Existing partner connection tests are prior art; apps do not import
  one another or require a new shared package merely for these tests.
- Verify #51 integration with an actual recorded invitation, eligible action,
  no invitation, expected follow-up, and settled follow-up. Fixtures can test the
  consumer contract but do not establish that the producer is delivered.
- Manually inspect confirmation and account revisit in Danish and English,
  changed account preference, narrow/wide widths, long text, keyboard/focus,
  screen-reader progress updates, map-load failure and browser/session recovery.
  Do not add a new Playwright suite; update an existing journey only if its
  behavior changes and leave its execution to the ready flow.
- Demonstrate twenty simultaneous relevant journeys with 95% of ordinary status
  requests within two seconds. Report workload, errors and stream/fallback mix;
  an SSE connection staying open is not a two-second response-time measurement.
  These targets and all runtime/device evidence remain unverified until exercised.

## Out of Scope

- Native apps, SMS, push notifications, operating-system alerts and updates while
  the website is closed; continuous background phone tracking is not promised.
- Restaurant/destination map markers, geocoding, route lines, route optimization,
  arrival estimates, automatic matching and inferred pickup/arrival/handover.
- Customer-facing arrival, contact attempts, internal alerts, financial details,
  operator notes, agent identity and stored GPS trails.
- Changes to payment, Restaurant preparation, assignment, location capture,
  cancellation/refund policy, Feedback submission or bonus calculations.
- Implementation, work-item splitting, board movement, delivery or closing #50
  as part of writing this specification. The team invokes `/to-tickets` separately.

## Further Notes

ADR-0004/0005/0008/0009/0010/0011/0013/0014/0021 and the shared glossary remain
authoritative. The [recipe compatibility review](/MTGO/architecture/restaurant-recipe-review/)
requires paid placement before assignment and independent preparation; the pinned
Medusa Eats status component supplies visual inspiration rather than GPS or
sequencing rules. Installed Framework, Medusa, JS SDK and test-utils package
guidance was checked for routing, authentication, streaming and test boundaries.

The discovery record identifies existing source behavior and required gaps.
This specification introduces concrete read/stream and reconciliation decisions;
it does not claim those interfaces, a map provider or the #51 producer exist.
There are no unresolved business decisions from the grill. Provider setup and
exact implementation mechanics must be verified in the relevant work item.
