# Restaurant Finance module

Registered as `restaurantFinance` (Feature #52, spec
[Restaurant fees and statements](/MTGO/product/restaurant-statements-spec/)).
Owns what MTOGO recognizes financially for a Restaurant, separate from
Medusa's Customer payments and refunds and from the operational prepared-food
obligation in the Order Operations module. Issue #227 adds the first part:
delivered food credit and commission, and their evidence problems. Issue #228
adds the monthly service-fee obligation from active Copenhagen dates.

Issue #229 recognizes existing prepared-food credits and records
cancellations that owe no entitlement. Issue #230 fixes closed statements
and recovers late amounts as linked current-month adjustments. Issue #233
recognizes each Operator cancellation (#199) through the same boundary, dated
and explained by the operator's recorded action. Issue #231 reconciles
legacy handovers without a preserved basis from verifiable facts only and
names the purchase or terms evidence that is missing
([Incomplete statement history](/MTGO/product/restaurant-statement-history/)).

## Data model

| Model                 | Owns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FinanceReceipt`      | One recognition per source: `source_kind` (`order_delivered`, `prepared_food_credit`, `order_cancelled` or `service_fee_difference`) and `source_id` (unique together: the Order, or the existing food credit), `restaurant_id`, `order_id`, `outcome` (`delivered` or the cancellation category), `occurred_at` and `original_month` (the qualifying moment and its Copenhagen month), `posted_at` and `posting_month`, `terms_version`, `currency_code`, `evidence` (JSON: exact calculation inputs) and `payload_digest` |
| `FinanceJournalEntry` | The booked effect of one receipt (`receipt_id` unique): `kind` (`delivered_order`, `prepared_food_compensation` or `service_fee_difference`), Restaurant, Order, original and posting dates and months, `currency_code`, `food_credit` and `commission` and `service_fee` (exact decimals, statement direction: credit owed, commission and fee charged) and `funded_by` (`customer` or `mtogo`)                                                                                                                            |
| `FinanceServiceFee`   | The one service-fee obligation per `restaurant_id` and `month` (unique together): `terms_version`, `currency_code`, `policy_amount`, `month_day_count`, `active_dates` (JSON list of `YYYY-MM-DD`), `active_date_count`, `amount` (exact, rounded once for the month) and `accrued_at`                                                                                                                                                                                                                                      |
| `FinanceClosure`      | One unique `restaurant_id`/`month` closure with exclusive Copenhagen `starts_at`/`ends_at` and an immutable JSON snapshot: full journal membership, whole-month totals or unavailability, fee evidence, problems, days, zero outcomes and boundary verification time.                                                                                                                                                                                                                                                       |
| `FinanceProblem`      | A visible evidence problem, once per source and `code`: `missing_purchase_evidence` or `missing_terms_evidence` (#231), `missing_financial_basis` (recorded before #231), `conflicting_recognition` or `missing_outcome_evidence`, with Restaurant, Order, `original_month` and `detected_at`                                                                                                                                                                                                                               |

- **One fee obligation per month.** `accrueServiceFee` creates the month's
  obligation or replaces its dates and amount while the month is current; the
  same dates again change nothing. It is never a sum of rounded daily fees,
  and nothing accrues a month after it ended. A later verified monthly target
  produces only the difference from the frozen accrual and prior differences.
- **Created only.** Nothing updates or deletes a receipt, entry or problem.
  `recognizeSource` creates a receipt and its entry in one transaction; the
  unique source identity in storage backs the workflow's guard. An
  `order_cancelled` receipt has no entry: it records that a cancellation was
  processed with no entitlement, so recovery can tell an accounted-for zero
  from work never assessed, without a fake monetary entry.
- **Compensation is referenced, not created.** A `prepared_food_credit`
  receipt's source is the Order Operations module's existing food credit, and
  its entry books that credit's full value excluding VAT, `funded_by: mtogo`,
  with zero commission. Finance creates no second credit or transfer.
- **A replay returns the original.** The same source with the same
  `payload_digest` returns `already_recognized`; another payload records a
  `conflicting_recognition` problem, keeps the booked amounts and books
  nothing new.
- **Components stay separate.** Food credit, commission and their funding
  stay individually identifiable for the later bonus Feature (#53); a later
  reversal is a negative commission of exactly the original amount.
- **No cascades.** The read-only `order.finance_receipt` link
  (`src/links/order-restaurant-finance.ts`) has no link table, so removing
  operational or menu data never deletes financial history.

## Workflows

`src/workflows/restaurant-finance/`:

- `calculation.ts`: the pure rules: VAT removal, marginal commission, one
  rounding per booked amount with ties away from zero, exact reversal of a
  booked commission and Copenhagen months.
- `recognition.ts`: `recognizeDeliveredOrder` runs right after the handover
  commits (`confirmHandoverWorkflow`), outside every Order guard, under the
  Restaurant's finance guard (`locks.ts`). The handover time in the delivery
  record dates it, never the kitchen or native synchronization. The posting
  month is chosen by the server clock inside the guarded local transaction,
  after receipt lookup. An older handover is recognized once in the current
  month as an adjustment, with its real handover date and original-month link.
- `reconciliation.ts` (#234): `recoverRestaurantFinanceWorkflow` is the one
  finance reconciliation. Each invocation closes ended months, then recognizes
  owed handovers, re-examines legacy problems, accounts for cancellations and
  accrues current-month fees, each with its own bounded batch (`batch`, 50 by
  default) read from durable records only. One failing part never skips the
  others; the first failure is rethrown afterwards. Its result reports
  `backlog` when a part filled its batch. The once-per-minute job
  `recover-restaurant-finance` calls it through `drainRestaurantFinance`, up to
  ten fresh invocations per tick while a backlog remains; its first tick after
  a restart is the startup reconciliation. It runs whatever the
  `restaurant_statements` flag says. See
  [Recovering interrupted statement processing](/MTGO/product/restaurant-statement-recovery/).
- `legacy-basis.ts` and `legacy-sources.ts` (#231): a handover whose Order
  has no preserved basis is reconstructed only from the native Order's
  original version (its lines, exact VAT-inclusive prices and quantities;
  Medusa's later fulfillment versions do not change them, while an applied
  edit, claim or exchange makes it unverifiable) and the one
  agreement recorded no later than placement and not removed before it, of a
  known terms version. The placement time is the placement record's or, for
  an older record, the native Order's creation. The receipt's evidence carries
  `reconstruction`. Only a missing basis is reconstructed; a stored but
  unreadable one is `missing_purchase_evidence`. Whatever cannot be verified is recorded as
  `missing_purchase_evidence` or `missing_terms_evidence`; today's menu and
  agreement are never used. `reconcileLegacyBasisProblems`, run by the
  recovery job with its own batch, re-examines each older
  `missing_financial_basis` once: it is recognized (as a linked adjustment
  when its month closed) or gets its specific code. Statement reads stop
  withholding for a problem whose source was recognized before the read's
  cutoff, except a conflict, and do not count a generic problem twice.
- `cancellation-rules.ts` and `cancellation-recognition.ts` (#229):
  `recognizeCancelledOrder` runs after every committed cancellation's
  settlement (`settleCancellation`), outside the Order and settlement guards,
  under the finance guard. With an existing prepared-food credit (unassigned
  timeout or operator cancellation) it books that credit once; otherwise
  (rejection, acceptance timeout, Customer cancellation, cancellation before
  preparation) it records the outcome with no entitlement. The original date
  is the qualifying moment: the delivery's claim deadline for an unassigned
  timeout, the acceptance deadline for an acceptance timeout (the processing
  time for a legacy Order without one) and the recorded cancellation
  otherwise; the posting time is kept apart. Unrecognized compensation of an
  ended month posts once as a linked current-month adjustment. The Customer's
  refund plays no part: a pending, failed or retried refund leaves the one
  recognition as it is. A cancellation whose facts do not establish its
  outcome or credit is a `missing_outcome_evidence` problem, never inferred.
  An Operator cancellation is dated by the operator's action
  (`cancelled_at`). Its evidence still records the accepted work's
  `claim_deadline` as a fact, but a statement's `calculation` leaves it out
  (`explainReceipt` in `statement-rules.ts`), because that deadline is the
  unassigned timeout's moment, not this outcome's (#233). The operator's
  reason (`cancellation_note`) stays in Order Operations.
  The recovery job scans every cancellation page with its own bounded batch,
  including older months, so downtime cannot strand an entitlement.
- `service-fee.ts`: the pure fee rules (#228). It replays the recorded
  activations and deactivations from creation (a Restaurant starts inactive)
  into intervals that end at the next change, so a deactivation at midnight
  never makes the new date active. A change that repeats the state already
  reached, or today's flag disagreeing with the replay, makes the preceding
  interval unknown instead of guessed. Opening and closing are not read. It
  counts each Copenhagen date active at any time once, up to now, and rounds
  DKK 100 x active / month's dates once. `serviceFeeStanding` compares that
  evidence with the stored obligation: accrued, owed or unknown.
- `service-fee-accrual.ts`: `accrueServiceFee` accrues the current month
  under the finance guard, with the month decided by the server clock inside
  it. `activateRestaurantWorkflow` and `deactivateRestaurantWorkflow` run it
  last, after releasing the Restaurant's lock (owed work, ADR-0021), and
  the reconciliation's `sweepServiceFees` sweeps every Restaurant page by page
  each minute. That sweep also accrues each new date after midnight. Missing
  evidence accrues nothing.
- `closure.ts`: `closeStatementsWorkflow` materializes ended months under
  the same finance guard, once per Restaurant/month. A delayed worker uses
  the exclusive boundary cutoff for journal membership, receipts and problems;
  later recognition cannot make historical pending work look completed.
  The recorded fee accrual is never recomputed into the old obligation.
  Verified differences retain monthly target, already recognized amount,
  active dates and obligation reference in a separate `service_fee_difference`
  receipt/entry. A replay recognizes no new difference; negative differences
  restore an overcharge. No daily monetary charges are rounded and summed.
- `earnings.ts` and `earnings-rules.ts`: MTOGO's earnings across all
  Restaurants (`GET /admin/earnings[/{month}]`, #256). They read each
  Restaurant's month through `readStatement` and only add the summaries up, so
  Admin earnings equal the sum of the statements. A total any Restaurant
  withholds is withheld for the month and the Restaurant is named. Closing a
  month also stores `finance_closure.summary` (`statementSummary` of the same
  snapshot: lifecycle, completeness, commission, service fee and MTOGO-funded
  credits), so Earnings reads a closed month in one query without its entries.
  Closures stored before #256 have no summary and are read through
  `readStatement` instead; the current month is always read live.
- `pending-handovers.ts`, `cancellation-sources.ts` and `participation.ts`
  collect durable source evidence for recovery and boundary reads.
- `statement.ts`, `statement-read.ts` and `statement-rules.ts`: the shared
  read behind the partner statement routes
  (`GET /partner/restaurants/{id}/statements[/{month}]`) and the operator
  routes (`GET /admin/restaurants/{id}/statements[/{month}]`, #230, #232).
  Each surface only authorizes its caller (own-Restaurant staff, or Admin
  authentication) before the same read steps, so a new financial kind reaches
  both surfaces at once. A closed month is served from its stored snapshot
  without the finance guard; other months are read under the guard for a
  consistent header/page, and readers of the same Restaurant, month and page
  still waiting for it share one guarded read (#235). Reads never create
  entries or closures.
  Before physical materialization they project the exclusive boundary cutoff;
  afterwards they page the stored immutable snapshot. Ordinary totals include
  only entries whose original and posting months agree. Older entries
  contribute their signed net once under adjustments and link their original
  statement; credit, commission, fee and funding remain separate. Missing
  older fee/source evidence withholds current adjustments and balance.

## Demo data

`src/scripts/seed-demo-statements.ts` (#228) fills the current month's
statements of "Pizzeria Nørrebro" (or `DEMO_STATEMENTS_RESTAURANT_ID`) and
three other active, open Restaurants with delivered Orders on their recorded
active dates, at lunch and dinner, never in the future, with varied baskets
up to catering Orders in the higher commission bands. Each Order goes through
the real checkout, kitchen, claim, pickup and handover workflows; its
recorded times are then moved back to its planned handover and finance
recognizes it again from there. It then accrues each fee. A Restaurant whose
history cannot establish its active dates is skipped. From `apps/backend`,
against a local, disposable or staging database:

```bash
npx medusa exec ./src/scripts/seed-demo-statements.ts
```

`DEMO_STATEMENTS_REMOVE_BLOCKERS=true` first soft-deletes the demo
Restaurant's earlier test Orders that keep its current month incomplete
(delivered without a preserved purchase basis, or with prepared-food
compensation not recognized until #229), with their operational, delivery
and finance records, and logs their numbers. Synthetic test data only.
`DEMO_STATEMENTS_STAFF_PASSWORD` gives the other Restaurants' demo staff
(created when a Restaurant has none) a sign-in, named in the log. Reruns add
only missing date slots. `demo-statements-plan.unit.spec.ts` covers the plan.
In the devcontainer, whose `.env` names the database host `postgres`, run it
with `NODE_ENV=development` and `DATABASE_URL` pointing at `localhost`, which
the synthetic-seed guard accepts.

`src/scripts/seed-statement-population.ts` (#235) is the verification
population: 100 synthetic Customers and 500 Orders at four Restaurants of
their own over two closed months and the current one. The Orders have mixed
delivered and cancellation outcomes, prepared-food compensation and linked
late adjustments. `src/scripts/check-statement-population.ts` reconciles
every statement on both surfaces against the independently expected manifest
(`src/lib/statement-population-manifest.ts`) and times twenty simultaneous
journeys. See
[Statement verification population](/MTGO/product/restaurant-statement-population/).

Closed snapshots retain unresolved earlier-month adjustment warnings as well as
warnings about their own activity. Boundary reads and materialization use the
same exclusive cutoff for evidence problems and recognition receipts, so a
later recovery cannot turn a historically unavailable adjustment into zero.
