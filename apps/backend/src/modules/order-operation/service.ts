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
  type OrderOperationState,
} from "./models/order-operation"
import FoodCredit from "./models/food-credit"
import PurchaseReview from "./models/purchase-review"
import RefundObligation from "./models/refund-obligation"

export type CancellationCommand = {
  /** The record and the revision and state the caller decided on. */
  id: string
  order_id: string
  revision: number
  /** The state the decision was made in, repeated by the guarded write. */
  state: OrderOperationState
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
  /** The prepared-food credit owed with this cancellation (#162), if any. */
  food_credit?: {
    restaurant_id: string
    /** Exact decimal string, excluding VAT. */
    amount: string
    currency_code: string
    reason: CancellationCategory
    preparation_started_at: Date
    ready_at: Date | null
  } | null
}

class OrderOperationModuleService extends MedusaService({
  OrderOperation,
  PurchaseReview,
  RefundObligation,
  FoodCredit,
}) {
  /**
   * Commits a business cancellation, its full-refund obligation and any
   * prepared-food credit together (#143, #162), before any provider is
   * contacted. The update's selector repeats the revision and state the
   * caller read, so a stale decision writes nothing and returns false. The
   * unique `order_id` of each obligation keeps a second cancellation from
   * owing a second refund or credit.
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
          state: command.state,
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
    if (command.food_credit)
      await this.createFoodCredits(
        {
          order_id: command.order_id,
          ...command.food_credit,
          amount: new BigNumber(
            command.food_credit.amount,
          ) as unknown as number,
          commission_amount: new BigNumber(0) as unknown as number,
          funded_by: "mtogo",
        },
        context,
      )
    return true
  }
}

export default OrderOperationModuleService
