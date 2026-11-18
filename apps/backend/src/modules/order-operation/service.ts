import type { Context } from "@medusajs/framework/types"
import {
  BigNumber,
  InjectManager,
  InjectTransactionManager,
  MedusaContext,
  MedusaService,
} from "@medusajs/framework/utils"
import OrderOperation, {
  type CancellationCategory,
} from "./models/order-operation"
import PurchaseReview from "./models/purchase-review"
import RefundObligation from "./models/refund-obligation"

export type CancellationCommand = {
  /** The record and the revision and state the caller decided on. */
  id: string
  order_id: string
  revision: number
  cancelled_at: Date
  cancelled_by: string
  category: CancellationCategory
  note: string | null
  /** The full refund owed, or null when nothing was captured. */
  refund: {
    payment_id: string
    /** Medusa monetary value as a decimal string, never float arithmetic. */
    amount: string
    currency_code: string
  } | null
}

class OrderOperationModuleService extends MedusaService({
  OrderOperation,
  PurchaseReview,
  RefundObligation,
}) {
  /**
   * Commits a business cancellation and its full-refund obligation together
   * (#143), before any provider is contacted. The update's selector repeats
   * the revision and awaiting state the caller read, so a stale decision
   * writes nothing and returns false. The obligation's unique `order_id`
   * keeps a second cancellation from owing a second refund.
   */
  @InjectManager()
  @InjectTransactionManager()
  async cancelWithRefundObligation(
    command: CancellationCommand,
    @MedusaContext() context: Context = {},
  ): Promise<boolean> {
    const updated = await this.updateOrderOperations(
      {
        selector: {
          id: command.id,
          revision: command.revision,
          state: "awaiting_acceptance",
        },
        data: {
          state: "cancelled",
          cancelled_at: command.cancelled_at,
          cancelled_by: command.cancelled_by,
          cancellation_category: command.category,
          cancellation_note: command.note,
          revision: command.revision + 1,
        },
      },
      context,
    )
    if (!updated.length) return false
    if (command.refund)
      await this.createRefundObligations(
        {
          order_id: command.order_id,
          payment_id: command.refund.payment_id,
          // Exact decimal: the generated input type says `number`, but a
          // bigNumber property stores a BigNumber without float rounding.
          amount: new BigNumber(command.refund.amount) as unknown as number,
          currency_code: command.refund.currency_code,
          // Stable for the Order's one obligation: every attempt sends it.
          idempotency_key: `mtogo-full-refund:${command.order_id}`,
        },
        context,
      )
    return true
  }
}

export default OrderOperationModuleService
