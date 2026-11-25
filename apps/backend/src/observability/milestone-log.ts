import { createLogRecord, type LogEvent, type LogFields } from "@dtc/logging"
import type { MedusaContainer } from "@medusajs/framework/types"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { writeRecord } from "./write-record"

export type MilestoneEvent = Extract<
  LogEvent,
  `order.${string}` | `delivery.${string}`
>

/** The opaque references one milestone names (ADR-0019, #247). */
export type Milestone = Pick<
  LogFields,
  "order_id" | "restaurant_id" | "actor_type" | "actor_id" | "category"
>

const ACTOR_TYPES: [prefix: string, type: string][] = [
  ["user_", "user"],
  ["apk_", "api_key"],
  ["rstf_", "restaurant_staff"],
  ["dagt_", "delivery_agent"],
]

/**
 * Who a milestone names, from the recorded actor's id: the type always, the id
 * for everyone but a Customer. An id of unknown kind might be a Customer's, so
 * it is not named either.
 */
export function milestoneActor(
  id: string,
): Pick<Milestone, "actor_type" | "actor_id"> {
  if (id === "system") return { actor_type: "system", actor_id: id }
  if (id.startsWith("cus_")) return { actor_type: "customer" }
  const match = ACTOR_TYPES.find(([prefix]) => id.startsWith(prefix))
  return match
    ? { actor_type: match[1], actor_id: id }
    : { actor_type: "unknown" }
}

/**
 * One business milestone as a safe log record, so an Order can be followed by
 * its ID. The database stays the only authority: a record can be lost, and
 * nothing may count Orders from records. Call it only for a milestone that was
 * just committed and can no longer be undone, never for a repeated request.
 * Workflows carry no request ID, so records correlate by Order. It never
 * throws: a failed record must not undo or interrupt business work.
 */
export function logMilestone(
  container: MedusaContainer,
  event: MilestoneEvent,
  milestone: Milestone,
) {
  try {
    writeRecord(container, createLogRecord("backend", event, milestone))
  } catch {
    // Best effort (ADR-0019): the database has the milestone.
  }
}

/**
 * Logs a milestone whose write has a compensation. It must be the workflow's
 * last step, so no later failure can undo what the record says. Without a
 * milestone (a repeated request) it logs nothing. It changes no data, so it
 * needs no compensation.
 */
export const logMilestoneStep = createStep(
  "log-milestone",
  async (
    input: { event: MilestoneEvent; milestone: Milestone | null },
    { container },
  ) => {
    if (input.milestone) logMilestone(container, input.event, input.milestone)
    return new StepResponse(undefined)
  },
)
