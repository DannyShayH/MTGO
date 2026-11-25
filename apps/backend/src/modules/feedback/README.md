# Feedback module

Registered as `feedback` ([#218](https://github.com/DannyShayH/MTGO/issues/218), Feature
[#51](https://github.com/DannyShayH/MTGO/issues/51)). Medusa has no review or
rating module, so this custom module holds the ordering Customer's Feedback on a
delivered Order (ADR-0010). The whole Feature is behind the default-off `feedback`
Feature flag (ADR-0022); the module and its workflows work regardless of the flag,
which only the routes read.

## Data model

| Model      | Owns                                                                                                                                                                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Feedback` | `order_id` (unique), `customer_id`, `restaurant_id`, `agent_id` (the Delivery's `assigned_agent_id`), `delivered_at` (the recorded handover time), `food_rating`, `experience_rating` and `agent_rating` (integers, checked 1 to 5 by the database) and `created_at`, shown to the Customer as `submitted_at` |

- **One Feedback per Order.** The unique `order_id` decides concurrent
  submissions: the first committed insert wins, and the loser answers
  `feedback_already_submitted` with the recorded ratings.
- **Never edited or deleted.** The service only has Medusa's generated CRUD, and
  no route updates or deletes a Feedback. The submit workflow's compensation is
  the only delete: it removes the Feedback its own failed run created.
- **Copied facts.** The Restaurant, the agent and the handover time are copied
  from the Delivery when the Feedback is recorded. They are recorded milestones
  that never change (ADR-0021), so statistics and the bonus
  ([#53](https://github.com/DannyShayH/MTGO/issues/53)) can group by them without
  joining across modules. Indexes cover `delivered_at`, `restaurant_id` with
  `delivered_at`, and `agent_id` with `delivered_at`.
- **Subjects stay apart.** Only `agent_rating` describes the agent and only
  `food_rating` the Restaurant; `experience_rating` is platform-wide. Missing
  Feedback is unrated, never zero.
- **The agent stays anonymous.** The Customer's views never return `agent_id`,
  `restaurant_id` or any agent name.

## Link

`src/links/order-feedback.ts` is a read-only one-to-one link from the Medusa
Order to its Feedback on `order_id`, like the Order's operation record.

## Workflows

`src/workflows/feedback/`:

- `rules.ts`: the pure eligibility rule `decideFeedback` (already submitted, open
  with its `closes_at`, `order_not_delivered` or `feedback_window_closed`) and
  the Customer view. The Feedback window
  ([#219](https://github.com/DannyShayH/MTGO/issues/219), ADR-0010) runs for
  exactly 168 hours (`FEEDBACK_WINDOW_MS`) from the Delivery's recorded
  handover instant `terminal_at`; at the closing instant it is already closed.
  It ignores the Feature flag, so switching the flag never extends it.
  Recorded Feedback stays readable after the window.
- `retrieveOrderFeedbackWorkflow` reads the Customer's state;
  `submitFeedbackWorkflow` records the Feedback.

The routes are `GET` and `POST /store/orders/:id/feedback`; see the
[API README](../../api/README.md).

## Demo data

`src/scripts/seed-demo-feedback.ts` ([#220](https://github.com/DannyShayH/MTGO/issues/220))
seeds 500 delivered, rated Orders for one existing Customer account, plus one
Order still open for rating and one whose window has closed. Run it from
`apps/backend` against a local, disposable or staging database:

```bash
DEMO_FEEDBACK_CUSTOMER_EMAIL=<email> npx medusa exec ./src/scripts/seed-demo-feedback.ts
```

The pure plan (`src/lib/demo-feedback-plan.ts`) spreads the handovers over the
previous and the current calendar month in Copenhagen time, counted from the day
of the run, and varies the ratings per Restaurant and agent. The four demo
Restaurants in Nørrebro publish the fuller demo menu, and each Order buys one to
three pizzas, often with a drink. The script runs the real Order, delivery and
`submitFeedbackWorkflow` steps, so the flag can be off, then moves each Order's
recorded times back together. The Order's `created_at` is written on the Order
module directly, an exception to coding standard 5.1 that no core-flow covers.
Application code never rewrites recorded milestones or Feedback (ADR-0021,
ADR-0010); this synthetic seed does, and only on the databases
`syntheticSeedAllowed` accepts. Each Order's slot is kept in its metadata, so a
second run adds only the missing Orders, plus a new open Order once the
previous one was rated or its window closed (`isSeededSlotKept`), and moves the
kept Orders to the current plan's times, so rerun it shortly before a demo. A
full run places 502 Orders and takes about 15 minutes in the devcontainer.

## Operator statistics

`statistics` groups food ratings by Restaurant, agent ratings by Delivery agent,
and overall-experience ratings platform-wide in the database over a half-open
handover-time range. The operator workflow combines those distributions with
Delivery's counts. Unrated delivered Orders increase the delivery count, never
rating counts or averages. `GET /admin/feedback/statistics` and the Feedback
Admin page are behind the `feedback` flag; the only supported period is the
last 30 × 24 hours.
