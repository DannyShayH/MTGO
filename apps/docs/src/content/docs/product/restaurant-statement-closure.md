---
title: Closed statements and late adjustments
description: How Restaurant staff and operators inspect fixed monthly statements and explain later postings.
---

Restaurant statements use Europe/Copenhagen calendar months and DKK excluding
VAT. The current month is provisional. At the next month's boundary, the old
month's journal membership, service-fee accrual, totals or unavailable
components, and completeness warnings become fixed. Closing a month does not
verify missing evidence or complete unfinished processing.

Staff choose a past month in the partner app's **Statements** workspace.
Operators select a Restaurant in Admin and open **Statements** from its detail.
Both surfaces read the same contract. Access remains scoped to the authorized
actor, and navigation follows the backend's default-off
`restaurant_statements` Feature flag.

## Explaining a late posting

A late entry keeps its original outcome date and Copenhagen month, its actual
posting date and month, and a link to the original statement. Food credit,
commission, fee differences and funding remain separate. An older food credit
of DKK 600 and commission of DKK 30 contribute DKK 570 once under the current
month's **Adjustments**. Those components do not also enter the current month's
ordinary food-credit and commission totals.

Payment does not earn food credit or commission. A November purchase delivered
in December earns in December's ordinary totals. An unassigned timeout due in
November but processed in December uses November's deadline as its original
date and appears as a December adjustment. Missing financial evidence never
becomes an assumed zero.

A service-fee adjustment subtracts the frozen accrual and all prior differences
from the independently rounded monthly target. For two active November dates,
the target is DKK 6.67. If DKK 3.33 already accrued, the later fee difference is
DKK 3.34, reducing the posting month's balance by that amount. Recovery does
not charge the full fee again or sum rounded daily charges. A negative fee
difference restores an overcharge.

The monthly balance is food credits minus commission minus service fee plus
signed adjustments. It carries no earlier balance and is neither a tax invoice
nor a completed payout.

## Downtime and incomplete history

A delayed worker uses the old month's exclusive posting cutoff. It cannot
extend that month's posting window. Snapshot materialization and financial
posting share the Restaurant's finance guard; unique closure and source
identities protect retries and concurrent recovery. A receipt that posts later
does not make its original month's pending warning disappear.

Unresolved earlier-source adjustment warnings also remain fixed when the
posting month closes. Historical problem and receipt reads use its exclusive
closure cutoff. A missing activation history remains unknown even if a later deactivation is
recorded. An unresolved conflict with an already booked historical recognition
remains visible in current adjustment availability. Original closed amounts
and warnings stay fixed in both cases. Current balances remain withheld while
required earlier evidence is missing or known processing is outstanding.

Recognition recovery reads sources in bounded pages and limits each batch.
Closure stores the full month's snapshot in memory under the finance guard;
this is intended for the agreed school-project workload and is not evidence of
large-volume reporting capacity.

## Verification and manual check

Issue #230 adds controlled-clock authenticated HTTP journeys for the Copenhagen
midnight race, competing closing attempts, delayed materialization, fixed
membership and warnings, current-month late entries, November payment with
December delivery, delayed timeout, fee differences, operator access and totals
across pages. Focused decimal calculation tests cover DKK 600 minus DKK 30,
monthly target differences, replay and negative differences.

On 26 November 2026, Chromium inspection used the actual Partner development
page and the actual Admin statement component with controlled contract fixtures.
The financial behavior was checked separately through the real HTTP/workflow
seam. Partner Danish and English and English Admin were inspected at 1440px and
390px, including long Restaurant names, long source references, negative
amounts, closed incomplete states, original-month keyboard navigation and
Admin failed-read/retry presentation. A duplicate desktop original-month link
found in inspection was removed; neither width had page-level horizontal
overflow. Follow-up inspection confirmed both adjustment-link variants have at
least 44px targets, a 2px keyboard focus-ring offset and working original-month
navigation in both Partner languages at both widths. No new Playwright
specification was added.

Local verification passed 1,613 backend unit tests, 47 statement HTTP tests,
15 i18n tests and 12 Partner tests. Combined coverage from the serial affected
run and the final focused runs gives every changed backend file at least 80%
branch coverage.

Before wrapping up, the developer performs the issue's manual check:

1. Release the backend flag locally and use a migrated local/disposable database.
2. As Restaurant staff, choose a closed month in Statements; inspect its warnings,
   fee evidence and amounts in Danish and English.
3. Open a later adjustment and follow its original-month link with the keyboard.
   Check original and posting dates and that the old statement is unchanged.
4. In Admin, select the same Restaurant and month. Compare whole-month totals,
   fee differences and entry pages with Partner, at narrow and wide widths.

The developer confirmed that the manual check passed on 26 November 2026.

This work adds no delivered-Order refund, manual historical repair, transfer,
bonus calculation or configurable commercial policy. The acceptance limits in
the [Restaurant fees and statements specification](/MTGO/product/restaurant-statements-spec/)
remain in force.
