---
title: Sustainable agent bonuses specification
description: Specification for Feature 53, synthesized from the agreed discovery 224.
---

## Problem Statement

Delivery agents are MTOGO employees who are eligible for performance bonuses, but they cannot yet see what their delivery work earns on top of their salary. Pickup times, delivery outcomes and agent ratings exist separately, and nothing turns them into explainable Bonus points or a Bonus award.

MTOGO must keep the scheme financially sustainable. Bonuses must never spend refunded or loss-funded revenue, a month with food losses must not be paid from future commission without being earned back, and a finalized award must never change or become a wage deduction. Operators need to see why each month's Bonus pool has the size it has.

## Solution

Calculate Bonus points for every delivered Order from its food value excluding VAT, with the agreed pickup-hour and agent-rating multipliers, credited to the delivering agent in the Copenhagen month of handover. Fund a monthly Bonus pool of 20% of the positive balance of commission minus reversals, MTOGO-funded food compensation and any Carried loss, read from Feature #52's finance journal. Share it proportionally, round each award down to DKK 0.01 and let MTOGO retain the remainder.

A daily job finalizes each month once, from the 8th of the following month, oldest first, with a recorded cut-off. Delivery agents get a Danish and English Bonus page in the partner app showing each delivery's points, multipliers and approximate amount, a provisional current month, finalized months and their final awards this year. Operators get a read-only Admin page with each month's funding evidence, awards and status. Everything sits behind the default-off `agent_bonus` flag. The agreed [discovery](/MTGO/product/agent-bonuses/) contains Q1–Q29, examples and the worked fairness example.

## User Stories

1. As a Delivery agent, I want a Bonus entry in the delivery workspace and history, so that I can find my bonus from where I already work.
2. As a Delivery agent, I want the page in Danish or English, so that I can read it in my working language.
3. As a Delivery agent, I want the page to work on my phone, so that I can check it between deliveries.
4. As a Delivery agent, I want the current month shown first and labelled provisional, so that I know it can still change.
5. As a Delivery agent, I want to see "This month so far" with an approximate amount and delivery count, so that I know roughly what I have earned this month.
6. As a Delivery agent, I want to see when the provisional figures were calculated, so that I know how fresh they are.
7. As a Delivery agent, I want to see "No bonus pool so far this month" when funding is not positive, so that I am not promised an amount that does not exist.
8. As a Delivery agent, I want each delivered Order listed with handover date and Order reference, so that I can recognize my work.
9. As a Delivery agent, I want each delivery's food value excluding VAT and points, so that I can see how bigger Orders count.
10. As a Delivery agent, I want the recorded pickup time and whether the early or late multiplier applied, so that I understand the effect of my working hours.
11. As a Delivery agent, I want to see whether the rating multiplier applied, without the star value, so that I understand the effect of good service without seeing a Customer's individual Feedback.
12. As a Delivery agent, I want an approximate DKK amount for each delivery, so that I can see what each delivery adds.
13. As a Delivery agent, I want deliveries cancelled after pickup to be absent, so that I am not misled about which work earns points.
14. As a Delivery agent, I want finalized months labelled final with their award, so that I can tell decided amounts from estimates.
15. As a Delivery agent, I want each finalized month's per-delivery amounts to stay the same forever, so that the explanation I saw does not change.
16. As a Delivery agent, I want a footnote explaining that awards are rounded down to DKK 0.01, so that a few øre difference from the per-delivery sum makes sense.
17. As a Delivery agent, I want my total of final awards this year, so that I know what has been decided so far this year.
18. As a Delivery agent, I want a finalized month with no pool shown honestly, so that I understand why there was no award.
19. As a Delivery agent, I want an award of DKK 0.00 shown with my points when my share is below one øre, so that I can see my work was counted.
20. As a Delivery agent, I want to see only my own figures, so that colleagues' bonuses and Customer details stay private.
21. As a Delivery agent, I want the page to show that the bonus comes on top of my salary, so that it is not mistaken for pay per delivery.
22. As a Delivery agent whose access has ended, I want my earned award still finalized, so that past work is not forfeited.
23. As a Delivery agent, I want keyboard-accessible controls and readable long values on narrow and wide screens, so that I can use the page on any device.
24. As a Delivery agent, I want loading, unavailable and failed states distinguished from an empty month, so that an error does not look like zero bonus.
25. As an MTOGO operator, I want an Agent bonuses page in Medusa Admin, so that I can inspect bonuses without an agent identity.
26. As an MTOGO operator, I want one row per month with provisional or finalized status and finalization time, so that I can see where each month stands.
27. As an MTOGO operator, I want commission, reversals, compensation, carried loss in, balance, pool, total awarded, retained remainder and carried loss out, so that I can confirm the pool never exceeds the agreed budget.
28. As an MTOGO operator, I want per-agent deliveries, points and awards for a month, so that I can explain any agent's award.
29. As an MTOGO operator, I want a #52 evidence warning shown on the affected month, so that I know the month finalized with incomplete financial evidence.
30. As an MTOGO operator, I want the actual finalization time when the job ran late, so that a missed 8th is visible.
31. As an MTOGO operator, I want no action that triggers, re-runs or edits a finalization, so that finalized awards cannot be changed by mistake.
32. As an MTOGO operator, I want no payroll, payout or profitability figures, so that the page does not claim what MTOGO does not know.
33. As MTOGO, I want a pool of 20% of positive funding only, so that bonuses cannot exceed what the business can afford.
34. As MTOGO, I want a refund to reduce funding only by the commission it reverses, so that funding is neither overstated nor deducted twice.
35. As MTOGO, I want a negative balance carried forward as a Carried loss, so that later commission must earn it back before a pool exists.
36. As MTOGO, I want funding facts recorded after their month is finalized to count in the next month not yet finalized, so that late facts are never lost and finalized awards never change.
37. As MTOGO, I want the rounding remainder retained, so that rounding never pays more than the pool.
38. As MTOGO, I want each month finalized exactly once, even with repeated, concurrent or late runs, so that awards are never duplicated.
39. As MTOGO, I want months finalized oldest first, so that each month's carried loss is known when the next month finalizes.
40. As MTOGO, I want the finalization job and stored awards to keep running while the flag is off, so that release timing does not change earned facts.
41. As a maintainer, I want the calculation verified against every agreed example, including daylight-saving nights, so that the money rules are proven.
42. As a maintainer, I want demonstration data with a carried-loss month, a finalized month and a provisional month, so that both journeys can be shown on any date.
43. As a maintainer, I want the Bonus page and Admin page measured on the 500-Order baseline under twenty simultaneous journeys, so that performance has evidence.

