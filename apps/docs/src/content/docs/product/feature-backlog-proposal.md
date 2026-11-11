---
title: Feature backlog
description: Agreed Feature parents, user stories, business rules and provisional demo milestone groups.
sidebar:
  order: 7
---

**Agreed on 11 November 2026.** Fifteen parent issues are published as #42–#56 and were verified in Project #2 Backlog, with only the development label, their milestones and native blockers. No sub-issues were created. The team approved the business model, MoSCoW scope, Feature ordering, native blockers and provisional milestone groups below. This is an evolving backlog, with implementation refined when each Feature is pulled.

## How to use the backlog

Every selected Feature needs a later Feature grill, documented user stories and business-rule acceptance examples before implementation. The team then calls `/to-spec` and `/to-tickets` itself; work items are independently demonstrable vertical slices, effort M or smaller, aiming for one day each. This session creates no sub-issues and prescribes no module, workflow, API or UI implementation.

Apply role restrictions, historical facts, durable state, safe retries, deadline recovery, visible unresolved failures and reasoned corrections wherever relevant. Verify the accepted exercise performance/data baseline in the relevant journeys and reports. These are cross-cutting acceptance requirements, not separate layer-based Features.

Each Feature is an aggregate and may exceed effort M. Its work items must satisfy the size limit when pulled. Parent issues stay open until the business outcome is accepted and all required work is delivered. Features never contribute to work-item WIP or throughput, even while empty. New parents use only the `development` work-type label and remain in Backlog; humans own board movement and starts.

## Ordered Feature list

Order is a pull preference; only listed blockers become native blocking links. An unblocked Feature can be pulled while another is in progress, within the human-owned WIP policy. Week groups are provisional demo goals for five developers, without fixed time budgets or delivery promises. Should have and Could have scope follows the Must have capability; the list can change by explicit agreement.

