---
title: Restaurant fees and statements specification
description: Specification for Feature 52, synthesized from the agreed discovery 223.
---

## Problem Statement

Restaurant staff cannot yet inspect an explainable monthly account of what their Restaurant earns and owes through MTOGO. Paid Orders, delivery outcomes, prepared-food compensation, participation history and Customer refunds exist separately. They do not yet provide a consistent Restaurant statement, delivered food-credit recognition or commission history.

Operators need to reconcile those amounts without treating a refund attempt as a Restaurant credit, charging twice after recovery, or silently changing a past statement. Historical evidence is incomplete for some older records, so a convincing numeric balance can be misleading unless its completeness is explicit.

## Solution

Provide read-only Copenhagen calendar-month statements for authorized Restaurant staff in the partner app and for MTOGO operators in Medusa Admin. Each statement explains food credits, commission, the prorated service fee, signed adjustments and that month's balance, with itemized supporting evidence.

Use the existing common MVP policy and preserve its purchase-time application. The current month is provisional. Closed statements stay fixed; later processing appears once as a linked adjustment in the month recorded. Missing evidence and known outstanding processing are visible and withhold affected totals and balances. Processing survives retries, concurrency and restarts.

This specification implements the financial journeys supported by explicit operational evidence and preserves the reduced scope agreed for Feature #49. It does not introduce missing operational responsibility or refund actions. The agreed [discovery](/MTGO/product/restaurant-statements/) contains Q1–Q19 and the team's shared-understanding confirmation.

## User Stories

