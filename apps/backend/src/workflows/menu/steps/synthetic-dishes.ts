import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { monotonicFactory } from "ulid"
import { RESTAURANT_MODULE } from "../../../modules/restaurant"
import RestaurantModuleService from "../../../modules/restaurant/service"
import { assertRestaurantExists } from "../../restaurants/steps/restaurant-exists"

const nextId = monotonicFactory()

type Bilingual = { da: string; en: string }

export type SyntheticDish = {
  /** Unique product handle; the seed uses it to recognize a repeated run. */
  handle: string
  name: Bilingual
  description?: Bilingual
  /** Display-unit DKK including VAT and delivery. */
  price: number
  is_sold_out?: boolean
}

export type SyntheticCategory = {
  name: Bilingual
  dishes: SyntheticDish[]
}

/** Appends the categories to the Restaurant's own list. Caller holds the Restaurant lock. */
export const createSyntheticCategoriesStep = createStep(
  "create-synthetic-categories",
  async (
    input: { restaurant_id: string; categories: SyntheticCategory[] },
    { container },
  ) => {
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    await assertRestaurantExists(service, input.restaurant_id)
    const [last] = await service.listMenuCategories(
      { restaurant_id: input.restaurant_id },
      { order: { position: "DESC" }, take: 1 },
    )
    const first = (last?.position ?? -1) + 1
    const occurred_at = new Date().toISOString()
    const created = await service.createMenuCategories(
      input.categories.map(({ name }, index) => {
        const id = `mcat_${nextId()}`
        return {
          id,
          restaurant_id: input.restaurant_id,
          name_da: name.da,
          name_en: name.en,
          revision: 1,
          position: first + index,
          request_id: `synthetic-${id}`,
          creation_name: name,
          history: {
            entries: [
              {
                kind: "create",
                actor_id: "synthetic_seed",
                actor_name: "Synthetic seed",
                occurred_at,
                name,
              },
            ],
          },
        }
      }),
    )
    const ids = created.map(({ id }) => id)
    return new StepResponse(ids, ids)
  },
  async (ids, { container }) => {
    if (ids?.length)
      await container
        .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
        .deleteMenuCategories(ids)
  },
)

/** One dish content record per dish, in input order, positioned within its category. */
export const createSyntheticDishContentStep = createStep(
  "create-synthetic-dish-content",
  async (
    input: { categories: SyntheticCategory[]; category_ids: string[] },
    { container },
  ) => {
    const created = await container
      .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
      .createMenuDishes(
        input.categories.flatMap(({ dishes }, categoryIndex) =>
          dishes.map((dish, position) => ({
            id: `mdsh_${nextId()}`,
            name_da: dish.name.da,
            name_en: dish.name.en,
            description_da: dish.description?.da ?? null,
            description_en: dish.description?.en ?? null,
            is_sold_out: dish.is_sold_out ?? false,
            position,
            category_id: input.category_ids[categoryIndex],
            revision: 1,
            published_price: String(dish.price),
          })),
        ),
      )
    const ids = created.map(({ id }) => id)
    return new StepResponse(ids, ids)
  },
  async (ids, { container }) => {
    if (ids?.length)
      await container
        .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
        .deleteMenuDishes(ids)
  },
)