## Implementation Decisions

### 1. Ownership and reuse

- Introduce a bonus module, registered with a camelCase key, owning month finalization records and per-agent Bonus award rows. It does not own delivery, Feedback or financial facts and never copies them as its own truth.
- Delivery remains the source of the assigned agent, actual pickup time, outcome and handover time. Feedback remains the source of the agent rating. Feature #52's finance module remains the only source of commission, original-amount reversals and MTOGO-funded compensation, with original month and recorded time. Custom modules do not import each other; workflows read through the query layer and module links.
- Put the business rules in pure calculation functions used by both the provisional read and finalization, so that provisional and final figures can never disagree in method.
- Reuse the installed Framework facilities for models, decimal arithmetic, transactions, locking, workflows and scheduled jobs, following existing project patterns. The Restaurant-Delivery recipe has no bonus concept; no dependency upgrades are introduced.
- Add a shared Copenhagen time helper for month boundaries and wall-clock hours, stating Europe/Copenhagen in code as the coding standard requires.

### 2. Bonus points

- Base points are the exact VAT-exclusive purchased food value from #52's preserved basis: line totals including VAT divided once by 1.25. Never round points.
- Multiply by 1.25 when the recorded `picked_up_at` falls from 06:00 to before 09:00 or from 21:00 to before 06:00 in Copenhagen wall-clock time. Multiply by 1.10 when the delivery's agent rating is 4 or 5.
- Only a delivery whose outcome is `delivered` earns points, credited to its assigned agent, in the Copenhagen month of its handover time.
- A delivered Order fully refunded before finalization earns no points. This applies only once #49 and #52 introduce delivered-Order refunds, and the MVP proves it with calculation tests.

### 3. Funding and pool

- A month's funding balance is commission − reversals − MTOGO-funded compensation − the previous month's carried loss. A refund contributes only through its commission reversal; refund obligation amounts never enter funding.
- A positive balance gives a pool of 20% of it and carries nothing. A zero or negative balance gives no pool; a negative balance becomes the next month's carried loss.
- Each funding fact belongs to its original month unless that month was finalized before the fact was recorded; it then belongs to the earliest month not yet finalized. Service fees and Restaurant monthly balances are never read.
- Each award is pool × agent points ÷ all points, rounded down to DKK 0.01. The retained remainder is pool − total awarded. Store the month's DKK per point, the exact pool divided by all points, so per-delivery explanations never change.

### 4. Finalization

- A daily scheduled job runs a finalization workflow that takes the current time as input. It finalizes every month whose 8th at 00:00 Copenhagen time has passed, oldest first, starting from the first bonus month. The first bonus month is the earliest month containing a #52 finance fact; the carried loss before it is zero.
- Finalization runs under a lock per month and records a cut-off time when it starts. It includes exactly the finance facts and Feedback recorded before the cut-off and stores the actual finalization time.
- The month record is unique in the database. A repeated, concurrent or restarted run returns the existing result. Finalization stores, per month: status, cut-off, finalization time, funding inputs, carried loss in and out, balance, pool, DKK per point, total awarded, retained remainder and any #52 evidence warning. It stores one award row per agent with points, delivery count and award, including DKK 0.00 rows.
- Finalized records and award rows have no update or delete path. Any later correction follows ADR-0014 as a separate, linked record.
- The finalization slice is blocked by #219, so no agent rating can arrive after finalization.

