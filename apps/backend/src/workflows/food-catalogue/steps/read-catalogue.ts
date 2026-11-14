import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { FOOD_CATALOGUE_MODULE } from "../../../modules/food-catalogue"
import FoodCatalogueModuleService from "../../../modules/food-catalogue/service"

type BilingualName = { name_da: string; name_en: string }
const name = (row: BilingualName) => ({ da: row.name_da, en: row.name_en })
const description = (row: {
  description_da: string
  description_en: string
}) => ({ da: row.description_da, en: row.description_en })

export const readFoodCatalogueStep = createStep(
  "read-food-catalogue",
  async (_input: { staff?: { id: string } }, { container }) => {
    const service = container.resolve<FoodCatalogueModuleService>(
      FOOD_CATALOGUE_MODULE,
    )
    const [allergens, details, labels] = await Promise.all([
      service.listAllergens({}, { take: null, order: { number: "ASC" } }),
      service.listAllergenDetails({}, { take: null, order: { code: "ASC" } }),
      service.listFoodLabels(
        {},
        { take: null, order: { created_at: "ASC", code: "ASC" } },
      ),
    ])
    const food_labels = ["halal", "chili", "garlic"]
      .flatMap((code) => labels.filter((row) => row.code === code))
      .map((row) => ({
        id: row.id,
        code: row.code,
        name: name(row),
        description: description(row),
      }))
    return new StepResponse({
      allergens: allergens.map((row) => ({
        id: row.id,
        code: row.code,
        number: row.number,
        name: name(row),
        description: description(row),
        details: details
          .filter((detail) => detail.parent_number === row.number)
          .map((detail) => ({
            id: detail.id,
            code: detail.code,
            name: name(detail),
          })),
      })),
      food_labels,
    })
  },
)
