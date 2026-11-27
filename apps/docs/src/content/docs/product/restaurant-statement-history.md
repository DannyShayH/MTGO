---
title: Incomplete statement history
description: How Restaurant statements reconcile legacy financial evidence and withhold amounts that cannot be verified.
---

Some Orders, participation changes and agreements predate the financial
records that Restaurant statements now rely on. Issue
[#231](https://github.com/DannyShayH/MTGO/issues/231) reconciles that older
history where reliable evidence exists. Where it does not, statements show an
evidence problem and withhold the affected totals. They never present a guessed
amount or a zero in their place.

## What legacy reconciliation verifies

| Source                                             | Verified from                                                                                                                                              | When it cannot be verified                                                                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delivery and its date                              | The authoritative handover outcome and time in the delivery record                                                                                         | Nothing is recognized; the handover stays visible as owed processing                                                                                     |
| Purchased amounts                                  | The preserved basis (#226), or for an older Order the native Order's **original version**: its lines, exact VAT-inclusive prices and the quantities bought | `missing_purchase_evidence`: food credits and commission are withheld. Today's menu is never used                                                        |
| Terms                                              | The preserved basis, or the one agreement recorded no later than placement and not removed before it, of a known terms version                             | `missing_terms_evidence`: food credits and commission are withheld. Today's agreement, recorded later, is not proof of what applied                      |
| Prepared-food credit and zero-credit cancellations | The existing credit and the recorded cancellation (#229, #233)                                                                                             | `missing_outcome_evidence`: food credits are withheld                                                                                                    |
| Participation                                      | Recorded activations and deactivations from the Restaurant's creation                                                                                      | `participation_evidence_missing`: the service fee and balance are withheld. Today's active flag and the creation date are not proof of past active dates |

An older Order's placement time is its placement record's time or, for a record
that predates it, the native Order's creation. The reconstructed entry's
calculation names which one was used and that the basis was reconstructed.
The partner app and Admin show that note beside the entry.

Medusa adds a native Order version for fulfillment and delivery, so the latest
version of a delivered Order is never version 1. Reconciliation reads the
quantities of the Order's first version, which those later versions do not
change, together with the line prices. An Order with an applied edit, claim or
exchange can have changed prices, so its purchase counts as unverifiable.

Only an Order with no stored basis is reconstructed. A basis that was stored at
placement but cannot be read is reported as `missing_purchase_evidence` and is
never replaced by a reconstruction.

Under the current rules, a fact that reconciliation names as missing cannot
appear later. An agreement recorded after placement is never proof, and an
Order's original version does not change. Re-examination therefore happens
once per older problem. Participation history works differently: each read
recalculates the service fee, and a verified closed-month difference posts once
as an adjustment (#230).

## Dates and the reconciliation path

A reconstructed entry keeps the handover as its original date and month and
its actual processing time as its posting date. When the original month is
still current, the entry counts in its ordinary totals. When that month is
closed, the entry posts once to the current month's adjustments with a link to
the original statement, as for any late processing (#230).

The once-a-minute `recover-restaurant-finance` job runs the bounded
[finance reconciliation](/MTGO/product/restaurant-statement-recovery/): it pages through all handovers and records outside the
batch, so restart or downtime cannot strand older evidence. Handovers recorded
as `missing_financial_basis` before reconciliation existed are re-examined once
each. A verifiable basis is recognized; otherwise the specific missing fact is
recorded, which ends that re-examination. No migration writes statements or
closures as if finance had run before its rollout. No manual repair screen is
added.

## What a statement shows

- Known entries stay readable, and totals that the gap does not affect stay
  available. A missing purchase or terms record withholds food credits and
  commission, but not the service fee. Missing participation withholds the fee,
  but not verified food credits.
- The balance needs every component, so it is unavailable whenever one is.
- An Order still waiting for its outcome is not an evidence gap. A failed
  delivery without recorded responsibility (`responsibility_unknown`) withholds
  food credits. Contact attempts and attention alerts establish no fault or
  credit.
- A month with verified inactivity shows actual zeros.
- Lifecycle (`provisional` or `closed`) and completeness (`complete`,
  `incomplete` or `processing_pending`) are separate fields, with
  `verified_at` and safe source references per problem.
- A closed month keeps its original warnings and totals. If reconciliation
  later verifies the missing amount, it reaches the current month once as a
  linked adjustment. Recovery does not book it again.
- A problem resolved inside the current month no longer withholds that month's
  totals. A recognition conflict always stays visible.

## Verification

`legacy-basis.unit.spec.ts` covers the pure rule: an original Order version
with an agreement in force reconstructs; a changed version, missing or
VAT-exclusive prices, no agreement, a later agreement, an agreement removed
before placement and an unknown terms version each name the missing fact. An
agreement removed only after placement still applies.

The `history without a preserved purchase basis (#231)` journeys in
`partner-restaurant-statements.spec.ts` drive real checkout, kitchen, claim,
pickup and handover through the HTTP routes:

- A legacy handover is recognized once from its original Order and the
  agreement in force, dated by the handover.
- Unreproducible purchased prices withhold food credits, commission and the
  balance. They leave the known entry, the recorded service fee and an
  in-progress Order alone.
- An agreement recorded after placement names missing terms.
- A pre-reconciliation problem is re-examined once and names its fact.
- A closed incomplete November keeps its warning. Its later verified handover
  posts once as a linked December adjustment, and a second recovery adds
  nothing.

Existing journeys cover missing participation, verified zero months, failed
deliveries without responsibility, prepared-food evidence and late fee
differences.

On 26 November 2026, the development database held 10 Pizzeria Nørrebro
handovers recorded as `missing_financial_basis` by #227. After the change
loaded, the recovery job reconstructed all 10 from their original Order
versions and the agreement in force. Each posted on 26 November with its 25
November handover date. Chromium inspection of the partner Statements page in
Danish and English at 1440px and 390px showed the reconstruction note on all
10 entries. The note wrapped at 390px, the Order link kept a visible keyboard
focus ring and no width overflowed. Admin at 1440px and 390px showed the same
10 notes. The dev data had no unverifiable Order, so the 390px Admin check
added `missing_purchase_evidence` and `missing_terms_evidence` problems to the
live response with Playwright route interception. Their English explanations
and withheld totals rendered without overflow. The partner app reads statements
server side, so its Danish and English problem texts are verified by the
`@dtc/i18n` tests instead. No Playwright specification was added.

Before wrapping up, the developer performs the issue's manual check:

1. Release `restaurant_statements` locally and migrate a local or disposable
   database that has delivered Orders without a preserved basis.
2. As Restaurant staff, open Statements in Danish and English. Check that
   reconstructed entries carry the note and their original handover dates, and
   that any unverifiable Order shows a named problem with food credits,
   commission and balance unavailable rather than zero.
3. Open a closed month with a warning and the current month's linked adjustment.
   Follow the original-month link with the keyboard and confirm the old
   statement is unchanged.
4. In Admin, compare the same Restaurant and month at narrow and wide widths.

This work adds no delivered-Order refund, responsibility recording, manual
historical repair, transfer or configurable policy. The acceptance limits in
the [Restaurant fees and statements specification](/MTGO/product/restaurant-statements-spec/)
remain in force.
