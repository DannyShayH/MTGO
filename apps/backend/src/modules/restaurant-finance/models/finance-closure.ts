import { model } from "@medusajs/framework/utils"

/** One immutable boundary snapshot, including fixed membership and warnings. */
const FinanceClosure = model
  .define("finance_closure", {
    id: model.id({ prefix: "fclose" }).primaryKey(),
    restaurant_id: model.text(),
    month: model.text(),
    starts_at: model.dateTime(),
    ends_at: model.dateTime(),
    snapshot: model.json(),
  })
  .indexes([{ on: ["restaurant_id", "month"], unique: true }])

export default FinanceClosure
