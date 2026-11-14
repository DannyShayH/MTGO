import { model } from "@medusajs/framework/utils"

const FoodLabel = model
  .define("food_label", {
    id: model.id({ prefix: "flb" }).primaryKey(),
    code: model.enum(["halal", "chili", "garlic"]),
    name_da: model.text(),
    name_en: model.text(),
    description_da: model.text(),
    description_en: model.text(),
  })
  .indexes([{ on: ["code"], unique: true }])
  .checks([
    {
      name: "food_label_bilingual",
      expression:
        "length(trim(name_da)) > 0 AND length(trim(name_en)) > 0 AND length(trim(description_da)) > 0 AND length(trim(description_en)) > 0",
    },
  ])
export default FoodLabel
