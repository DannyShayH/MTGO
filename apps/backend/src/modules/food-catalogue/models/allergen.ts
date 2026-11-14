import catalogue from "../data/catalogue.json"
import { model } from "@medusajs/framework/utils"

const Allergen = model
  .define("allergen", {
    id: model.id({ prefix: "alg" }).primaryKey(),
    code: model.text(),
    number: model.number(),
    name_da: model.text(),
    name_en: model.text(),
    description_da: model.text(),
    description_en: model.text(),
  })
  .indexes([
    { on: ["code"], unique: true },
    { on: ["number"], unique: true },
  ])
  .checks([
    {
      name: "allergen_code_number",
      expression: catalogue.allergens
        .map((row) => `(code = '${row.code}' AND number = ${row.number})`)
        .join(" OR "),
    },
    { name: "allergen_number_range", expression: "number BETWEEN 1 AND 14" },
    {
      name: "allergen_bilingual",
      expression:
        "length(trim(name_da)) > 0 AND length(trim(name_en)) > 0 AND length(trim(description_da)) > 0 AND length(trim(description_en)) > 0",
    },
  ])
export default Allergen