| Order                                                     | Feature                                         | MoSCoW      | Demo group | Native blockers |
| --------------------------------------------------------- | ----------------------------------------------- | ----------- | ---------- | --------------- |
| [F01 / #42](https://github.com/DannyShayH/MTGO/issues/42) | Measure Feature delivery and work item flow     | Must have   | Week 47    | None            |
| [F02 / #43](https://github.com/DannyShayH/MTGO/issues/43) | Onboard and operate Restaurants                 | Must have   | Week 47    | None            |
| [F03 / #44](https://github.com/DannyShayH/MTGO/issues/44) | Publish bilingual Restaurant menus              | Must have   | Week 47    | F02             |
| [F04 / #45](https://github.com/DannyShayH/MTGO/issues/45) | Manage Customer accounts and delivery details   | Must have   | Week 47    | None            |
| [F05 / #46](https://github.com/DannyShayH/MTGO/issues/46) | Order from one Restaurant and pay               | Must have   | Week 47    | F03, F04        |
| [F06 / #47](https://github.com/DannyShayH/MTGO/issues/47) | Accept and prepare Restaurant Orders            | Must have   | Week 48    | F05             |
| [F07 / #48](https://github.com/DannyShayH/MTGO/issues/48) | Claim and complete deliveries                   | Must have   | Week 48    | F06             |
| [F08 / #49](https://github.com/DannyShayH/MTGO/issues/49) | Resolve operational exceptions and full refunds | Must have   | Week 48    | F07             |
| [F09 / #50](https://github.com/DannyShayH/MTGO/issues/50) | Follow Orders through a timeline and SMS        | Must have   | Week 48    | F07             |
| [F10 / #51](https://github.com/DannyShayH/MTGO/issues/51) | Rate delivered Orders                           | Must have   | Week 49    | F07             |
| [F11 / #52](https://github.com/DannyShayH/MTGO/issues/52) | Explain Restaurant fees and monthly statements  | Must have   | Week 49    | F07             |
| [F12 / #53](https://github.com/DannyShayH/MTGO/issues/53) | Award and explain sustainable agent bonuses     | Must have   | Week 49    | F10, F11        |
| [F13 / #54](https://github.com/DannyShayH/MTGO/issues/54) | Monitor MTOGO operations                        | Should have | Week 49    | F07             |
| [F14 / #55](https://github.com/DannyShayH/MTGO/issues/55) | Apply Restaurant opening schedules              | Could have  | Week 49    | F02             |
| [F15 / #56](https://github.com/DannyShayH/MTGO/issues/56) | Show estimated arrival times                    | Could have  | Week 49    | F09             |

## Published milestones

- [Supervision week 47: paid ordering](https://github.com/DannyShayH/MTGO/milestone/1): provisional week-47 demo group, without a fixed due date.
- [Supervision week 48: preparation and delivery](https://github.com/DannyShayH/MTGO/milestone/2): provisional week-48 demo group, without a fixed due date.
- [Supervision week 49: feedback and business insight](https://github.com/DannyShayH/MTGO/milestone/3): provisional week-49 demo group, without a fixed due date.

## Existing enabling work

Reuse [deployment #35](https://github.com/DannyShayH/MTGO/issues/35), [coverage #6](https://github.com/DannyShayH/MTGO/issues/6), [static analysis #7](https://github.com/DannyShayH/MTGO/issues/7), [logging #28](https://github.com/DannyShayH/MTGO/issues/28), and their existing prerequisites. Do not create replacement infrastructure Features. Hosting is needed for supervision demonstrations; its issue does not prevent independent local product development. Existing issues keep their current board fields and ownership.

## Scope boundaries

**Must have:** F01–F12 form the agreed coherent MVP: accurate team flow reporting, Restaurant and Customer participation, bilingual menus, paid ordering, preparation, delivery, operator recovery, timeline/SMS, Feedback, commercial statements and explainable bonuses.

**Should have:** F13 adds management analytics after the core operational work list and journeys are dependable. It remains targeted at week 49, with explicit reason if deferred.

**Could have:** F14–F15 are week-49 stretch candidates after Must have scope. Their parked business questions must be settled when pulled.

**Won't have in this MVP:** native apps, telephone or scheduled ordering, agent release/reassignment, dish options/customization, promotions, tips, partial refunds, actual bank transfers, tax invoicing, payroll integration, live GPS tracking and route optimization. Complaint management is outside the current project. These boundaries do not create Feature issues.

## Parked questions and limits

- Actual profitability cannot be proven because salaries and operating costs are unspecified. The accepted bonus policy bounds awards after commission reversals and food losses; it does not invent a cost budget.
- F14/F15 business rules remain explicitly parked for their optional Feature grills, for the reasons below.
- Monetary tie handling, concurrent menu-edit interactions, identity/invitation screens, persistence and other implementation/refinement details are deferred to the relevant Feature grills while preserving the agreed business rules.

## Feature briefs

### F01: Measure Feature delivery and work item flow

GitHub Feature: [#42](https://github.com/DannyShayH/MTGO/issues/42).

**Must have · Supervision week 47: paid ordering · Blocked by: None**

#### Problem

The current collector identifies parents only by sub-issue count, so an empty Feature can be counted as a work item and Feature lead time is unavailable.

#### User stories

- As project lead, I want Features excluded from work-item WIP and throughput even before decomposition so flow measurements stay comparable.
- As a teammate, I want to trace Feature lead time to its work items and see missing data so I can discuss delivery honestly.

#### Agreed rules and boundaries

- A Feature remains a Feature before sub-issues exist; work items are counted once.
- Feature lead time uses Copenhagen calendar days from the earliest sub-issue Start date, including discovery work items, to completion of the last required delivery.
- Keep the original start when scope is removed; record reasons. Reopening required work reopens completion, while later enhancements after accepted completion are new scope.
- Missing dates are unavailable. Wholly withdrawn Features have no completed Feature lead time and appear separately.

#### Acceptance examples to refine

- An empty Feature contributes zero to work-item WIP and throughput.
- A Feature containing a started discovery item and later implementation items uses the discovery Start date; a missing date is visible rather than invented.

#### References

[ADR-0007](/MTGO/architecture/decisions/0007-features-and-work-item-flow-measures/).

### F02: Onboard and operate Restaurants

GitHub Feature: [#43](https://github.com/DannyShayH/MTGO/issues/43).

**Must have · Supervision week 47: paid ordering · Blocked by: None**

#### Problem

MTOGO needs to register participating food locations, arrange Restaurant staff access and control whether each location may receive Orders.

#### User stories

- As an MTOGO operator, I want to register a Restaurant location and authorize its staff so it can join the platform.
- As Restaurant staff, I want to open or close my Restaurant without losing existing Orders so daily service availability is accurate.

#### Agreed rules and boundaries

- One preparation and pickup location is one Restaurant, including catering businesses operating that way; separate branches are separate Restaurants.
- Operators manage Restaurant staff access, activation/deactivation, operating areas and commercial terms.
- Activation requires pickup address, contacts, authorized staff, common commercial terms, a published menu and a postal-code delivery area.
- Active/inactive participation is separate from manually open/closed availability; only active, open Restaurants serving the destination may receive new Orders.
- Closing, deactivation and revoked access preserve history and do not abandon existing Orders.

#### Acceptance examples to refine

- A Restaurant without a published menu cannot be activated; complete synthetic setup can be activated.
- Closing a Restaurant prevents a new Order while an existing paid Order remains visible and actionable.

#### References

[ADR-0004](/MTGO/architecture/decisions/0004-website-mvp-with-mocked-external-services/), [ADR-0006](/MTGO/architecture/decisions/0006-marginal-commission-and-monthly-service-fee/), [ADR-0008](/MTGO/architecture/decisions/0008-role-boundaries-and-restaurant-activation/).

### F03: Publish bilingual Restaurant menus

GitHub Feature: [#44](https://github.com/DannyShayH/MTGO/issues/44).

**Must have · Supervision week 47: paid ordering · Blocked by: F02**

#### Problem

Restaurants need to publish their own food, prices and availability so Customers can choose accurate offerings in Danish or English.

#### User stories

- As Restaurant staff, I want to maintain categories, dishes, prices and sold-out status so Customers see what my Restaurant can prepare.
- As a Customer, I want clear bilingual menu information and honest availability so I can choose food confidently.

#### Agreed rules and boundaries

- Only authorized staff manage their own Restaurant menu; individual dishes do not require MTOGO approval.
- Category and dish names require Danish and English; optional descriptions require both languages when supplied.
- Restaurant-provided allergen information is displayed, with missing information visibly unknown.
- Prices are positive DKK amounts including delivery and the exercise menu VAT assumption of 25%.
- Valid saved changes publish immediately. Sold-out dishes remain visible and cannot be ordered.
- Removing or changing menu content preserves historical Order facts. Dish options, customization, promotions and tips are outside the MVP.

#### Acceptance examples to refine

- A supplied description missing one required language does not publish as valid content.
- Marking a dish sold out prevents ordering it while preserving its visibility and past Order lines.

#### References

[ADR-0005](/MTGO/architecture/decisions/0005-single-restaurant-orders-and-historical-facts/), [ADR-0008](/MTGO/architecture/decisions/0008-role-boundaries-and-restaurant-activation/), [ADR-0012](/MTGO/architecture/decisions/0012-restaurant-owned-bilingual-menus/).

**Parked/refinement:** Concurrent staff-edit interaction and exact monetary tie handling are refinement questions for the Feature grill; the accepted ownership and historical-Order rules remain binding.

### F04: Manage Customer accounts and delivery details

GitHub Feature: [#45](https://github.com/DannyShayH/MTGO/issues/45).

**Must have · Supervision week 47: paid ordering · Blocked by: None**

#### Problem

Customers need personal accounts and delivery/contact details, while private Order information must remain accessible only to its owner.

#### User stories

- As a Customer, I want to browse before signing in and use a personal account before ordering so I can shop without losing ownership of my Orders.
- As a Customer, I want to manage my delivery details and language so Orders use the information I confirm.

#### Agreed rules and boundaries

- Browsing is public; submitting an Order requires the Customer to sign in.
- A Customer accesses only their own Orders and account details.
- The confirmed destination and chosen language are preserved with each Order; later changes to saved details do not rewrite it.
- The MVP supports Danish and English and website ordering; native apps and telephone ordering are outside scope.

#### Acceptance examples to refine

- A signed-out visitor can browse but cannot submit an Order.
- Changing a saved address leaves an existing Order destination unchanged, and another Customer cannot access that Order.

#### References

[ADR-0004](/MTGO/architecture/decisions/0004-website-mvp-with-mocked-external-services/), [ADR-0005](/MTGO/architecture/decisions/0005-single-restaurant-orders-and-historical-facts/), [ADR-0008](/MTGO/architecture/decisions/0008-role-boundaries-and-restaurant-activation/), [ADR-0013](/MTGO/architecture/decisions/0013-order-timeline-and-independent-notification-delivery/).

### F05: Order from one Restaurant and pay

GitHub Feature: [#46](https://github.com/DannyShayH/MTGO/issues/46).

**Must have · Supervision week 47: paid ordering · Blocked by: F03, F04**

#### Problem

Customers need to review food and delivery details, pay once and receive a durable Order reference without duplicate purchases during retries.

#### User stories

- As a Customer, I want to review one Restaurant basket and the final price before paying so I know exactly what I am buying.
- As a Customer, I want a clear payment outcome and Order reference so refreshing or retrying does not purchase the same food twice.

#### Agreed rules and boundaries

- An Order has one Customer, one Restaurant, one destination and one intended delivery; another Restaurant requires another Order.
- Recheck Restaurant participation/opening, destination coverage, dish availability and price before payment; changed content requires Customer review.
- Charge through the mocked external supplier at submission. Success immediately places an Order awaiting Restaurant acceptance, independent of agent assignment.
- Uncertain outcomes stay pending while checked; after five minutes they need operator attention without another charge or a false conclusive failure.
- No separate delivery charge, payment on delivery, silent food substitution or silently increased charge.
- Preserve ordered names, quantities, prices, destination and payment history across changes, retries and restarts.

#### Acceptance examples to refine

- A price change before payment requires review of the updated basket.
- Concurrent retries or a restart around a successful mock payment produce one purchase and one successful charge; immediate-provider submissions meet the agreed five-second target.

#### References

[ADR-0004](/MTGO/architecture/decisions/0004-website-mvp-with-mocked-external-services/), [ADR-0005](/MTGO/architecture/decisions/0005-single-restaurant-orders-and-historical-facts/), [ADR-0008](/MTGO/architecture/decisions/0008-role-boundaries-and-restaurant-activation/), [ADR-0009](/MTGO/architecture/decisions/0009-paid-orders-and-independent-preparation-and-assignment/), [ADR-0012](/MTGO/architecture/decisions/0012-restaurant-owned-bilingual-menus/), [ADR-0014](/MTGO/architecture/decisions/0014-durable-business-state-and-auditable-corrections/).

### F06: Accept and prepare Restaurant Orders

GitHub Feature: [#47](https://github.com/DannyShayH/MTGO/issues/47).

**Must have · Supervision week 48: preparation and delivery · Blocked by: F05**

#### Problem

Restaurant staff need to accept or reject paid Orders and record preparation without waiting for delivery assignment.

#### User stories

- As Restaurant staff, I want to accept or reject my Restaurant Orders so I commit only to food I can fulfil.
- As Restaurant staff, I want to record preparation starting and food readiness so pickup and Customer progress reflect reality.

#### Agreed rules and boundaries

- Staff access only their Restaurant Orders. Acceptance must occur within five minutes of placement.
- Rejection or acceptance timeout cancels the Order with a full Customer refund owed; retain the Order/payment history and show unresolved refunds until successful.
- After acceptance, preparation and agent assignment proceed independently; pickup requires both ready food and an assigned agent.
- Customers can cancel themselves before acceptance. After acceptance an operator handles cancellation: full refund before preparation; no automatic change-of-mind refund afterward, with reasoned operator exceptions.
- Restaurant inability to fulfil requires a full refund. Record actual preparation milestones and recover expired deadlines after restart.

#### Acceptance examples to refine

- An accepted Order can enter preparation with no agent assigned.
- An unanswered Order cancels after five minutes, including after recovery from a restart; refund failure remains unresolved rather than falsely successful.

#### References

[ADR-0008](/MTGO/architecture/decisions/0008-role-boundaries-and-restaurant-activation/), [ADR-0009](/MTGO/architecture/decisions/0009-paid-orders-and-independent-preparation-and-assignment/), [ADR-0011](/MTGO/architecture/decisions/0011-order-failures-cancellation-and-mvp-handover/), [ADR-0014](/MTGO/architecture/decisions/0014-durable-business-state-and-auditable-corrections/).

### F07: Claim and complete deliveries

GitHub Feature: [#48](https://github.com/DannyShayH/MTGO/issues/48).

**Must have · Supervision week 48: preparation and delivery · Blocked by: F06**

#### Problem

MTOGO agents need authorized access, one responsible delivery at a time and an accurate record of pickup and handover.

#### User stories

- As an MTOGO operator, I want to authorize agents and define their operating areas so delivery work reaches eligible employees.
- As a Delivery agent, I want to claim local work, collect ready food and confirm handover so responsibility and progress stay accurate.

#### Agreed rules and boundaries

- Operators manage agent access and areas. Agents see available work in their area and their assigned deliveries; Customer contact details become visible after assignment.
- One responsible agent per delivery and at most one active delivery per agent, including competing claims.
- Pickup requires ready food and assignment; report actual pickup and confirm delivery only after handover to the Customer or designated recipient.
- Alert after ten minutes unassigned and cancel after twenty if still unassigned, both from acceptance; full Customer refund and MTOGO-funded prepared-food credit follow the shared financial rules.
- Contact attempts and operator escalation follow ten minutes at the destination with an unreachable Customer; never report a false delivery.
- Release and reassignment are outside the MVP before and after pickup; an agent unable to complete escalates to an operator.

#### Acceptance examples to refine

- Two agents competing for one delivery produce one assignment, and an agent cannot hold two active deliveries.
- Food cannot be picked up before readiness; an unreachable Customer is escalated without a delivered status.

#### References

[ADR-0008](/MTGO/architecture/decisions/0008-role-boundaries-and-restaurant-activation/), [ADR-0009](/MTGO/architecture/decisions/0009-paid-orders-and-independent-preparation-and-assignment/), [ADR-0011](/MTGO/architecture/decisions/0011-order-failures-cancellation-and-mvp-handover/), [ADR-0014](/MTGO/architecture/decisions/0014-durable-business-state-and-auditable-corrections/).

### F08: Resolve operational exceptions and full refunds

GitHub Feature: [#49](https://github.com/DannyShayH/MTGO/issues/49).

**Must have · Supervision week 48: preparation and delivery · Blocked by: F07**

#### Problem

Operators need a shared view and reasoned actions for uncertain payments, overdue work, failed handovers and unresolved full refunds.

#### User stories

- As an MTOGO operator, I want to see Orders and payment outcomes needing attention so failures are not lost between actors.
- As an MTOGO operator, I want to resolve full refunds and correct recorded mistakes with reasons so financial responsibility and history stay explainable.

#### Agreed rules and boundaries

- Collect attention for acceptance/unassigned deadlines, five-minute uncertain payments, thirty minutes from acceptance without pickup, thirty minutes from pickup without delivery and ten-minute unreachable handover escalation.
- Assigned-work thresholds trigger investigation, not automatic cancellation or a delivery-time promise; record continuation or failure.
- Apply the agreed cancellation and responsibility rules. Full refunds return the amount paid, reverse original commission and remain unresolved until provider success.
- Preserve original events, who corrected them and the reason; goodwill refunds identify who bears the loss.
- No agent release/reassignment, partial refunds or complaint-management workflow is added.
- Retries, restart recovery and role restrictions preserve the same business outcome without duplicate charges or refunds.

#### Acceptance examples to refine

- An overdue assigned delivery appears for operator investigation without being silently cancelled.
- An approved but provider-failed refund remains visible and reduces available bonus funding; retrying does not repay the Customer twice.

#### References

[ADR-0006](/MTGO/architecture/decisions/0006-marginal-commission-and-monthly-service-fee/), [ADR-0008](/MTGO/architecture/decisions/0008-role-boundaries-and-restaurant-activation/), [ADR-0009](/MTGO/architecture/decisions/0009-paid-orders-and-independent-preparation-and-assignment/), [ADR-0011](/MTGO/architecture/decisions/0011-order-failures-cancellation-and-mvp-handover/), [ADR-0014](/MTGO/architecture/decisions/0014-durable-business-state-and-auditable-corrections/).

### F09: Follow Orders through a timeline and SMS

GitHub Feature: [#50](https://github.com/DannyShayH/MTGO/issues/50).

**Must have · Supervision week 48: preparation and delivery · Blocked by: F07**

#### Problem

Customers need consistent progress information on the website and through SMS even when message delivery fails.

#### User stories

- As a Customer, I want an Order timeline showing recorded progress so I can understand what is happening.
- As a Customer, I want SMS updates in my chosen language so I can follow progress without keeping the website open.

#### Agreed rules and boundaries

- The website timeline and mocked SMS carry placement, acceptance, preparation starting, readiness, pickup, delivery, cancellation and Feedback-invitation information.
- Use the language recorded with the Order, with Danish and English supported.
- The website is the place to check current status; failed SMS does not block preparation or delivery.
- Failed messages stay visible for operator attention; retries avoid duplicate Customer messages.
- SMS includes the Order reference and status without unnecessary personal/address details; the Customer timeline respects ownership and does not expose internal financial or operator-only notes.
- Native apps and live location tracking are outside this MVP capability.

#### Acceptance examples to refine

- A preparation event appears consistently in the Customer timeline and mocked SMS in the Order language.
- An SMS failure leaves the timeline usable and does not prevent pickup or delivery.

#### References

[ADR-0004](/MTGO/architecture/decisions/0004-website-mvp-with-mocked-external-services/), [ADR-0005](/MTGO/architecture/decisions/0005-single-restaurant-orders-and-historical-facts/), [ADR-0008](/MTGO/architecture/decisions/0008-role-boundaries-and-restaurant-activation/), [ADR-0013](/MTGO/architecture/decisions/0013-order-timeline-and-independent-notification-delivery/), [ADR-0014](/MTGO/architecture/decisions/0014-durable-business-state-and-auditable-corrections/).

### F10: Rate delivered Orders

GitHub Feature: [#51](https://github.com/DannyShayH/MTGO/issues/51).

**Must have · Supervision week 49: feedback and business insight · Blocked by: F07**

#### Problem

MTOGO needs voluntary feedback that distinguishes food, the overall experience and the individual agent without attributing food quality to delivery staff.

#### User stories

- As the ordering Customer, I want to rate food, experience and agent separately after delivery so my feedback identifies the right subject.
- As a Delivery agent, I want food ratings kept separate from my rating-based bonus so responsibility is represented fairly.

#### Agreed rules and boundaries

- Only the ordering Customer may submit Feedback after successful delivery.
- Use three separate integer ratings from 1 to 5: food, overall experience and agent.
- One voluntary submission within seven days of delivery, uneditable in the MVP; missing Feedback is unrated, never zero.
- Only the agent rating affects the individual rating-based bonus; food and experience ratings do not reduce that reward.
- The Feedback invitation is part of the timeline/SMS capability; this Feature does not depend on that external delivery succeeding.

#### Acceptance examples to refine

- Another Customer, a pre-delivery Order, an expired window or a second submission cannot produce valid Feedback.
- Poor food ratings with a five-star agent rating preserve the agent-rating uplift.

#### References

[ADR-0008](/MTGO/architecture/decisions/0008-role-boundaries-and-restaurant-activation/), [ADR-0010](/MTGO/architecture/decisions/0010-commission-funded-bonuses-and-separate-feedback-ratings/), [ADR-0013](/MTGO/architecture/decisions/0013-order-timeline-and-independent-notification-delivery/).

### F11: Explain Restaurant fees and monthly statements

GitHub Feature: [#52](https://github.com/DannyShayH/MTGO/issues/52).

**Must have · Supervision week 49: feedback and business insight · Blocked by: F07**

#### Problem

Restaurants and operators need reproducible fees, food credits and commercial balances that explain how Order outcomes affect money.

#### User stories

- As Restaurant staff, I want to see my Restaurant food credits, commission and monthly service fee so I can understand the commercial balance.
- As an MTOGO operator, I want financial history to preserve original amounts and adjustments so refunds and failures can be reconciled.

#### Agreed rules and boundaries

- Exercise menu VAT is 25%; commission uses food value excluding VAT and marginal tiers of 6%, 5%, 4% and 3% at DKK 100, 500 and 1,000.
- Earn commission on successful delivery, round the final amount once to two decimals and reverse the original amount on a full refund.
- Charge DKK 100 excluding VAT per active month, prorated once by active Copenhagen calendar days; temporary closure remains billable.
- Apply the shared food-credit responsibility table, including MTOGO-funded prepared-food loss and no commission on undelivered Orders.
- Monthly statements show food credits, commission, service fees, adjustments and balance excluding VAT. Staff see only their Restaurant.
- Changes to commercial terms affect future business. Actual bank transfers, tax invoicing, payroll and partial refunds are outside the MVP.

#### Acceptance examples to refine

- DKK 600 excluding VAT gives DKK 30 commission; fifteen active days in a thirty-day month give DKK 50 service fee excluding VAT.
- An MTOGO-caused failure after preparation credits the full food value excluding VAT with no commission; historical terms remain unchanged.
- Verify management/financial results with 50,000 synthetic Customers and 200,000 historical Orders.

#### References

[ADR-0005](/MTGO/architecture/decisions/0005-single-restaurant-orders-and-historical-facts/), [ADR-0006](/MTGO/architecture/decisions/0006-marginal-commission-and-monthly-service-fee/), [ADR-0008](/MTGO/architecture/decisions/0008-role-boundaries-and-restaurant-activation/), [ADR-0011](/MTGO/architecture/decisions/0011-order-failures-cancellation-and-mvp-handover/), [ADR-0014](/MTGO/architecture/decisions/0014-durable-business-state-and-auditable-corrections/).

### F12: Award and explain sustainable agent bonuses

GitHub Feature: [#53](https://github.com/DannyShayH/MTGO/issues/53).

**Must have · Supervision week 49: feedback and business insight · Blocked by: F10, F11**

#### Problem

Agents need explainable performance bonuses, and MTOGO needs a budget bounded by available commission after refunds and food losses.

#### User stories

- As an MTOGO operator, I want to calculate and finalize monthly awards within the available funding so bonuses cannot exceed the agreed budget.
- As a Delivery agent, I want to see my completed work, points and provisional/final awards so I can understand my own bonus.

#### Agreed rules and boundaries

- Cap the pool at 20% of positive commission after refunds, reversals, MTOGO-funded food compensation and carried losses; exclude service fees.
- Delivered net Order value gives base points; multiply by 1.25 for pickup in Copenhagen early hours 06:00–09:00 or late hours 21:00–06:00, with window ends exclusive.
- Multiply by 1.10 for agent ratings of 4 or 5; other ratings and missing Feedback retain the baseline.
- Share the pool proportionally and finalize the previous month on the 8th. Approved refund obligations count before provider completion; full pre-finalization refunds remove points.
- Later refunds affect future funding and negative balances carry forward without wage deductions. Round awards down to DKK 0.01 increments and retain the remainder.
- Agents see only their own completed deliveries, points and clearly distinguished provisional/final awards; salary costs are unspecified, so no overall-profitability claim is made.

#### Acceptance examples to refine

- DKK 200 at 22:00 with a five-star agent rating gives 275 points.
- DKK 1,000 commission minus DKK 300 food compensation allows at most DKK 140 in the pool; approved refunds cannot fund bonuses while provider execution is pending.
- No positive funding or no eligible points produces no awards; rounding cannot increase total awards above the available pool.

#### References

[ADR-0006](/MTGO/architecture/decisions/0006-marginal-commission-and-monthly-service-fee/), [ADR-0008](/MTGO/architecture/decisions/0008-role-boundaries-and-restaurant-activation/), [ADR-0010](/MTGO/architecture/decisions/0010-commission-funded-bonuses-and-separate-feedback-ratings/), [ADR-0014](/MTGO/architecture/decisions/0014-durable-business-state-and-auditable-corrections/).

### F13: Monitor MTOGO operations

GitHub Feature: [#54](https://github.com/DannyShayH/MTGO/issues/54).

**Should have · Supervision week 49: feedback and business insight · Blocked by: F07**

#### Problem

Management needs shared Order-volume and processing measures with visible periods, populations and data gaps.

#### User stories

- As an MTOGO operator, I want to see open Orders, recent volume, processing time and unresolved exceptions so I can assess daily operations.
- As Restaurant staff, I want the same business measures restricted to my Restaurant so I can understand my own service.

#### Agreed rules and boundaries

- Open Orders are paid Orders neither delivered nor cancelled/failed.
- Show rolling last-24-hour placements with cancellations separate; average placements per day across the previous seven complete Copenhagen days, including zero-Order days.
- Average processing time is placement to handover for Orders delivered in the last 24 hours.
- Show unresolved payments/refunds and deliveries needing attention separately.
- Missing history/timestamps is unavailable with visible exclusions; show population and period.
- Operators see the platform; Restaurant staff only their Restaurant. Verify reporting with the agreed 50,000-Customer/200,000-Order synthetic dataset.

#### Acceptance examples to refine

- A cancelled Order is excluded from open Orders and delivered processing time, while its placement can contribute to the stated volume population.
- A missing handover timestamp is reported as an exclusion rather than a zero processing time.

#### References

[ADR-0008](/MTGO/architecture/decisions/0008-role-boundaries-and-restaurant-activation/), [ADR-0014](/MTGO/architecture/decisions/0014-durable-business-state-and-auditable-corrections/), [ADR-0015](/MTGO/architecture/decisions/0015-management-measures-and-visible-exclusions/).

### F14: Apply Restaurant opening schedules

GitHub Feature: [#55](https://github.com/DannyShayH/MTGO/issues/55).

**Could have · Supervision week 49: feedback and business insight · Blocked by: F02**

#### Problem

Manual opening decisions are enough for the MVP, but predictable recurring hours could reduce routine Restaurant staff work.

#### User stories

- As Restaurant staff, I want recurring opening hours so normal availability can follow my Restaurant schedule.

#### Agreed rules and boundaries

- This is a stretch Feature, outside the required MVP; manual opening remains the agreed baseline.
- Activation, destination coverage, dish availability and preservation of existing Orders remain binding.
- Business rules for manual overrides, overnight periods and exceptional closures are explicitly parked until the Feature grill.

#### Acceptance examples to refine

- Before implementation, agree user stories and acceptance examples for schedule/manual-closure interaction without weakening existing Order eligibility.

#### References

[ADR-0004](/MTGO/architecture/decisions/0004-website-mvp-with-mocked-external-services/), [ADR-0008](/MTGO/architecture/decisions/0008-role-boundaries-and-restaurant-activation/).

**Parked/refinement:** Manual override, overnight and exceptional-closure rules are parked because this optional capability is not part of the agreed MVP; settle them if the team pulls it.

### F15: Show estimated arrival times

GitHub Feature: [#56](https://github.com/DannyShayH/MTGO/issues/56).

**Could have · Supervision week 49: feedback and business insight · Blocked by: F09**

#### Problem

The agreed timeline shows actual progress; an arrival estimate could help Customers plan if a defensible estimate becomes available.

#### User stories

- As a Customer, I want a clearly identified arrival estimate alongside actual Order progress so I can plan for delivery.

#### Agreed rules and boundaries

- This is a stretch Feature, outside the required MVP; actual timeline events remain authoritative.
- An estimate must be identified as an estimate, without turning existing escalation thresholds into promised arrival times.
- Estimation inputs, update rules and any delivery promise are explicitly parked until the Feature grill; live GPS tracking is not implied.

#### Acceptance examples to refine

- Before implementation, agree how estimates differ from actual events and how an unavailable or outdated estimate is presented.

#### References

[ADR-0004](/MTGO/architecture/decisions/0004-website-mvp-with-mocked-external-services/), [ADR-0013](/MTGO/architecture/decisions/0013-order-timeline-and-independent-notification-delivery/).

**Parked/refinement:** Estimation inputs, updates and promise policy are parked because this optional capability is not part of the agreed MVP; settle them if the team pulls it.
