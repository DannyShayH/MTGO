import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { FOOD_CATALOGUE_MODULE } from "../../../modules/food-catalogue"
import FoodCatalogueModuleService from "../../../modules/food-catalogue/service"
import catalogue from "../../../modules/food-catalogue/data/catalogue.json"

// Separate steps let the workflow compensate earlier tables if a later insert fails.
export const seedAllergensStep = createStep(
  "seed-allergens",
  async (_, { container }) => {
    const service = container.resolve<FoodCatalogueModuleService>(
      FOOD_CATALOGUE_MODULE,
    )
    const existing = await service.listAllergens({}, { take: null })
    const codes = new Set<string>(existing.map((row) => row.code))
    const rows = catalogue.allergens.filter((row) => !codes.has(row.code))
    const created = rows.length ? await service.createAllergens(rows) : []
    return new StepResponse(
      { seeded: true },
      created.map((row) => row.id),
    )
  },
  async (ids, { container }) => {
    if (ids?.length)
      await container
        .resolve<FoodCatalogueModuleService>(FOOD_CATALOGUE_MODULE)
        .deleteAllergens(ids)
  },
)

export const seedAllergenDetailsStep = createStep(
  "seed-allergen-details",
  async (_input: { seeded: boolean }, { container }) => {
    const service = container.resolve<FoodCatalogueModuleService>(
      FOOD_CATALOGUE_MODULE,
    )
    const existing = await service.listAllergenDetails({}, { take: null })
    const codes = new Set<string>(existing.map((row) => row.code))
    const rows = catalogue.details.filter((row) => !codes.has(row.code))
    const created = rows.length ? await service.createAllergenDetails(rows) : []
    return new StepResponse(
      { seeded: true },
      created.map((row) => row.id),
    )
  },
  async (ids, { container }) => {
    if (ids?.length)
      await container
        .resolve<FoodCatalogueModuleService>(FOOD_CATALOGUE_MODULE)
        .deleteAllergenDetails(ids)
  },
)

export const seedFoodLabelsStep = createStep(
  "seed-food-labels",
  async (_input: { seeded: boolean }, { container }) => {
    const service = container.resolve<FoodCatalogueModuleService>(
      FOOD_CATALOGUE_MODULE,
    )
    const existing = await service.listFoodLabels({}, { take: null })
    const codes = new Set<string>(existing.map((row) => row.code))
    const rows = catalogue.food_labels
      .filter((row) => !codes.has(row.code))
      .map((row) => ({
        ...row,
        code: row.code as "halal" | "chili" | "garlic",
      }))
    const created = rows.length ? await service.createFoodLabels(rows) : []
    return new StepResponse(
      { seeded: true },
      created.map((row) => row.id),
    )
  },
  async (ids, { container }) => {
    if (ids?.length)
      await container
        .resolve<FoodCatalogueModuleService>(FOOD_CATALOGUE_MODULE)
        .deleteFoodLabels(ids)
  },
)
