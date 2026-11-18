import { MedusaContainer } from "@medusajs/framework/types"
import { FOOD_CATALOGUE_MODULE } from "../../modules/food-catalogue"
import type FoodCatalogueModuleService from "../../modules/food-catalogue/service"
import type {
  AllergenDeclaration,
  FoodLabelDeclaration,
} from "./published-menu"

export type Bilingual = { da: string; en: string }

/** A food label is declared yes or no, or stays unknown. */
export type FoodLabelState = "yes" | "no" | "unknown"

/** An allergen group by its stable Annex II number and code, with any specific types. */
export type DeclaredAllergen = {
  number: number
  code: string
  name: Bilingual
  details: { code: string; name: Bilingual }[]
}

/**
 * A dish's declarations in catalogue terms. Unknown allergens stay `unknown`,
 * never an empty declaration; each catalogue label is `unknown` until declared.
 */
export type FoodInformation = {
  allergens:
    | { status: "unknown" }
    | {
        status: "supplied"
        contains: DeclaredAllergen[]
        may_contain: DeclaredAllergen[]
        none_declared: boolean
      }
  labels: {
    code: string
    name: Bilingual
    description: Bilingual
    state: FoodLabelState
  }[]
}

/**
 * Reads the fixed allergen catalogue once and returns a translator from a
 * dish's stored declaration ids to the catalogue's stable codes and names.
 */
export async function loadFoodInformationTranslator(
  container: MedusaContainer,
) {
  const service = container.resolve<FoodCatalogueModuleService>(
    FOOD_CATALOGUE_MODULE,
  )
  const [allergens, details, labels] = await Promise.all([
    service.listAllergens({}, { take: null, order: { number: "ASC" } }),
    service.listAllergenDetails({}, { take: null }),
    service.listFoodLabels({}, { take: null }),
  ])
  const allergenById = new Map(allergens.map((row) => [row.id, row]))
  const detailById = new Map(details.map((row) => [row.id, row]))
  const translate = (
    entries: { allergen_id: string; detail_ids: string[] }[],
  ): DeclaredAllergen[] =>
    entries
      .flatMap(({ allergen_id, detail_ids }) => {
        const row = allergenById.get(allergen_id)
        return row
          ? [
              {
                number: row.number,
                code: row.code,
                name: { da: row.name_da, en: row.name_en },
                details: detail_ids.flatMap((id) => {
                  const detail = detailById.get(id)
                  return detail
                    ? [
                        {
                          code: detail.code,
                          name: { da: detail.name_da, en: detail.name_en },
                        },
                      ]
                    : []
                }),
              },
            ]
          : []
      })
      .sort((a, b) => a.number - b.number)

  return (dish: {
    allergens: AllergenDeclaration
    food_labels: FoodLabelDeclaration
  }): FoodInformation => ({
    allergens:
      dish.allergens.status === "unknown"
        ? { status: "unknown" }
        : {
            status: "supplied",
            contains: translate(dish.allergens.contains),
            may_contain: translate(dish.allergens.may_contain),
            none_declared: dish.allergens.none_declared,
          },
    labels: labels.map((label) => ({
      code: label.code,
      name: { da: label.name_da, en: label.name_en },
      description: { da: label.description_da, en: label.description_en },
      state:
        (dish.food_labels ?? []).find(
          ({ food_label_id }) => food_label_id === label.id,
        )?.state ?? "unknown",
    })),
  })
}
