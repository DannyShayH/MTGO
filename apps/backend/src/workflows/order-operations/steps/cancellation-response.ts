import { StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { withResponseFields } from "../../common/response-fields"
import { ORDER_CHANGED } from "../rules"
import type { CancellationCommit } from "../cancellation"
import { orderNotFound } from "./read-restaurant-orders"

/** Whether this request committed the cancellation, so it alone settles. */
export type CancellationResult = { cancelled: boolean }

/**
 * The HTTP outcome of a guarded pre-acceptance cancellation, shared by staff
 * rejection (#143) and Customer cancellation (#145). A refusal carries the
 * Order as the caller may see it now (`readCurrent`), so the page shows the
 * truth; a recorded cancellation is the current outcome for a repeat.
 */
export async function cancellationStepResponse(
  result: CancellationCommit,
  readCurrent: () => Promise<Record<string, unknown>>,
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
      return new StepResponse({ cancelled: false })
    case "cancelled":
      return new StepResponse({ cancelled: true })
    default: {
      const unhandled: never = result
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Unhandled cancellation outcome ${String(unhandled)}`,
      )
    }
  }
}
