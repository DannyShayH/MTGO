# Medusa Eats inspiration and implementation handoff

Updated 17 November 2026 during #136. The purpose of this document is to preserve
useful Medusa Eats ideas and the remaining work if this conversation is lost.
Read the [recipe gap audit](../../apps/docs/src/content/docs/architecture/restaurant-recipe-gap-audit.md)
for the coverage matrix and the [recipe compatibility review](../../apps/docs/src/content/docs/architecture/restaurant-recipe-review.md)
before adapting backend behavior. The issue tracker and agreed ADRs remain
business authority.

## Source material worth returning to

The official [Restaurant-Delivery recipe](https://docs.medusajs.com/resources/recipes/marketplace/examples/restaurant-delivery)
credits [Medusa Eats](https://github.com/medusajs/medusa-eats). We inspected the
source at commit `734e7a2fb2d5e2671daaacf2b79fb72fd75073a7`. Its
[README](https://github.com/medusajs/medusa-eats/blob/734e7a2fb2d5e2671daaacf2b79fb72fd75073a7/README.md)
calls it an architectural demo that the core team does not actively maintain.
Borrow interaction patterns; verify APIs against our installed Medusa 2.22.4.
Do not treat the demo as a production starter.

## Best next ideas to borrow

These priorities are recommendations for discovery, not authorization to start
other issues or move their board status.

| Priority | Borrow and adapt                                                                             | Business value                                                                  | Existing tracking and next step                                                                                                                                                                                                                                               |
| -------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Kitchen cards showing Order reference, dish quantities, status and the next permitted action | Staff can handle incoming work quickly without hunting through commerce screens | #140–146 already detail kitchen work under #47. Use those tickets rather than creating another kitchen epic.                                                                                                                                                                  |
| 2        | Visible live connection state and new-Order alerts                                           | Fewer missed Orders; staff can recognize stale information                      | #148 covers scoped SSE, reconnect reconciliation and polling fallback. #149 covers visual alerts and optional sound.                                                                                                                                                          |
| 3        | Customer progress with completed, current and upcoming stages                                | Fewer support questions after payment                                           | #147 covers food progress; #50 covers full history and mocked SMS. Detail the remaining delivery and exception states within those scopes.                                                                                                                                    |
| 4        | Driver cards with a clear claim, pickup or delivered action                                  | Makes the delivery job understandable and reduces handover mistakes             | #48 tracks this at Feature level. Discover and split it into small vertical slices, including competing claims, one active job, readiness and timeout recovery.                                                                                                               |
| 5        | Photos in native Admin Product lists and Order lines                                         | Operators recognize dishes immediately across screens                           | [#150](https://github.com/DannyShayH/MTGO/issues/150) now tracks this gap under #46, in Backlog and blocked by #136. #113/#114 cover photo storage and #136 covers custom inspection. Agree current versus historical image semantics and supported integration before Ready. |
| 6        | Operator exception queue and full event history                                              | Makes unresolved refunds, preparation failures and delivery problems actionable | #49/#50 are existing Feature parents. They still need detailed journey and recovery slices.                                                                                                                                                                                   |

The relevant source examples are concrete:

- [Delivery cards](https://github.com/medusajs/medusa-eats/blob/734e7a2fb2d5e2671daaacf2b79fb72fd75073a7/frontend/src/components/dashboard/delivery-card.tsx)
  show a reference, status, item quantities and role-specific actions.
- [Restaurant actions](https://github.com/medusajs/medusa-eats/blob/734e7a2fb2d5e2671daaacf2b79fb72fd75073a7/frontend/src/components/dashboard/restaurant/delivery-buttons.tsx)
  change their label with status: acceptance, preparation and ready for pickup.
  Our preparation must remain independent of driver assignment; copy the clarity
  of the action, not the example's sequencing.
- [Realtime client](https://github.com/medusajs/medusa-eats/blob/734e7a2fb2d5e2671daaacf2b79fb72fd75073a7/frontend/src/components/dashboard/realtime-client.tsx)
  uses EventSource, refreshes and plays an arrival sound. Its simple green
  indicator is not sufficient evidence of a healthy connection. Implement our
  reconnect, stale-state, authorization and opt-in sound requirements.
- [Customer status](https://github.com/medusajs/medusa-eats/blob/734e7a2fb2d5e2671daaacf2b79fb72fd75073a7/frontend/src/components/store/order/order-status.tsx)
  visually distinguishes completed, active and upcoming steps. Adapt it to our
  independent payment, preparation and delivery facts, including honest pending
  and failure states. The decorative animation is not required for this value.
- [Driver actions](https://github.com/medusajs/medusa-eats/blob/734e7a2fb2d5e2671daaacf2b79fb72fd75073a7/frontend/src/components/dashboard/driver/delivery-buttons.tsx)
  expose claiming, pickup and delivery actions. Server-side ownership and allowed
  transitions must decide what each driver may actually do.

## What is missing, and what is already accounted for

Most major capabilities are already tracked. Missing implementation does not
mean missing tickets. Kitchen work has detailed #140–149 slices. Driver work,
operator exceptions and full history/SMS have #48/#49/#50 parents, with more
discovery needed before implementation. Opening schedules (#55) and arrival
estimates (#56) are optional roadmap work already tracked.

The concrete gap identified here is native Admin photo thumbnails, now tracked
in #150 after the developer requested explicit follow-through.
Use the existing attachment registry and File Module. Decide how removed or
replaced photos affect old Orders, and how authorized views obtain fresh URLs.
Do not store expiring signed URLs in persistent Product or Order fields or add a
second upload registry.

Restaurant ownership, bilingual menu editing and processed photos are already
implemented through #43/#44 and #104–114. #136 now adds Restaurant-scoped dish
inspection and a dish-first Admin layout. Collections are not a replacement for
the existing Restaurant/Product relationship. The developer subsequently requested issue-level follow-through: #150 was
created for thumbnails and source references with concrete benefits were added
to #46/#47/#48/#49/#50 and #140/#142/#143/#146/#147/#148/#149. Existing statuses
were preserved; #150 is in Backlog under #46, blocked by #136. A future session
should use that issue rather than duplicate it, and check current child tickets
before splitting Feature parents.

## Business decisions to preserve

- ADR-0009: a successful paid Order exists before Restaurant acceptance and driver
  assignment. Preparation and assignment are independent. Do not copy the demo's
  sequential delivery status as our complete domain model.
- ADR-0017: Restaurant staff use the separate partner app with invitations,
  revocation and Restaurant ownership checks. Do not adopt unrestricted actor
  registration against a supplied Restaurant ID.
- ADR-0012/0018: Restaurant content is Danish and English; operator Admin labels
  are English.
- MVP external payments and SMS are mocked. Immediate successful Pay already
  captures before returning the paid Order (#132). Uncertain or delayed outcomes
  remain pending honestly (#133–135). The screenshot's Captured status confirms
  payment; Not fulfilled describes a separate fulfillment fact.
- Live GPS, automatic driver matching, native apps and a real payment provider
  are not requirements introduced by this inspiration exercise.

## Short #136 resume checkpoint

Stay on `136-Make_Admin_Products_reflect_Restaurant_dishes`; npm is authoritative
and the storefront exists. Inspect `git status` first. The developer confirmed
this backend uses local development data only and authorized layout and demo
clothing cleanup. Those migrations were applied; do not request that same
confirmation again. Four known clothing Products were removed while inventory,
a reservation and historical Orders were retained.

The developer reported that the revised manual check works, then requested
whole-row dish navigation and descriptions in Product details. Those refinements
are implemented in #136. Native Chromium checks proved whole-row navigation in
the running Admin, both descriptions, missing-description placeholders and long
text at narrow and wide widths. Standards and specification reviews found no
remaining issues. See [Admin implementation and verification](../../apps/backend/src/admin/README.md)
and [API contracts](../../apps/backend/src/api/README.md) for the current behavior.
The saved custom widget key is `widget:mtogo-restaurant-dish`; retain the already
applied layout correction migration.

Before committing, follow AGENTS.md checks and use only
`gh wrapup "Make Admin Products reflect Restaurant dishes (#136)"`.
The developer owns delivery and board movement. No plain commit/push or staging.
The earlier combined affected run hit Node's 2 GB heap after 17 files;
its remaining files passed in fresh processes. The final affected verification
uses two sequential batches, excluding `/http/restaurant` first and selecting
that same pattern second, so every HTTP file is covered without one large
process retaining all suites. Both final batches passed: all 20 HTTP files,
plus the affected cleanup unit tests. Run heavy checks sequentially. Admin typecheck passed; full backend
typecheck has existing errors in unchanged customer-auth/request-logging specs.
Temporary logs and browser helpers under `/tmp` and ignored `tmp/` may disappear;
source and fresh checks take precedence.

The developer subsequently authorized rebasing #136 onto `origin/main`. The only
conflict was independently appended API documentation; both the #93
email-change-notice endpoints and #136 dish-inspection endpoints were retained.
Use `gh wrapup` to publish the rebased branch; the developer still owns delivery.
