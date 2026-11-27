---
title: Statement verification population
description: The reproducible 100-Customer, 500-Order population that reconciles Restaurant statements against independently expected totals and times their reads under twenty simultaneous journeys.
---

Issue #235 verifies Restaurant statements on the agreed school-project
population: **100 synthetic Customers and 500 Orders** (ADR-0014, spec
[Restaurant fees and statements](/MTGO/product/restaurant-statements-spec/)
decision 13 and testing decision 9). It reconciles every statement against
totals computed independently of the finance module, through both read
surfaces, and measures the reads under twenty simultaneous journeys. The
population demonstrates the exercise dataset only. It does not demonstrate the
growth capacity the assignment describes.

It is not the Feedback fixture. `seed-demo-feedback.ts` (#220) seeds 500
delivered, rated Orders for one Customer. This population has mixed outcomes,
100 different Customers and its own four Restaurants.

## Running it

From `apps/backend`, against a local, disposable (`medusa_ci_*`) or staging
database. Stop the backend first, so its recovery job cannot close a month
while the seed is still moving it:

```bash
npx medusa exec ./src/scripts/seed-statement-population.ts
```

Then start the backend with `MTOGO_FF_RESTAURANT_STATEMENTS=true` and run:

```bash
npx medusa exec ./src/scripts/check-statement-population.ts
```

The check prints one JSON report. It contains the population summary, the
expected statements, the reconciliation result and the timings. It fails when
a statement differs from the manifest. `MEDUSA_BACKEND_URL` names another
backend (default `http://localhost:9000`). `DEMO_STATEMENT_POPULATION_ROUNDS`
sets the number of timing rounds (default 3).
`DEMO_STATEMENT_POPULATION_STAFF_PASSWORD` gives the four staff logins
(`<restaurant-slug>-staff@example.test`) a password, so you can open the
partner app's Statements as them.

The seed takes 10–40 minutes, because every Order goes through the real
workflows. A rerun is safe. Each Order carries `<anchor date>:<slot>` in
its metadata. An Order whose finance receipt already records its planned
moment is kept, so a rerun creates only the missing Orders. If an
interrupted run left an Order unfinished, the rerun discards that Order and
its records first. The plan is fixed by the anchor date, the Copenhagen date
of the first run, and does not depend on when a later run happens. So later
runs keep the same population. A first run on a month's first day is refused,
because no date in that month has ended yet. The seed changes no data outside
the population. Its timeout steps run the recovery sweep's own expiry for the
one seeded Order only, so other Orders already past their deadline are left
for the backend's recovery job.

## What the population contains

`planStatementPopulation` (`apps/backend/src/lib/statement-population-plan.ts`)
is pure and deterministic for its anchor date. Its unit tests check the
counts, the outcome mix, the milestone order, the active dates and the
Customer details.

| Part        | Content                                                                                                                                                                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Restaurants | Trattoria Sankt Hans (Nørrebro), Phở & Bánh Mì Vesterbro, Smørrebrød ved Søerne (Østerbro) and Frederiksberg Curry House. Each has a Danish and English menu of eight or nine dishes at DKK 30–149, common MVP terms and six Copenhagen delivery postal codes.                                                                             |
| Months      | The two months before the anchor month are closed. The anchor month is provisional, with Orders only on dates before the anchor date.                                                                                                                                                                                                      |
| Activity    | Smørrebrød ved Søerne joins on the tenth of the first month, so its fee is prorated. Frederiksberg Curry House is deactivated from the 12th to the 17th of the second month. Orders fall only on dates when the Restaurant was active all day.                                                                                             |
| Customers   | Varied Danish and international names, `example.test` email addresses in several formats, distinct Danish mobile numbers and street addresses in the delivery postal codes. Every Customer has at least one Order, and 25 regulars order more often.                                                                                       |
| Orders      | 205, 235 and 60 per month. Baskets range from one dish to office orders of more than ten items, which reach the higher commission bands. Lunch and dinner times. Each Order's milestones follow in a realistic order and spacing.                                                                                                          |
| Outcomes    | 430 delivered, 6 delivered in the second month but recognized in the anchor month (linked late adjustments), 18 Customer cancellations, 16 staff rejections with a note, 10 acceptance timeouts, 8 unassigned timeouts and 12 Operator cancellations after preparation started. The last two earn MTOGO-funded prepared-food compensation. |

Each Order is placed through the real cart, mock payment and completion
workflows and ends through the real workflow for its outcome. For the two
timeouts, the seed moves that one Order's deadline to now and runs the
recovery sweep's expiry and settlement (`expireDueOrder`,
`expireUnassignedDelivery`) for that Order alone. Each Order's recorded times are then mapped onto its planned
history (`retimerAlong`), and finance recognizes the Order again from that
history. When all 500 Orders exist, the seed moves each Restaurant's creation,
agreement and participation history to the plan. It records each ended
month's fee as accrued at the month's end from that history, closes the ended
months and accrues the current fee. Application code never rewrites recorded
times or deletes financial entries. This synthetic seed does, but only for
its own records and only on databases `syntheticSeedAllowed` accepts.

