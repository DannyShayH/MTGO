---
title: Restaurant Order acceptance and preparation
description: Confirmed stories, decisions and acceptance examples from Feature 47 discovery.
---

Discovery [#139](https://github.com/DannyShayH/MTGO/issues/139) for [Feature #47](https://github.com/DannyShayH/MTGO/issues/47) was confirmed by the team on 17 November 2026, including explicit confirmation that a shared understanding was reached. The decisions below were agreed during the Feature grill. Specification, ticket splitting and implementation follow separately.

## Refined user stories

- As Restaurant staff, I want to see my Restaurant's paid Orders in deadline order and accept or reject them, so I commit only to food I can fulfil.
- As Restaurant staff, I want to record preparation starting and food readiness independently of Delivery agent assignment, so the kitchen can work and report actual progress.
- As Restaurant staff, I want the kitchen ticket to preserve the purchased bilingual dish information and declarations, so later menu edits do not change an existing Order.
- As a Customer, I want to cancel before acceptance and see the cancellation and refund outcome, so I know whether the Order will proceed and whether my money has been returned.
- As a Customer, I want a simple food-progress timeline on my Order page, so I can see placement, acceptance, preparation and readiness from recorded milestones.

## Agreed staff journey

Restaurant staff use the partner app to access only their own Restaurant's paid Orders. The Orders page separates Orders awaiting acceptance, Orders being prepared and completed or cancelled history. Awaiting Orders appear earliest-deadline first. Order details show the purchased dishes, quantities, placement time, acceptance deadline and recorded progress.

Closing or deactivating the Restaurant does not remove existing paid Orders or prevent authorized staff acting on them. Revoked staff access remains refused.

Acceptance, preparation starting and food readiness are three explicit staff actions. Acceptance does not automatically start preparation. Food readiness requires preparation to have started. Neither preparation action requires an assigned Delivery agent; pickup still requires ready food and an assigned agent.

Each milestone records its actual time. Staff cannot undo recorded milestones; mistakes require reasoned operator correction that preserves the original history. A rejection reason is optional and omitting one must not prevent rejection.

Preserve Danish and English dish names, allergen declarations and food labels as they were when purchased, alongside quantities and item prices. Show the preserved information in the staff member's chosen language; the Order language remains the separate Customer communication choice. Later menu edits must not change an existing kitchen ticket. Missing allergen information remains visibly unknown. This does not add custom meal instructions or allergy-request inputs.

## Acceptance deadline

Acceptance must be recorded by the server before five minutes have elapsed since paid Order placement. The browser click time does not decide whether acceptance succeeded. At the deadline an unanswered Order expires, even if the background timeout job runs later.

For an Order placed at 18:00:00, acceptance must be recorded before 18:05:00. An attempt at 18:05:00 is too late. Acceptance and cancellation competing for the same Order must produce one consistent outcome.

The ordinary MVP journey uses an immediately successful mock payment. The five-minute window runs from paid Order placement; an internal provisional Medusa Order may exist before successful payment, so its creation time must not silently define that deadline. Existing payment failure and uncertainty behavior from Feature #46 remains in place; this Feature does not add another payment integration.

Keep competing-action handling small for the MVP. The backend must recheck the current Order state before applying an action, refuse actions that no longer apply and return the current outcome for a stale screen. Retrying a successful action must not duplicate milestones, cancellations or refund attempts. Elaborate multi-staff collaboration is outside this discovery's agreed scope; the specification chooses the smallest mechanism that preserves consistent outcomes.

## Cancellation and neighboring Features

Feature #47 includes Customer self-cancellation before acceptance, Restaurant rejection and automatic acceptance timeout. These establish the full Customer refund obligation and retain Order and payment history. A failed refund stays visibly unresolved until successful.

Rejection, acceptance timeout and pre-acceptance Customer cancellation automatically attempt the full refund through the mock provider. Cancellation takes effect independently of refund completion. Distinguish refund pending, failed and successful outcomes; a failed refund remains owed for operator handling under #49.

After acceptance, remove the staff Reject action. Restaurant staff contact an MTOGO operator using the Order reference if the Restaurant cannot fulfil it. The operator records the reason and handles cancellation with the required full refund under #49; staff cannot reverse acceptance themselves.

The operator's cancellation, exception and refund-investigation screens belong to Feature #49. Delivery assignment and pickup belong to #48; the complete Customer event timeline and live delivery map belong to #50. Preparation remains independent of assignment, and notification failures must not block progress.

## Customer progress

Feature #47 updates the existing Customer Order details with acceptance, preparation, readiness, cancellation and refund status, and a Cancel action available only before acceptance. Present food progress as a simple chronological progress display: Order placed, Restaurant accepted, Preparing and Ready for pickup. Use the actual recorded milestones; future steps remain upcoming, and food readiness does not imply agent assignment or pickup.

A cancelled Order shows cancellation and its separate refund outcome. Pending or failed refunds must not appear successful. The complete event history, live browser updates and delivery map remain under #50; delivery milestones belong to #48. The team confirmed this simple progress timeline as the intended presentation for #47. It introduces the food-preparation steps that #48 and #50 later extend.

## Agreed live updates

Use Server-Sent Events (SSE) to update the Restaurant Orders queue promptly while the kitchen screen is open. After reconnecting, reload the current Orders so missed notifications do not leave the screen stale. Automatic polling is the fallback when streaming fails, and the screen must show its connection status. Staff actions remain ordinary authenticated API requests. The acceptance deadline is enforced by the backend independently of the browser connection.

Show a prominent visual alert for each newly received Order. Staff may explicitly enable an optional sound, subject to browser restrictions. Operating-system notifications and alerts while the app is closed are outside the first version.

Medusa's [Restaurant-Delivery Marketplace recipe, Step 20](https://docs.medusajs.com/resources/recipes/marketplace/examples/restaurant-delivery#step-20-real-time-tracking-in-the-storefront) demonstrates Server-Sent Events (SSE): an API route subscribes to a delivery workflow execution and streams changes to a browser using `EventSource`. This is an example for tracking an existing delivery, rather than a ready-made Restaurant Orders queue. Its workflow sequence must also be adapted to the agreed MTOGO payment and independent-preparation rules.

Medusa also documents [SSE API responses](https://docs.medusajs.com/learn/fundamentals/api-routes/responses#example-server-sent-events-sse). The team agreed to apply this transport to the Restaurant Orders queue, adding reconnect reconciliation and fallback polling. Restaurant isolation, staff revocation, the partner app's server-side token boundary and streaming through the deployed proxy must be preserved and verified.

## Existing code and specification constraints

Read-only inspection found the following constraints for the later specification:

- Paid placement already captures payment, links the Order to one Restaurant and marks it awaiting acceptance. It does not yet record an explicit paid placement time or preparation milestones.
- Existing placed-Order visibility and placement retry logic recognize the awaiting-acceptance state. They must continue recognizing a paid Order after acceptance, preparation or cancellation, without re-placing it or hiding its history.
- Restaurant staff authorization and Restaurant ownership checks are reusable and independent of Restaurant open/active status. At discovery the partner app had no Orders queue or acceptance/preparation actions; see [Delivered so far](#delivered-so-far).
- Native Order lines preserve the English dish title, quantity and unit price. Both language names and the Restaurant's allergen and food-label declarations are only available from the current menu; the agreed historical kitchen view therefore needs additional capture during the ordering journey. Since #141, completion freezes the reviewed names and declarations before payment and placement copies them onto the Order; Orders placed earlier show them as unavailable.
- Customer Order details show generic Medusa status, with no Customer cancellation action. Feature #47 must add the agreed current progress, refund outcome and pre-acceptance cancellation display, while #50 retains the complete event timeline and live delivery map.
- The installed Medusa 2.22.4 SDK supports `client.fetchStream`. The recipe's per-delivery workflow stream does not itself supply a new-Order feed for the Restaurant. The later specification must preserve staff authorization, disconnect cleanup and reconciliation with durable Order facts.

## Acceptance examples for the later specification

| Scenario                                                              | Expected outcome                                                                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| An Order is placed at 18:00:00                                        | Its acceptance deadline is 18:05:00; acceptance at the deadline is too late.                                                          |
| The Restaurant rejects without giving a reason                        | Cancel the Order and automatically attempt its full refund; the missing reason does not block rejection.                              |
| No acceptance arrives and the server restarts after the deadline      | Recover the expired deadline, cancel the unanswered Order and retain its full refund obligation.                                      |
| A refund attempt fails                                                | The Order stays cancelled, the refund remains owed and its failed outcome stays visible for operator handling.                        |
| Staff accept and start preparation without an assigned agent          | Record both milestones and allow preparation to continue. Readiness does not itself authorize pickup.                                 |
| Another action has already changed the Order                          | Recheck current state and refuse a conflicting action; successful retries add no duplicate milestone or refund.                       |
| The Restaurant closes or is deactivated after placement               | Its existing paid Orders remain visible and actionable for authorized staff.                                                          |
| The menu changes after purchase                                       | The kitchen ticket retains the purchased bilingual names, quantities, prices and declarations.                                        |
| Customer cancels before acceptance                                    | Cancel with a full refund automatically attempted; after acceptance the Customer must use operator handling.                          |
| The staff stream disconnects                                          | Show connection status, use fallback polling and reconcile current Orders after reconnecting.                                         |
| Staff mark food ready                                                 | Customer Order details show readiness based on the recorded milestone, without claiming pickup or delivery.                           |
| Staff request another Restaurant's Order or have their access revoked | Refuse the request; an open stream must not continue exposing Orders after access is revoked.                                         |
| An Order has no allergen declaration                                  | Preserve and display the information as unknown, rather than claiming the dish has no allergens.                                      |
| A Customer asks to cancel after acceptance                            | Require an operator: full refund before preparation, no automatic change-of-mind refund afterward, with reasoned exceptions retained. |
| The Restaurant cannot fulfil an accepted Order                        | Staff contact the operator using the Order reference; operator cancellation requires a full Customer refund.                          |
| Notification delivery fails                                           | Preserve the milestone and let preparation continue; keep unresolved notification handling within #50.                                |

## Delivered so far

- [#140](https://github.com/DannyShayH/MTGO/issues/140): Restaurant staff see their Restaurant's paid Orders in the partner app's Orders queue and Order details.
- [#141](https://github.com/DannyShayH/MTGO/issues/141): the kitchen view shows the bilingual dish names, allergen declarations and food labels frozen at purchase.
- [#142](https://github.com/DannyShayH/MTGO/issues/142): staff accept an awaiting Order from its details page strictly before its placement time plus five minutes, checked at the server's time. Acceptance records its time and actor once, a repeated acceptance returns the recorded one, and a late or conflicting attempt is refused with the Order's current outcome. Acceptance starts no preparation and assigns no Delivery agent. The endpoint is documented in the backend [API README](https://github.com/DannyShayH/MTGO/blob/main/apps/backend/src/api/README.md).

- [#143](https://github.com/DannyShayH/MTGO/issues/143): staff reject an awaiting Order with an optional reason. The cancellation and its full-refund obligation are recorded before the mocked provider is called. The refund is attempted automatically with a stored idempotency key, and a failed refund leaves the Order cancelled and the money visibly owed. A rejection at or after the deadline records the timeout outcome. Staff and the Customer's existing Order page show the cancellation and the refund's pending, failed or succeeded outcome. Accepted Orders have no Reject and point staff to an MTOGO operator.

- [#144](https://github.com/DannyShayH/MTGO/issues/144): an unanswered Order expires without a staff action. A recovery job runs every minute on the worker, the first time right after it starts, and reads only durable records. It cancels each awaiting Order whose deadline has passed with the timeout outcome by the system and attempts the full refund. It also resumes unfinished native cancellation and refunds that are still pending. After downtime the deadline is never extended: staff and the Customer see the deadline as when the cancellation took effect, and staff also see when it was recorded. Acceptance and rejection apply the same expiry rule before the job has run, and an accepted Order is never cancelled by it. A refund whose response was lost is recorded from Medusa's persisted refund instead of being sent again. A refund that failed explicitly stays visibly owed for the operator's retry under #49; recovery does not retry it.

- [#146](https://github.com/DannyShayH/MTGO/issues/146): staff press Start preparing on an accepted Order and then Ready for pickup, with or without an assigned Delivery agent. Each milestone records its actual time and actor once; a repeat keeps the first one, and an out-of-order, cancelled, foreign or revoked attempt is refused with the Order's current outcome. Readiness is not pickup, delivery or native Order completion, and staff cannot undo a milestone. The milestone times, without the staff who recorded them, are part of the Customer's Order progress for the later timeline.

- [#147](https://github.com/DannyShayH/MTGO/issues/147): the Customer's Order page shows the food-progress timeline from the recorded milestones: Order placed, Restaurant accepted, Preparing and Ready for pickup. The stage the Order has reached is marked as now, earlier stages as done with their recorded times, and later ones as upcoming without a time. Readiness says the food is waiting at the Restaurant and claims no Delivery agent, pickup, delivery or arrival time. A cancelled Order keeps the stages it really reached, ends in the cancellation and shows the refund outcome separately; stages it never reached are left out rather than shown as done. The page refreshes the progress every 15 seconds while it is visible, backs off after a failed read, pauses after about ten minutes until the Customer returns or presses Refresh, and stops once the food is ready or the refund has succeeded. A failed refresh keeps the last known progress and says when it was confirmed; a refused one, such as after signing out, stops refreshing. There is no Customer SSE feed. Twenty simultaneous Order-page journeys (the Order details and two progress reads each, on five Orders, against the local devcontainer database) answered at p50 470 ms and p95 968 ms, within the target of 95% of status reads under two seconds (`customer-order-progress.spec.ts`). The Order page and the Order history label each Order by its recorded state (waiting for the Restaurant, accepted, preparing, ready for pickup or cancelled) instead of Medusa's generic status. To see every stage locally, run `DEMO_PROGRESS_CUSTOMER_EMAIL=<email> npx medusa exec ./src/scripts/seed-demo-order-progress.ts` from `apps/backend`: it places one paid Order per stage for that Customer account through the real checkout and staff workflows.
- [#145](https://github.com/DannyShayH/MTGO/issues/145): the owning Customer cancels an awaiting Order from their Order page before Restaurant acceptance. Cancel is offered only while the server allows it and asks for confirmation first. The request rechecks the state and deadline under the Order's lock and uses the same cancellation, full-refund and native synchronization as rejection, so a double tap, a retried lost response or a race with acceptance gives one outcome and one refund. At or after the deadline the Order receives the timeout outcome even before the recovery job runs; after acceptance the Customer is told to contact MTOGO with the Order number. The page then shows the cancellation separately from the refund's pending, failed or succeeded outcome, keeping the purchase, payment and address history.

- [#149](https://github.com/DannyShayH/MTGO/issues/149): on any partner dashboard page, each Order that starts awaiting acceptance raises a prominent banner with a bell icon and its Order number, announced to screen readers without moving keyboard focus, and its queue card is marked New. The Orders link in the navigation shows how many Orders await acceptance on every page. The Orders queue is one column with its connection status, sound switch and Refresh in one toolbar, Awaiting cards lead with the acceptance deadline, and the Awaiting tab shows its count. Hiding the alert only acknowledges it; it never accepts the Order or changes its state. Staff may switch on a short arrival tone; it is off until they do, and when the browser refuses sound the screen says so and keeps the visual alert. Arrivals are recognized by Order identity, so Orders already waiting when the screen opens, repeated updates and reconnects never alert again, and Orders found by the polling fallback alert the same way as live ones. There are no operating-system notifications or alerts while the app is closed.

The Customer's complete event history and live delivery updates remain open under #50.

## Evidence required during implementation

This is discovery evidence, not proof that the Feature has been implemented. Later work items must verify the acceptance examples through meaningful unit and HTTP integration tests, including deadline boundaries, restart recovery, repeated actions, ownership, revoked access and failed refunds. Preserve the existing paid-Order visibility and retry guarantees as the lifecycle expands.

For UI work, check Danish and English, narrow and wide widths, keyboard focus and long text in the browser. Verify the SSE connection through the deployed proxy, isolation by Restaurant, disconnect cleanup, reconnect reconciliation, fallback polling and optional sound behavior. Check that Customer progress and refund outcomes use actual business facts.

Apply the agreed exercise target of twenty simultaneous journeys and 95% of ordinary browsing/status requests within two seconds to the relevant Order queue/status evidence. The 50,000-Customer and 200,000-Order reporting population remains relevant to the later management and financial reporting Features; this discovery does not claim that capacity has been demonstrated.

## Handoff

No business questions remain open from this grill. The team invokes `/to-spec` and then `/to-tickets` separately. The specification must choose the durable lifecycle/deadline/refund representation, the placement and historical snapshot integration, consistent state transitions, the authorized SSE feed and relay, and the concrete verification setup. Preserve the agreed business rules and use installed Medusa APIs and commerce workflows.

Later work items are independently demonstrable vertical slices, each effort M or smaller. Candidate behaviors include accepting a paid Order, rejecting and refunding it, recovering unanswered deadlines, Customer cancellation, preparation milestones and the Customer's progress display, and reliable new-Order alerts. These are handoff considerations, not created or agreed implementation tickets; the later specification determines the final split and dependencies.

Feature #47 remains open until its business outcome is accepted and all required work items are delivered. Discovery #139 remains open for human delivery through TakT.

## References

- [Agreed domain model](/MTGO/product/domain-model/)
- [Customer ordering](/MTGO/product/customer-ordering/)
- [Restaurant recipe compatibility review](/MTGO/architecture/restaurant-recipe-review/)
- [Product acceptance and FURPS](/MTGO/quality/product-acceptance/)
