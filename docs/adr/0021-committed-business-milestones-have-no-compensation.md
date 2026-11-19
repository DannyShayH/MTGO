# Committed business milestones have no compensation; owed follow-up work is retried

Agreed on 19 November 2026 in issue #160. The coding standard says every workflow step that changes data has a compensation function, so a failing workflow undoes the steps before it. Some steps record a fact about the physical world or a business guarantee that [ADR-0014](/MTGO/architecture/decisions/0014-durable-business-state-and-auditable-corrections/) requires us to keep: an agent became responsible for a delivery (#157), an agent collected the food (#160). Undoing such a record because a later step failed would make the system state something untrue, or let a retry rewrite the original time. These steps are a deliberate exception to the compensation rule.

- **A step that commits an authoritative milestone has no compensation.** Today this covers the delivery assignment (`assignDeliveryStep`) and pickup (`recordPickupStep`). The step decides under the same guards as the competing actions and records the milestone at most once, so a repeated request returns the original milestone instead of writing a new one.
- **Work owed after the milestone never fails the request and is never undone.** For pickup, the native commerce fulfillment and shipment (`settleNativePickupStep`) are attempted right away. If they fail, the milestone stands and the durable record shows the work is still owed.
- **A recovery job finishes owed work from durable records only.** `recover-delivery-pickups` runs every minute and retries the native synchronization for recorded pickups that have none yet. It reads only durable state, so its first run after a restart is the startup reconciliation. Each attempt is safe to repeat.
- **Recovery and sweep steps that commit each record on its own** (Order recovery, the delivery attention sweep from #158) have no compensation for the same reason: each change is committed separately, is safe to repeat and only records what the rule decided.
- **Every other step that changes data keeps its compensation.** The exception covers only milestones that must not move and the follow-up work they own. A step does not qualify just because writing a compensation is inconvenient.

## Consequences

- The step's JSDoc says it has no compensation and why, and names the recovery that finishes its owed work.
- A milestone recorded by mistake is not rolled back by a workflow. It is corrected by an operator action with an audit history, as ADR-0014 requires. That correction is owned by the operator exception Feature (#49).
- Tests cover the repeated request (the original milestone is kept) and the recovery of owed follow-up work, not a rollback.
