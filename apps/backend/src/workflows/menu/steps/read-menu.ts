import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  QueryContext,
} from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { evaluateNewOrderEligibility } from "../../restaurants/eligibility"
import { restaurantNotFound } from "../../restaurants/steps/restaurant-exists"
import { FOOD_CATALOGUE_MODULE } from "../../../modules/food-catalogue"
import { RESTAURANT_MODULE } from "../../../modules/restaurant"
import type RestaurantModuleService from "../../../modules/restaurant/service"
import { signedPhotoUrl } from "../../photos/signed-url"
import FoodCatalogueModuleService from "../../../modules/food-catalogue/service"
import {
  MENU_CURRENCY,
  MenuCategoryRecord,
  MenuProductRecord,
  PublishedCategory,
  publishedMenuOf,
} from "../published-menu"

type RestaurantMenuRecord = {
  id: string
  name: string
  is_active: boolean
  is_open: boolean
  delivery_area_postal_codes?: { postal_code: string }[]
  menu_categories?: MenuCategoryRecord[]
  products?: ({ id: string } | null)[]
}

/**
 * The Restaurant with its valid published menu, read fresh; nothing when the
 * Restaurant does not exist. The price is Medusa's calculated DKK price, the
 * amount a cart would charge, in display units.
 */
async function readRestaurantWithMenu(
  container: MedusaContainer,
  restaurant_id: string,
): Promise<{
  restaurant: RestaurantMenuRecord
  menu: PublishedCategory[]
} | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "restaurant",
    fields: [
      "id",
      "name",
      "is_active",
      "is_open",
      "delivery_area_postal_codes.postal_code",
      "menu_categories.*",
      "products.id",
    ],
    filters: { id: restaurant_id },
  })
  // The links' generated query types exist only after a build, so the shape is stated here.
  const [restaurant] = data as unknown as RestaurantMenuRecord[]
  if (!restaurant) return null
  const productIds = (restaurant.products ?? []).flatMap((product) =>
    product ? [product.id] : [],
  )
  if (!productIds.length) return { restaurant, menu: [] }
  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "status",
      "menu_dish.*",
      "variants.id",
      "variants.calculated_price.*",
    ],
    filters: { id: productIds },
    context: {
      variants: {
        calculated_price: QueryContext({ currency_code: MENU_CURRENCY }),
      },
    },
  })
  const menu = publishedMenuOf(
    restaurant.menu_categories ?? [],
    (
      products as unknown as (MenuProductRecord & {
        menu_dish?: { category_id: string }
      })[]
    ).map((product) => ({
      ...product,
      menu_category: product.menu_dish
        ? { id: product.menu_dish.category_id }
        : null,
    })),
  )
  return {
    restaurant,
    menu,
  }
}

/** Adds current owned photos only to views that expose images. */
export async function withDishPhotos(
  container: MedusaContainer,
  restaurant_id: string,
  menu: PublishedCategory[],
  includeMissing = true,
) {
  const attachments = await container
    .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    .listPhotoAttachments({ restaurant_id, kind: "dish" }, { take: null })
  const photos = new Map(
    await Promise.all(
      attachments.map(
        async ({ resource_id, file_id }) =>
          [
            resource_id,
            await signedPhotoUrl(container, file_id)
              .then((url) => ({ url }))
              .catch(() => null),
          ] as const,
      ),
    ),
  )
  return menu.map((category) => ({
    ...category,
    dishes: category.dishes.map((dish) => {
      const photo = photos.get(dish.id) ?? null
      return photo || includeMissing ? { ...dish, photo } : dish
    }),
  }))
}

/** The valid published menu that activation readiness counts and Customers see. */
export async function readPublishedMenu(
  container: MedusaContainer,
  restaurant_id: string,
): Promise<PublishedCategory[]> {
  return (await readRestaurantWithMenu(container, restaurant_id))?.menu ?? []
}

/**
 * The public menu of an active Restaurant, open or closed. An inactive
 * Restaurant answers exactly like one that does not exist.
 */
export const readRestaurantMenuStep = createStep(
  "read-restaurant-menu",
  async (input: { restaurant_id: string }, { container }) => {
    const found = await readRestaurantWithMenu(container, input.restaurant_id)
    if (!found?.restaurant.is_active) throw restaurantNotFound()
    const { restaurant, menu } = found
    const restaurantService =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    const [menuWithPhotos, covers] = await Promise.all([
      withDishPhotos(container, input.restaurant_id, menu),
      restaurantService.listPhotoAttachments({
        restaurant_id: input.restaurant_id,
        kind: "cover",
      }),
    ])
    const cover = covers[0]
      ? await signedPhotoUrl(container, covers[0].file_id)
          .then((url) => ({ url }))
          .catch(() => null)
      : null
    const service = container.resolve<FoodCatalogueModuleService>(
      FOOD_CATALOGUE_MODULE,
    )
    const [allergens, details, labels] = await Promise.all([
      service.listAllergens({}, { take: null, order: { number: "ASC" } }),
      service.listAllergenDetails({}, { take: null }),
      service.listFoodLabels({}, { take: null }),
    ])
    const byId = new Map(allergens.map((row) => [row.id, row]))
    const detailById = new Map(details.map((row) => [row.id, row]))
    const translate = (
      entries: { allergen_id: string; detail_ids: string[] }[],
    ) =>
      entries
        .flatMap(({ allergen_id, detail_ids }) => {
          const row = byId.get(allergen_id)
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
    return new StepResponse({
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        cover,
        is_open: restaurant.is_open,
        ...evaluateNewOrderEligibility({
          is_active: restaurant.is_active,
          is_open: restaurant.is_open,
          delivery_postal_codes: (
            restaurant.delivery_area_postal_codes ?? []
          ).map(({ postal_code }) => postal_code),
        }),
      },
      categories: menuWithPhotos.map((category) => ({
        ...category,
        dishes: category.dishes.map(
          ({ allergens: declaration, food_labels, ...dish }) => ({
            ...dish,
            photo: dish.photo ?? null,
            food_information: {
              allergens:
                declaration.status === "unknown"
                  ? { status: "unknown" as const }
                  : {
                      status: "supplied" as const,
                      contains: translate(declaration.contains),
                      may_contain: translate(declaration.may_contain),
                      none_declared: declaration.none_declared,
                    },
              labels: labels.map((label) => {
                const declaration = (food_labels ?? []).find(
                  ({ food_label_id }) => food_label_id === label.id,
                )
                return {
                  code: label.code,
                  name: { da: label.name_da, en: label.name_en },
                  description: {
                    da: label.description_da,
                    en: label.description_en,
                  },
                  state: declaration?.state ?? ("unknown" as const),
                }
              }),
            },
          }),
        ),
      })),
    })
  },
)
