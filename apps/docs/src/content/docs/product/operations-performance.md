---
title: Operations read performance
description: How the operator and staff operations reads perform under twenty simultaneous journeys on the verification population with the demo world loaded, with their query plans.
---

Issue #264 measures both operations reads (spec
[Operations monitoring](/MTGO/product/operations-monitoring-spec/), testing
decision "Performance", user stories 56 and 57): the staff read
`GET /partner/restaurants/{id}/operations` and the operator read
`GET /admin/operations`, for one Restaurant and for all Restaurants. The
measurement uses the agreed baseline, the **100-Customer, 500-Order**
[statement verification population](/MTGO/product/restaurant-statement-population/)
(ADR-0014), with the demo world loaded beside it. It demonstrates the
exercise dataset only, not production capacity or the assignment's growth
target.

## Running it

From `apps/backend`, on a local, disposable (`medusa_ci_*`) or staging
database that holds both seeds (`seed-statement-population.ts` and
`seed-demo-world.ts`), start the backend with
`MTOGO_FF_OPERATIONS_MONITORING=true` and run:

```bash
npx medusa exec ./src/scripts/check-operations-performance.ts
```

The script prints one JSON report on stdout: the population, the
environment and the timings. `MEDUSA_BACKEND_URL` names another backend (default
`http://localhost:9000`), and `OPERATIONS_PERFORMANCE_ROUNDS` sets the number
of timing rounds (default 5). Requests are signed with short-lived tokens made
with the backend's JWT secret, so no password is needed.

## Result, 28 November 2026

**Workload:** 20 simultaneous journeys x 5 rounds, after one unmeasured
warm-up journey. Each journey makes 3 reads: a Restaurant's figures as its
staff, the same Restaurant as an operator (`?restaurant_id=`) and all
Restaurants as an operator. The journeys rotate over the 27 Restaurants with
authorized staff. **Target:** 95% within 2000 ms.

**Population:** 508 Customers and 4,514 Orders over 35 Restaurants: the
100-Customer, 500-Order verification population plus the demo world.

**Environment:** the backend in `medusa develop` mode, as for the statement
measurement, on the dev container's PostgreSQL with Redis. Node v24.22.3,
Linux 6.6.87.2-microsoft-standard-WSL2, 12 x AMD Ryzen 7 PRO 6850U, 9 GB. The
partner app and the editor ran on the same machine. Measured at
2026-11-28T16:50:15Z.

| Read                    | Requests | Within 2 s | p50 ms | p95 ms | Max ms |
| ----------------------- | -------: | ---------: | -----: | -----: | -----: |
| partner: own Restaurant |      100 |     100.0% |    370 |    767 |    829 |
| admin: one Restaurant   |      100 |     100.0% |    395 |    485 |    550 |
| admin: all Restaurants  |      100 |     100.0% |    401 |    442 |    464 |
| **All reads**           |      300 |     100.0% |    390 |    555 |    829 |

**The target is met: every read completed within two seconds**, with no
failed read. A run a few minutes earlier gave the same 100% (p95 493 ms).

## Query plans

The plans below were captured on the measured population on 28 November
2026 by running every query of one Restaurant's read and one platform read
again under `EXPLAIN ANALYZE`. Each module aggregates its own records, and no
query joins another module's tables.

The script no longer touches the database connection (coding standard 5.1).
The plans are checked where the database may be used, in
`apps/backend/integration-tests/http/admin-operations.spec.ts`: the placement
and handover index checks from #261 and #262, and for #264 a check that every
count and average of the staff read can be served by an index, with
sequential scans ruled out.

- Every query ran in 1.3 ms or less.
- **One Restaurant:** placements, Orders per hour, placements per day and
  the Unfulfilled Orders use `IDX_order_operation_restaurant_id_state_placed_at_id`.
  Open Orders use `IDX_order_operation_restaurant_id_state`. Processing time
  uses `IDX_order_operation_delivery_ended_at`, and transit time uses
  `IDX_intended_delivery_restaurant_id_terminal_at_id`. Unassigned deliveries
  and attention use the delivery indexes.
- **All Restaurants:** placements use `IDX_order_operation_placed_at`. Both
  times use the delivery end-time indexes (`IDX_order_operation_delivery_ended_at`,
  `IDX_intended_delivery_delivered_terminal_at_id`), and the Customer rating
  uses `IDX_feedback_delivered_at`.
- The one sequential scan is on `refund_obligation`, for a single
  Restaurant's unresolved Full refunds. The table holds 323 rows. The scan
  keeps the 11 that are pending or failed, then joins each to its Order
  record by `IDX_order_operation_order_id_unique` (both tables belong to the
  Order-operation module), in 0.5 ms in total. The platform read uses
  `IDX_refund_obligation_status_created_at_id`. If refunds grow by orders of
  magnitude, this read is the first to revisit.

The time indexes come from #261 and #262. #264 adds none: one Restaurant's
reads are served by the existing composite indexes that begin with
`restaurant_id`.
