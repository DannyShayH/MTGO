import sharp from "sharp"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createOrderWorkflow,
  createInventoryLevelsWorkflow,
  createReservationsWorkflow,
  updateProductVariantsWorkflow,
  createProductsWorkflow,
  createProductCategoriesWorkflow,
} from "@medusajs/medusa/core-flows"
import initialDataSeed from "../../src/migration-scripts/initial-data-seed"
import operatorProductLayout from "../../src/migration-scripts/operator-product-layout"
import operatorSidebar from "../../src/migration-scripts/operator-sidebar"
import dishThumbnails from "../../src/migration-scripts/dish-thumbnails"
import { retireStarterMerchandiseWorkflow } from "../../src/workflows/starter-cleanup"
import { RESTAURANT_MODULE } from "../../src/modules/restaurant"
import {
  ensureMenuCommerceSetupWorkflow,
  publishSyntheticMenuWorkflow,
} from "../../src/workflows/menu"

jest.setTimeout(120000)

medusaIntegrationTestRunner({
  dbName: "medusa_ci_admin_dishes_http",
  testSuite: ({ api, getContainer }) => {
    const seedDish = async (suffix = "") => {
      const container = getContainer()
      const restaurant = await container
        .resolve(RESTAURANT_MODULE)
        .createRestaurants({
          name: "Kitchen",
          address_street: "Street 1",
          address_postal_code: "2200",
          address_city: "Copenhagen",
          contact_phone: "12345678",
          contact_email: "kitchen@example.test",
          pickup_address_key: `kitchen${suffix}`,
        })
      const { result } = await publishSyntheticMenuWorkflow(container).run({
        input: {
          restaurant_id: restaurant.id,
          categories: [
            {
              name: { da: "Mad", en: "Food" },
              dishes: [
                {
                  handle: `admin-dish${suffix}`,
                  name: { da: "Dagens ret", en: "Dish of the day" },
                  description: {
                    da: "Tomat og mozzarella",
                    en: "Tomato and mozzarella",
                  },
                  price: 100,
                  is_sold_out: true,
                },
              ],
            },
          ],
        },
      })
      return { restaurant, result }
    }

    it("lets only an operator inspect an inactive Restaurant's sold-out bilingual dish", async () => {
      const container = getContainer()
      const { restaurant, result } = await seedDish()
      const user = await container
        .resolve(Modules.USER)
        .createUsers({ email: "operator@example.test" })
      const secret = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
        .projectConfig.http.jwtSecret
      const token = generateJwtToken(
        { actor_id: user.id, actor_type: "user", auth_identity_id: "auth" },
        { secret, expiresIn: "1h" },
      )
      const path = `/admin/products/${result.product_ids[0]}/dish`
      expect((await api.get(path, { validateStatus: () => true })).status).toBe(
        401,
      )
      const staffToken = generateJwtToken(
        {
          actor_id: "staff",
          actor_type: "restaurant_staff",
          auth_identity_id: "staff-auth",
        },
        { secret, expiresIn: "1h" },
      )
      expect(
        (
          await api.get(path, {
            headers: { authorization: `Bearer ${staffToken}` },
            validateStatus: () => true,
          })
        ).status,
      ).toBe(401)
      const headers = { authorization: `Bearer ${token}` }
      const response = await api.get(path, { headers })
      expect(response.headers["cache-control"]).toContain("no-store")
      expect(response.data.dish).toMatchObject({
        restaurant: { id: restaurant.id, name: "Kitchen" },
        category: {
          id: result.category_ids[0],
          name: { da: "Mad", en: "Food" },
        },
        name: { da: "Dagens ret", en: "Dish of the day" },
        description: { da: "Tomat og mozzarella", en: "Tomato and mozzarella" },
        is_sold_out: true,
        photo: null,
      })
      const fileService = container.resolve(Modules.FILE)
      const file = await fileService.createFiles({
        filename: "dish.webp",
        mimeType: "image/webp",
        content: (
          await sharp({
            create: { width: 4, height: 3, channels: 3, background: "white" },
          })
            .webp()
            .toBuffer()
        ).toString("base64"),
        access: "private",
      })
      await container.resolve(RESTAURANT_MODULE).createPhotoAttachments({
        restaurant_id: restaurant.id,
        resource_id: result.product_ids[0],
        kind: "dish",
        file_id: file.id,
        url: "https://untrusted.example/stored-url",
        size_bytes: 13,
        request_id: "fixture",
        actor_id: user.id,
        occurred_at: new Date(),
      })
      await seedDish("-foreign")
      const menuPath = `/admin/restaurants/${restaurant.id}/menu`
      expect(
        (await api.get(menuPath, { validateStatus: () => true })).status,
      ).toBe(401)
      const menu = await api.get(menuPath, { headers })
      expect(menu.headers["cache-control"]).toContain("no-store")
      expect(menu.data.categories).toHaveLength(1)
      expect(menu.data.categories[0]).toMatchObject({
        id: result.category_ids[0],
        name: { da: "Mad", en: "Food" },
        dishes: [
          expect.objectContaining({
            id: result.product_ids[0],
            name: { da: "Dagens ret", en: "Dish of the day" },
            is_sold_out: true,
            photo: { url: (await fileService.retrieveFile(file.id)).url },
          }),
        ],
      })
      expect(
        (
          await api.get("/admin/restaurants/res_missing/menu", {
            headers,
            validateStatus: () => true,
          })
        ).status,
      ).toBe(404)
      const withPhoto = await api.get(path, { headers })
      expect(withPhoto.data.dish.photo.url).toBe(
        (await fileService.retrieveFile(file.id)).url,
      )
      expect(withPhoto.data.dish.photo.url).not.toContain("untrusted.example")
      const unavailablePhoto = jest
        .spyOn(fileService, "retrieveFile")
        .mockRejectedValueOnce(new Error("Storage provider unavailable"))
      try {
        const fallback = await api.get(path, { headers })
        expect(fallback.data.dish).toMatchObject({
          name: { da: "Dagens ret", en: "Dish of the day" },
          photo: null,
        })
      } finally {
        unavailablePhoto.mockRestore()
      }
      await fileService.deleteFiles(file.id)
      const {
        result: [ordinary],
      } = await createProductsWorkflow(container).run({
        input: {
          products: [
            {
              title: "Ordinary Product",
              options: [{ title: "Portion", values: ["Regular"] }],
              variants: [
                {
                  title: "Regular",
                  options: { Portion: "Regular" },
                  manage_inventory: false,
                  prices: [{ currency_code: "dkk", amount: 100 }],
                },
              ],
            },
          ],
        },
      })
      expect(
        (await api.get(`/admin/products/${ordinary.id}/dish`, { headers }))
          .data,
      ).toEqual({ dish: null })
      const product = (
        await api.get(`/admin/products/${result.product_ids[0]}`, { headers })
      ).data.product
      expect(product.variants).toEqual([
        expect.objectContaining({ manage_inventory: false }),
      ])
      expect(
        (
          await api.get("/admin/products/prod_missing/dish", {
            headers,
            validateStatus: () => true,
          })
        ).status,
      ).toBe(404)
    })
    it("serves a stable authorized dish thumbnail for native Admin tables and never stores signed URLs", async () => {
      const container = getContainer()
      const { restaurant, result } = await seedDish("-thumb")
      const productId = result.product_ids[0]
      const thumbnail = `/admin/products/${productId}/dish/photo`
      const productModule = container.resolve(Modules.PRODUCT)
      expect((await productModule.retrieveProduct(productId)).thumbnail).toBe(
        thumbnail,
      )
      const user = await container
        .resolve(Modules.USER)
        .createUsers({ email: "thumb-operator@example.test" })
      const secret = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
        .projectConfig.http.jwtSecret
      const token = generateJwtToken(
        { actor_id: user.id, actor_type: "user", auth_identity_id: "auth" },
        { secret, expiresIn: "1h" },
      )
      const headers = { authorization: `Bearer ${token}` }
      const read = (path = thumbnail) =>
        api.get(path, { headers, maxRedirects: 0, validateStatus: () => true })
      expect(
        (await api.get(thumbnail, { validateStatus: () => true })).status,
      ).toBe(401)
      const staffToken = generateJwtToken(
        {
          actor_id: "staff",
          actor_type: "restaurant_staff",
          auth_identity_id: "staff-auth",
        },
        { secret, expiresIn: "1h" },
      )
      expect(
        (
          await api.get(thumbnail, {
            headers: { authorization: `Bearer ${staffToken}` },
            validateStatus: () => true,
          })
        ).status,
      ).toBe(401)
      const placeholder = await read()
      expect(placeholder.status).toBe(200)
      expect(placeholder.headers["content-type"]).toContain("image/svg+xml")
      expect(placeholder.headers["cache-control"]).toContain("no-store")
      expect(placeholder.data).toContain("<svg")
      const fileService = container.resolve(Modules.FILE)
      const restaurants = container.resolve(RESTAURANT_MODULE)
      const register = async (owner: string, name: string) => {
        const file = await fileService.createFiles({
          filename: name,
          mimeType: "image/webp",
          content: (
            await sharp({
              create: { width: 4, height: 3, channels: 3, background: "white" },
            })
              .webp()
              .toBuffer()
          ).toString("base64"),
          access: "private",
        })
        const attachment = await restaurants.createPhotoAttachments({
          restaurant_id: owner,
          resource_id: productId,
          kind: "dish",
          file_id: file.id,
          url: "https://untrusted.example/stored-url",
          size_bytes: 13,
          request_id: `fixture-${name}`,
          actor_id: user.id,
          occurred_at: new Date(),
        })
        return { file, attachment }
      }
      const foreign = await register("res_foreign", "foreign.webp")
      expect((await read()).status).toBe(200)
      await restaurants.deletePhotoAttachments(foreign.attachment.id)
      const first = await register(restaurant.id, "first.webp")
      const firstUrl = (await fileService.retrieveFile(first.file.id)).url
      const shown = await read()
      expect(shown.status).toBe(302)
      expect(shown.headers.location).toBe(firstUrl)
      // The signed URL lives an hour (download_file_duration), so the browser
      // may reuse the redirect for five minutes instead of asking again on
      // every Admin page (#253).
      expect(shown.headers["cache-control"]).toBe("private, max-age=300")
      expect((await productModule.retrieveProduct(productId)).thumbnail).toBe(
        thumbnail,
      )
      await restaurants.deletePhotoAttachments(first.attachment.id)
      const second = await register(restaurant.id, "second.webp")
      expect((await read()).headers.location).toBe(
        (await fileService.retrieveFile(second.file.id)).url,
      )
      const outage = jest
        .spyOn(fileService, "retrieveFile")
        .mockRejectedValueOnce(new Error("Storage provider unavailable"))
      try {
        const failed = await read()
        expect(failed.status).toBe(200)
        expect(failed.headers["content-type"]).toContain("image/svg+xml")
      } finally {
        outage.mockRestore()
      }
      await restaurants.deletePhotoAttachments(second.attachment.id)
      expect((await read()).status).toBe(200)
      await register(restaurant.id, "third.webp")
      await container.resolve(Modules.PRODUCT).softDeleteProducts([productId])
      const deleted = await read()
      expect(deleted.status).toBe(200)
      expect(deleted.headers["content-type"]).toContain("image/svg+xml")
      expect(
        (await read(`/admin/products/prod_missing/dish/photo`)).status,
      ).toBe(200)
    })
    it("leaves ordinary Products alone and backfills only linked dishes", async () => {
      const container = getContainer()
      const { result } = await seedDish("-backfill")
      const {
        result: [ordinary],
      } = await createProductsWorkflow(container).run({
        input: {
          products: [
            {
              title: "Ordinary Product",
              thumbnail: "https://images.example/ordinary.png",
              options: [{ title: "Portion", values: ["Regular"] }],
              variants: [
                {
                  title: "Regular",
                  options: { Portion: "Regular" },
                  manage_inventory: false,
                  prices: [{ currency_code: "dkk", amount: 100 }],
                },
              ],
            },
          ],
        },
      })
      const productModule = container.resolve(Modules.PRODUCT)
      await productModule.updateProducts(result.product_ids[0], {
        thumbnail: null,
      })
      await dishThumbnails({ container })
      await dishThumbnails({ container })
      expect(
        (await productModule.retrieveProduct(result.product_ids[0])).thumbnail,
      ).toBe(`/admin/products/${result.product_ids[0]}/dish/photo`)
      expect((await productModule.retrieveProduct(ordinary.id)).thumbnail).toBe(
        "https://images.example/ordinary.png",
      )
    })
    it("omits clothing on repeated setup and retires only known demo data without changing historical Orders", async () => {
      const container = getContainer()
      await ensureMenuCommerceSetupWorkflow(container).run({ input: undefined })
      await initialDataSeed({ container })
      await initialDataSeed({ container })
      const products = container.resolve(Modules.PRODUCT)
      expect(await products.listProducts()).toEqual([])
      expect(await products.listProductCategories()).toEqual([])
      await container
        .resolve(Modules.SETTINGS)
        .setSystemDefaultLayoutConfiguration("sidebar", {
          widgets: {
            "core:nav:/products": { order: 2 },
            "core:nav:/inventory": { order: 3 },
          },
        })
      await operatorSidebar({ container })
      await operatorSidebar({ container })
      const layout = await container
        .resolve(Modules.SETTINGS)
        .getSystemDefaultLayoutConfiguration("sidebar")
      expect(layout?.configuration.widgets["core:nav:/inventory"]).toEqual({
        order: 3,
        hidden: true,
      })
      expect(layout?.configuration.widgets["core:nav:/products"]).toEqual({
        order: 2,
      })
      const settings = container.resolve(Modules.SETTINGS)
      await settings.setSystemDefaultLayoutConfiguration("product.details", {
        widgets: { "custom-existing-widget": { order: 5 } },
      })
      await operatorProductLayout({ container })
      await operatorProductLayout({ container })
      const productLayout =
        await settings.getSystemDefaultLayoutConfiguration("product.details")
      expect(
        productLayout?.configuration.widgets["widget:mtogo-restaurant-dish"],
      ).toEqual({ section: "main", order: -100, hidden: false })
      expect(
        productLayout?.configuration.widgets["core:ProductAttributeSection"],
      ).toEqual({ hidden: true })
      expect(
        productLayout?.configuration.widgets["core:ProductOptionSection"],
      ).toEqual({ hidden: true })
      expect(
        productLayout?.configuration.widgets["custom-existing-widget"],
      ).toEqual({ order: 5 })
      const [salesChannel] = await container
        .resolve(Modules.SALES_CHANNEL)
        .listSalesChannels({ name: "Default Sales Channel" })
      const { result: food } = await seedDish()
      const {
        result: [category],
      } = await createProductCategoriesWorkflow(container).run({
        input: { product_categories: [{ name: "Shirts", handle: "shirts" }] },
      })
      const {
        result: [demo, real],
      } = await createProductsWorkflow(container).run({
        input: {
          products: [
            {
              title: "Medusa T-Shirt",
              status: ProductStatus.PUBLISHED,
              handle: "t-shirt",
              sales_channels: [{ id: salesChannel.id }],
              description:
                "Reimagine the feeling of a classic T-shirt. With our cotton T-shirts, everyday essentials no longer have to be ordinary.",
              category_ids: [category.id],
              images: [
                "tee-black-front.png",
                "tee-black-back.png",
                "tee-white-front.png",
                "tee-white-back.png",
              ].map((name) => ({
                url: `https://medusa-public-images.s3.eu-west-1.amazonaws.com/${name}`,
              })),
              options: [
                { title: "Size", values: ["S", "M", "L", "XL"] },
                { title: "Color", values: ["Black", "White"] },
              ],
              variants: ["S", "M", "L", "XL"].flatMap((size) =>
                ["Black", "White"].map((color) => ({
                  title: `${size} / ${color}`,
                  sku: `SHIRT-${size}-${color.toUpperCase()}`,
                  options: { Size: size, Color: color },
                  manage_inventory: false,
                  prices: [
                    { currency_code: "eur", amount: 10 },
                    { currency_code: "usd", amount: 15 },
                  ],
                })),
              ),
            },
            {
              title: "Real product",
              handle: "real-product",
              options: [{ title: "Portion", values: ["Regular"] }],
              variants: [
                {
                  title: "Regular",
                  options: { Portion: "Regular" },
                  manage_inventory: false,
                  prices: [{ currency_code: "eur", amount: 25 }],
                },
              ],
            },
          ],
        },
      })
      const reservedVariantId = demo.variants.find(
        ({ sku }) => sku === "SHIRT-S-BLACK",
      )?.id
      if (!reservedVariantId)
        throw new Error("Reserved demo variant was not created")
      const { result: order } = await createOrderWorkflow(container).run({
        input: {
          sales_channel_id: salesChannel.id,
          currency_code: "eur",
          email: "customer@example.test",
          items: [
            {
              title: "Historical T-Shirt",
              variant_id: reservedVariantId,
              quantity: 1,
              unit_price: 10,
            },
          ],
        },
      })
      await updateProductVariantsWorkflow(container).run({
        input: {
          selector: { product_id: demo.id },
          update: { manage_inventory: true },
        },
      })
      const inventory = container.resolve(Modules.INVENTORY)
      const [inventoryItem] = await inventory.listInventoryItems({
        sku: "SHIRT-S-BLACK",
      })
      const [location] = await container
        .resolve(Modules.STOCK_LOCATION)
        .listStockLocations({ name: "European Warehouse" })
      await createInventoryLevelsWorkflow(container).run({
        input: {
          inventory_levels: [
            {
              inventory_item_id: inventoryItem.id,
              location_id: location.id,
              stocked_quantity: 10,
            },
          ],
        },
      })
      const lineItemId = order.items?.[0]?.id
      if (!lineItemId) throw new Error("Historical Order line was not created")
      const {
        result: [reservation],
      } = await createReservationsWorkflow(container).run({
        input: {
          reservations: [
            {
              inventory_item_id: inventoryItem.id,
              location_id: location.id,
              line_item_id: lineItemId,
              quantity: 1,
            },
          ],
        },
      })
      expect(
        (
          await retireStarterMerchandiseWorkflow(container).run({
            input: undefined,
          })
        ).result,
      ).toEqual({ product_ids: [demo.id], category_ids: [category.id] })
      expect(
        (
          await retireStarterMerchandiseWorkflow(container).run({
            input: undefined,
          })
        ).result,
      ).toEqual({ product_ids: [], category_ids: [] })
      expect(
        (await products.listProducts()).map(({ id }) => id).sort(),
      ).toEqual([real.id, ...food.product_ids].sort())
      expect(await products.listProductCategories()).toEqual([])
      expect(
        (await inventory.retrieveInventoryItem(inventoryItem.id)).sku,
      ).toBe("SHIRT-S-BLACK")
      const retained = await inventory.retrieveReservationItem(reservation.id)
      expect(JSON.parse(JSON.stringify(retained))).toMatchObject({
        inventory_item_id: inventoryItem.id,
        line_item_id: lineItemId,
        quantity: 1,
      })
      expect(
        Number(
          await inventory.retrieveStockedQuantity(inventoryItem.id, [
            location.id,
          ]),
        ),
      ).toBe(10)
      const historical = await container
        .resolve(Modules.ORDER)
        .retrieveOrder(order.id, { relations: ["items"] })
      expect(JSON.parse(JSON.stringify(historical.items))).toEqual([
        expect.objectContaining({
          title: "Historical T-Shirt",
          quantity: 1,
          unit_price: 10,
        }),
      ])
    })
  },
})
