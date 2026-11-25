import { model } from "@medusajs/framework/utils"

/**
 * The one service-fee obligation of a Restaurant's Copenhagen month (#228;
 * spec #52 §6), unique per Restaurant and month. It accrues while the month
 * is current: each accrual replaces its active dates and the monthly amount
 * rounded once from them, so repeated accrual never adds another obligation
 * or a sum of rounded daily fees. Nothing accrues it after its month ended;
 * a later verified difference becomes a linked adjustment (#230).
 */
const FinanceServiceFee = model
  .define("finance_service_fee", {
    id: model.id({ prefix: "ffee" }).primaryKey(),
    restaurant_id: model.text(),
    month: model.text(),
    terms_version: model.text(),
    currency_code: model.text(),
    /** The full monthly policy amount, DKK excluding VAT. */
    policy_amount: model.bigNumber(),
    month_day_count: model.number(),
    /** Each distinct active Copenhagen date, `YYYY-MM-DD`, oldest first. */
    active_dates: model.json(),
    active_date_count: model.number(),
    /** policy_amount x active_date_count / month_day_count, rounded once. */
    amount: model.bigNumber(),
    accrued_at: model.dateTime(),
  })
  .indexes([{ on: ["restaurant_id", "month"], unique: true }])

export default FinanceServiceFee
