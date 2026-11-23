import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  listOpenRefunds,
  type ListOpenRefundsInput,
  retryFullRefund,
} from "../refunds"

/** One page of the operator's open full refunds (#198). Reads only. */
export const listOpenRefundsStep = createStep(
  "list-open-refunds",
  async (input: ListOpenRefundsInput, { container }) =>
    new StepResponse(await listOpenRefunds(container, input)),
)

/**
 * An operator's guarded retry of a failed full refund (#198). Deliberately
 * no compensation (ADR-0021): an attempt that reached the provider is
 * history, and each write is committed on its own and safe to repeat. An
 * obligation left `pending` by an interrupted attempt is finished by the
 * `recover-order-operations` job.
 */
export const retryFullRefundStep = createStep(
  "retry-full-refund",
  async (input: { order_id: string; actor_id: string }, { container }) =>
    new StepResponse(await retryFullRefund(container, input)),
)
