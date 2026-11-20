import { model } from "@medusajs/framework/utils"

/** Who bears the prepared-food loss (ADR-0006). Only MTOGO-funded credits exist so far. */
export const FOOD_CREDIT_FUNDERS = ["mtogo"] as const

/**
 * The durable food-credit obligation to a Restaurant for an Order (#162;
 * ADR-0006, ADR-0011). It is committed with the cancellation that owes it, so
 * a retry or recovery never creates a second one (unique `order_id`). It
 * keeps the preparation evidence that justified it, the full food value
 * excluding VAT and no commission, for the later monthly statements (#52).
 * It is not a bank payout.
 */
const FoodCredit = model
  .define("food_credit", {
    id: model.id({ prefix: "fcred" }).primaryKey(),
    order_id: model.text(),
    restaurant_id: model.text(),
    /** Full purchased food value excluding VAT, in Medusa's monetary units. */
    amount: model.bigNumber(),
    currency_code: model.text(),
    /** Commission on this outcome: none (ADR-0006). */
    commission_amount: model.bigNumber(),
    funded_by: model.enum([...FOOD_CREDIT_FUNDERS]),
    /** The cancellation category that owes it. */
    reason: model.text(),
    /** The preparation evidence (#146) copied at cancellation. */
    preparation_started_at: model.dateTime(),
    ready_at: model.dateTime().nullable(),
  })
  .indexes([
    { on: ["order_id"], unique: true },
    { on: ["restaurant_id", "created_at"] },
  ])

export default FoodCredit