1. As Restaurant staff, I want a Statements navigation item, so that I can find my Restaurant's commercial history.
2. As Restaurant staff, I want to select a Copenhagen calendar month, so that I can inspect the period relevant to my work.
3. As Restaurant staff, I want the current month selected initially, so that I can see current activity without searching through history.
4. As Restaurant staff, I want food credits, commission, service fees, adjustments and monthly balance together, so that I can understand how the result was calculated.
5. As Restaurant staff, I want amounts clearly identified as DKK excluding VAT, so that I can distinguish the statement from Customer payments including VAT.
6. As Restaurant staff, I want each delivered food credit linked to its Order and delivery outcome, so that I can trace what earned it.
7. As Restaurant staff, I want commission explained by the preserved purchased food value and marginal rates, so that I can reproduce the charge.
8. As Restaurant staff, I want purchased prices and commercial terms preserved, so that later menu or policy changes do not rewrite my charges.
9. As Restaurant staff, I want an Order delivered in the following month recognized in that delivery month, so that payment timing does not appear to earn commission early.
10. As Restaurant staff, I want prepared-food compensation distinguished from Customer-funded food credit, so that I can understand why MTOGO owes the amount.
11. As Restaurant staff, I want prepared-food credit to appear once even when Customer refunds are retried, so that a provider failure does not duplicate or remove my entitlement.
12. As Restaurant staff, I want cancellation without a food-credit entitlement to produce no commission or food credit, so that unsuccessful Orders do not inflate my statement.
13. As Restaurant staff, I want the service-fee calculation to show active dates and the month's day count, so that I can reproduce the prorated fee.
14. As Restaurant staff, I want temporary closure distinguished from deactivation, so that I understand why a closed but active Restaurant remains billable.
15. As Restaurant staff, I want repeated participation changes on one date counted once, so that the fee does not depend on how many times participation changed.
16. As Restaurant staff, I want the current-month fee to include only days already active, so that it does not charge predicted future participation.
17. As Restaurant staff, I want a no-Order month to show its actual fee and balance, so that absence of Orders does not hide an amount owed.
18. As Restaurant staff, I want a fully inactive month with no other activity to show zero, so that genuine inactivity is clear.
19. As Restaurant staff, I want provisional and closed statements labeled, so that I understand which monthly account can still accumulate activity.
20. As Restaurant staff, I want a closed statement to remain fixed, so that the account I previously inspected remains reproducible.
21. As Restaurant staff, I want late entries shown as linked current-month adjustments with their original dates, so that I can explain changes without losing earlier statements.
22. As Restaurant staff, I want an unassigned timeout's effective deadline distinguished from its processing time, so that downtime does not misstate the original financial period.
23. As Restaurant staff, I want my monthly balance to exclude earlier balances, so that it describes the selected month's activity rather than an unexplained running amount owed.
24. As Restaurant staff, I want negative monthly balances displayed honestly, so that charges exceeding credits are visible.
25. As Restaurant staff, I want missing historical evidence identified with affected totals unavailable, so that an unknown amount is never presented as zero.
26. As Restaurant staff, I want an incomplete month to keep its warning after closure, so that automatic closure does not imply verification.
27. As Restaurant staff, I want known unfinished processing shown separately from missing evidence, so that I can distinguish recovery in progress from an evidence gap.
28. As Restaurant staff, I want whole-month totals while paging through entries, so that a page subtotal cannot be mistaken for the monthly result.
29. As Restaurant staff, I want Danish and English labels, dates and amounts, so that I can use the statement in my working language.
30. As Restaurant staff, I want keyboard-accessible controls and readable layouts with long values on narrow and wide screens, so that I can inspect the statement on the devices I use.
31. As Restaurant staff, I want loading, unavailable and failed-request states distinguished from an empty month, so that a failed read does not look like zero activity.
32. As Restaurant staff, I want continued access while authorized after Restaurant deactivation, so that I can inspect historical activity after participation ends.
33. As Restaurant staff, I want my Restaurant's statement isolated from other Restaurants, so that private commercial information stays private.
34. As an MTOGO operator, I want to select a Restaurant and month in Medusa Admin, so that I can inspect its commercial account without using a staff identity.
35. As an MTOGO operator, I want the same amounts and evidence as Restaurant staff, so that reconciliation does not depend on which screen I use.
36. As an MTOGO operator, I want original dates, posting dates, source references and calculation explanations, so that I can trace every amount.
37. As an MTOGO operator, I want completed processing to remain completed through repeated events and restarts, so that recovery never produces duplicate charges or credits.
38. As an MTOGO operator, I want known processing backlogs to withhold affected balances, so that an apparently final number does not hide unfinished financial work.
39. As an MTOGO operator, I want original commission retained and its full reversal reproducible, so that later supported refund work can reverse the actual charge rather than today's rates.
40. As an MTOGO operator, I want unsupported responsibility outcomes identified rather than inferred from alerts, so that financial results do not invent who caused a failure.
41. As an MTOGO operator, I want distinct commission, compensation, reversal and refund-obligation evidence available to the later bonus Feature, so that it can apply its agreed funding rules without using Restaurant statement balances.
42. As a maintainer, I want financial correctness verified with 100 synthetic Customers and 500 realistic Orders, so that the agreed school-project workload has reviewable evidence.
43. As a maintainer, I want reproducible people, menus, purchases and coherent histories in any data generator, so that verification and demonstrations look credible and exercise real financial cases.
44. As a maintainer, I want request timings measured under twenty simultaneous journeys, so that the reporting result includes performance evidence rather than an unsupported capacity claim.

## Implementation Decisions

### 1. Ownership and reuse

- Introduce a Restaurant finance module, registered with a camelCase module key, owning financial recognition receipts, append-only monetary entries, monthly service-fee obligations and statement closure records. Keep these concepts separate from native Customer payments and from the operational prepared-food obligation.
- Extend the existing paid-placement recording boundary to preserve the financial purchase facts alongside its immutable Restaurant and placement facts. The Order-operation module continues to own placement and cancellation evidence; the Restaurant module owns participation and agreements; Delivery owns authoritative handover outcomes. Workflows collect their facts and coordinate finance. Custom modules do not import each other.
- Use module links for cross-module relationships and indexed owner/source identifiers for financial reads. Module services handle local persistence and atomic operations; workflows decide recognition, ownership and recovery; authenticated API routes validate and run those workflows.
- Reuse Framework decimal arithmetic, models, transaction context, locking, workflow and job facilities. Native Order line prices and versioned quantities supply purchased amounts. Native Payment refunds describe money returned to Customers; they are not a Restaurant ledger. Keep native commerce mutations in existing core-flows-based journeys.
- Follow the Restaurant-Delivery recipe's separation of Restaurant and delivery concepts, with the adaptations already documented in its compatibility review. The recipe does not supply this commission, responsibility or statement policy. Use the installed package documentation and existing module conventions; introduce no dependency upgrades for this Feature.