No delivered-Order refund, goodwill, correction, responsibility outcome,
transfer, invoice, payroll, export or bonus is seeded. The spec does not
support those journeys.

## Expected results

`expectedStatementManifest`
(`apps/backend/src/lib/statement-population-manifest.ts`) computes each
Restaurant's and month's expected statement from the plan's baskets, menu
prices and participation history. It uses ADR-0006's terms (25% VAT,
marginal bands of 6/5/4/3%, DKK 100 a month, prorated by active dates) in
whole hundredths of an øre. It never calls the finance module's calculation
or reads a statement, so a reconciliation can disagree with the finance
module. Its unit tests check worked examples. One is DKK 95 incl. VAT: food
credit 76.00 and commission 4.56. Another is DKK 1 500 incl. VAT: commission
52.00 across all four bands. The others cover compensation, a late adjustment
of +59.41 in the next month, and fees of 70.00 (21 of 30 days) and 87.10
(27 of 31 days).

The check reads every population Restaurant and month as its staff member
and as an operator, page by page, and requires:

- each total to equal the manifest: food credits, the MTOGO-funded part,
  commission, service fee, adjustments and balance;
- the expected lifecycle and completeness, active dates, day count and
  outcomes without entitlement. A closed month that a late delivery left
  `processing_pending` must withhold its delivered totals and balance;
- the entry count and the delivered, compensation and late-adjustment
  entries to match;
- the same whole-month totals on every page;
- the same statement and entries on the partner and Admin surfaces.

## Recorded results

Run on 27 November 2026 (anchor date 2026-11-27, measured at
2026-11-27T02:08:41.799Z). The seed took about 40 minutes for 500 Orders. A
second run kept all 500 and created none. A first run on a fresh database
with the final seed took 10.4 minutes. It produced the same 12 statements
below, including all 18 timeout cancellations settled with their refunds, and
reconciled with 0 differences (timing: 98.4% of 800 reads within two seconds,
measured at 2026-11-27T03:06:22.637Z).

### Reconciliation

All 12 statements reconcile on both surfaces: **0 differences** from the
manifest. Amounts are DKK excluding VAT; "—" is a total the statement
withholds.

| Restaurant                | Month   | State                      | Entries | Food credits | Commission | Service fee | Adjustments |  Balance |
| ------------------------- | ------- | -------------------------- | ------: | -----------: | ---------: | ----------: | ----------: | -------: |
| Trattoria Sankt Hans      | 2026-09 | closed                     |      40 |     13816.00 |     679.44 |      100.00 |        0.00 | 13036.56 |
| Trattoria Sankt Hans      | 2026-10 | closed, processing pending |      68 |            — |          — |      100.00 |        0.00 |        — |
| Trattoria Sankt Hans      | 2026-11 | provisional                |      11 |      1934.40 |     106.72 |       90.00 |       97.80 |  1835.48 |
| Phở & Bánh Mì Vesterbro   | 2026-09 | closed                     |      60 |     14142.40 |     719.10 |      100.00 |        0.00 | 13323.30 |
| Phở & Bánh Mì Vesterbro   | 2026-10 | closed, processing pending |      51 |            — |          — |      100.00 |        0.00 |        — |
| Phở & Bánh Mì Vesterbro   | 2026-11 | provisional                |      17 |      2260.00 |     117.62 |       90.00 |      318.10 |  2370.48 |
| Smørrebrød ved Søerne     | 2026-09 | closed                     |      37 |      9499.20 |     488.47 |       70.00 |        0.00 |  8940.73 |
| Smørrebrød ved Søerne     | 2026-10 | closed                     |      40 |      9636.80 |     515.48 |      100.00 |        0.00 |  9021.32 |
| Smørrebrød ved Søerne     | 2026-11 | provisional                |      13 |      3431.20 |     177.10 |       90.00 |        0.00 |  3164.10 |
| Frederiksberg Curry House | 2026-09 | closed                     |      47 |     15485.60 |     755.49 |      100.00 |        0.00 | 14630.11 |
| Frederiksberg Curry House | 2026-10 | closed, processing pending |      53 |            — |          — |       87.10 |        0.00 |        — |
| Frederiksberg Curry House | 2026-11 | provisional                |      19 |      6059.20 |     292.42 |       90.00 |      268.56 |  5945.34 |

