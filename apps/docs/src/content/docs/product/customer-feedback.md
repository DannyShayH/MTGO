---
title: Customer Feedback and rating statistics
description: Confirmed scope, decisions and acceptance examples from Feature 51 discovery.
---

Discovery [#209](https://github.com/DannyShayH/MTGO/issues/209) for [Feature #51](https://github.com/DannyShayH/MTGO/issues/51) was confirmed by the team on 24 November 2026, including explicit confirmation that a shared understanding was reached. The ordering Customer rates a delivered Order on its Order detail page, operators see per-Restaurant and per-agent rating statistics in Medusa Admin, and the whole Feature is released behind a default-off Feature flag ([ADR-0022](/MTGO/architecture/decisions/0022-default-off-feature-flags-separate-release-from-deployment/)). Specification, ticket splitting and implementation follow separately.

## Refined user stories

- As the ordering Customer, I want to rate the food, the overall experience and my Delivery agent separately on my delivered Order, so my Feedback reaches the right subject.
- As the ordering Customer, I want to see the ratings I gave, so I know my Feedback was recorded.
- As a Delivery agent, I want only my agent ratings to describe me, so food quality is never held against me.
- As an MTOGO operator, I want to see how each Restaurant's food and each Delivery agent are rated over a period, so I have a clear overview of how they perform.
- As the MTOGO team, we want to deploy Feedback switched off and release it with a Feature flag, so deployment and release are separate.

## Source evidence

- A delivered Order has `terminal_outcome = 'delivered'` and its handover time in `terminal_at` on the Delivery module's `IntendedDelivery`. The Customer progress read already exposes it as `delivered_at` (`steps/read-order-progress.ts`).
- `IntendedDelivery.assigned_agent_id` is the historical responsibility and never changes once set; `active_agent_id` is cleared at the end.
- Customer progress deliberately does not reveal who the agent is.
- A delivered Order is never cancelled or refunded afterwards: operator cancellation refuses `order_delivered` (#199), and corrections are deferred (discovery #196).
- No Feedback code exists. The Customer Order detail page (`account/@dashboard/orders/details/[id]`) already shows Order progress.
- **Medusa has no Feedback or review module.** None of the installed `@medusajs/*` packages models ratings, and the Medusa backend guidance treats reviews as a new domain concept built as a custom module. Feedback is therefore a custom module, with its mutations in a workflow, a Customer-authenticated store route and an operator admin route, linked to the Order with a module link.
- **Medusa has native project feature flags.** At boot the installed loader discovers flag definitions (`key`, `env_key`, `default_val`) in any `feature-flags` directory of the app, and the environment variable overrides the default. The built-in `GET /admin/feature-flags` route lists them, and the Admin dashboard already reads it.
- At this discovery, no generator existed for the then-proposed 200,000-Order reporting dataset. Discovery #223, Q19, later revised [product acceptance](/MTGO/quality/product-acceptance/) to 100 synthetic Customers and 500 Orders.

## Agreed decisions

| Question                  | Decision                                                                                                                                                                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1: Where Feedback starts | A Feedback section on the existing Order detail page, under Order progress, shown while the Order can be rated. No Order-history marker and no separate page. #50's invitation may link to it later; #51 does not depend on it.                                                     |
| Q2: The window            | From the recorded handover time for exactly 168 hours. A submission at or after the end is refused. No time-zone or calendar-day rule.                                                                                                                                              |
| Q3: Ratings               | All three ratings are required in one submission: food, overall experience and agent, each an integer from 1 to 5.                                                                                                                                                                  |
| Q4: Comment               | No free-text comment in the MVP. Complaint management stays out of scope.                                                                                                                                                                                                           |
| Q5: The rated agent       | The agent rating belongs to the Delivery's `assigned_agent_id`. The form says "your Delivery agent" and never shows the agent's name.                                                                                                                                               |
| Q6: Customer view         | The ordering Customer sees their own submitted ratings read-only on the Order detail page. Agent-facing rating information belongs to #53. Restaurant views belong to #52 and #54. Operator statistics were brought back by Q17.                                                    |
| Q7: No changes            | Nobody changes or deletes submitted Feedback in the MVP, operators included. A later correction follows ADR-0014.                                                                                                                                                                   |
| Q8: Repeats               | The first committed submission wins. Any later one, including a double click or a retry after a timeout, is refused with `feedback_already_submitted`, and the page shows the recorded ratings.                                                                                     |
| Q9: Language              | Feedback stores only numbers. The form is shown in the Customer's current storefront language.                                                                                                                                                                                      |
| Q10: Flag scope           | One `feedback` Feature flag covers the whole Feature. When off, the store and admin Feedback routes answer `404`, and the storefront and Admin show nothing.                                                                                                                        |
| Q11: Flag mechanism       | Medusa's native project flag, default off, switched by `MTOGO_FF_FEEDBACK`. Changing it needs a restart, not a new build.                                                                                                                                                           |
| Q12: Single source        | The backend is the only source. The storefront hides the section when the Feedback read answers `404`; the Admin page reads the built-in `GET /admin/feature-flags`.                                                                                                                |
| Q13: Facts survive        | The flag gates behaviour only. Feedback recorded while it was on stays stored and counts for #53. The window keeps running while it is off and is never extended.                                                                                                                   |
| Q14: Defaults and tests   | Off by default; local development, CI and staging switch it on explicitly. Tests prove both states.                                                                                                                                                                                 |
| Q15: Flag removal         | The flag stays until #51 is accepted (ADR-0016); a cleanup work item then removes it and its flag-off path.                                                                                                                                                                         |
| Q16: Convention           | Recorded as project-wide [ADR-0022](/MTGO/architecture/decisions/0022-default-off-feature-flags-separate-release-from-deployment/), with the glossary term Feature flag.                                                                                                            |
| Q17: Operator statistics  | #51 includes an operator-only **Feedback** page in Medusa Admin (English, ADR-0018), behind the same flag, as its own work item after the Customer journey. #54 is unchanged.                                                                                                       |
| Q18: Subjects             | A Restaurant is measured only by food ratings and an agent only by agent ratings. Overall experience is one platform-wide figure, attributed to neither.                                                                                                                            |
| Q19: Row contents         | Average to one decimal, number of ratings, the 1–5 distribution and the number of delivered Orders in the period. Missing Feedback is excluded from the average, never zero; a subject without ratings shows "No ratings".                                                          |
| Q20: Period               | Last 30 days (default), previous calendar month or all time, grouped by the Order's handover time in Copenhagen time, so "previous month" matches #53's bonus month.                                                                                                                |
| Q21: Few ratings          | The average is always shown next to its count; no minimum number of ratings.                                                                                                                                                                                                        |
| Q22: Aggregates only      | No list of individual Feedback or Order references in the MVP.                                                                                                                                                                                                                      |
| Q23: Inactive subjects    | Deactivated Restaurants and agents whose access was revoked stay listed for periods with ratings, marked inactive.                                                                                                                                                                  |
| Q24: Performance          | The statistics page meets the shared response-time requirement on the demo dataset of Q27.                                                                                                                                                                                          |
| Q25: After the window     | Without Feedback, the section disappears silently when the window ends. With Feedback, the read-only ratings stay.                                                                                                                                                                  |
| Q26: Rating control       | Three labelled 1–5 groups shown as stars, keyboard-selectable and announced as "4 of 5". Submit stays disabled until all three are chosen. Danish and English labels from `@dtc/i18n`.                                                                                              |
| Q27: Demo data            | A `seed-demo-feedback.ts` script creates **500 delivered Orders** with Feedback across several Restaurants and agents, plus one Order still open for rating and one whose window has ended. The same data serves the Q24 performance check. No 200,000-Order generator is built.    |
| Medusa first              | Reuse Medusa wherever it already provides the capability: native feature flags and their admin route, a module link to the Order, workflows for mutations, `authenticate` middleware, the JS SDK and `@medusajs/ui`. Build a custom `feedback` module only because Medusa has none. |

### Deviation from product acceptance

At the #51 discovery, [product acceptance](/MTGO/quality/product-acceptance/) asked for reporting verified on 50,000 synthetic Customers and 200,000 Orders. For #51 the team chose 500 seeded delivered Orders, because this is a school project and a full generator is out of proportion for one Feature. Discovery #223, Q19, subsequently revised the shared reporting target to 100 synthetic Customers and 500 Orders with realistic people and coherent histories. The #51 decision to seed 500 delivered Orders for Feedback remains a separate fixture requirement.

## Acceptance examples

| Scenario                                                                                               | Expected result                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The ordering Customer opens an Order delivered two hours ago and submits food 2, experience 3, agent 5 | Feedback is recorded once; the section shows the three ratings read-only. The agent rating belongs to the assigned agent and still qualifies for #53's uplift.                |
| The Customer submits again, double-clicks Submit, or retries after a timeout                           | `feedback_already_submitted`; the recorded ratings are shown and unchanged.                                                                                                   |
| Another Customer submits Feedback for that Order                                                       | Refused; nothing is recorded or revealed.                                                                                                                                     |
| The Customer opens an Order that is preparing, picked up, cancelled or failed                          | No Feedback section; a direct submission is refused.                                                                                                                          |
| The Customer submits 168 hours or more after handover                                                  | Refused. Without earlier Feedback, the section is gone.                                                                                                                       |
| The Customer leaves the agent rating empty, or sends 0 or 6                                            | Submit stays disabled; a direct request is refused.                                                                                                                           |
| The `feedback` flag is off                                                                             | Store and admin Feedback routes answer `404`; no Feedback section or Admin page. Recorded Feedback remains stored.                                                            |
| The flag is switched off for a day and on again                                                        | Orders whose 168 hours passed meanwhile can no longer be rated; the window was not extended.                                                                                  |
| An operator opens the Feedback page with the default period                                            | Restaurants by food rating and agents by agent rating for the last 30 days, each with average, count, distribution and delivered Orders; one platform-wide experience figure. |
| A Restaurant has delivered Orders but no Feedback in the period                                        | Its row shows "No ratings", not 0.0.                                                                                                                                          |
| An Order delivered on 31 October at 23:30 is rated on 3 November                                       | It counts in October's "previous calendar month".                                                                                                                             |
| A deactivated Restaurant had ratings last month                                                        | Listed for that month, marked inactive.                                                                                                                                       |
| Restaurant staff, a Delivery agent or a Customer calls the admin statistics route                      | Refused.                                                                                                                                                                      |

## Delivered so far

- [#218](https://github.com/DannyShayH/MTGO/issues/218): the Customer journey behind the `feedback` flag. A Feedback section on the Order detail page, under the Order's progress, offers the ordering Customer of a delivered Order three labelled 1 to 5 star groups (the food, the overall experience and "your Delivery agent") in Danish or English. The stars are native radio buttons, so arrow keys choose them and screen readers announce "4 of 5". Submit stays disabled until all three are chosen. The `feedback` module records one Feedback per Order with the Delivery's Restaurant, assigned agent and handover time copied in; a repeat, a double click or a concurrent submission answers `feedback_already_submitted`, and the page shows the recorded ratings read-only. Another Customer's Order answers `404`, an Order that was not delivered (still under way, cancelled or failed) is refused with `order_not_delivered`, and invalid ratings with `feedback_ratings_invalid`. The agent's identity is never returned. With the flag off, both store routes answer `404`, the storefront shows no section and recorded Feedback stays unchanged (`customer-feedback.spec.ts`). Operator statistics and the demo seed follow in their own work items.
- [#220](https://github.com/DannyShayH/MTGO/issues/220): demo data for Feedback and the statistics (Q27). From `apps/backend`, against a local, disposable or staging database, run `DEMO_FEEDBACK_CUSTOMER_EMAIL=<email> npx medusa exec ./src/scripts/seed-demo-feedback.ts` with the email of a Customer account registered in the storefront. It creates 500 delivered Orders with Feedback for that Customer at four demo Restaurants in Nørrebro (Pizzeria Fælledvej, Trattoria Guldberg, Nørrebro Pizzabar and Jægersborg Stenovn) and five named demo agents. Each Order buys one to three pizzas, often with a drink, and the handovers spread over the previous and the current calendar month in Copenhagen time, counted from the day of the run. Ratings vary per Restaurant and agent, and every 21st Order has poor food (1 or 2) with a five-star agent rating. It also creates one delivered Order still open for rating (handed over two days ago) and one handed over nine days ago without Feedback, whose window has closed. Each Order goes through the real checkout, kitchen, claim, pickup, handover and Feedback workflows, so the script works with the `feedback` flag off; the Order's recorded times are then moved back together. Application code never rewrites recorded milestones or Feedback (ADR-0021); this synthetic seed does, and it refuses any database that is not local, disposable or staging. A second run creates only the missing Orders and never a second set of Feedback; it also adds a new open Order once the previous one was rated or its window closed, so a demo always has one to rate, and moves the kept Orders to the current plan's times, so rerun it shortly before a demo. At the end it logs how to sign in and the Order numbers that show each Feedback state, without the Customer's email. Generating the plan is covered by `demo-feedback-plan.unit.spec.ts`. One Customer owns all the Orders so that one sign-in shows every state; the shared reporting population of 100 Customers and 500 Orders (ADR-0014) is separate.
- [#219](https://github.com/DannyShayH/MTGO/issues/219): the Feedback window. Feedback can be given until exactly 168 hours after the recorded handover instant, with no time zone or calendar day involved. While the window is open, the store read returns `can_submit: true` and the closing instant as `closes_at`; from the 168th hour on it returns `can_submit: false` with `closes_at: null`, and a submission is refused with `feedback_window_closed`. Without Feedback, the Order detail page then shows no Feedback section; recorded ratings stay visible read-only. The window ignores the `feedback` flag, so switching it off and on never extends it (`customer-feedback.spec.ts`, `rules.unit.spec.ts`).

## Integration boundaries

- **#48 claiming and delivering:** provides the delivered outcome, handover time and assigned agent. #51 reads them and changes nothing.
- **#49 operator refunds:** delivered Orders are never cancelled or refunded; corrections stay deferred.
- **#50 live timeline:** owns the Feedback invitation, which may link to the Order detail section.
- **#52 Restaurant statements and #54 monitoring:** own anything Restaurant staff see; #54 owns a larger reporting dataset.
- **#53 agent bonuses:** reads the recorded agent ratings (4 or 5 gives the 1.10 multiplier; missing Feedback keeps the baseline) and owns what agents see about their ratings.

## Evidence needed in implementation

- HTTP tests for ownership, the delivered-only rule, the exact 168-hour boundary, rating validation and repeated or concurrent submissions recording one Feedback.
- Both flag states for store and admin routes, and the storefront and Admin hiding the Feature when it is off.
- Operator-only access to statistics, food ratings never appearing in agent rows, "No ratings" for unrated subjects and grouping by handover time in Copenhagen time.
- The statistics page within the shared response-time requirement on the 500-Order seed.
- Danish and English labels and keyboard operation of the rating control in a browser journey.

### Operator Feedback statistics (#221)

The operator-only Feedback page shows the last 30 × 24 hours of handovers.
Food ratings describe Restaurants, agent ratings describe Delivery agents,
and overall experience is platform-wide. Each summary shows the average,
number and distribution of ratings and delivered Orders, including unrated
Orders. Inactive Restaurants and revoked agents remain visible. With the
`feedback` flag off the page says “Feedback is not released yet” and does not
request statistics; the endpoint answers 404. Additional periods are a
separate issue.

The HTTP performance test loads the seed generator's 500 planned handovers and
ratings into a disposable database across four Restaurants and five agents,
then makes 20 concurrent operator reads. This exercises the same statistics
facts without running the full commerce-order seed script. On the local test
run, p95 was 74 ms; the shared target is at least 95% within two seconds.
