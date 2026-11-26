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
    /**
     * What Earnings adds up from this statement (#256), written with the
     * snapshot so a closed month is read without its entries. Closures stored
     * before it existed have none; they are read from the snapshot instead.
     */
    summary: model.json().nullable(),
  })
  .indexes([{ on: ["restaurant_id", "month"], unique: true }])

export default FinanceClosure
