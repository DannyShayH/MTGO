import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import { ExecArgs } from "@medusajs/framework/types"
import {
  createApiKeysWorkflow,
  createLinksWorkflow,
  createProductsWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows"
import { RESTAURANT_MODULE } from "../../src/modules/restaurant"
import register from "../../src/modules/postal-code/data/postal-codes.json"
import { syncPostalCodeRegisterWorkflow } from "../../src/workflows/postal-codes"
import { createAuthorizedStaffWorkflow } from "../../src/workflows/restaurant-staff"
import {
  ensureMenuCommerceSetupWorkflow,
  MENU_SALES_CHANNEL_NAME,
} from "../../src/workflows/menu"
import seedFoodCatalogue from "../../src/migration-scripts/food-catalogue"
import seedDemoMenu from "../../src/scripts/seed-demo-menu"

jest.setTimeout(120000)

const claimsOf = (token: string) =>
  JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())

const pizzeria = {
  name: "Pizzeria Nørrebro",
  address_street: "Nørrebrogade 1",
  address_postal_code: "2200",
  address_city: "København N",
  contact_phone: "+45 12 34 56 78",
  contact_email: "kontakt@pizzeria.example",
}

const UNKNOWN_FOOD_INFORMATION = {
  allergens: { status: "unknown" },
  labels: { halal: "unknown", chili: "unknown", garlic: "unknown" },
}

type Dish = {
  id: string
  variant_id: string
  name: { da: string; en: string }
  price: { amount: number }
  is_sold_out: boolean
}
type Category = { id: string; name: { da: string; en: string }; dishes: Dish[] }

