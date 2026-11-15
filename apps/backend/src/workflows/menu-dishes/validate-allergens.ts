import { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import { FOOD_CATALOGUE_MODULE } from "../../modules/food-catalogue"
import FoodCatalogueModuleService from "../../modules/food-catalogue/service"
import { AllergenDeclaration } from "./validation"

/** Resolve every submitted identity against current seeded reference rows. */
export async function validateAllergens(
  container: MedusaContainer,
  declaration: AllergenDeclaration,
) {
  if (declaration.status === "unknown") return
  const entries = [...declaration.contains, ...declaration.may_contain]
  const ids = entries.map(({ allergen_id }) => allergen_id)
  const detailIds = entries.flatMap(({ detail_ids }) => detail_ids)
  const isEmpty = entries.length === 0
  const service = container.resolve<FoodCatalogueModuleService>(
    FOOD_CATALOGUE_MODULE,
  )
  const [allergens, details] = await Promise.all([
    service.listAllergens({}, { take: null }),
    service.listAllergenDetails({}, { take: null }),
  ])
  const byId = new Map(allergens.map((row) => [row.id, row]))
  const detailById = new Map(details.map((row) => [row.id, row]))
  const valid =
    declaration.none_declared === isEmpty &&
    new Set(ids).size === ids.length &&
    new Set(detailIds).size === detailIds.length &&
    entries.every(({ allergen_id, detail_ids }) => {
      const allergen = byId.get(allergen_id)
      return (
        !!allergen &&
        detail_ids.every(
          (id) => detailById.get(id)?.parent_number === allergen.number,
        )
      )
    })
  if (!valid)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "dish_allergens_invalid",
      "dish_allergens_invalid",
    )
}
