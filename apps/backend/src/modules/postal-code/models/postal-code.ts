import { model } from "@medusajs/framework/utils"

/** One Danish postal code from the official register; reference data, not owned by a Restaurant. */
const PostalCode = model
  .define("postal_code", {
    id: model.id({ prefix: "pc" }).primaryKey(),
    postal_code: model.text(),
    name: model.text(),
    municipality: model.text(),
  })
  .indexes([{ on: ["postal_code"], unique: true }])

export default PostalCode
