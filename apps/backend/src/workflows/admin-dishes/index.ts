import { readRestaurantWithMenu, withDishPhotos } from "../menu/steps/read-menu"
import { restaurantNotFound } from "../restaurants/steps/restaurant-exists"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { readDishPhotos } from "../photos/read-dish-photos"

type DishProduct = {
  id: string
  restaurant?: { id: string; name: string } | null
  menu_dish?: {
    name_da: string
    name_en: string
    description_da: string | null
    description_en: string | null
    is_sold_out: boolean
    category?: {
      id: string
      restaurant_id: string
      name_da: string
      name_en: string
    } | null
  } | null
}

type DishResponse = {
  dish: {
    restaurant: { id: string; name: string }
    category: { id: string; name: { da: string; en: string } }
    name: { da: string; en: string }
    description: { da: string | null; en: string | null } | null
    is_sold_out: boolean
    photo: { url: string } | null
  } | null
}

const readAdminDishStep = createStep(
  "read-admin-dish",
  async (input: { product_id: string }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "restaurant.id",
        "restaurant.name",
        "menu_dish.name_da",
        "menu_dish.name_en",
        "menu_dish.description_da",
        "menu_dish.description_en",
        "menu_dish.is_sold_out",
        "menu_dish.category.id",
        "menu_dish.category.restaurant_id",
        "menu_dish.category.name_da",
        "menu_dish.category.name_en",
      ],
      filters: { id: input.product_id },
    })
    const [product] = data as unknown as DishProduct[]
    if (!product)
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "product_not_found")
    const content = product.menu_dish
    const restaurant = product.restaurant
    const category = content?.category
    if (
      !content ||
      !restaurant ||
      !category ||
      category.restaurant_id !== restaurant.id
    )
      return new StepResponse<DishResponse>({ dish: null })
    const photos = await readDishPhotos(container, restaurant.id, [product.id])
    const photo = photos.get(product.id) ?? null
    return new StepResponse<DishResponse>({
      dish: {
        restaurant,
        category: {
          id: category.id,
          name: { da: category.name_da, en: category.name_en },
        },
        name: { da: content.name_da, en: content.name_en },
        description:
          content.description_da !== null || content.description_en !== null
            ? { da: content.description_da, en: content.description_en }
            : null,
        is_sold_out: content.is_sold_out,
        photo,
      },
    })
  },
)

/** Operator inspection includes inactive Restaurants; no public-menu eligibility filter. */
export const readAdminDishWorkflow = createWorkflow(
  "read-admin-dish",
  function (input: { product_id: string }) {
    return new WorkflowResponse(readAdminDishStep(input))
  },
)

const readAdminRestaurantMenuStep = createStep(
  "read-admin-restaurant-menu",
  async (input: { restaurant_id: string }, { container }) => {
    const result = await readRestaurantWithMenu(container, input.restaurant_id)
    if (!result) throw restaurantNotFound()
    const categories = await withDishPhotos(
      container,
      input.restaurant_id,
      result.menu,
    )
    return new StepResponse({
      restaurant_id: input.restaurant_id,
      categories: categories.map(({ id, name, dishes }) => ({
        id,
        name,
        dishes: dishes.map(({ id, name, price, is_sold_out, photo }) => ({
          id,
          name,
          price,
          is_sold_out,
          photo: photo ?? null,
        })),
      })),
    })
  },
)

/** Read the owning Restaurant's published dishes even when the Restaurant is inactive. */
export const readAdminRestaurantMenuWorkflow = createWorkflow(
  "read-admin-restaurant-menu",
  function (input: { restaurant_id: string }) {
    return new WorkflowResponse(readAdminRestaurantMenuStep(input))
  },
)