medusaIntegrationTestRunner({
  dbName: "medusa_ci_restaurant_menu_http",
  env: { JWT_SECRET: "ci-only-menu-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer }) => {
    const password = "ci-only-staff-password"
    let admin: { authorization: string }
    let store: { "x-publishable-api-key": string }
    let defaultChannelId: string
    let restaurantId: string
    let staffToken: string

    const adminPath = () => `/admin/restaurants/${restaurantId}`
    const readMenu = (id = restaurantId, headers: object = store) =>
      api.get(`/store/restaurants/${id}/menu`, {
        headers,
        validateStatus: () => true,
      })
    const seedMenu = (...variation: string[]) =>
      seedDemoMenu({
        container: getContainer(),
        args: [restaurantId, ...variation],
      } as ExecArgs)
    const activate = () =>
      api.post(
        `${adminPath()}/activate`,
        {},
        { headers: admin, validateStatus: () => true },
      )
    const open = () =>
      api.post(
        `/partner/restaurants/${restaurantId}/open`,
        {},
        { headers: { authorization: staffToken } },
      )
    const adminView = async () =>
      (await api.get(adminPath(), { headers: admin })).data.restaurant

    beforeEach(async () => {
      const container = getContainer()
      await syncPostalCodeRegisterWorkflow(container).run({
        input: { postal_codes: register.postal_codes },
      })
      const user = await container
        .resolve(Modules.USER)
        .createUsers({ email: "operator@example.test" })
      admin = {
        authorization: `Bearer ${generateJwtToken(
          { actor_id: user.id, actor_type: "user", auth_identity_id: "auth" },
          {
            secret: container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
              .projectConfig.http.jwtSecret,
            expiresIn: "1h",
          },
        )}`,
      }
      // The Customer app's key, bound to the default channel as in a real setup.
      const {
        result: [channel],
      } = await createSalesChannelsWorkflow(container).run({
        input: { salesChannelsData: [{ name: "Default Sales Channel" }] },
      })
      defaultChannelId = channel.id
      const {
        result: [key],
      } = await createApiKeysWorkflow(container).run({
        input: {
          api_keys: [
            { title: "Customer app", type: "publishable", created_by: "" },
          ],
        },
      })
      await linkSalesChannelsToApiKeyWorkflow(container).run({
        input: { id: key.id, add: [channel.id] },
      })
      store = { "x-publishable-api-key": key.token }

      restaurantId = (
        await api.post("/admin/restaurants", pizzeria, { headers: admin })
      ).data.restaurant.id
      const email = "sofie@pizzeria.example"
      const registered = await api.post(
        "/auth/restaurant_staff/emailpass/register",
        { email, password },
      )
      await createAuthorizedStaffWorkflow(container).run({
        input: {
          restaurant_id: restaurantId,
          name: "Sofie Jensen",
          email,
          auth_identity_id: claimsOf(registered.data.token).auth_identity_id,
        },
      })
      staffToken = `Bearer ${
        (
          await api.post("/auth/restaurant_staff/emailpass", {
            email,
            password,
          })
        ).data.token
      }`
      await api.post(
        `${adminPath()}/commercial-terms`,
        { terms_version: "common_mvp_v1" },
        { headers: admin },
      )
      await api.post(
        `${adminPath()}/delivery-area-postal-codes`,
        { postal_code: "2200" },
        { headers: admin },
      )
    })

    it("counts a real staff-published dish for activation and returns it on the next Customer fetch", async () => {
      const headers = { authorization: staffToken }
      expect((await activate()).status).toBe(400)
      const category = await api.post(
        `/partner/restaurants/${restaurantId}/categories`,
        {
          request_id: "real-category",
          revision: 0,
          name: { da: "Mad", en: "Food" },
        },
        { headers },
      )
      const published = await api.post(
        `/partner/restaurants/${restaurantId}/dishes`,
        {
          request_id: "real-dish",
          category_id: category.data.category.id,
          name: { da: "Dagens ret", en: "Dish of the day" },
          price: "95.50",
        },
        { headers },
      )
      expect(published.status).toBe(200)
      expect((await adminView()).menu.published_dish_count).toBe(1)
      expect((await readMenu()).status).toBe(404)
      expect((await activate()).status).toBe(200)
      const customer = await readMenu()
      expect(customer.data.restaurant.is_open).toBe(false)
      expect(customer.data.categories[0].dishes).toEqual([
        expect.objectContaining({
          name: { da: "Dagens ret", en: "Dish of the day" },
          price: { amount: 95.5, currency_code: "dkk", includes_tax: true },
          food_information: UNKNOWN_FOOD_INFORMATION,
          photo: null,
        }),
      ])
      const dish = customer.data.categories[0].dishes[0]
      const sold = await api.post(
        `/partner/restaurants/${restaurantId}/dishes/${dish.id}/availability`,
        { request_id: "sold-out", revision: dish.revision, is_sold_out: true },
        { headers },
      )
      expect(sold.status).toBe(200)
      const refreshed = await readMenu()
      expect(refreshed.data.categories[0].dishes[0]).toMatchObject({
        id: dish.id,
        revision: dish.revision + 1,
        is_sold_out: true,
        price: dish.price,
      })
      expect(refreshed.data.restaurant.is_open).toBe(false)
      expect((await adminView()).is_active).toBe(true)
      expect((await adminView()).menu.published_dish_count).toBe(1)
    })

    it("shows an active, open Restaurant's bilingual menu in order, without empty categories or invalid products", async () => {
      await seedMenu("showcase")
      expect((await activate()).status).toBe(200)
      await open()

      const response = await readMenu()
      expect(response.status).toBe(200)
      expect(response.headers["cache-control"]).toBe("no-store")
      expect(response.data.restaurant).toEqual({
        id: restaurantId,
        name: "Pizzeria Nørrebro",
        is_open: true,
        receiving_new_orders: true,
        reason: null,
      })
      expect(response.data.categories).toEqual([
        {
          id: expect.stringMatching(/^mcat_/),
          revision: 1,
          name: { da: "Pizza", en: "Pizza" },
          dishes: [
            {
              id: expect.stringMatching(/^prod_/),
              variant_id: expect.stringMatching(/^variant_/),
              revision: 1,
              name: {
                da: "Pizza Margherita (syntetisk)",
                en: "Pizza Margherita (synthetic)",
              },
              description: {
                da: "En syntetisk ret til demonstrationer. Ikke en rigtig ret.",
                en: "A synthetic dish seeded for demonstrations. Not a real menu item.",
              },
              price: { amount: 95, currency_code: "dkk", includes_tax: true },
              is_sold_out: false,
              photo: null,
              food_information: UNKNOWN_FOOD_INFORMATION,
            },
            {
              id: expect.stringMatching(/^prod_/),
              variant_id: expect.stringMatching(/^variant_/),
              revision: 1,
              name: {
                da: "Pizza Pepperoni (syntetisk)",
                en: "Pizza Pepperoni (synthetic)",
              },
              description: {
                da: "Tomat, mozzarella og pepperoni. Syntetisk ret.",
                en: "Tomato, mozzarella and pepperoni. Synthetic dish.",
              },
              // DKK 109.50 stays 109.5: no cents conversion and no VAT on top.
              price: {
                amount: 109.5,
                currency_code: "dkk",
                includes_tax: true,
              },
              is_sold_out: true,
              photo: null,
              food_information: UNKNOWN_FOOD_INFORMATION,
            },
          ],
        },
        {
          id: expect.stringMatching(/^mcat_/),
          revision: 1,
          name: { da: "Drikkevarer", en: "Drinks" },
          dishes: [
            expect.objectContaining({
              name: {
                da: "Hjemmelavet hyldeblomstlimonade (syntetisk)",
                en: "Homemade elderflower lemonade (synthetic)",
              },
              description: null,
              price: { amount: 32, currency_code: "dkk", includes_tax: true },
              is_sold_out: false,
            }),
          ],
        },
      ])
    })

    it("counts for readiness exactly the dishes the menu shows, sold out included, and not the published single-title product", async () => {
      await seedMenu("showcase")
      await activate()
      const shown = (await readMenu()).data.categories.flatMap(
        ({ dishes }: Category) => dishes,
      )
      expect(shown).toHaveLength(3)
      expect(shown.filter((dish: Dish) => dish.is_sold_out)).toHaveLength(1)
      // The showcase links four published products; one has a single title only.
      const { data } = await api.get("/admin/products?fields=id,status", {
        headers: admin,
      })
      expect(
        data.products.filter(
          ({ status }: { status: string }) => status === "published",
        ),
      ).toHaveLength(4)
      expect((await adminView()).menu.published_dish_count).toBe(3)
    })

    it("keeps an active, closed Restaurant's menu readable and says it receives no new Orders", async () => {
      await seedMenu()
      await activate()
      const response = await readMenu()
      expect(response.status).toBe(200)
      expect(response.data.restaurant).toMatchObject({
        is_open: false,
        receiving_new_orders: false,
        reason: "restaurant_closed",
      })
      expect(response.data.categories).toHaveLength(1)
      expect(response.data.categories[0].dishes).toHaveLength(1)
    })

    it("hides an inactive Restaurant's menu exactly like an unknown Restaurant, before activation and after deactivation", async () => {
      await seedMenu()
      const unknown = await readMenu("res_unknown")
      expect(unknown.status).toBe(404)
      expect(unknown.data).toMatchObject({
        type: "not_found",
        message: "restaurant_not_found",
      })
      const inactive = await readMenu()
      expect(inactive.status).toBe(404)
      expect(inactive.data).toEqual(unknown.data)

      await activate()
      expect((await readMenu()).status).toBe(200)
      await api.post(
        `${adminPath()}/deactivate`,
        { reason: "Kitchen renovation" },
        { headers: admin },
      )
      const deactivated = await readMenu()
      expect(deactivated.status).toBe(404)
      expect(deactivated.data).toEqual(unknown.data)
    })

    it("refuses a menu read without the Customer app's publishable key", async () => {
      await seedMenu()
      await activate()
      expect((await readMenu(restaurantId, {})).status).toBe(400)
    })

    it("answers Customers and signed-out visitors alike, and never with a staff or operator view", async () => {
      await seedMenu()
      await activate()
      const withStaffToken = await readMenu(restaurantId, {
        ...store,
        authorization: staffToken,
      })
      expect(withStaffToken.status).toBe(200)
      expect(withStaffToken.data).toEqual((await readMenu()).data)
    })

    it("publishes each dish as one native variant with one tax-inclusive DKK price, in the menu sales channel with a shipping profile", async () => {
      await seedMenu()
      const { data } = await api.get(
        "/admin/products?fields=id,title,status,*variants,*variants.prices,*sales_channels,*shipping_profile",
        { headers: admin },
      )
      expect(data.products).toHaveLength(1)
      const [product] = data.products
      expect(product).toMatchObject({
        title: "Pizza Margherita (synthetic)",
        status: "published",
        sales_channels: [{ name: MENU_SALES_CHANNEL_NAME }],
        shipping_profile: { type: "default" },
      })
      expect(product.variants).toHaveLength(1)
      expect(product.variants[0].manage_inventory).toBe(false)
      expect(product.variants[0].prices).toHaveLength(1)
      expect(product.variants[0].prices[0]).toMatchObject({
        amount: 95,
        currency_code: "dkk",
      })
      const preferences = await api.get(
        "/admin/price-preferences?attribute=currency_code&value=dkk",
        { headers: admin },
      )
      expect(preferences.data.price_preferences).toEqual([
        expect.objectContaining({ is_tax_inclusive: true }),
      ])
    })

    it("keeps dishes out of native product browsing, so an inactive Restaurant's dishes stay hidden there too", async () => {
      await seedMenu()
      const listed = await api.get("/store/products", { headers: store })
      expect(listed.status).toBe(200)
      expect(listed.data.products).toEqual([])
      const channels = await api.get("/admin/sales-channels", {
        headers: admin,
      })
      expect(
        channels.data.sales_channels.map(({ id }: { id: string }) => id),
      ).toContain(defaultChannelId)
    })

    it("repeats the commerce setup and the seed without duplicating anything", async () => {
      await seedMenu()
      await seedMenu()
      await ensureMenuCommerceSetupWorkflow(getContainer()).run({
        input: undefined,
      })
      const channels = await api.get("/admin/sales-channels", {
        headers: admin,
      })
      expect(
        channels.data.sales_channels.filter(
          ({ name }: { name: string }) => name === MENU_SALES_CHANNEL_NAME,
        ),
      ).toHaveLength(1)
      const preferences = await api.get(
        "/admin/price-preferences?attribute=currency_code&value=dkk",
        { headers: admin },
      )
      expect(preferences.data.price_preferences).toHaveLength(1)
      expect((await adminView()).menu.published_dish_count).toBe(1)
    })

    it("replaces the old single-title seed with a valid bilingual menu without deleting the old product", async () => {
      const container = getContainer()
      const handle = `synthetic-dish-${restaurantId.toLowerCase().replace(/_/g, "-")}`
      const {
        result: [legacy],
      } = await createProductsWorkflow(container).run({
        input: {
          products: [
            {
              title: "Pizza Margherita (synthetic)",
              handle,
              status: ProductStatus.PUBLISHED,
              options: [{ title: "Size", values: ["Regular"] }],
              variants: [
                {
                  title: "Regular",
                  options: { Size: "Regular" },
                  manage_inventory: false,
                  prices: [{ amount: 95, currency_code: "dkk" }],
                },
              ],
            },
          ],
        },
      })
      await createLinksWorkflow(container).run({
        input: [
          {
            [RESTAURANT_MODULE]: { restaurant_id: restaurantId },
            [Modules.PRODUCT]: { product_id: legacy.id },
          },
        ],
      })
      expect((await adminView()).menu.published_dish_count).toBe(0)
      await seedMenu("showcase")
      expect((await activate()).status).toBe(200)
      const shown = (await readMenu()).data.categories.flatMap(
        ({ dishes }: Category) => dishes,
      )
      expect(shown).toHaveLength(3)
      expect(shown.map(({ id }: Dish) => id)).not.toContain(legacy.id)
      await seedMenu("showcase")
      expect((await adminView()).menu.published_dish_count).toBe(3)
      expect(
        (await api.get(`/admin/products/${legacy.id}`, { headers: admin })).data
          .product.id,
      ).toBe(legacy.id)
    })

    it("creates nothing when the synthetic menu is requested for an unknown Restaurant", async () => {
      await expect(
        seedDemoMenu({
          container: getContainer(),
          args: ["res_unknown"],
        } as ExecArgs),
      ).rejects.toMatchObject({ message: "restaurant_not_found" })
      const { data } = await api.get("/admin/products?fields=id", {
        headers: admin,
      })
      expect(data.products).toEqual([])
    })

    it("serves twenty simultaneous browsing journeys with at least 95% of requests within two seconds", async () => {
      await seedFoodCatalogue({ container: getContainer() })
      await seedMenu("showcase")
      await activate()
      await open()
      const durations: number[] = []
      const timed = async (path: string) => {
        const started = performance.now()
        const response = await api.get(path, { headers: store })
        durations.push(performance.now() - started)
        expect(response.status).toBe(200)
      }
      // One journey: open the menu, read the food legend, fetch the menu again.
      const journey = async () => {
        await timed(`/store/restaurants/${restaurantId}/menu`)
        await timed("/store/food-catalogue")
        await timed(`/store/restaurants/${restaurantId}/menu`)
      }
      await Promise.all(Array.from({ length: 20 }, journey))
      durations.sort((a, b) => a - b)
      const percentile = (share: number) =>
        durations[Math.ceil(durations.length * share) - 1]
      const withinTwoSeconds =
        durations.filter((duration) => duration <= 2000).length /
        durations.length
      console.info(
        `menu browsing workload: ${durations.length} requests, ` +
          `p50 ${Math.round(percentile(0.5))} ms, p95 ${Math.round(percentile(0.95))} ms, ` +
          `max ${Math.round(durations[durations.length - 1])} ms, ` +
          `${Math.round(withinTwoSeconds * 100)}% within 2 s`,
      )
      expect(durations).toHaveLength(60)
      expect(withinTwoSeconds).toBeGreaterThanOrEqual(0.95)
    })
  },
})