### 5. Agent API and Bonus page

- An authenticated Delivery agent read under the partner namespace returns only the signed-in agent's figures, re-checking authorization on every request (ADR-0017). It returns the provisional current month and finalized months with per-delivery handover date, Order reference, food value, pickup time, multiplier flags, points and amount, plus the year's final total.
- Provisional figures are calculated when read from current facts, with the calculation time returned, and are never stored. The estimate uses the pool funded so far and all agents' points so far, but returns only the agent's own points, estimate and per-delivery amounts.
- Never return Customer details, star values, food or experience ratings, other agents' figures or funding inputs. Missing Feedback and a low rating both return "no rating multiplier".
- The partner page is phone-first, Danish and English through the shared text package, and linked from the delivery workspace and history. Provisional amounts carry "≈" and a provisional label; final amounts do not.

### 6. Operator API and Admin page

- An admin read returns months with status and the stored or provisional funding evidence, and per-agent detail for a selected month. It offers no write operation.
- The Admin page is English-only (ADR-0018) and shows no payout, payroll or profitability figures.

### 7. Feature flag and demonstration

- Add one backend flag, `agent_bonus`, environment key `MTOGO_FF_AGENT_BONUS`, default off, following the existing `feedback` flag. It returns 404 from both reads; the partner and Admin pages follow the backend. The finalization job runs regardless of the flag.
- A demonstration seed builds on #220's rated Orders and #52's finance facts. It covers two past months and the current month: early, late and normal pickups; 4–5 and lower agent ratings; missing Feedback; and one month whose compensation produces a carried loss. Its Customers, Restaurants and Orders follow #52's realism rules.

### 8. Dependencies

- Funding slices are blocked by #227 (commission) and #229 (compensation); Operator cancellation credits follow #233.
- Finalization is blocked by #219. The demonstration seed is blocked by #220.

## Testing Decisions

- Good tests check external behaviour: points, amounts, statuses and what each role can read. They do not check internal step order or query shapes. Every acceptance example on the discovery page is traced to at least one test.
- **Calculation unit specs** cover pickup windows at each boundary second and on both daylight-saving nights, exact points, both multipliers, funding balance, carried loss, the 20% pool, shares, rounding down, the remainder, DKK per point, zero funding and zero points. Prior art: the delivery arrival rules and unassigned-cancellation rules unit specs.
- **A bonus module integration spec** using the module test runner proves the storage guarantees: one month record, one award per agent per month, DKK 0.00 rows accepted, and no update or delete path for finalized rows. This is the first module integration spec in the repository, so keep it narrow.
- **Finalization workflow HTTP integration specs** run the workflow with an explicit current time, as the delivery attention spec does. They cover finalization from the 8th, nothing before it, catch-up oldest first, the cut-off, late facts moving to the next month not yet finalized, carried loss across months, repeated and concurrent runs, restart and the flag-off case.
- **HTTP read specs** cover the agent's own figures only, refusal for other agents and signed-out or revoked agents, the 404 when the flag is off, provisional versus final labels, per-delivery amounts, the year total, no hidden Feedback details and the operator's read-only evidence. Prior art: the Customer Feedback and operator refunds HTTP specs.
- Until #227 and #229 are delivered, tests create finance facts through the finance module's own recording API, never by faking its tables.
- Performance: measure the agent and Admin reads on the 100-Customer, 500-Order baseline under twenty simultaneous journeys, 95% within two seconds, and show one month's finalization completing in one job run. Report workload and timings.
- Manually check the partner page in Danish and English, narrow and wide widths, keyboard focus and long values, and the Admin page in English. Use the existing browser verification flow; add no Playwright specs. Money changes need a second reviewer.

## Out of Scope

- Salaries, payroll, wage deductions, bank transfers and actual payouts.
- Overall-profitability claims, since salaries and other operating costs are unspecified.
- Changing the 20% cap or the points rule; both would reopen ADR-0010.
- Operator actions to trigger, re-run, correct or edit a finalization.
- Delivered-Order refunds, goodwill payments and their journeys, which belong to #49 and #52.
- Food or experience ratings affecting awards, and zero ratings for missing Feedback.
- Showing star values or individual Feedback to agents, or other agents' figures.
- Monitoring alerts on missed finalization, which #54 may add later.
- New Playwright specs.

## Further Notes

The worked example on the discovery page puts a typical bonus at about DKK 1.50–2 per delivery, roughly DKK 150–200 for 100 deliveries a month, on top of salary. The team reviewed it and kept the 20% cap. The 200,000-Order dataset named in #224 is superseded by the 100-Customer, 500-Order baseline from discovery #223.

Keep Feature #53 open until its accepted business scope and all required work items are delivered. Ticket splitting is a separate `/to-tickets` invocation.
