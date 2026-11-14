import { model } from "@medusajs/framework/utils"

const AllergenDetail = model
  .define("allergen_detail", {
    id: model.id({ prefix: "ald" }).primaryKey(),
    code: model.text(),
    parent_number: model.number(),
    name_da: model.text(),
    name_en: model.text(),
  })
  .indexes([{ on: ["code"], unique: true }])
  .checks([
    {
      name: "allergen_detail_parent",
      expression:
        "(parent_number = 1 AND code IN ('wheat', 'spelt', 'khorasan_wheat', 'rye', 'barley', 'oats', 'hybridised_cereals')) OR (parent_number = 8 AND code IN ('almond', 'hazelnut', 'walnut', 'cashew', 'pecan', 'brazil_nut', 'pistachio', 'macadamia'))",
    },
    {
      name: "allergen_detail_bilingual",
      expression: "length(trim(name_da)) > 0 AND length(trim(name_en)) > 0",
    },
  ])
export default AllergenDetail
