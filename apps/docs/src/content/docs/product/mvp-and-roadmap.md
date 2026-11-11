---
title: MVP boundary and evolving roadmap
description: Agreed channel boundaries and provisional supervision demo goals from the issue 10 domain review.
sidebar:
  order: 6
---

The team agreed the boundaries below on 11 November 2026. The complete business model, MoSCoW scope, ordered Features and dependencies are agreed; the backlog and demo groups remain open to explicit revision.

The [agreed Feature backlog](/MTGO/product/feature-backlog-proposal/) links fifteen published Feature parents (#42–#56), all verified in Backlog, and their briefs with user stories, business rules, acceptance examples and native blockers: twelve Must have Features, management analytics as Should have, and opening schedules and arrival estimates as Could have stretch candidates.

## Agreed MVP boundary

- Website journeys for Customers, Restaurant staff, Delivery agents and MTOGO operators.
- Danish and English support, including category and dish names and optional descriptions when supplied.
- Mocked payment and SMS services, demonstrating success and failure outcomes.
- A Customer website Order timeline carrying the same business progress information as mocked SMS.
- One Restaurant per Order, one Customer, one destination and one intended delivery.
- Native apps, telephone ordering and scheduled orders are outside the MVP.
- Agent release and reassignment, before and after pickup, are outside the MVP by team choice.
- Dish options, meal customization, promotions and tips are outside the MVP.
- Partial refunds, actual bank transfers, tax invoicing and payroll integration are outside the MVP.
- Complaint management remains outside the current project.

These boundaries are recorded in [ADR-0004](/MTGO/architecture/decisions/0004-website-mvp-with-mocked-external-services/) and [ADR-0005](/MTGO/architecture/decisions/0005-single-restaurant-orders-and-historical-facts/). Inclusion of a journey does not commit every proposed detail to Must have scope.

## Provisional demo goals

Five developers will pull Features in priority order and adjust the backlog as they learn. These are overall demo goals, not deadlines, time estimates or promises to finish a fixed amount of work each week. Business rules and dependencies will determine the final Feature ordering.

| Supervision                          | Provisional demonstrable outcome                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Week 47, 16–22 November 2026         | A Customer submits a paid Order to a Restaurant                                                |
| Week 48, 23–29 November 2026         | The Restaurant prepares the Order, an agent delivers it, and the Customer receives updates     |
| Week 49, 30 November–6 December 2026 | Feedback, commission, sustainable bonuses and management reporting connect to completed Orders |

Existing deployment and quality work must support the demonstrations. The supervision day and available project days have not been specified; the team is not assigning fixed time budgets.

## Agreed Feature grouping

This grouping was agreed on 11 November 2026 and remains an evolving set of demo goals. Priority within each group follows the ordered Feature list; actual prerequisites are shown in the [Feature briefs](/MTGO/product/feature-backlog-proposal/).

| Demo group                             | Features                                                                                                                       | MoSCoW      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| Week 47: paid ordering                 | F01 accurate Feature/work-item flow, F02 Restaurant participation, F03 bilingual menus, F04 Customer accounts, F05 paid Orders | Must have   |
| Week 48: preparation and delivery      | F06 acceptance/preparation, F07 agent deliveries, F08 operational exceptions/refunds, F09 timeline/SMS                         | Must have   |
| Week 49: feedback and business insight | F10 Feedback, F11 fees/statements, F12 agent bonuses                                                                           | Must have   |
| Week 49: management insight            | F13 operational analytics                                                                                                      | Should have |
| Week 49: stretch                       | F14 opening schedules, F15 arrival estimates                                                                                   | Could have  |

The operational exception work list is Must have; aggregate management analytics is Should have so the first MVP remains coherent if that extension is deferred. Existing deployment, coverage, analysis and logging issues are reused, preserving their board fields and avoiding duplicate infrastructure Features.

## Feature planning policy

Each agreed Feature will have one parent issue titled `Feature: <name>`, following the MoM template, with the problem, agreed business rules, relevant ADRs and its milestone. Native blocking links will express real prerequisites. The ordered list and provisional milestone assignment are recorded in the agreed Feature backlog.

New issues remain in Backlog with work-type labels only. Humans own board movement and starting work. This session creates no sub-issues and does not run `/to-spec` or `/to-tickets`; later Feature grills lead to vertical slices of effort M or smaller, aiming for about one day each.

Each Feature needs documented user stories before implementation. When it is pulled, the team refines those stories and breaks them down with an agent while preserving the agreed business rules. A change to a business rule requires explicit team agreement and a corresponding documentation update; implementation refinement does not silently change it.

A Feature parent stays open until the business outcome is accepted and all required work items are delivered. Because TakT closes the issue attached to a delivered branch, discovery requiring a branch is tracked as a work item when the Feature is pulled. No sub-issues are created in this session.

Features are excluded from work-item WIP and throughput, including when they have no sub-issues. [ADR-0007](/MTGO/architecture/decisions/0007-features-and-work-item-flow-measures/) records the agreed distinction and the current metrics implementation gap.
