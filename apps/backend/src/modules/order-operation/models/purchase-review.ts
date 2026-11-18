import { model } from "@medusajs/framework/utils"

/**
 * The kitchen facts of a cart's last server-validated purchase review: per
 * dish, the bilingual name and declarations at the revision the Customer
 * reviewed. Replaced on each review until the cart completes; placement copies
 * it onto the Order's record, so a delayed placement never rereads the menu.
 */
const PurchaseReview = model
  .define("purchase_review", {
    id: model.id({ prefix: "purrev" }).primaryKey(),
    cart_id: model.text(),
    items: model.json(),
    reviewed_at: model.dateTime(),
  })
  .indexes([{ on: ["cart_id"], unique: true }])

export default PurchaseReview
