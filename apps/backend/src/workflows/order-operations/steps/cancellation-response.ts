import { StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { withResponseFields } from "../../common/response-fields"
import { ORDER_CHANGED } from "../rules"
import type { CancellationCommit } from "../cancellation"
import type { OperatorCancellationCommit } from "../operator-cancellation"
import { orderNotFound } from "./read-restaurant-orders"

/**
 * Whether this request committed the cancellation, so it alone settles, and
 * the actor it recorded, who that settlement's refund attempt belongs to.
 */
export type CancellationResult =
  | { cancelled: true; cancelled_by: string }
  | { cancelled: false; cancelled_by: null }

/**
 * The HTTP outcome of a guarded cancellation, shared by staff rejection
 * (#143), Customer cancellation (#145) and Operator cancellation (#199). A
 * refusal carries the Order as the caller may see it now (`readCurrent`), so
 * the page shows the truth; the operator's refusal carries only its code. A
 * recorded cancellation is the current outcome for a repeat.
 */
export async function cancellationStepResponse(
  result: CancellationCommit | OperatorCancellationCommit,
  readCurrent: () => Promise<Record<string, unknown>> = async () => ({}),
): Promise<StepResponse<CancellationResult>> {
  const refuse = async (code: string) =>
    withResponseFields(
      new MedusaError(
        code === ORDER_CHANGED
          ? MedusaError.Types.CONFLICT
          : MedusaError.Types.NOT_ALLOWED,
        code,
        code,
      ),
      await readCurrent(),
    )
  switch (result.outcome) {
    case "not_found":
      throw orderNotFound()
    case "refused":
      throw await refuse(result.code)
    case "changed":
      throw await refuse(ORDER_CHANGED)
    case "already_cancelled":
      return new StepResponse<CancellationResult>({
        cancelled: false,
        cancelled_by: null,
      })
    case "cancelled":
      return new StepResponse<CancellationResult>({
        cancelled: true,
        cancelled_by: result.cancelled_by,
      })
    default: {
      const unhandled: never = result
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Unhandled cancellation outcome ${String(unhandled)}`,
      )
    }
  }
}
