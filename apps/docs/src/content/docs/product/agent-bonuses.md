---
title: Sustainable agent bonuses
description: Decisions from Feature 53 discovery 224.
---

Discovery [#224](https://github.com/DannyShayH/MTGO/issues/224) refines [Feature #53](https://github.com/DannyShayH/MTGO/issues/53). The team accepted Q1–Q29 on 24 November 2026. This page records discovery rather than a specification or implemented capability. The team invokes `/to-spec` and `/to-tickets` separately.

Earlier decisions stand. [ADR-0010](/MTGO/architecture/decisions/0010-commission-funded-bonuses-and-separate-feedback-ratings/) defines the 20% cap, the multipliers, finalization on the 8th and the retained remainder. Its 24 November 2026 revision records how this discovery reads "after refunds", the month of late facts and the finalization cut-off. Q27 explicitly kept the 20% cap after the team reviewed the worked example below.

## Refined user stories

- As a Delivery agent, I want to see each Order I delivered this month with its points, the multipliers that did or did not apply and an approximate amount, plus a provisional total for the month, so I understand what I am earning so far.
- As a Delivery agent, I want to see each finalized month's award and my total of final awards this year, clearly separated from provisional figures, so I know what has been decided.
- As an MTOGO operator, I want to inspect each month's funding evidence, Bonus pool, per-agent awards, retained remainder, carried loss and finalization status, so I can confirm bonuses never exceed the agreed budget.

A Delivery agent is an MTOGO employee. The Bonus award is a performance top-up on the agent's salary, which is outside the system. It is not pay per delivery.

## Agreed decisions

### Bonus points

| Question                             | Decision                                                                                                                                                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1: Pickup hours                     | The recorded actual pickup (`picked_up_at`) in Copenhagen wall-clock time decides the 1.25 multiplier: 06:00:00 to before 09:00:00 and 21:00:00 to before 06:00:00. Readiness and acceptance never count. On daylight-saving nights only local wall time matters; the affected hours lie in the late window. |
| Q2: Point precision                  | Points are exact: value × 1.25 and/or 1.10, never rounded. Display uses two decimals; shares use the exact sums. Only money is rounded.                                                                                                                                                                      |
| Q7: Delivered net Order value        | Base points are the exact VAT-exclusive purchased food value (line totals including VAT divided once by 1.25), the same basis as commission. Checkout has no discounts, delivery charge or tips; any future one needs its own decision.                                                                      |
| Q8: Earning outcome, agent and month | Only a delivery ending `delivered` earns points, credited to its `assigned_agent_id`. Cancelled and failed deliveries earn nothing, also after pickup. The delivery's month is the Copenhagen calendar month of its recorded handover time.                                                                  |
| Q4: Agent rating                     | Finalization uses the agent ratings recorded before its cut-off, whether or not the feedback flag was on (#209 Q13). A 4 or 5 multiplies by 1.10; other ratings and missing Feedback keep the baseline.                                                                                                      |
| Q23: Ended access                    | An agent whose access ends keeps the points and award earned. They cannot see the page once signed out; operators still can.                                                                                                                                                                                 |

### Bonus pool funding

| Question             | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q9: Funding source   | Read funding only from Feature #52's finance journal: commission earned, original-amount commission reversals and MTOGO-funded food compensation. Never recalculate it from Orders or food-credit records, so no obligation or compensation is deducted twice. Service fees and Restaurant monthly balances never count.                                                                                                                                                                                       |
| Q10: After refunds   | A refund reduces funding only by the commission reversal it causes, never by the refunded amount, which is the Customer's own payment. MTOGO's loss is already counted as food compensation. Refund money never counts as funding in any status, so approved refunds cannot fund bonuses while the provider refund is pending. In the MVP only cancelled Orders are refunded and they earned no commission; a full refund of a delivered Order before finalization removes its points once such refunds exist. |
| Q11: Month of a fact | Each fact belongs to its original month from #52: the handover month for commission, the cancellation month for compensation (the claim deadline for a timeout). If that month is already finalized when the fact is recorded, it belongs to the next month not yet finalized. Statement closure never decides bonus months.                                                                                                                                                                                   |
| Q12: Carried loss    | Funding balance = commission − reversals − compensation + previous carried loss. A negative balance gives no pool and carries forward as a Carried loss. A positive balance gives a pool of 20% and carries nothing; unused budget stays with MTOGO. Finalization stores the carried amount with its inputs. It is never deducted from an agent.                                                                                                                                                               |
| Q27: Cap             | Keep the 20% cap from ADR-0010 after reviewing the worked example. A higher cap would reopen ADR-0010.                                                                                                                                                                                                                                                                                                                                                                                                         |

### Shares and finalization

| Question                        | Decision                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q3: Remainder                   | Each award is the pool × the agent's points ÷ all points, rounded down to DKK 0.01. The rounding remainder stays with MTOGO and never enters a later pool.                                                                                                                                                                                                                                                             |
| Q24: Zero awards                | An agent whose share rounds to DKK 0.00 still gets a stored row with points and a DKK 0.00 award; the amount joins the remainder.                                                                                                                                                                                                                                                                                      |
| Q5: Scheduled finalization      | A daily scheduled job finalizes each month from 00:00 Copenhagen time on the 8th of the following month. A missed day is caught up on the next run, with the actual time recorded. One record per month, enforced by the database; repeated or concurrent runs return the same result. Operators cannot trigger, re-run or change it. Finalized awards never change; any correction follows ADR-0014 as a later entry. |
| Q16: Missing #52 evidence       | Finalize on schedule with the facts recorded by the cut-off, and show any #52 evidence warning for that month. Facts recorded later belong to the next month not yet finalized (Q11).                                                                                                                                                                                                                                  |
| Q17: Cut-off                    | Finalization records a cut-off time when it starts, under a lock for that month. It includes exactly the journal facts and Feedback recorded before the cut-off.                                                                                                                                                                                                                                                       |
| Q18: First month and catch-up   | The first bonus month is the earliest month containing a #52 journal fact; earlier months are never finalized and the carried loss starts at zero. The job finalizes every month whose 8th has passed, oldest first, because each carried loss depends on the month before.                                                                                                                                            |
| Q25: Feedback window dependency | The finalization slice is blocked by #219, which closes Feedback 168 hours after handover. A delivery at 23:59 on the last day closes its window at 23:59 on the 7th, before finalization. The provisional page does not depend on #219.                                                                                                                                                                               |

### Agent and operator journeys

| Question                  | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q13: Agent Bonus page     | A phone-first page in the partner app (ADR-0017), linked from the delivery workspace and history, in Danish and English. Each delivered Order shows handover date, Order reference, food value excluding VAT, points and the reason each multiplier applied or not, such as "Picked up 22:14 – late hours ×1.25" or "No rating bonus". Never Customer details, star values, food or experience ratings, or whether Feedback is missing or low. |
| Q14: Provisional estimate | The current month's estimate is the pool funded so far × the agent's points ÷ all points so far, rounded down, labelled provisional until finalization on the 8th. Agents never see other agents' points or awards, or the funding inputs. With no positive funding so far, the page says "No bonus pool so far this month".                                                                                                                   |
| Q6: Provisional freshness | Provisional figures are calculated when read from current facts, with the calculation time shown, and are not stored. Only finalization stores anything. A stored snapshot is added only if the Q21 performance evidence requires it.                                                                                                                                                                                                          |
| Q28: Year total           | The page header shows "This month so far (provisional)" and "Final awards this year", the sum of finalized awards for the Copenhagen calendar year. Provisional amounts never enter the year total.                                                                                                                                                                                                                                            |
| Q29: DKK per delivery     | Each delivery shows its approximate amount: points × the month's DKK per point. Provisional amounts are marked "≈". Finalization stores the month's DKK per point so final explanations never change. The award is the authoritative amount; a footnote explains that it is rounded down to DKK 0.01, so per-delivery amounts may add up to a few øre more.                                                                                    |
| Q15: Operator Admin page  | A read-only, English-only Admin page, "Agent bonuses" (ADR-0018). One row per month shows status and finalization time; commission, reversals, compensation, carried loss in, balance, pool, total awarded, remainder retained and carried loss out; and per-agent deliveries, points and award. No actions, payouts, payroll or profitability figures.                                                                                        |
| Q19: Feature flag         | One backend flag, `agent_bonus`, default off (ADR-0022), hides the partner page, its API and the Admin page, like `feedback`. The finalization job and stored awards run whether or not the flag is on, because flags gate behaviour, never facts or time rules.                                                                                                                                                                               |

### Demonstration and evidence

| Question                       | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q20: Smallest journey and seed | Seed two past months and the current month, building on #220's 500 rated Orders with #52 journal facts: early, late and normal pickups, 4–5 and lower agent ratings, missing Feedback, and one month whose MTOGO-funded compensation produces a carried loss. The operator sees a month with no pool and a carried loss, then the next month finalized with awards and a retained remainder; a seeded agent sees that award explained per delivery next to the current provisional month. |
| Q21: Performance               | Use the 100-Customer, 500-Order baseline from discovery #223 Q19, which supersedes the 200,000-Order dataset named in #224. Measure the agent Bonus page and the Admin page under twenty simultaneous journeys, 95% within two seconds, and show one month's finalization completing in a single job run. Report workload and timings.                                                                                                                                                    |
| Q22: Records                   | This page, the ADR-0010 revision, the glossary terms (Bonus pool, Carried loss, Bonus points, Bonus award) and a summary on #53.                                                                                                                                                                                                                                                                                                                                                          |
| Q26: Boundaries                | See [Boundaries](#boundaries-with-other-features).                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Acceptance examples

| Example                                                                                          | Expected result                                                                   |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| DKK 250 including VAT, picked up at 22:00, agent rating 5                                        | Value excluding VAT 200; 200 × 1.25 × 1.10 = 275 points.                          |
| DKK 50.31 including VAT, picked up at 12:00, no Feedback                                         | 40.248 points, unrounded.                                                         |
| Pickup at 05:59:59, 06:00:00, 08:59:59, 09:00:00, 20:59:59 and 21:00:00 Copenhagen time          | ×1.25, ×1.25, ×1.25, ×1.0, ×1.0 and ×1.25.                                        |
| Agent rating 3, or no Feedback                                                                   | No rating multiplier; the page shows "No rating bonus" in both cases.             |
| Handed over 31 January 23:30, rated 4 on 3 February                                              | Belongs to January and earns ×1.10 when January is finalized on 8 February.       |
| A delivery cancelled after pickup                                                                | No points.                                                                        |
| DKK 1,000 commission and DKK 300 MTOGO-funded compensation, no carried loss                      | Balance 700; pool at most DKK 140.                                                |
| A cancelled DKK 250 Order with DKK 120 MTOGO-funded compensation and a pending refund obligation | Funding falls by 120, not 370. The pending refund never counts as funding.        |
| January: 100 commission, 300 compensation. February: 1,000 commission, 300 compensation          | January: no pool, carried loss 200. February: 1,000 − 300 − 200 = 500, pool 100.  |
| A January timeout compensation processed 5 February, or 9 February after January was finalized   | Reduces January's funding, or February's.                                         |
| Pool DKK 100.00, three agents with equal points                                                  | Three awards of DKK 33.33; MTOGO retains DKK 0.01.                                |
| Zero or negative balance, or positive funding but no eligible points                             | No awards.                                                                        |
| The job did not run on the 8th                                                                   | The next run finalizes the month with the same rules and records the actual time. |
| Two finalization runs at once, or a run after restart                                            | One month record and one set of awards.                                           |
| An agent opens another agent's figures, or a signed-out agent opens the page                     | Refused; agents see only their own figures.                                       |

## Worked example: is it fair and not too much?

The team reviewed this example before keeping the 20% cap (Q27). Every Order is DKK 250 including VAT, so DKK 200 excluding VAT and DKK 11.00 commission. The month has 750 deliveries and ten unassigned timeouts that MTOGO compensates at DKK 200 each.

| Funding                        | DKK          |
| ------------------------------ | ------------ |
| Commission (750 × 11.00)       | 8,250.00     |
| MTOGO-funded food compensation | −2,000.00    |
| Carried loss in                | 0.00         |
| Balance                        | 6,250.00     |
| **Bonus pool (20%)**           | **1,250.00** |

| Agent                         | Deliveries | Early/late pickup | Rated 4–5 | Points  | Award        | Per delivery | Per hour (~2.5 deliveries/hour) |
| ----------------------------- | ---------- | ----------------- | --------- | ------- | ------------ | ------------ | ------------------------------- |
| Anna (full-time, mixed hours) | 300        | 20%               | 70%       | 67,410  | 497.31       | 1.66         | 4.14                            |
| Bo (evenings)                 | 220        | 60%               | 60%       | 53,635  | 395.69       | 1.80         | 4.40                            |
| Dan (daytime)                 | 150        | 0%                | 50%       | 31,500  | 232.39       | 1.55         | 3.87                            |
| Carla (part-time)             | 80         | 10%               | 30%       | 16,890  | 124.60       | 1.56         | 3.56                            |
| **Total**                     | 750        |                   |           | 169,435 | **1,249.99** |              |                                 |

MTOGO retains the DKK 0.01 remainder. The month pays about DKK 0.0074 per point.

A loss month with 45 timeouts has DKK 9,000 compensation against DKK 8,250 commission: no pool and a DKK 750 carried loss. The following month like the one above then has a pool of DKK 1,100, and the awards become 437.63, 348.20, 204.50 and 109.65; MTOGO retains DKK 0.02.

For a DKK 400 Order including VAT, the Customer pays 400, VAT is 80, the food value excluding VAT is 320 and MTOGO's commission is DKK 17.00. At the example month's rate the delivering agent's bonus is about DKK 2.36 at normal hours without a 4–5 rating, DKK 2.95 for a late pickup and DKK 3.25 for a late pickup rated 4–5. Over 100 deliveries an agent earns roughly DKK 150–200 a month.

Conclusions the team accepted:

- The bonus is about 0.8% of delivered food value, roughly DKK 1.50–2 per delivery. It is a top-up on salary, so the page must not suggest pay per delivery. Even a 100% cap would pay less than the DKK 17 commission on a DKK 400 Order.
- The multipliers have a modest effect: Bo, mostly evenings and well rated, earns about 16% more per delivery than Dan in daytime.
- Points follow Order value, not effort: a DKK 800 late Order earns 1,000 points and a DKK 80 Order 80. That is ADR-0010's rule and was not reopened.
- Awards are relative: they depend on other agents' points and the month's food losses, which is why provisional amounts carry "≈" and a provisional label.

## Boundaries with other Features

- **#48 delivery** provides `assigned_agent_id`, `picked_up_at` and the handover time and outcome. Reassignment is outside the MVP, so the assigned agent is the delivering agent. #53 changes nothing in delivery.
- **#49 refunds** provides refund obligations. Delivered-Order refunds and goodwill stay deferred. When they exist they must produce a #52 commission reversal, and #53 removes the Order's points if it comes before finalization.
- **#51 Feedback** provides the agent rating with `agent_id` and `delivered_at`. #53 owns what agents see about their ratings. #219 must enforce the 168-hour window before finalization ships.
- **#52 statements** provides journal facts for commission, reversals and MTOGO compensation with original month and recorded time (ADR-0023). #227 (commission), #229 (compensation) and later #233 (Operator cancellation credits) block the funding slices. Statement closure never decides bonus months.
- **#54 monitoring** may later read finalization status, for example to alert on a missed finalization. Nothing is built for it now.

## Source evidence

- Recipe and installed APIs: the Restaurant-Delivery recipe has no bonus concept. A custom bonus module, a scheduled job (`export const config = { name, schedule }` running a workflow), locking through `Modules.LOCKING` and read-only links to delivery and Feedback facts follow existing project patterns. No existing job is calendar-based or uses a time zone, and the backend has no Copenhagen time helper yet.
- `IntendedDelivery` records `assigned_agent_id` (never changed once set), `picked_up_at` and `terminal_outcome` with `terminal_at`, the handover time for `delivered`. An index covers `(assigned_agent_id, terminal_at)`.
- Feedback stores `agent_id`, `delivered_at` and `agent_rating` 1–5, indexed by `(agent_id, delivered_at)`. The 168-hour window is not yet enforced.
- Refund obligations have no separate approval status: they are created with the cancellation as `pending`, then become `failed` or `succeeded`. Only cancelled Orders have them; a delivered Order is never cancelled or refunded.
- Food-credit records cover MTOGO-funded unassigned-timeout compensation only. #52's finance journal, which #53 reads, is specified but not built.
- The partner app has agent workspace and history pages, scoped to the signed-in agent on every request, and no earnings or bonus page.

## Verification handoff

Trace calculation tests for points, multipliers, funding, carried loss, shares and rounding to the acceptance examples, including Copenhagen boundaries on both daylight-saving nights. Use controlled-clock HTTP tests for finalization, catch-up, the cut-off, repeated and concurrent runs and restart. Check that agents see only their own figures, that the flag hides the pages and API, and that operators cannot change anything. Measure performance per Q21. Manually check both partner languages, narrow and wide widths, keyboard access and long values. Add no Playwright specs for discovery.

Money changes need a second reviewer under the [way of working](/MTGO/way-of-working/how-we-work/).

## Shared-understanding handoff

All twenty-nine questions have answers and no disagreements are parked. Publishing a specification and creating implementation work items remain separate team invocations. Keep Feature #53 open until its accepted business scope and all required work items are delivered.

The team subsequently invoked `/to-spec`. The [sustainable agent bonuses specification](/MTGO/product/agent-bonuses-spec/) synthesizes the agreed decisions and testing seams for Feature #53. Ticket splitting remains a separate invocation.