### 2. Immutable purchased financial facts

- At successful paid placement, preserve Restaurant identity, placement time, currency, applicable agreement/version, the common policy's VAT assumption and commission bands, and the purchased line identifiers, quantities and exact unit amounts needed to reproduce the food value. Snapshot the original Order version or equivalent frozen purchase facts; do not later read changed quantities from the current version as if they were the purchase.
- Record these facts at the existing placement commit, before downstream financial recognition can claim them complete. A later finance failure must not remove a committed paid placement or cause payment to be repeated. Recover owed finance from durable facts under ADR-0014 and ADR-0021.
- Apply only the existing common MVP policy. Preserving a policy version and its actual calculation inputs is required; a policy editor, configurable terms engine and new commercial policies are not.
- A legacy record may be reconstructed only when its historical ownership, purchase, terms and dates are verifiable. Neither today's menu nor today's agreement is historical proof. Missing required facts produce a visible evidence problem, not an automatic current-policy backfill.

### 3. Recognition receipts and journal

- Record one durable receipt for each source entitlement, identified by its authoritative source kind and stable identity. Preserve the source reference, Restaurant, optional Order, qualifying outcome, original occurrence time, original Copenhagen month, actual financial posting time/month, policy evidence, exact calculation inputs, booked amounts and funding explanation.
- A receipt and its journal entry commit together in the finance module's local transaction. Enforce unique source identities in storage as well as workflow guards. Replays return the original result; a conflicting payload for the same identity is an evidence problem, never permission to overwrite an amount or create another entry.
- A successfully delivered Order produces one recognition with food credit and commission. Existing prepared-food compensation produces one recognition referencing its existing credit identity, with MTOGO funding and zero commission. The journal reflects that obligation; it does not create another compensation obligation or another transfer.
- Record the processing result of supported zero-entitlement outcomes, so recovery can distinguish an accounted-for rejection or early cancellation from work it has never assessed. No monetary entry is needed to pretend that zero was earned.
- New model and link definitions require generated migrations, uniqueness constraints and suitable Restaurant/month/source indexes. Preserve historical records; do not cascade deletion of operational or menu data into deletion of financial history.

### 4. Qualifying outcomes and responsibilities

