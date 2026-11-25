import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { FOOD_CATALOGUE_MODULE } from "../../../modules/food-catalogue"
import { RESTAURANT_MODULE } from "../../../modules/restaurant"
import {
  readCustomerMenu,
  readPublishedMenu,
  readRestaurantWithMenu,
  withDishPhotos,
} from "../steps/read-menu"

const restaurant = {
  id: "rest_1",
  name: "Pizzeria",
  is_active: true,
  is_open: true,
  delivery_area_postal_codes: [{ postal_code: "2200" }],
  menu_categories: [
    {
      id: "mcat_1",
      name_da: "Pizza",
      name_en: "Pizza",
      position: 0,
      revision: 1,
      is_removed: false,
    },
  ],
}

const margherita = {
  id: "prod_1",
  status: "published",
  menu_dish: {
    name_da: "Margherita",
    name_en: "Margherita",
    description_da: null,
    description_en: null,
    is_sold_out: false,
    position: 0,
    revision: 1,
    category_id: "mcat_1",
    published_price: "95",
  },
  variants: [
    {
      id: "variant_1",
      calculated_price: {
        calculated_amount: 95,
        currency_code: "dkk",
        is_calculated_price_tax_inclusive: true,
      },
    },
  ],
}

type Started = { read: string; answer: (data: unknown[]) => void }

/**
 * A Query whose reads stay pending until the test answers them, so the test
 * sees which reads were started before any of them finished.
 */
function pendingQuery({ signing = true } = {}) {
  const started: Started[] = []
  const pending = (read: string) =>
    new Promise<unknown[]>((resolve) => started.push({ read, answer: resolve }))
  const graph = async ({ entity }: { entity: string }) => ({
    data: await pending(entity),
  })
  const services: Record<string, unknown> = {
    [ContainerRegistrationKeys.QUERY]: { graph },
    [RESTAURANT_MODULE]: {
      listPhotoAttachments: (filters: { kind: string }) =>
        pending(`${filters.kind} photos`),
    },
    [Modules.FILE]: {
      retrieveFile: async (id: string) => {
        if (!signing) throw new Error("storage unavailable")
        return { url: `https://photos/${id}` }
      },
    },
    [FOOD_CATALOGUE_MODULE]: {
      listAllergens: async () => [],
      listAllergenDetails: async () => [],
      listFoodLabels: async () => [],
    },
    [ContainerRegistrationKeys.LOGGER]: { log: () => undefined },
  }
  const container = {
    resolve: (key: string) => services[key],
  } as unknown as MedusaContainer
  const answer = (read: string, data: unknown[]) =>
    started.find((started) => started.read === read)?.answer(data)
  return { container, started, answer }
}

const settle = () => new Promise((resolve) => setImmediate(resolve))

describe("readRestaurantWithMenu", () => {
  it("starts the dish-price read without waiting for the Restaurant read (#206)", async () => {
    const { container, started, answer } = pendingQuery()

    const read = readRestaurantWithMenu(container, "rest_1")
    await settle()

    expect(started.map(({ read }) => read).sort()).toEqual([
      "restaurant",
      "restaurant_product",
    ])
    answer("restaurant", [restaurant])
    answer("restaurant_product", [{ product: margherita }])
    await expect(read).resolves.toEqual({
      restaurant,
      menu: [
        {
          id: "mcat_1",
          revision: 1,
          name: { da: "Pizza", en: "Pizza" },
          dishes: [
            expect.objectContaining({
              id: "prod_1",
              variant_id: "variant_1",
              price: { amount: 95, currency_code: "dkk", includes_tax: true },
            }),
          ],
        },
      ],
    })
  })

  it("is nothing when the Restaurant does not exist", async () => {
    const { container, answer } = pendingQuery()

    const read = readRestaurantWithMenu(container, "rest_missing")
    await settle()
    answer("restaurant", [])
    answer("restaurant_product", [])

    await expect(read).resolves.toBeNull()
  })

  it("leaves out a link whose product no longer exists", async () => {
    const { container, answer } = pendingQuery()

    const read = readRestaurantWithMenu(container, "rest_1")
    await settle()
    answer("restaurant", [restaurant])
    answer("restaurant_product", [{ product: null }, { product: margherita }])

    const found = await read
    expect(found?.menu[0].dishes.map(({ id }) => id)).toEqual(["prod_1"])
  })

  it("leaves out a dish without its Restaurant-owned content", async () => {
    const { container, answer } = pendingQuery()

    const read = readRestaurantWithMenu(container, "rest_1")
    await settle()
    answer("restaurant", [restaurant])
    answer("restaurant_product", [
      { product: { ...margherita, id: "prod_bare", menu_dish: null } },
      { product: margherita },
    ])

    const found = await read
    expect(found?.menu[0].dishes.map(({ id }) => id)).toEqual(["prod_1"])
  })

  it("is an empty menu for a Restaurant without categories", async () => {
    const { container, answer } = pendingQuery()

    const read = readRestaurantWithMenu(container, "rest_1")
    await settle()
    answer("restaurant", [{ ...restaurant, menu_categories: undefined }])
    answer("restaurant_product", [{ product: margherita }])

    await expect(read).resolves.toMatchObject({ menu: [] })
  })
})

