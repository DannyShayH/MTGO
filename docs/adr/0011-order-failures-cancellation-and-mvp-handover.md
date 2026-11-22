# Bound delivery failures and distinguish cancellation responsibility

Agreed on 11 November 2026 in the issue #10 domain review. An accepted Order still unassigned after ten minutes alerts an MTOGO operator; after thirty minutes it is cancelled if still unassigned, with a full Customer refund. Both periods run from Restaurant acceptance. MTOGO carries the loss of food already prepared because delivery capacity is its responsibility; ADR-0006 records the full food-value credit excluding VAT and no commission for this failure.

Customers may cancel themselves before Restaurant acceptance with a full refund. After acceptance, cancellation requires an operator: before preparation starts the operator can cancel with a full refund; after preparation starts a change of mind has no automatic refund, though an operator can grant an exception with a recorded reason. Restaurant inability to fulfil requires a full refund.

Delivery is confirmed only after handover to the Customer or their designated recipient. An unreachable Customer triggers contact attempts and operator escalation after ten minutes at the destination, never a false delivered status. Customer-caused failed handover has no automatic refund; MTOGO-caused failure requires a full refund. Operators may correct mistakes with a reason while preserving original events and the identity of the person making the correction. Releasing or reassigning an agent's delivery is outside the MVP, before and after pickup, by explicit team choice.

Assigned work alerts an operator after thirty minutes from Restaurant acceptance without pickup, or thirty minutes from pickup without delivery. These are attention thresholds, not promised delivery times or automatic cancellation. The operator investigates and records continued work or failure under the responsibility and refund rules. A payment outcome still uncertain after five minutes also needs operator attention, without charging again or treating uncertainty as a conclusive failure.

## Discovery #152 revision

On 18 November 2026 the team extended the unassigned claim and cancellation deadline from twenty to thirty minutes after Restaurant acceptance. The ten-minute operator alert stays. At the thirty-minute boundary an unassigned delivery can no longer be claimed and is cancelled even if a background recovery job has not run yet. A successful claim before the deadline prevents unassigned cancellation. Full Customer refund and prepared-food credit rules remain. The separate thirty-minute attention threshold for assigned work without pickup remains an alert, not automatic cancellation.

## Discovery #196 revision

On 22 November 2026 the team kept Feature #49 deliberately small. Operators get one Operator cancellation, always with a Full refund and a required reason, for accepted, unfinished Orders; when preparation had started, MTOGO funds the prepared-food credit as for unassigned cancellation. Operators can see and retry failed full refunds, and every attempt records who triggered it. Delivery agents can file one Problem report per active delivery, which only raises operator attention. Corrections of recorded mistakes, goodwill refunds with a recorded loss bearer, cancellation without refund and the five-minute uncertain-payment attention are deferred from the MVP. The rules above still describe the business; the MVP implements only part of them.
