# Restaurant Finance module

Registered as `restaurantFinance` (Feature #52, spec
[Restaurant fees and statements](/MTGO/product/restaurant-statements-spec/)).
Owns what MTOGO recognizes financially for a Restaurant, separate from
Medusa's Customer payments and refunds and from the operational prepared-food
obligation in the Order Operations module. Issue #227 adds the first part:
delivered food credit and commission, and their evidence problems. Issue #228
adds the monthly service-fee obligation from active Copenhagen dates.

Issue #229 recognizes existing prepared-food credits and records
cancellations that owe no entitlement.

## Data model

| Model                 | Owns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FinanceReceipt`      | One recognition per source: `source_kind` (`order_delivered`, `prepared_food_credit` or `order_cancelled`) and `source_id` (unique together: the Order, or the existing food credit), `restaurant_id`, `order_id`, `outcome` (`delivered` or the cancellation category), `occurred_at` and `original_month` (the qualifying moment and its Copenhagen month), `posted_at` and `posting_month`, `terms_version`, `currency_code`, `evidence` (JSON: exact calculation inputs) and `payload_digest` |
| `FinanceJournalEntry` | The booked effect of one receipt (`receipt_id` unique): `kind` (`delivered_order` or `prepared_food_compensation`), Restaurant, Order, original and posting dates and months, `currency_code`, `food_credit` and `commission` (exact decimals, statement direction: credit owed, commission charged) and `funded_by` (`customer` or `mtogo`)                                                                                                                                                      |
| `FinanceServiceFee`   | The one service-fee obligation per `restaurant_id` and `month` (unique together): `terms_version`, `currency_code`, `policy_amount`, `month_day_count`, `active_dates` (JSON list of `YYYY-MM-DD`), `active_date_count`, `amount` (exact, rounded once for the month) and `accrued_at`                                                                                                                                                                                                            |
| `FinanceProblem`      | A visible evidence problem, once per source and `code`: `missing_financial_basis`, `conflicting_recognition` or `missing_outcome_evidence`, with Restaurant, Order, `original_month` and `detected_at`                                                                                                                                                                                                                                                                                            |

- **One fee obligation per month.** `accrueServiceFee` creates the month's
  obligation or replaces its dates and amount while the month is current; the
  same dates again change nothing. It is never a sum of rounded daily fees,
  and nothing accrues a month after it ended (#230 adjusts later differences).
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
  month is the server's Copenhagen month inside the guard; a handover from an
  ended month that is still unrecognized stays owed (`deferred`) for the later
  closing work instead of being backdated. `recoverRestaurantFinanceWorkflow`
  is the once-per-minute job `recover-restaurant-finance`, whose first tick
  after a restart is the startup reconciliation. Both run whatever the
  `restaurant_statements` flag says.
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
  ended month stays owed (`deferred`) for the closing work. The Customer's
  refund plays no part: a pending, failed or retried refund leaves the one
  recognition as it is. A cancellation whose facts do not establish its
  outcome or credit is a `missing_outcome_evidence` problem, never inferred.
  The recovery job sweeps cancellations from the start of the previous month
  with its own batch, so an outcome with no entitlement whose processing
  failed just before a month ended is still recorded. It skips compensation
  whose month has ended, because that cannot be posted before the closing
  work and would otherwise use up the batch on every tick.
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
  `accrueServiceFeesWorkflow` sweeps every Restaurant page by page each
  minute from the `recover-restaurant-finance` job, independently of handover
  recognition, which also accrues each new date after midnight. Missing evidence
  accrues nothing.
- `statement.ts` and `statement-rules.ts`: the shared read behind the
  partner statement routes (`GET /partner/restaurants/{id}/statements[/{month}]`).

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