| Evidence                                                                       | Food credit                                                       | Commission             | Original financial date                                 |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ---------------------- | ------------------------------------------------------- |
| Authoritative successful handover                                              | Full purchased food value excluding VAT                           | Marginal commission    | Recorded handover time                                  |
| Rejection, acceptance timeout or Customer cancellation before preparation      | None                                                              | None                   | Recorded qualifying cancellation/deadline as applicable |
| Unassigned timeout with an existing prepared-food obligation                   | Existing full prepared-food credit excluding VAT, funded by MTOGO | None                   | Authoritative claim deadline                            |
| Operator cancellation with prepared-food obligation (#199, recognized by #233) | Explicit existing credit evidence, funded by MTOGO                | None                   | Recorded operator cancellation time                     |
| Operator cancellation before preparation (#199, recognized by #233)            | None                                                              | None                   | Recorded operator cancellation time                     |
| Contact attempts, overdue attention or an unclassified failed outcome          | No inferred entitlement                                           | No inferred commission | Insufficient evidence to classify responsibility        |

- Actual handover remains authoritative even while native fulfillment or the kitchen outcome copy is catching up. Do not substitute a synchronization timestamp for delivery time.
- Preserve ADR-0006's complete responsibility table as the business rule. Customer-caused failed-handover credit has no supported responsibility-recording journey in the source reviewed for discovery. Do not fabricate that outcome or implement the missing operational action inside finance.
- An Order still awaiting its qualifying outcome has not yet earned an entitlement; it does not by itself make the current statement incomplete. A recorded terminal failure whose financial responsibility cannot be established is an evidence problem and withholds the affected totals and balance, rather than being silently classified as zero.
- Pending or failed Customer refunds do not remove an independently established prepared-food obligation. Repeated refund attempts create no new Restaurant credit, commission or reversal.
- Preserve and test reversal of the original recorded commission as a financial rule. Discovery #196 does not provide a delivered-Order refund journey, goodwill loss bearer or correction action. This specification does not turn a calculation test into evidence that such a journey exists, nor invent a rule for reversing food credit when responsibility is unknown.

### 5. Monetary calculations

- Use DKK monetary units as Medusa stores them, without multiplying or dividing by 100 for storage or display. Use exact decimal arithmetic for unit price times quantity, sums, VAT removal, tiers, prorating and adjustment differences. Do not calculate financial results with JavaScript floating-point arithmetic.
- Sum purchased food amounts including the exercise's 25% VAT, then divide the exact total by 1.25. Current checkout has no Customer delivery fee, promotions, tips or partial refunds; do not turn those absent concepts into extra charges or deductions.
- Compute food credit and commission independently from the exact VAT-exclusive food value. Commission is 6% of the first DKK 100, 5% of the next DKK 400, 4% of the next DKK 500 and 3% of the remainder. Round each required final amount once to two decimals, ties away from zero. Sum booked amounts for monthly totals; do not recompute commission on aggregated Orders or rounded food credit.
- Keep commission charged as a deduction; a full commission reversal uses exactly the original booked amount and references the original recognition. Retain signed monetary components so the direction of every adjustment is explicit.

| Input                                                              | Required result                                             |
| ------------------------------------------------------------------ | ----------------------------------------------------------- |
| Exact food value DKK 100 / 500 / 600 / 1,000 / 1,100 excluding VAT | Commission DKK 6 / 26 / 30 / 46 / 49 respectively           |
| DKK 50.31 including VAT                                            | Exact food value 40.248; food credit 40.25; commission 2.41 |
| Final rounding of 1.005 / -1.005                                   | 1.01 / -1.01                                                |
| Original commission 30.00, fully reversed in a financial test      | Restore exactly 30.00, regardless of later policy changes   |

### 6. Service-fee accrual and evidence

- Maintain one service-fee obligation per Restaurant and Copenhagen calendar month. Its basis is DKK 100 multiplied by the number of distinct active dates divided by the actual number of dates in that month. Round the resulting monthly target once; do not round and sum separate daily monetary fees.
- Reconstruct participation from verifiable activation/deactivation intervals and their ordering. Count a date once if the Restaurant was active at any point on it. Opening and closing do not alter participation. Repeated activation, deactivation and reactivation on a date cannot multiply its fee.
- Treat participation intervals as ending at deactivation: deactivation exactly at midnight does not itself establish activity on the new date. Count Copenhagen dates rather than dividing elapsed milliseconds by 24 hours; include leap-year and daylight-saving cases.
- During the current month, count only active dates already reached, including today, without predicting future participation. Expose the policy amount, active-day count, month-day count, covered dates and calculation evidence. The monthly obligation may accrue while provisional; closed booked amounts are immutable.
- Use durable accrual/recognition state and source evidence to distinguish a verified zero fee, missing history and processing not yet reconciled. Today's active flag and Restaurant creation date do not establish past active dates. A fully inactive month has no service fee, while an active no-Order month still has one.
- Where evidence is later recovered, determine the correctly rounded monthly target and subtract amounts already recognized for this same obligation. Record the verified difference once as a linked late adjustment. This preserves one monthly obligation without charging the whole fee twice or adding rounded daily differences.

### 7. Calendar months, closure and late processing

- Store actual timestamps unambiguously and classify original and posting months using Europe/Copenhagen. Month intervals include their start and exclude the next month's start. At the exact boundary the earlier month is closed; worker timing cannot extend its write window.
- Serialize financial posting, fee accrual and closing for a Restaurant with a shared finance guard and a unique monthly closure record. Decide the posting month using the authoritative server clock inside the guarded commit. Prevent a transaction that waited over midnight from appending to the old period.
- A closure retains the period boundaries, immutable booked totals or unavailable components, completeness evidence and the fixed journal membership for that month. Physical materialization may recover after an outage, but it must use the boundary's durable cutoff and cannot backdate entries processed later into an earlier month.
- Finalizing an already recorded provisional service-fee obligation freezes its verified accrued monthly basis. Missing or unreconciled accrual remains visible; its later verified difference follows the late-adjustment rule. Do not silently use today's participation to finalize an earlier month.
- When original entitlement and posting month match, classify its amounts under food credit, commission or service fee. When an older month is already closed, classify the later entry under the current month's signed adjustments, retaining its component breakdown, original outcome date/month and original statement reference.
- An adjustment's net effect contributes once. For example, a delayed DKK 600 food credit with DKK 30 commission gives a DKK 570 current-month adjustment; do not also add 600 and deduct 30 in that month's ordinary totals and then add 570 again.
- Keep closed snapshots and their completeness warnings fixed. Later verified missing amounts appear in the current month, with links explaining the original month. Any related adjustment information displayed alongside an old statement is separate from its immutable original totals.

### 8. Monthly balance and truthful states

- Monthly balance is food credits minus commission minus service fee plus signed adjustments, all excluding VAT. There is no opening balance, carried Restaurant debt, payout allocation or running amount owed. A negative result is valid.
- Lifecycle and completeness are separate: provisional or closed; complete, incomplete because evidence is missing, or processing pending. Preserve component-level availability and safe machine-readable reason codes, source references and the last verified time. Unknown totals are unavailable, not zero or a subtotal presented as complete.
- Know which authoritative outcomes and participation facts are owed financial processing. Do not infer completeness merely because a job ran or one bounded batch finished. Statement reads must expose detected missing receipts, inconsistent evidence or outstanding accrual for the requested period until reconciled.
- Withhold each affected total and the overall balance while its required facts are missing or known processing is outstanding. Known unaffected totals and booked entries remain readable. A missing account of older active days can make the fee and balance unavailable without hiding verified food credits.
- A month can close incomplete or with pending work; closure is not verification. Later processing preserves that snapshot and posts adjustments according to the agreed rule. A verified no-activity month shows actual zeros; a failed request shows an error rather than a fabricated empty statement.

### 9. Recovery and integration

- Attempt recognition promptly after committed delivery or qualifying cancellation, without undoing that authoritative milestone if financial follow-up fails. Follow ADR-0021's recoverable-work pattern; generated CRUD outside a financial local transaction is insufficient to claim exactly-once recognition.
- Add one finance reconciliation workflow, used by a once-per-minute recovery job and startup reconciliation, to discover durable unprocessed sources, reconcile accrual, recover unfinished local work and materialize closed statements. Use bounded, indexed paging that can drain more than one batch and safely resume. Missing source evidence is a visible data problem, not an endless successful retry or a fabricated result.
- Detect and replay work from durable state. In-memory events may prompt work but cannot be its only record. Source uniqueness, local transactions and the finance guard cover a worker restart, two recovery workers, a replayed callback, concurrent reads and close/post races.
- Preserve lock ordering when called from existing Order workflows. Prefer financial follow-up after the operational milestone's guarded section has committed; do not acquire an Order guard from inside the finance guard and create an opposing order of locks.
- Extend placement and financial-source migrations deliberately. Inventory verifiable existing deliveries, prepared-food obligations and historical gaps; recognize recovered amounts with honest original and posting dates. A migration must not silently manufacture closed statements as if finance had been running before rollout. No manual historical repair interface is introduced.

### 10. Read API contracts

| Endpoint                                           | Actor and result                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GET /partner/restaurants/{id}/statements`         | Authorized staff of that Restaurant; paginated available month summaries and evidence coverage |
| `GET /partner/restaurants/{id}/statements/{month}` | Same ownership; immutable/provisional header, whole-month totals and one page of entries       |
| `GET /admin/restaurants/{id}/statements`           | MTOGO operator; the same month-summary contract for the selected Restaurant                    |
| `GET /admin/restaurants/{id}/statements/{month}`   | MTOGO operator; the same statement calculation and evidence contract                           |

- Validate month as a real `YYYY-MM` value, with the current Copenhagen month as the UI default. Expose months during the Restaurant's existence, including known gaps and zero-activity months, without inventing statements for dates before it existed or future months.
- Follow the existing bounded limit/offset convention, with a default of 20 entries and maximum of 50. Sort month summaries newest first; sort entries by posting time descending with a stable identity tie-breaker. Return count, limit and offset. Changing page never turns monthly totals into page totals.
- Statement data includes Restaurant identity, month and timezone, lifecycle, completeness and component availability, currency/VAT basis, whole-month totals, service-fee evidence, entry count and entries, safe problems, and verification time. Entries retain source and optional Order references, kind, outcome, original and posting dates/months, booked component amounts, funding/calculation explanation and original statement link for adjustments.
- Serialize amounts as exact decimal strings and unavailable values explicitly, rather than converting through binary floating-point totals. Format in the UI for the selected language. Return a consistent header and entries for each read; when a provisional page is refreshed, update its header and entries together.
- Authenticate with the existing actor-specific middleware and enforce live authorization and own-Restaurant scope in the shared read workflow. An inactive Restaurant remains readable to authorized staff. Revoked staff receive the established access-ended behavior; foreign and unknown Restaurant references disclose no financial details. Customer and Delivery agent identities cannot call either surface.
- Both actor surfaces use the same calculation/read workflow after authorization. GET endpoints are read-only; they must not create financial entries or close statements as a side effect of a staff member paging through history. No public mutation API is added for finance.

### 11. Partner and operator interactions

- Add a read-only Statements workspace to the existing partner navigation. Select month, inspect the five totals and state, inspect fee evidence, page through entries and follow authorized Order/original-month references. Preserve selected month through language changes and paging; reset paging when the month changes.
- Add a Statements page in Medusa Admin using the existing Restaurant selection/list patterns and the same evidence layout. All operators can inspect any Restaurant. Use the existing SDK client for custom Admin requests, with initial loading, errors and retry states independent of any disclosure panel.
- Partner reads use the existing server-only authenticated data layer and httpOnly staff token, with no public backend token or cross-user caching. Reuse established session-ending behavior. Do not change Customer or Delivery agent sessions for this Feature.
- Use Medusa UI, shared MTOGO tokens and existing typography. Partner text is Danish and English; Admin remains English under ADR-0018. Use a semantic table or narrow-screen equivalent, labeled month/pagination controls, visible keyboard focus, wrapping long references/names and readable amounts. State and sign must not depend on color alone.
- Clearly label DKK excluding VAT and monthly activity. Explain that the statement is not a tax invoice, completed payout or cumulative bank account. Distinguish loading, empty, incomplete, processing and failed-request states; show retry guidance without replacing unavailable money with zero.

### 12. Handoff to bonuses

- Keep commission earnings, original-amount reversals and MTOGO-funded food compensation individually identifiable, with original outcome and posting dates. Do not expose only a single Restaurant monthly balance as the finance interface.
- Feature #53 reads approved refund obligations even before provider success under ADR-0010 and applies its own finalization and carried-loss rules. It must not deduct the same obligation/compensation twice. This Feature preserves the evidence and stable identities; it does not calculate points, pools or awards.
- Service fees remain separately identifiable and excluded from bonus funding. Restaurant statement closure and late-adjustment presentation do not replace the bonus policy's own month/finalization decisions.

### 13. Realistic verification population

- Use exactly 100 synthetic Customers and 500 Orders for the shared reporting verification population, as revised in Q19 and ADR-0014. State the periods, Restaurants, outcome mix and active-day histories represented. Keep exceptional fixtures outside that population identified if a test needs extra records; do not quietly claim a larger or all-delivered population as the agreed dataset.
- A later seed script, if needed, uses recognizable bilingual menus, plausible Danish names and addresses, varied basket sizes, sensible DKK prices and quantities, and consistent totals. Its Orders follow coherent placement, acceptance, preparation, pickup, handover, cancellation and refund histories. Include several Restaurants and more than one statement month so isolation and late adjustments are demonstrable.
- Make generation reproducible and safe to repeat without doubling its named dataset. Retain stable fixture identities and an expected-results manifest for totals and important boundary cases. Use supported commerce setup/workflows and validated financial source evidence; do not mutate live stores or generate Orders with impossible histories just to reach 500.
- Reuse existing demo-data and HTTP fixture conventions where suitable. The Feedback discovery's separate requirement for 500 delivered Feedback Orders is not silently the same population: finance needs varied supported outcomes, including cancellations. Do not build the earlier 200,000-Order generator.

## Testing Decisions

1. **Confirmed boundaries:** Q19 and the team's shared-understanding confirmation already approved calculation tests, controlled-clock HTTP integration tests, manual UI verification and the revised reporting population. These are the testing boundaries for this specification; no further interview is required.
2. **Highest practical seam:** Prefer the authenticated statement HTTP surfaces exercised with the existing Medusa integration runner and shared Restaurant Order harness. Drive supported payment, acceptance, preparation, handover, cancellation and refund journeys through existing APIs/workflows, then assert returned statement amounts, evidence, access results and immutable historical responses. Keep both actor surfaces behind one shared finance read model rather than separate mock calculators.
3. **Focused calculation seam:** Use deterministic tests for decimal VAT removal, marginal tiers, independent rounding, signed original-amount reversals, active-date intervals, Copenhagen month boundaries, leap years and daylight saving. This extends the existing pure financial-rule style used by prepared-food credit and refund decision tests. Assert inputs and observable results, without reproducing the implementation in expected-value code.
4. **Supported outcomes:** Verify delivered recognition, every supported zero-credit cancellation, prepared-food compensation before provider success, and a failed refund subsequently retried without creating another financial entry. Add Operator cancellation integration when #199's explicit evidence is available. A generic failed outcome or contact attempt must not produce inferred compensation.
5. **History and close:** Assert original purchase terms/amounts after menu changes; November payment with December delivery; a November timeout processed in December; posting that waits across midnight; close/recovery races; late adjustment component breakdown without double counting; fixed closed responses; current-day fee accrual; no-Order and inactive zero months; negative monthly activity; and incomplete closure with later verified differences.
6. **Reliability:** Inject failure after a committed operational outcome but before finance finishes, and around the finance receipt/journal transaction and closure. Invoke the real reconciliation workflow with a controlled clock, including a fresh invocation with no retained in-memory state. Repeated and concurrent processing must leave one entitlement receipt, one booked effect and one monthly fee obligation. Assert recoverability and public results rather than private call counts.
7. **Access and reads:** Verify staff of two Restaurants, deactivation without revocation, immediate revocation with an unexpired token, unauthenticated access, wrong actors and operator visibility. Test validation, stable ordering, bounded pages, full-month totals on every page, null/unavailable components and transport failures. Existing operator-refund, unassigned-cancellation and partner authorization suites provide prior art.
8. **Reversal coverage limit:** A calculation test proves reversal of the original commission. It does not prove delivered-Order refund approval, goodwill loss allocation or Customer-caused failed-handover recognition. Keep those absent journeys explicit in acceptance evidence instead of seeding unsupported production states and calling them an implemented actor journey.
9. **Population and timing:** Reconcile independently expected financial totals on 100 synthetic Customers and 500 Orders. Measure statement reads with twenty simultaneous journeys and report whether 95% complete within two seconds, including the fixture period, workload, environment and observed timings. The dataset demonstrates the agreed exercise population, not the assignment's future growth capacity.
10. **UI and repository checks:** Manually inspect both partner languages, English Admin, narrow/wide widths, keyboard focus, long text and large/negative amounts, loading, failed reads, zero and incomplete states. Use existing application/browser verification and update an existing journey only if the change breaks it; do not add new Playwright specs for this discovery. Run required lint, affected backend coverage, changed-package tests and documentation checks during implementation, keeping heavy suites sequential.

## Out of Scope

- Bank transfers, payout execution, a running amount owed, tax invoices, payroll and partial refunds.
- New delivered-Order refund actions, goodwill refunds, loss-bearer selection, operational corrections, Customer-responsibility recording, agent reassignment and complaint management.
- Manual financial adjustment or historical-repair interfaces, exports, configurable pricing/terms editors and new commercial policies.
- Delivery agent bonus points, funding calculations, finalization and awards; finance supplies evidence to Feature #53.
- A new Customer or Delivery agent statement surface, Danish Medusa Admin, changes to payment-provider behavior or dependency upgrades.
- A 50,000-Customer/200,000-Order generator or a claim that this verification demonstrates the assignment's projected future capacity.
- Implementation code, new implementation work items, labels representing readiness, board movements and closing the Feature as part of specification publication.

## Further Notes

The implemented [closed-statement and late-adjustment behavior](/MTGO/product/restaurant-statement-closure/) documents issue #230, its verification and the developer manual check. [Incomplete statement history](/MTGO/product/restaurant-statement-history/) documents issue #231's legacy reconciliation, evidence coverage and manual check.

This specification belongs to [Feature #52](https://github.com/DannyShayH/MTGO/issues/52), based on [discovery #223](https://github.com/DannyShayH/MTGO/issues/223) and its [agreed decisions](/MTGO/product/restaurant-statements/). The team confirmed all nineteen questions and shared understanding before invoking `/to-spec`. The team invokes `/to-tickets` separately for independently demonstrable vertical work items under #52; no new work items are created here.

The financial policy comes from [ADR-0006](/MTGO/architecture/decisions/0006-marginal-commission-and-monthly-service-fee/), with fixed statements and recovery dates in [ADR-0023](/MTGO/architecture/decisions/0023-fixed-restaurant-statements-and-later-adjustments/). Preserve [ADR-0005](/MTGO/architecture/decisions/0005-single-restaurant-orders-and-historical-facts/), [ADR-0008](/MTGO/architecture/decisions/0008-role-boundaries-and-restaurant-activation/), [ADR-0010](/MTGO/architecture/decisions/0010-commission-funded-bonuses-and-separate-feedback-ratings/), [ADR-0011](/MTGO/architecture/decisions/0011-order-failures-cancellation-and-mvp-handover/), [ADR-0014](/MTGO/architecture/decisions/0014-durable-business-state-and-auditable-corrections/), [ADR-0017](/MTGO/architecture/decisions/0017-partner-app-for-restaurant-staff-and-delivery-agents/), [ADR-0018](/MTGO/architecture/decisions/0018-english-only-medusa-admin-for-operators/) and [ADR-0021](/MTGO/architecture/decisions/0021-committed-business-milestones-have-no-compensation/).

The [recipe compatibility review](/MTGO/architecture/restaurant-recipe-review/) and [gap audit](/MTGO/architecture/restaurant-recipe-gap-audit/) remain the adaptation references. Installed Framework, Order, Payment, Admin SDK and test-runner documentation were reviewed for module boundaries, native versioned purchase amounts, refund evidence and existing integration seams. Implementation must check the exact exports and migration behavior it uses.

Operator cancellation [#199](https://github.com/DannyShayH/MTGO/issues/199) was still open in the source reviewed for specification. It has since been delivered, and [#233](https://github.com/DannyShayH/MTGO/issues/233) recognizes its prepared-food credit and zero-credit outcome through the common cancellation recognition, dated by the operator's recorded action. Native fulfillment synchronization and kitchen outcome copying may lag the authoritative handover and are not grounds for moving its financial date.

The responsibility and refund acceptance limits from discovery are intentional. Feature acceptance must name supported journeys, calculation-only evidence and deferred operational coverage separately. Publishing this specification, or delivering discovery #223, leaves Feature #52 open until the accepted business outcome and all required work items are delivered.