describe("readCustomerMenu", () => {
  it("starts the Restaurant, dish prices, dish photos and cover at the same time (#206)", async () => {
    const { container, started, answer } = pendingQuery()

    const read = readCustomerMenu(container, "rest_1")
    await settle()

    expect(started.map(({ read }) => read).sort()).toEqual([
      "cover photos",
      "dish photos",
      "restaurant",
      "restaurant_product",
    ])
    answer("restaurant", [restaurant])
    answer("restaurant_product", [{ product: margherita }])
    answer("dish photos", [
      { resource_id: "prod_1", file_id: "file_1" },
      { resource_id: "prod_unpublished", file_id: "file_2" },
    ])
    answer("cover photos", [])
    const menu = await read
    expect(menu.restaurant).toMatchObject({ id: "rest_1", cover: null })
    expect(menu.categories[0].dishes).toEqual([
      expect.objectContaining({
        id: "prod_1",
        photo: { url: "https://photos/file_1" },
      }),
    ])
  })

  it("keeps the dish text when its photo and the cover cannot be signed", async () => {
    const { container, answer } = pendingQuery({ signing: false })

    const read = readCustomerMenu(container, "rest_1")
    await settle()
    answer("restaurant", [restaurant])
    answer("restaurant_product", [{ product: margherita }])
    answer("dish photos", [{ resource_id: "prod_1", file_id: "file_1" }])
    answer("cover photos", [{ file_id: "file_cover" }])

    const menu = await read
    expect(menu.restaurant.cover).toBeNull()
    expect(menu.categories[0].dishes).toEqual([
      expect.objectContaining({
        name: { da: "Margherita", en: "Margherita" },
        photo: null,
      }),
    ])
  })

  it("shows the menu of a Restaurant without a delivery area as not receiving Orders", async () => {
    const { container, answer } = pendingQuery()

    const read = readCustomerMenu(container, "rest_1")
    await settle()
    answer("restaurant", [
      { ...restaurant, delivery_area_postal_codes: undefined },
    ])
    answer("restaurant_product", [{ product: margherita }])
    answer("dish photos", [])
    answer("cover photos", [])

    const menu = await read
    expect(menu.restaurant).toMatchObject({
      receiving_new_orders: false,
      reason: "delivery_area_missing",
    })
    expect(menu.categories).toHaveLength(1)
  })

  it("answers an inactive Restaurant as not found", async () => {
    const { container, answer } = pendingQuery()

    const read = readCustomerMenu(container, "rest_1")
    await settle()
    answer("restaurant", [{ ...restaurant, is_active: false }])
    answer("restaurant_product", [{ product: margherita }])
    answer("dish photos", [])
    answer("cover photos", [])

    await expect(read).rejects.toMatchObject({
      type: MedusaError.Types.NOT_FOUND,
    })
  })
})

describe("readPublishedMenu", () => {
  it("is the published menu of the Restaurant", async () => {
    const { container, answer } = pendingQuery()

    const read = readPublishedMenu(container, "rest_1")
    await settle()
    answer("restaurant", [restaurant])
    answer("restaurant_product", [{ product: margherita }])

    const menu = await read
    expect(menu.map(({ id }) => id)).toEqual(["mcat_1"])
  })

  it("is empty when the Restaurant does not exist", async () => {
    const { container, answer } = pendingQuery()

    const read = readPublishedMenu(container, "rest_missing")
    await settle()
    answer("restaurant", [])
    answer("restaurant_product", [])

    await expect(read).resolves.toEqual([])
  })
})

describe("withDishPhotos", () => {
  const dish = (id: string) => ({ id, name: { da: id, en: id } })
  const menu = [
    {
      id: "mcat_1",
      revision: 1,
      name: { da: "Pizza", en: "Pizza" },
      dishes: [dish("prod_1"), dish("prod_2")],
    },
  ] as unknown as Parameters<typeof withDishPhotos>[2]

  it("gives every dish its photo, or null when it has none", async () => {
    const { container, answer } = pendingQuery()

    const read = withDishPhotos(container, "rest_1", menu)
    await settle()
    answer("dish photos", [{ resource_id: "prod_1", file_id: "file_1" }])

    const [category] = await read
    expect(category.dishes).toEqual([
      { ...dish("prod_1"), photo: { url: "https://photos/file_1" } },
      { ...dish("prod_2"), photo: null },
    ])
  })

  it("leaves a dish without a photo untouched when missing photos are left out", async () => {
    const { container, answer } = pendingQuery()

    const read = withDishPhotos(container, "rest_1", menu, false)
    await settle()
    answer("dish photos", [{ resource_id: "prod_1", file_id: "file_1" }])

    const [category] = await read
    expect(category.dishes).toEqual([
      { ...dish("prod_1"), photo: { url: "https://photos/file_1" } },
      dish("prod_2"),
    ])
  })
})
