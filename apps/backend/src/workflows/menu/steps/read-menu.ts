import {
  listDishPhotoAttachments,
  readDishPhotos,
  signDishPhotos,
} from "../../photos/read-dish-photos"
import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  QueryContext,
} from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { evaluateNewOrderEligibility } from "../../restaurants/eligibility"
import { restaurantNotFound } from "../../restaurants/steps/restaurant-exists"
import { RESTAURANT_MODULE } from "../../../modules/restaurant"
import type RestaurantModuleService from "../../../modules/restaurant/service"
import { startMenuReadTiming } from "../../../observability/menu-read-timing"
import { signedPhotoUrl } from "../../photos/signed-url"
import { loadFoodInformationTranslator } from "../food-information"
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

/** The Restaurant with its categories and dish ids; nothing when it does not exist. */
async function readRestaurantRecord(
  container: MedusaContainer,
  restaurant_id: string,
): Promise<RestaurantMenuRecord | null> {
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
  return restaurant ?? null
}

/** The ids of the Restaurant's linked dishes, published or not. */
const productIdsOf = (restaurant: RestaurantMenuRecord) =>
  (restaurant.products ?? []).flatMap((product) =>
    product ? [product.id] : [],
  )

/**
 * The valid published menu of a Restaurant record. The price is Medusa's
 * calculated DKK price, the amount a cart would charge, in display units.
 */
async function readPublishedMenuOf(
  container: MedusaContainer,
  restaurant: RestaurantMenuRecord,
): Promise<PublishedCategory[]> {
  const productIds = productIdsOf(restaurant)
  if (!productIds.length) return []
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
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
  return publishedMenuOf(
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
}

/**
 * The Restaurant with its valid published menu, read fresh; nothing when the
 * Restaurant does not exist. The price is Medusa's calculated DKK price, the
 * amount a cart would charge, in display units.
 */
export async function readRestaurantWithMenu(
  container: MedusaContainer,
  restaurant_id: string,
): Promise<{
  restaurant: RestaurantMenuRecord
  menu: PublishedCategory[]
} | null> {
  const restaurant = await readRestaurantRecord(container, restaurant_id)
  if (!restaurant) return null
  return { restaurant, menu: await readPublishedMenuOf(container, restaurant) }
}

/** Adds current owned photos only to views that expose images. */
export async function withDishPhotos(
  container: MedusaContainer,
  restaurant_id: string,
  menu: PublishedCategory[],
  includeMissing = true,
) {
  const photos = await readDishPhotos(
    container,
    restaurant_id,
    menu.flatMap(({ dishes }) => dishes.map(({ id }) => id)),
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

/** The cover photo URL; a storage outage leaves the cover out. */
async function readCover(container: MedusaContainer, restaurant_id: string) {
  const [cover] = await container
    .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    .listPhotoAttachments({ restaurant_id, kind: "cover" })
  return cover
    ? await signedPhotoUrl(container, cover.file_id)
        .then((url) => ({ url }))
        .catch(() => null)
    : null
}

/**
 * The public menu of an active Restaurant, open or closed. An inactive
 * Restaurant answers exactly like one that does not exist.
 *
 * After the Restaurant query, the dish prices and the photo records are read
 * at the same time; only the published dishes' photo URLs are signed. Each part is timed on the private exporter, and a read over one
 * second logs its breakdown (#202).
 */
export const readRestaurantMenuStep = createStep(
  "read-restaurant-menu",
  async (input: { restaurant_id: string }, { container }) => {
    const timing = startMenuReadTiming()
    const restaurant = await timing.time("restaurant", () =>
      readRestaurantRecord(container, input.restaurant_id),
    )
    if (!restaurant?.is_active) throw restaurantNotFound()
    const [menu, [attachments, cover]] = await Promise.all([
      timing.time("dish_prices", () =>
        readPublishedMenuOf(container, restaurant),
      ),
      // Listed for every linked dish: which are published is known only later.
      timing.time("photos", () =>
        Promise.all([
          listDishPhotoAttachments(
            container,
            input.restaurant_id,
            productIdsOf(restaurant),
          ),
          readCover(container, input.restaurant_id),
        ]),
      ),
    ])
    const dishes = menu.flatMap((category) => category.dishes)
    const published = new Set(dishes.map(({ id }) => id))
    const photos = await timing.time("photo_urls", () =>
      signDishPhotos(
        container,
        attachments.filter(({ resource_id }) => published.has(resource_id)),
      ),
    )
    const translateFoodInformation = await timing.time("food_information", () =>
      loadFoodInformationTranslator(container, dishes),
    )
    timing.finish(container.resolve(ContainerRegistrationKeys.LOGGER), {
      dishes: dishes.length,
      photos: dishes.filter(({ id }) => photos.get(id)).length,
    })
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
      categories: menu.map((category) => ({
        ...category,
        dishes: category.dishes.map(({ allergens, food_labels, ...dish }) => ({
          ...dish,
          photo: photos.get(dish.id) ?? null,
          food_information: translateFoodInformation({
            allergens,
            food_labels,
          }),
        })),
      })),
    })
  },
)
