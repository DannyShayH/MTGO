---
title: Restaurant recipe gap audit
description: Restaurant recipe and Medusa Eats inspiration mapped to implemented behavior, tracked work and operator experience gaps.
---

Reviewed on 17 November 2026 during issue #136. This comparison distinguishes
missing implementation from missing tracking. An open Feature parent establishes
scope; it does not mean detailed implementation tickets or acceptance evidence
already exist.

## Sources and compatibility

The official [Restaurant-Delivery recipe](https://docs.medusajs.com/resources/recipes/marketplace/examples/restaurant-delivery)
models Restaurants owning Products, custom actor authentication and a delivery
workflow. It credits [Medusa Eats](https://github.com/medusajs/medusa-eats), whose
[reviewed README](https://github.com/medusajs/medusa-eats/blob/734e7a2fb2d5e2671daaacf2b79fb72fd75073a7/README.md)
describes Restaurant and driver dashboards, notifications and real-time progress.
That README explicitly describes an architectural demo that the core team does
not actively maintain. Reuse its ideas and verify installed APIs rather than
adopting it as a maintained starter.

The example compatibility review remains authoritative for the pinned example:
[recipe adaptations](/MTGO/architecture/restaurant-recipe-review/). MTOGO uses
Medusa 2.22.4; the pinned example uses 2.14.0.

## Coverage and tracking

| Capability or observation                                               | MTOGO implementation and tracking                                                                                                                                                                                                                                                                         | Conclusion                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Restaurant ownership of Products, actor access and menu management      | Delivered through [#43](https://github.com/DannyShayH/MTGO/issues/43)/[#44](https://github.com/DannyShayH/MTGO/issues/44) and their work items, including #104–114. Restaurant/Product links and the Restaurant-owned menu model already exist.                                                           | Implemented; preserve this model rather than duplicating ownership through Collections.                                                                                                                                                                                                               |
| Successful payment when the Customer presses Pay                        | [#132](https://github.com/DannyShayH/MTGO/issues/132) captures the immediate successful mock payment before exposing the paid Order. [#133](https://github.com/DannyShayH/MTGO/issues/133)–[#135](https://github.com/DannyShayH/MTGO/issues/135) cover failure, uncertain results and delayed resolution. | Implemented and tracked. A successful immediate purchase must not require manual Admin capture; uncertain results must remain honestly pending.                                                                                                                                                       |
| Kitchen Order list, acceptance, rejection and preparation               | [#140](https://github.com/DannyShayH/MTGO/issues/140), #141–146 under Feature #47.                                                                                                                                                                                                                        | Tracked implementation work, not a missing backlog capability.                                                                                                                                                                                                                                        |
| Live kitchen dashboard and arrival alerts                               | [#148](https://github.com/DannyShayH/MTGO/issues/148) explicitly covers scoped SSE, reconnect reconciliation and polling fallback; #149 covers visual alerts and optional sound.                                                                                                                          | Tracked in detailed work items.                                                                                                                                                                                                                                                                       |
| Customer progress                                                       | [#147](https://github.com/DannyShayH/MTGO/issues/147) covers the food-progress timeline and refreshes. [#50](https://github.com/DannyShayH/MTGO/issues/50) covers full event history and mocked SMS.                                                                                                      | Tracked; full history/SMS still have Feature-level tracking rather than the same detailed slices as kitchen preparation.                                                                                                                                                                              |
| Driver access, operating areas, claiming, pickup and completed handover | [#48](https://github.com/DannyShayH/MTGO/issues/48) states ownership, competing-claim, readiness, escalation and timeout rules.                                                                                                                                                                           | Tracked at Feature level; detailed driver journeys and transport/recovery acceptance still require that Feature's discovery.                                                                                                                                                                          |
| Operator exceptions and unresolved refunds                              | [#49](https://github.com/DannyShayH/MTGO/issues/49).                                                                                                                                                                                                                                                      | Tracked at Feature level.                                                                                                                                                                                                                                                                             |
| Opening schedules and arrival estimates                                 | [#55](https://github.com/DannyShayH/MTGO/issues/55), [#56](https://github.com/DannyShayH/MTGO/issues/56).                                                                                                                                                                                                 | Already tracked as optional roadmap capabilities.                                                                                                                                                                                                                                                     |
| Inspect dishes together under their Restaurant in Admin                 | #136 originally specifies only a Product detail panel, not a Restaurant-scoped dish list.                                                                                                                                                                                                                 | Operator experience gap identified in manual review; take a read-only Restaurant menu section into #136 while retaining the built-in Products list.                                                                                                                                                   |
| Restaurant-first Product layout                                         | #136 originally hides Inventory navigation but leaves generic Product sections and a panel below them.                                                                                                                                                                                                    | Manual-review refinement for #136: place the dish panel first and hide irrelevant whole sections using supported shared layouts.                                                                                                                                                                      |
| Native Product-list and Order-line photo thumbnails                     | [#113](https://github.com/DannyShayH/MTGO/issues/113)/[#114](https://github.com/DannyShayH/MTGO/issues/114) cover registered processed photos; #136 covers the custom dish panel photo. These do not explicitly cover native commerce thumbnails.                                                         | [#150](https://github.com/DannyShayH/MTGO/issues/150) now tracks this gap under #46, in Backlog and blocked by #136. Agree authorized projection and current versus historical Order-photo policy before Ready; do not persist expiring signed URLs or introduce a second upload/attachment registry. |

Issue ranges above refer to the [project issue tracker](https://github.com/DannyShayH/MTGO/issues).
The gap rows about layout and thumbnails come from MTOGO's operator review;
they are not claims that the recipe supplies those customizations out of the box.

## Boundaries to preserve

The example's workflow timing and authentication are inspiration, not MTOGO
business authority. Our [ADR-0017](https://github.com/DannyShayH/MTGO/blob/main/docs/adr/0017-partner-app-for-restaurant-staff-and-delivery-agents.md)
keeps Restaurant staff in a separate partner app. Staff invitations and
Restaurant ownership checks remain mandatory; do not adopt unrestricted
self-registration against a supplied Restaurant ID.

[ADR-0009](https://github.com/DannyShayH/MTGO/blob/main/docs/adr/0009-paid-orders-and-independent-preparation-and-assignment.md) places the paid Order before Restaurant acceptance and driver assignment. Payment,
food progress and delivery progress remain separate facts. In the Admin Activity
history, an earlier awaiting-payment event does not undo a later capture.
The website MVP uses mocked external payments and SMS; live location tracking,
real payment-provider setup and automatic driver matching are not requirements
created by this comparison. Driver claiming follows #48 and the agreed ADRs.

For photos, keep the existing attachment registry and File Module as the source
of truth. Read-only Restaurant views should reuse the existing menu and photo
projection. Native Admin thumbnail integration needs its own explicit contract,
including inactive Restaurants, authorization, replacement/removal and historical
Order behavior; duplicating image uploads or storing short-lived URLs does not
resolve that contract.

## Implementation evidence from #136

The operator review also exposed a cleanup case absent from the original fixture:
a known starter Product had reserved inventory. Native Product deletion correctly
refused to delete that inventory. The cleanup now uses Medusa's
variant/inventory unlink step with compensation before native Product retirement, retaining the
inventory items, quantities, reservations and historical Orders. The HTTP
regression covers this case. This is a safe-cleanup correction under #136,
not a new inventory-management capability or a reason to clear reservations.

## Tracking follow-through

Following the developer's request, #150 was created for native Admin thumbnails
and added to the MTGO board in Backlog under #46, blocked by #136. Its scope
reuses registered photos and requires an explicit Order-photo policy before
Ready. Keep it at effort M or smaller; split before Ready if supported native
integration or immutable image retention exceeds that boundary.

Concrete source references and business benefits were added to existing #46,
#47, #48, #49, #50, #140, #142, #143, #146, #147, #148 and #149. The notes
support the agreed work rather than introducing another dashboard, delivery or
timeline epic. Feature and work-item statuses were preserved.
