---
title: Recovering interrupted statement processing
description: How finance reconciliation finishes financial work that an interrupted process left behind, and what statements show meanwhile.
---

A handover, cancellation or participation change commits first. Its financial
follow-up runs afterwards, outside the Order's guard. If the process stops in
between, the operational outcome stays as recorded and the financial work stays
owed in durable records. Nothing is kept in memory, so a restarted or second
worker finds the same owed work (issue #234, spec
[Restaurant fees and statements](/MTGO/product/restaurant-statements-spec/)
§9).

## One reconciliation workflow

`recoverRestaurantFinanceWorkflow`
(`apps/backend/src/workflows/restaurant-finance/reconciliation.ts`) is the only
finance reconciliation. Each invocation runs these parts in order:

1. Materialize ended months. Each posting also closes its Restaurant's ended
   months under the finance guard first, so old work never posts into a
   closed period even when this step fails.
2. Recognize delivered Orders that have neither a receipt nor an evidence
   problem.
3. Re-examine handovers recorded as `missing_financial_basis` before #231.
4. Account for cancellations and existing prepared-food credits.
5. Accrue each Restaurant's current-month service fee.

Each part reads every source page, oldest first, and handles at most one
bounded batch (50 by default). One failing part does not skip the others. The
first failure is rethrown afterwards and logged by the job runner; any later
failures are logged by the reconciliation itself, so each is logged once. A
delivered Order without its Order operation records nothing and does not use
up the batch. The result
reports `backlog: true` when a part filled its batch and made progress, so more
owed work may remain. A batch of failed attempts is not progress; those sources
wait for the next tick and stay visible as pending.

The `recover-restaurant-finance` job runs every minute. It calls the workflow
again while the previous invocation reported a backlog, up to ten times per
tick, and leaves the rest for the next tick. Its first tick after a restart is
the startup reconciliation. It runs whether or not the `restaurant_statements`
Feature flag is on.

## What stays exactly once

- Payment capture, refunds and prepared-food credits belong to Order
  Operations. Recovery reads them and never creates them again.
- A receipt and its journal entry commit together, and each source identity is
  unique in storage. Two concurrent workers or a replayed callback get the
  original result back.
- Fee accrual, posting and closing for one Restaurant share its finance guard.
  The month keeps one fee obligation. A month that ended without an accrual is
  never accrued late. Its verified amount posts once as a `service_fee_difference`
  adjustment in the current month, and a replay recognizes no second difference.
- Old work keeps its original date and month and posts as a linked
  current-month adjustment. The closed statement's snapshot and warnings stay
  fixed.

## What a statement shows meanwhile

Owed work found by the read is a pending problem: `recognition_pending`,
`prepared_food_credit_pending`, `cancellation_processing_pending`,
`service_fee_accrual_pending` or an `earlier_month_*_pending` code, each with
its sources. The affected components show `processing_pending` and the balance
is withheld. Known amounts stay readable. Missing evidence is reported as
`incomplete` instead, and that state ranks above pending when both apply. A
finished job or batch does not complete a statement. Only the read of durable
sources does, so a statement is complete only when nothing is owed.

With the Feature flag off, the statement routes answer 404 and the navigation
is hidden. Recovery, accrual and closing continue. When the flag is on again,
the statement shows the recovered entries.

## Verification

Authenticated HTTP tests in `partner-restaurant-statements.spec.ts` cover:

- a three-handover backlog drained with a batch of one, pending until the last
  fresh invocation, and no backlog afterwards;
- a handover whose finance write fails: it stays delivered and dated, and a
  fresh job run books one entry without new captures, refunds or food credits;
- two concurrent job runs leaving one receipt and one fee obligation;
- a month closed and its handover recovered while the flag is off, shown when it
  is on again;
- an ended month's missing fee recovered once as a current-month difference.

The existing cancellation, close/post race and fee-difference tests in the same
file still apply.

Before wrapping up, the developer performs the issue's manual check:

1. Release the backend flag locally. As staff, deliver an Order while finance is
   interrupted, or remove its receipt in a disposable database.
2. Open Statements and confirm the pending warning and the withheld food credits
   and balance, in Danish and English.
3. Wait for the next job tick and reload. Confirm one entry with the original
   handover time and a complete or correctly incomplete statement.
4. Switch the flag off, confirm the navigation disappears, switch it on again
   and confirm the same result in Admin at narrow and wide widths.
