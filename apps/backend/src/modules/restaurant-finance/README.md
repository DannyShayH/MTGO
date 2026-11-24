# Restaurant Finance module

Registered as `restaurantFinance` (Feature #52, spec
[Restaurant fees and statements](/MTGO/product/restaurant-statements-spec/)).
Owns what MTOGO recognizes financially for a Restaurant, separate from
Medusa's Customer payments and refunds and from the operational prepared-food
obligation in the Order Operations module. Issue #227 adds the first part:
delivered food credit and commission, and their evidence problems.

## Data model

| Model                 | Owns                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FinanceReceipt`      | One recognition per source: `source_kind` (`order_delivered`) and `source_id` (unique together), `restaurant_id`, `order_id`, `outcome`, `occurred_at` and `original_month` (the authoritative handover and its Copenhagen month), `posted_at` and `posting_month`, `terms_version`, `currency_code`, `evidence` (JSON: exact calculation inputs) and `payload_digest` |
| `FinanceJournalEntry` | The booked effect of one receipt (`receipt_id` unique): `kind` (`delivered_order`), Restaurant, Order, original and posting dates and months, `currency_code`, `food_credit` and `commission` (exact decimals, statement direction: credit owed, commission charged) and `funded_by` (`customer` or `mtogo`)                                                           |
| `FinanceProblem`      | A visible evidence problem, once per source and `code`: `missing_financial_basis` or `conflicting_recognition`, with Restaurant, Order, `original_month` and `detected_at`                                                                                                                                                                                             |

- **Created only.** Nothing updates or deletes a receipt, entry or problem.
  `recognizeSource` creates a receipt and its entry in one transaction; the
  unique source identity in storage backs the workflow's guard.
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
- `statement.ts` and `statement-rules.ts`: the shared read behind the
  partner statement routes (`GET /partner/restaurants/{id}/statements[/{month}]`).