The three October statements with late deliveries are closed as **processing
pending**. Those handovers had not been recognized when October closed, so the
closed statement withholds its delivered totals and balance, and keeps that
warning (ADR-0023). November then shows them once as linked adjustments. This
is the agreed incomplete state, not an error. The other closed months are
complete. Smørrebrød ved Søerne's first month shows its prorated fee (70.00),
and Frederiksberg Curry House's paused October shows 87.10.

### Timing

Workload: 20 simultaneous journeys x 5 rounds, 8 reads each (staff and
operator: month list, 2026-09 entries 1-20 and 21-40, 2026-11 entries 1-20),
after one unmeasured warm-up journey. September is the timed closed month
because it is closed and complete for every Restaurant, so its reads return
real whole-month totals rather than withheld ones. Target: 95% within 2000 ms.
Environment: the backend in `medusa develop` mode (`DISABLE_MEDUSA_ADMIN=true`)
on a disposable loopback PostgreSQL database with Redis locking, Node v24.22.3,
Linux 6.18.58.1-microsoft-standard-WSL2, 4 x AMD Ryzen 5 5600H with Radeon
Graphics, 8 GB. A second development backend and the editor ran on the same
machine. Measured at 2026-11-27T02:44:46.686Z.

| Read                                 | Requests | Within 2 s | p50 ms | p95 ms | Max ms |
| ------------------------------------ | -------: | ---------: | -----: | -----: | -----: |
| partner: month list                  |      100 |     100.0% |    563 |   1074 |   1508 |
| partner: closed month, entries 1-20  |      100 |     100.0% |    202 |    366 |    377 |
| partner: closed month, entries 21-40 |      100 |     100.0% |    198 |    236 |    266 |
| partner: current month, entries 1-20 |      100 |      98.0% |    572 |   1164 |   2541 |
| admin: month list                    |      100 |      99.0% |    603 |   1467 |   2114 |
| admin: closed month, entries 1-20    |      100 |     100.0% |    145 |    208 |    234 |
| admin: closed month, entries 21-40   |      100 |     100.0% |    167 |    259 |    472 |
| admin: current month, entries 1-20   |      100 |     100.0% |    594 |   1198 |   1661 |
| **All reads**                        |      800 |      99.6% |    363 |   1124 |   2541 |

**The target is met: 99.6% of reads completed within two seconds**, with no
failed read. A three-round run a minute earlier gave 99.8% of 480.

Two bounded read changes got there, without changing money or access rules:

1. A closed statement never changes (ADR-0023), so `readStatement` serves it
   from its closure without waiting for the Restaurant's finance guard.
2. The current month is still read under the guard, which keeps its header and
   entries consistent with concurrent posting (spec §9). The guard is needed
   against posting, not against other reads, so readers of the same
   Restaurant, month and page that are all still waiting for the guard now
   share one guarded read. That read starts after every one of them asked, as
   each own read would have. Each caller is authorized first and gets its own
   copy. An HTTP test holds the guard, sends several waiting reads on both
   surfaces and checks that each gets the same current statement as a read
   made afterwards.

Before these changes, in the same environment, only 82.9% of reads completed
within two seconds and 2 failed with `409` after waiting ten seconds for the
guard. With only the first change, 88.5% did (month list 50%, current month
77%). The numbers come from development mode on a shared 4-core machine. They
do not establish production capacity or the assignment's future growth
target.

### Browser check

Checked on 27 November 2026 against this population, headless Chromium,
signed in as Frederiksberg Curry House staff in the partner app (Danish and
English) and as an operator in Medusa Admin, at 375 px and 1280 px:

- **States:** the provisional month with late adjustments, the October month
  closed as processing pending (food credit, commission and balance shown as
  unavailable with "Still processing", fee 87.10), the complete September
  month on entry pages 1 and 3, and a month before the Restaurant existed
  ("Unavailable"). In Admin, a held read shows "Loading statement…" and a
  failed read shows "Could not load the statement. This does not mean the
  month is empty", with the month picker still usable.
- **Long, large and negative values:** a 72-character Restaurant name, totals
  of 123,456,789.99, adjustments of −4,567.89 and a balance of
  −98,765,432.10, injected into the November read (in Admin through the
  browser, in the partner app through a local rewriting proxy, because its
  pages read on the server). Every value wrapped inside its card.
- **Layout:** no page scrolled horizontally at either width.
- **Keyboard:** every Tab stop showed a visible focus indicator, in reading
  order: navigation, language, sign out, month picker, help, day table
  toggle, then the entry links (partner); Admin's sidebar, month picker, day
  table and entry links.

Not covered by this population: a month with no activity at all. The existing
Statements demo (`seed-demo-statements.ts`) and the HTTP tests cover it.
One small inconsistency predates #235: the partner app writes a negative
total with a hyphen (`-DKK 4,567.89`, `-4.567,89 kr.`), Admin with a minus
sign (`−DKK 4,567.89`).
