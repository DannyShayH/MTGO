import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import sharp from "sharp"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  QueryContext,
  Modules,
} from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  createOrderWorkflow,
  createRegionsWorkflow,
  createApiKeysWorkflow,
} from "@medusajs/medusa/core-flows"
import { RESTAURANT_MODULE } from "../../src/modules/restaurant"
import RestaurantModuleService from "../../src/modules/restaurant/service"
import { FOOD_CATALOGUE_MODULE } from "../../src/modules/food-catalogue"
import FoodCatalogueModuleService from "../../src/modules/food-catalogue/service"
import { readActivationFacts } from "../../src/workflows/restaurants/steps/activation-facts"
import { evaluateActivationRequirements } from "../../src/workflows/restaurants/activation-requirements"
import { readPublishedMenu } from "../../src/workflows/menu"
import { Migration20261115153517 } from "../../src/modules/restaurant/migrations/Migration20261115153517"
import { cleanupPhotosWorkflow } from "../../src/workflows/photos/cleanup"
import seedFoodCatalogue from "../../src/migration-scripts/food-catalogue"

jest.setTimeout(120000)
medusaIntegrationTestRunner({
  dbName: "medusa_ci_menu_dishes_http",
  env: { JWT_SECRET: "ci-only-dishes-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer, dbConnection }) => {
    const config = {
      headers: { authorization: "" },
      validateStatus: () => true,
    }
    let restaurantId: string
    let categoryId: string
    let staffId: string
    let foodLabels: { food_label_id: string; state: "yes" | "no" | "unknown" }[]
    const service = () =>
      getContainer().resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    const restaurant = (key: string) =>
      service().createRestaurants({
        name: key,
        address_street: "Test 1",
        address_postal_code: "2200",
        address_city: "København N",
        contact_phone: "12345678",
        contact_email: `${key}@example.test`,
        pickup_address_key: key,
      })
    const post = (change = {}, id = restaurantId) =>
      api.post(
        `/partner/restaurants/${id}/dishes`,
        {
          request_id: "first-dish",
          category_id: categoryId,
          name: { da: "  Dagens ret ", en: " Dish of the day " },
          price: "95,50",
          allergens: { status: "unknown" },
          food_labels: foodLabels,
          ...change,
        },
        config,
      )
    const menu = () => readPublishedMenu(getContainer(), restaurantId)
    const nativePrice = async (dishId: string) => {
      const { data } = await getContainer()
        .resolve(ContainerRegistrationKeys.QUERY)
        .graph({
          entity: "product",
          fields: ["variants.calculated_price.calculated_amount"],
          filters: { id: dishId },
          context: {
            variants: {
              calculated_price: QueryContext({ currency_code: "dkk" }),
            },
          },
        })
      const [product] = data as unknown as {
        variants?: { calculated_price?: { calculated_amount?: number } }[]
      }[]
      return Number(product?.variants?.[0]?.calculated_price?.calculated_amount)
    }
    const edit = (dishId: string, change = {}, id = restaurantId) =>
      api.post(
        `/partner/restaurants/${id}/dishes/${dishId}`,
        {
          request_id: "first-edit",
          revision: 1,
          name: { da: "Ny ret", en: "New dish" },
          description: { da: "Tomat", en: "Tomato" },
          price: "105,50",
          allergens: { status: "unknown" },
          food_labels: foodLabels,
          ...change,
        },
        config,
      )
    const availability = (dishId: string, change = {}, id = restaurantId) =>
      api.post(
        `/partner/restaurants/${id}/dishes/${dishId}/availability`,
        {
          request_id: "first-availability",
          revision: 1,
          is_sold_out: true,
          ...change,
        },
        config,
      )
    it("reorders categories with a revision precondition and refreshes a stale list", async () => {
      const path = `/partner/restaurants/${restaurantId}/menu-arrangement`
      const first = await api.get(path, config)
      expect(first.status).toBe(200)
      await api.post(
        `/partner/restaurants/${restaurantId}/categories`,
        {
          request_id: "second-category",
          revision: 0,
          name: { da: "Drikke", en: "Drinks" },
        },
        config,
      )
      const current = (await api.get(path, config)).data
      const ids = current.categories
        .map(({ id }: { id: string }) => id)
        .reverse()
      const saved = await api.post(
        path,
        { kind: "categories", revision: current.revision, ids },
        config,
      )
      expect(saved.status).toBe(200)
      expect(saved.data.categories.map(({ id }: { id: string }) => id)).toEqual(
        ids,
      )
      const stale = await api.post(
        path,
        {
          kind: "categories",
          revision: current.revision,
          ids: [...ids].reverse(),
        },
        config,
      )
      expect(stale.status).toBe(409)
      expect(stale.data.code).toBe("menu_order_stale")
      expect((await api.get(path, config)).data).toEqual(saved.data)
    })

    it("moves a dish atomically, preserves its facts, hides the empty Customer category and appends new dishes", async () => {
      // Non-default facts, so a move that reset any of them would fail.
      const [milk] = (
        await api.get("/partner/food-catalogue", config)
      ).data.allergens.filter(({ number }: { number: number }) => number === 7)
      const allergens = {
        status: "supplied",
        contains: [{ allergen_id: milk.id, detail_ids: [] }],
        may_contain: [],
        none_declared: false,
      }
      const labels = foodLabels.map((label) => ({ ...label, state: "yes" }))
      const published = await post({ allergens, food_labels: labels })
      expect(published.status).toBe(200)
      const edited = await edit(published.data.categories[0].dishes[0].id, {
        allergens,
        food_labels: labels,
      })
      expect(edited.status).toBe(200)
      const soldOut = await availability(
        edited.data.categories[0].dishes[0].id,
        {
          revision: edited.data.categories[0].dishes[0].revision,
        },
      )
      expect(soldOut.status).toBe(200)
      const dish = soldOut.data.dish
      expect(dish).toMatchObject({
        is_sold_out: true,
        description: { da: "Tomat", en: "Tomato" },
        allergens,
      })
      const category = await api.post(
        `/partner/restaurants/${restaurantId}/categories`,
        {
          request_id: "target",
          revision: 0,
          name: { da: "Drikke", en: "Drinks" },
        },
        config,
      )
      const target = category.data.category.id
      const path = `/partner/restaurants/${restaurantId}/menu-arrangement`
      const before = (await api.get(path, config)).data
      const moved = await api.post(
        path,
        {
          kind: "move",
          revision: before.revision,
          dish_id: dish.id,
          source_id: categoryId,
          target_id: target,
        },
        config,
      )
      expect(moved.status).toBe(200)
      expect(
        moved.data.categories.find(
          ({ id }: { id: string }) => id === categoryId,
        ).dishes,
      ).toEqual([])
      expect(
        moved.data.categories.find(({ id }: { id: string }) => id === target)
          .dishes,
      ).toEqual([{ ...dish, revision: dish.revision + 1 }])
      expect((await menu()).map(({ id }) => id)).toEqual([target])
      const {
        result: [key],
      } = await createApiKeysWorkflow(getContainer()).run({
        input: {
          api_keys: [
            {
              title: "Customer menu fixture",
              type: "publishable",
              created_by: "",
            },
          ],
        },
      })
      await service().updateRestaurants({ id: restaurantId, is_active: true })
      const customerMenu = await api.get(
        `/store/restaurants/${restaurantId}/menu`,
        { headers: { "x-publishable-api-key": key.token } },
      )
      expect(customerMenu.status).toBe(200)
      expect(customerMenu.data.restaurant.cover).toBeNull()
      expect(
        customerMenu.data.categories.map(({ id }: { id: string }) => id),
      ).toEqual([target])
      expect(customerMenu.data.categories[0].dishes[0]).toMatchObject({
        id: dish.id,
        variant_id: dish.variant_id,
        name: dish.name,
        price: dish.price,
        is_sold_out: dish.is_sold_out,
        photo: null,
      })

      const linked = await getContainer()
        .resolve(ContainerRegistrationKeys.QUERY)
        .graph({
          entity: "product",
          fields: ["id", "menu_dish.category_id"],
          filters: { id: dish.id },
        })
      expect(linked.data[0].menu_dish).toMatchObject({ category_id: target })
      const again = await api.post(
        path,
        {
          kind: "move",
          revision: before.revision,
          dish_id: dish.id,
          source_id: categoryId,
          target_id: target,
        },
        config,
      )
      expect(again.status).toBe(409)
      expect(again.data.menu).toEqual(moved.data)
      const appended = await post({
        request_id: "append",
        category_id: target,
        name: { da: "Ny", en: "New" },
      })
      expect(appended.status).toBe(200)
      expect(
        appended.data.categories[0].dishes.map(
          ({ id }: { id: string }) => id,
        )[0],
      ).toBe(dish.id)
    })

    it("serializes competing reorder and move requests and rejects stale lists without losing dishes", async () => {
      const first = await post()
      const firstId = first.data.categories[0].dishes[0].id
      const second = await post({
        request_id: "second",
        name: { da: "Anden", en: "Second" },
      })
      const ids = second.data.categories[0].dishes.map(
        ({ id }: { id: string }) => id,
      )
      const target = (
        await api.post(
          `/partner/restaurants/${restaurantId}/categories`,
          {
            request_id: "target",
            revision: 0,
            name: { da: "Drikke", en: "Drinks" },
          },
          config,
        )
      ).data.category.id
      const path = `/partner/restaurants/${restaurantId}/menu-arrangement`
      const current = (await api.get(path, config)).data
      const commands = [
        {
          kind: "dishes",
          revision: current.revision,
          category_id: categoryId,
          ids: [...ids].reverse(),
        },
        {
          kind: "move",
          revision: current.revision,
          source_id: categoryId,
          target_id: target,
          dish_id: firstId,
        },
      ]
      const results = await Promise.all(
        commands.map((command) => api.post(path, command, config)),
      )
      expect(results.map(({ status }) => status).sort()).toEqual([200, 409])
      const latest = (await api.get(path, config)).data
      expect(
        latest.categories
          .flatMap(({ dishes }: { dishes: { id: string }[] }) =>
            dishes.map(({ id }) => id),
          )
          .sort(),
      ).toEqual([...ids].sort())
      expect(results.find(({ status }) => status === 409)?.data.menu).toEqual(
        latest,
      )
      const refreshed = latest.categories.find(
        ({ id }: { id: string }) => id === categoryId,
      )
      if (refreshed.dishes.length === 2) {
        expect(refreshed.dishes.map(({ id }: { id: string }) => id)).toEqual(
          [...ids].reverse(),
        )
      } else {
        expect(refreshed.dishes).toHaveLength(1)
      }
    })

    it("refuses foreign IDs, duplicate or missing lists, foreign Restaurants and revoked access without changes", async () => {
      const published = await post()
      const dish = published.data.categories[0].dishes[0]
      const other = await restaurant("foreign")
      const foreign = await service().createMenuCategories({
        restaurant_id: other.id,
        name_da: "Anden",
        name_en: "Other",
        request_id: "foreign",
        creation_name: { da: "Anden", en: "Other" },
        history: { entries: [] },
      })
      const path = `/partner/restaurants/${restaurantId}/menu-arrangement`
      const current = (await api.get(path, config)).data
      const invalid = [
        { kind: "categories", ids: [foreign.id] },
        { kind: "categories", ids: [] },
        { kind: "dishes", category_id: categoryId, ids: [dish.id, dish.id] },
        { kind: "dishes", category_id: foreign.id, ids: [dish.id] },
        {
          kind: "move",
          dish_id: dish.id,
          source_id: categoryId,
          target_id: foreign.id,
        },
        {
          kind: "move",
          dish_id: "foreign-dish",
          source_id: categoryId,
          target_id: categoryId,
        },
        {
          kind: "move",
          dish_id: dish.id,
          source_id: foreign.id,
          target_id: categoryId,
        },
      ]
      for (const command of invalid) {
        expect(
          (
            await api.post(
              path,
              { ...command, revision: current.revision },
              config,
            )
          ).status,
        ).toBe(409)
        expect((await api.get(path, config)).data).toEqual(current)
      }
      expect(
        (
          await api.post(
            path,
            { kind: "categories", ids: [categoryId] },
            config,
          )
        ).status,
      ).toBe(400)
      expect(
        (
          await api.get(
            `/partner/restaurants/${other.id}/menu-arrangement`,
            config,
          )
        ).status,
      ).toBe(404)
      expect(
        (
          await api.post(
            `/partner/restaurants/${other.id}/menu-arrangement`,
            {
              kind: "categories",
              revision: current.revision,
              ids: [foreign.id],
            },
            config,
          )
        ).status,
      ).toBe(404)
      await service().updateRestaurantStaffs({ id: staffId, status: "revoked" })
      expect((await api.get(path, config)).status).toBe(403)
      expect(
        (
          await api.post(
            path,
            {
              kind: "categories",
              revision: current.revision,
              ids: [categoryId],
            },
            config,
          )
        ).status,
      ).toBe(403)
      expect((await menu())[0].dishes).toEqual([dish])
    })

    it("rolls back a move and its history when a later write fails", async () => {
      const published = await post()
      const dish = published.data.categories[0].dishes[0]
      const target = (
        await api.post(
          `/partner/restaurants/${restaurantId}/categories`,
          {
            request_id: "target",
            revision: 0,
            name: { da: "Drikke", en: "Drinks" },
          },
          config,
        )
      ).data.category.id
      const path = `/partner/restaurants/${restaurantId}/menu-arrangement`
      const before = (await api.get(path, config)).data
      const original = await service().retrieveMenuCategory(categoryId)
      const failure = jest
        .spyOn(service(), "updateMenuCategories")
        .mockRejectedValueOnce(new Error("injected write failure"))
      try {
        expect(
          (
            await api.post(
              path,
              {
                kind: "move",
                revision: before.revision,
                dish_id: dish.id,
                source_id: categoryId,
                target_id: target,
              },
              config,
            )
          ).status,
        ).toBe(500)
      } finally {
        failure.mockRestore()
      }
      expect((await api.get(path, config)).data).toEqual(before)
      expect(
        (await service().retrieveMenuCategory(categoryId)).history,
      ).toEqual(original.history)
    })

    it("compensates placement and attribution when releasing the workflow lock fails after persistence", async () => {
      const path = `/partner/restaurants/${restaurantId}/menu-arrangement`
      const before = (await api.get(path, config)).data
      const original = await service().retrieveMenuCategory(categoryId)
      const locking = getContainer().resolve(Modules.LOCKING)
      const failure = jest
        .spyOn(locking, "release")
        .mockRejectedValueOnce(new Error("injected release failure"))
      try {
        expect(
          (
            await api.post(
              path,
              {
                kind: "categories",
                revision: before.revision,
                ids: [categoryId],
              },
              config,
            )
          ).status,
        ).toBe(500)
      } finally {
        failure.mockRestore()
      }
      expect((await api.get(path, config)).data).toEqual(before)
      expect(
        (await service().retrieveMenuCategory(categoryId)).history,
      ).toEqual(original.history)
    })

    it("migrates existing membership without changing content and preserves interrupted unlinked rows", async () => {
      await dbConnection.transaction(async (transaction) => {
        await transaction.schema.createSchema("menu_arrangement_upgrade")
        await transaction.raw(
          "SET LOCAL search_path TO menu_arrangement_upgrade",
        )
        await transaction.schema.createTable("menu_category", (table) => {
          table.text("id").primary()
        })
        await transaction.schema.createTable("menu_dish", (table) => {
          table.text("id").primary()
          table.text("name_da")
          table.text("name_en")
          table.text("published_price")
          table.jsonb("allergen_declaration")
          table.boolean("publication_committed")
          table.timestamp("deleted_at").nullable()
        })
        await transaction.schema.createTable(
          "product_product_restaurant_menu_dish",
          (table) => {
            table.text("product_id")
            table.text("menu_dish_id")
          },
        )
        await transaction.schema.createTable(
          "restaurant_menu_category_product_product",
          (table) => {
            table.text("product_id")
            table.text("menu_category_id")
          },
        )
        const content = {
          id: "legacy-dish",
          name_da: "Dagens ret",
          name_en: "Dish of the day",
          published_price: "95.5",
          allergen_declaration: { status: "unknown" },
          publication_committed: true,
          deleted_at: null,
        }
        const pending = {
          ...content,
          id: "interrupted-dish",
          publication_committed: false,
        }
        await transaction("menu_category").insert({ id: "legacy-category" })
        await transaction("menu_dish").insert([content, pending])
        await transaction("product_product_restaurant_menu_dish").insert({
          product_id: "legacy-product",
          menu_dish_id: content.id,
        })
        await transaction("restaurant_menu_category_product_product").insert({
          product_id: "legacy-product",
          menu_category_id: "legacy-category",
        })
        // This migration only emits SQL; its driver/config are unused.
        const migration = new Migration20261115153517(null!, null!)
        await migration.up()
        for (const query of migration.getQueries()) await transaction.raw(query)
        expect(
          await transaction("menu_dish").where({ id: content.id }).first(),
        ).toEqual({ ...content, category_id: "legacy-category" })
        expect(
          await transaction("menu_dish").where({ id: pending.id }).first(),
        ).toEqual({ ...pending, category_id: null })
        await transaction.schema.dropSchema("menu_arrangement_upgrade", true)
      })
    })

    beforeEach(async () => {
      await seedFoodCatalogue({ container: getContainer() })
      const labels = await getContainer()
        .resolve<FoodCatalogueModuleService>(FOOD_CATALOGUE_MODULE)
        .listFoodLabels({}, { take: null })
      foodLabels = labels.map((label) => ({
        food_label_id: label.id,
        state: "unknown" as const,
      }))
      restaurantId = (await restaurant("own")).id
      staffId = (
        await service().createRestaurantStaffs({
          restaurant_id: restaurantId,
          name: "Sofie",
          email: "sofie@example.test",
          status: "authorized",
        })
      ).id
      config.headers.authorization = `Bearer ${generateJwtToken(
        {
          actor_id: staffId,
          actor_type: "restaurant_staff",
          auth_identity_id: "auth",
        },
        {
          secret: getContainer().resolve(
            ContainerRegistrationKeys.CONFIG_MODULE,
          ).projectConfig.http.jwtSecret,
          expiresIn: "1h",
        },
      )}`
      categoryId = (
        await api.post(
          `/partner/restaurants/${restaurantId}/categories`,
          {
            request_id: "category",
            revision: 0,
            name: { da: "Mad", en: "Food" },
          },
          config,
        )
      ).data.category.id
    })
    it("attaches both owned photo kinds and publishes transformed images", async () => {
      const dish = (await post()).data.categories[0].dishes[0]
      const jpeg = await sharp({
        create: {
          width: 2400,
          height: 1200,
          channels: 3,
          background: "#aa4422",
        },
      })
        .jpeg()
        .toBuffer()
      const content = jpeg.toString("base64")
      const dishPath = `/partner/restaurants/${restaurantId}/dishes/${dish.id}/photo`
      const coverPath = `/partner/restaurants/${restaurantId}/cover`
      const attachedDish = await api.post(
        dishPath,
        {
          request_id: "c86805e7-8e71-414b-9389-cc1c12064944",
          revision: dish.revision,
          content,
        },
        config,
      )
      expect(attachedDish.status).toBe(200)
      expect(attachedDish.data.photo.url).toContain(".webp")
      expect(
        (await api.get(`/partner/restaurants/${restaurantId}/dishes`, config))
          .data.categories[0].dishes[0].photo.url,
      ).toBe(attachedDish.data.photo.url)
      const output = await getContainer()
        .resolve(Modules.FILE)
        .getAsBuffer(
          (
            await service().listPhotoAttachments({
              restaurant_id: restaurantId,
              kind: "dish",
            })
          )[0].file_id,
        )
      expect((await sharp(output).metadata()).width).toBe(2048)
      const attachedCover = await api.post(
        coverPath,
        {
          request_id: "ae45f1cc-ec72-442d-8b59-950d7d050f83",
          revision: 1,
          content,
        },
        config,
      )
      expect(attachedCover.status).toBe(200)
      expect(attachedCover.data.cover.url).toContain(".webp")
      const details = await api.get(
        `/partner/restaurants/${restaurantId}`,
        config,
      )
      expect(details.data.restaurant.cover.url).toBe(
        attachedCover.data.cover.url,
      )
      const {
        result: [key],
      } = await createApiKeysWorkflow(getContainer()).run({
        input: {
          api_keys: [
            { title: "Photo browsing", type: "publishable", created_by: "" },
          ],
        },
      })
      await service().updateRestaurants({ id: restaurantId, is_active: true })
      const store = { headers: { "x-publishable-api-key": key.token } }
      const file = getContainer().resolve(Modules.FILE)
      const retrieveFile = file.retrieveFile.bind(file)
      const signed = jest
        .spyOn(file, "retrieveFile")
        .mockImplementation(async (id) => ({
          ...(await retrieveFile(id)),
          url: `https://mtogo.t3.storage.dev/${id}?X-Amz-Signature=test`,
        }))
      const customerMenu = await api.get(
        `/store/restaurants/${restaurantId}/menu`,
        store,
      )
      const staffArrangement = await api.get(
        `/partner/restaurants/${restaurantId}/menu-arrangement`,
        config,
      )
      expect(staffArrangement.data.categories[0].dishes[0].photo.url).toContain(
        "X-Amz-Signature=test",
      )
      expect(customerMenu.data.restaurant.cover.url).toContain(
        "X-Amz-Signature=test",
      )
      expect(customerMenu.data.categories[0].dishes[0].photo.url).toContain(
        "X-Amz-Signature=test",
      )
      const customerHome = await api.get("/store/restaurants", store)
      expect(
        customerHome.data.restaurants.find(
          ({ id }: { id: string }) => id === restaurantId,
        ).cover.url,
      ).toContain("X-Amz-Signature=test")
      const stored = await service().listPhotoAttachments({
        restaurant_id: restaurantId,
      })
      expect(stored.every(({ url }) => !url.includes("X-Amz-Signature"))).toBe(
        true,
      )
      signed.mockRestore()
      const retry = await api.post(
        coverPath,
        {
          request_id: "ae45f1cc-ec72-442d-8b59-950d7d050f83",
          revision: 1,
          content,
        },
        config,
      )
      expect(retry.status).toBe(200)
      expect(
        await service().listPhotoAttachments({ restaurant_id: restaurantId }),
      ).toHaveLength(2)
    })

    it("protects both photo kinds from stale replacement and removal", async () => {
      const dish = (await post()).data.categories[0].dishes[0]
      const content = (
        await sharp({
          create: { width: 20, height: 20, channels: 3, background: "red" },
        })
          .jpeg()
          .toBuffer()
      ).toString("base64")
      for (const path of [
        `/partner/restaurants/${restaurantId}/cover`,
        `/partner/restaurants/${restaurantId}/dishes/${dish.id}/photo`,
      ]) {
        const firstRequest = crypto.randomUUID()
        const first = await api.post(
          path,
          { request_id: firstRequest, revision: 1, content },
          config,
        )
        expect(first.status).toBe(200)
        const revision = (first.data.cover ?? first.data.photo).revision
        const replacement = await api.post(
          path,
          { request_id: crypto.randomUUID(), revision, content },
          config,
        )
        expect(replacement.status).toBe(200)
        expect(
          (
            await api.post(
              path,
              { request_id: firstRequest, revision: 1, content },
              config,
            )
          ).data.code,
        ).toBe("photo_stale")
        expect(
          (
            await api.delete(path, {
              ...config,
              data: { request_id: crypto.randomUUID(), revision },
            })
          ).status,
        ).toBe(409)
        const removed = await api.delete(path, {
          ...config,
          data: {
            request_id: crypto.randomUUID(),
            revision: (replacement.data.cover ?? replacement.data.photo)
              .revision,
          },
        })
        expect(removed.status).toBe(200)
      }
    })

    it("preserves published photos when replacement fails and refuses revoked removal", async () => {
      const dish = (await post()).data.categories[0].dishes[0]
      const content = (
        await sharp({
          create: { width: 20, height: 20, channels: 3, background: "red" },
        })
          .jpeg()
          .toBuffer()
      ).toString("base64")
      const paths = [
        `/partner/restaurants/${restaurantId}/cover`,
        `/partner/restaurants/${restaurantId}/dishes/${dish.id}/photo`,
      ]
      for (const path of paths) {
        expect(
          (
            await api.post(
              path,
              { request_id: crypto.randomUUID(), revision: 1, content },
              config,
            )
          ).status,
        ).toBe(200)
        const invalid = await api.post(
          path,
          {
            request_id: crypto.randomUUID(),
            revision: 2,
            content: Buffer.from("bad").toString("base64"),
          },
          config,
        )
        expect(invalid.data.code).toBe("photo_invalid")
      }
      const before = await service().listPhotoAttachments({
        restaurant_id: restaurantId,
      })
      const changes = await service().listPhotoChanges({
        restaurant_id: restaurantId,
      })
      expect(changes).toHaveLength(2)
      await service().updateRestaurantStaffs({ id: staffId, status: "revoked" })
      for (const path of paths) {
        expect(
          (
            await api.delete(path, {
              ...config,
              data: { request_id: crypto.randomUUID(), revision: 2 },
            })
          ).status,
        ).toBe(403)
      }
      expect(
        await service().listPhotoAttachments({ restaurant_id: restaurantId }),
      ).toEqual(before)
      expect(
        await service().listPhotoChanges({ restaurant_id: restaurantId }),
      ).toHaveLength(2)
    })

    it("retains files referenced by either kind and retries failed cleanup", async () => {
      const dish = (await post()).data.categories[0].dishes[0]
      const content = (
        await sharp({
          create: { width: 20, height: 20, channels: 3, background: "red" },
        })
          .jpeg()
          .toBuffer()
      ).toString("base64")
      const coverPath = `/partner/restaurants/${restaurantId}/cover`
      const dishPath = `/partner/restaurants/${restaurantId}/dishes/${dish.id}/photo`
      for (const path of [coverPath, dishPath]) {
        expect(
          (
            await api.post(
              path,
              { request_id: crypto.randomUUID(), revision: 1, content },
              config,
            )
          ).status,
        ).toBe(200)
      }
      const [cover] = await service().listPhotoAttachments({
        restaurant_id: restaurantId,
        kind: "cover",
      })
      const [photo] = await service().listPhotoAttachments({
        restaurant_id: restaurantId,
        kind: "dish",
      })
      await service().updatePhotoAttachments({
        id: photo.id,
        file_id: cover.file_id,
      })
      expect(
        (
          await api.delete(coverPath, {
            ...config,
            data: { request_id: crypto.randomUUID(), revision: 2 },
          })
        ).status,
      ).toBe(200)
      const file = getContainer().resolve(Modules.FILE)
      const deleted = jest.spyOn(file, "deleteFiles")
      try {
        await cleanupPhotosWorkflow(getContainer()).run()
        expect(deleted).not.toHaveBeenCalled()
        expect((await file.getAsBuffer(cover.file_id)).length).toBeGreaterThan(
          0,
        )
        expect(
          (
            await api.delete(dishPath, {
              ...config,
              data: { request_id: crypto.randomUUID(), revision: 2 },
            })
          ).status,
        ).toBe(200)
        deleted.mockRejectedValueOnce(new Error("storage unavailable"))
        await cleanupPhotosWorkflow(getContainer()).run()
        expect(
          await service().listPhotoFiles({ file_id: cover.file_id }),
        ).toHaveLength(1)
        await cleanupPhotosWorkflow(getContainer()).run()
        expect(
          await service().listPhotoFiles({ file_id: cover.file_id }),
        ).toHaveLength(0)
      } finally {
        deleted.mockRestore()
      }
    })

    it("refuses invalid content, foreign targets and revoked staff for both photo kinds", async () => {
      const dish = (await post()).data.categories[0].dishes[0]
      const coverPath = `/partner/restaurants/${restaurantId}/cover`
      const dishPath = `/partner/restaurants/${restaurantId}/dishes/${dish.id}/photo`
      const body = {
        request_id: "c86805e7-8e71-414b-9389-cc1c12064944",
        revision: 1,
        content: Buffer.from("<svg/>").toString("base64"),
      }
      expect((await api.post(coverPath, body, config)).data.code).toBe(
        "photo_invalid",
      )
      expect((await api.post(dishPath, body, config)).data.code).toBe(
        "photo_invalid",
      )
      expect(
        (
          await api.post(
            `/partner/restaurants/${restaurantId}/dishes/not-owned/photo`,
            body,
            config,
          )
        ).status,
      ).toBe(404)
      await service().updateRestaurantStaffs({ id: staffId, status: "revoked" })
      expect((await api.post(coverPath, body, config)).status).toBe(403)
      expect((await api.post(dishPath, body, config)).status).toBe(403)
      expect(
        await service().listPhotoAttachments({ restaurant_id: restaurantId }),
      ).toHaveLength(0)
    })

    it("rejects input over 5 MiB before publishing an attachment", async () => {
      const response = await api.post(
        `/partner/restaurants/${restaurantId}/cover`,
        {
          request_id: "6f8c8793-91e5-4f95-b13d-bbb9784f2ee5",
          revision: 1,
          content: Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64"),
        },
        config,
      )
      expect(response.status).toBe(400)
      expect(response.data.code).toBe("photo_invalid")
      expect(
        await service().listPhotoAttachments({ restaurant_id: restaurantId }),
      ).toHaveLength(0)
    })

    it("keeps both targets unchanged after a storage failure", async () => {
      const dish = (await post()).data.categories[0].dishes[0]
      const content = (
        await sharp({
          create: { width: 20, height: 20, channels: 3, background: "red" },
        })
          .jpeg()
          .toBuffer()
      ).toString("base64")
      const file = getContainer().resolve(Modules.FILE)
      const create = jest
        .spyOn(file, "getUploadStream")
        .mockRejectedValue(new Error("provider unavailable"))
      try {
        for (const path of [
          `/partner/restaurants/${restaurantId}/cover`,
          `/partner/restaurants/${restaurantId}/dishes/${dish.id}/photo`,
        ]) {
          const response = await api.post(
            path,
            {
              request_id: "2ec25af3-0837-49bb-bc86-df150d0a66be",
              revision: 1,
              content,
            },
            config,
          )
          expect(response.status).toBe(503)
          expect(response.data.code).toBe("photo_storage_failed")
        }
        expect(
          await service().listPhotoAttachments({ restaurant_id: restaurantId }),
        ).toHaveLength(0)
        expect(
          (await api.get(`/partner/restaurants/${restaurantId}/dishes`, config))
            .data.categories[0].dishes[0].photo,
        ).toBeNull()
      } finally {
        create.mockRestore()
      }
    })

    it("recovers transformed output when the later attachment write fails", async () => {
      const content = (
        await sharp({
          create: { width: 20, height: 20, channels: 3, background: "red" },
        })
          .jpeg()
          .toBuffer()
      ).toString("base64")
      const file = getContainer().resolve(Modules.FILE)
      const deleted = jest.spyOn(file, "deleteFiles")
      const write = jest
        .spyOn(service(), "createPhotoAttachments")
        .mockRejectedValue(new Error("database unavailable"))
      try {
        const response = await api.post(
          `/partner/restaurants/${restaurantId}/cover`,
          {
            request_id: "2ec25af3-0837-49bb-bc86-df150d0a66be",
            revision: 1,
            content,
          },
          config,
        )
        expect(response.status).toBe(503)
        const [pending] = await service().listPhotoFiles({
          restaurant_id: restaurantId,
        })
        expect(pending).toBeDefined()
        await service().updatePhotoFiles({ id: pending.id, state: "cleanup" })
        await cleanupPhotosWorkflow(getContainer()).run()
        expect(deleted).toHaveBeenCalledTimes(1)
        expect(
          await service().listPhotoFiles({ restaurant_id: restaurantId }),
        ).toHaveLength(0)
        expect(
          await service().listPhotoAttachments({ restaurant_id: restaurantId }),
        ).toHaveLength(0)
      } finally {
        write.mockRestore()
        deleted.mockRestore()
      }
    })

    it("reconciles a committed attachment after a lost acknowledgement", async () => {
      const content = (
        await sharp({
          create: { width: 20, height: 20, channels: 3, background: "red" },
        })
          .jpeg()
          .toBuffer()
      ).toString("base64")
      const module = service()
      const original = module.commitPhotoChange.bind(module)
      const write = jest
        .spyOn(module, "commitPhotoChange")
        .mockImplementationOnce(async (data) => {
          await original(data)
          throw new Error("acknowledgement lost")
        })
      try {
        const response = await api.post(
          `/partner/restaurants/${restaurantId}/cover`,
          {
            request_id: "2ec25af3-0837-49bb-bc86-df150d0a66be",
            revision: 1,
            content,
          },
          config,
        )
        expect(response.status).toBe(200)
        expect(
          await service().listPhotoAttachments({ restaurant_id: restaurantId }),
        ).toHaveLength(1)
      } finally {
        write.mockRestore()
      }
    })
    it("refuses to remove the last sold-out dish of an active Restaurant", async () => {
      const created = await post()
      const dish = created.data.categories[0].dishes[0]
      const soldOut = await availability(dish.id)
      expect(soldOut.status).toBe(200)
      await service().updateRestaurants({ id: restaurantId, is_active: true })

      const removed = await api.delete(
        `/partner/restaurants/${restaurantId}/dishes/${dish.id}`,
        { ...config, data: { revision: soldOut.data.dish.revision } },
      )

      expect(removed.status).toBe(409)
      expect(removed.data.code).toBe("last_published_dish_while_active")
      expect((await menu())[0].dishes).toHaveLength(1)
    })
    it("removes a dish from the menu and permits deleting its emptied category", async () => {
      const created = await post()
      const dish = created.data.categories[0].dishes[0]
      const path = `/partner/restaurants/${restaurantId}/dishes/${dish.id}`
      const stale = await api.delete(path, { ...config, data: { revision: 2 } })
      expect(stale.status).toBe(409)
      expect(stale.data.code).toBe("dish_stale")
      const removed = await api.delete(path, {
        ...config,
        data: { revision: 1 },
      })
      expect(removed.status).toBe(200)
      expect(await menu()).toEqual([])
      const categories = await api.get(
        `/partner/restaurants/${restaurantId}/categories`,
        config,
      )
      const category = categories.data.categories.find(
        ({ id }: { id: string }) => id === categoryId,
      )
      const deletion = await api.delete(
        `/partner/restaurants/${restaurantId}/categories/${categoryId}`,
        { ...config, data: { revision: category.revision } },
      )
      expect(deletion.status).toBe(200)
    })
    it("refuses foreign and revoked staff without removing a dish", async () => {
      const dish = (await post()).data.categories[0].dishes[0]
      const other = await restaurant("other")
      const foreign = await api.delete(
        `/partner/restaurants/${other.id}/dishes/${dish.id}`,
        { ...config, data: { revision: 1 } },
      )
      expect(foreign.status).toBe(404)
      await service().updateRestaurantStaffs({ id: staffId, status: "revoked" })
      const revoked = await api.delete(
        `/partner/restaurants/${restaurantId}/dishes/${dish.id}`,
        { ...config, data: { revision: 1 } },
      )
      expect(revoked.status).toBe(403)
      expect((await menu())[0].dishes).toHaveLength(1)
    })
    it("refuses another Restaurant's dish identifier under the caller's Restaurant", async () => {
      const other = await restaurant("other-owner")
      const otherStaff = await service().createRestaurantStaffs({
        restaurant_id: other.id,
        name: "Other",
        email: "other-owner@example.test",
        status: "authorized",
      })
      const ownToken = config.headers.authorization
      const ownCategory = categoryId
      config.headers.authorization = `Bearer ${generateJwtToken({ actor_id: otherStaff.id, actor_type: "restaurant_staff", auth_identity_id: "auth" }, { secret: getContainer().resolve(ContainerRegistrationKeys.CONFIG_MODULE).projectConfig.http.jwtSecret, expiresIn: "1h" })}`
      categoryId = (
        await api.post(
          `/partner/restaurants/${other.id}/categories`,
          {
            request_id: "other-category",
            revision: 0,
            name: { da: "Mad", en: "Food" },
          },
          config,
        )
      ).data.category.id
      const foreignDish = (await post({ request_id: "foreign-dish" }, other.id))
        .data.categories[0].dishes[0]
      config.headers.authorization = ownToken
      categoryId = ownCategory
      const result = await api.delete(
        `/partner/restaurants/${restaurantId}/dishes/${foreignDish.id}`,
        { ...config, data: { revision: foreignDish.revision } },
      )
      expect(result.status).toBe(404)
      expect(
        (await readPublishedMenu(getContainer(), other.id))[0].dishes[0].id,
      ).toBe(foreignDish.id)
    })
    it("keeps historical Order facts and removes the current dish identity", async () => {
      const dish = (await post()).data.categories[0].dishes[0]
      const { result: regions } = await createRegionsWorkflow(
        getContainer(),
      ).run({
        input: {
          regions: [
            { name: "Denmark", currency_code: "dkk", countries: ["dk"] },
          ],
        },
      })
      const { result: order } = await createOrderWorkflow(getContainer()).run({
        input: {
          region_id: regions[0].id,
          currency_code: "dkk",
          email: "customer@example.test",
          items: [
            {
              title: "Historical dish",
              quantity: 2,
              unit_price: 95.5,
              variant_id: dish.variant_id,
            },
          ],
        },
      })
      const user = await getContainer()
        .resolve(Modules.USER)
        .createUsers({ email: "operator@example.test" })
      const token = generateJwtToken(
        { actor_id: user.id, actor_type: "user", auth_identity_id: "auth" },
        {
          secret: getContainer().resolve(
            ContainerRegistrationKeys.CONFIG_MODULE,
          ).projectConfig.http.jwtSecret,
          expiresIn: "1h",
        },
      )
      const admin = {
        headers: { authorization: `Bearer ${token}` },
        validateStatus: () => true,
      }
      const before = await api.get(`/admin/orders/${order.id}`, admin)
      expect(before.status).toBe(200)
      const removed = await api.delete(
        `/partner/restaurants/${restaurantId}/dishes/${dish.id}`,
        { ...config, data: { revision: 1 } },
      )
      expect(removed.status).toBe(200)
      const after = await api.get(`/admin/orders/${order.id}`, admin)
      expect(after.status).toBe(200)
      expect(
        after.data.order.items.map(
          ({
            title,
            quantity,
            unit_price,
          }: {
            title: string
            quantity: number
            unit_price: number
          }) => ({ title, quantity, unit_price }),
        ),
      ).toEqual(
        before.data.order.items.map(
          ({
            title,
            quantity,
            unit_price,
          }: {
            title: string
            quantity: number
            unit_price: number
          }) => ({ title, quantity, unit_price }),
        ),
      )
      expect(await menu()).toEqual([])
    })
    it("removes the dish and variant from the next Customer menu while retaining other dishes", async () => {
      const first = (await post()).data.categories[0].dishes[0]
      const second = (await post({ request_id: "second" })).data.categories[0]
        .dishes[1]
      const {
        result: [key],
      } = await createApiKeysWorkflow(getContainer()).run({
        input: {
          api_keys: [
            { title: "Customer menu", type: "publishable", created_by: "" },
          ],
        },
      })
      await service().updateRestaurants({ id: restaurantId, is_active: true })
      const getMenu = () =>
        api.get(`/store/restaurants/${restaurantId}/menu`, {
          headers: { "x-publishable-api-key": key.token },
        })
      const before = await getMenu()
      expect(
        before.data.categories[0].dishes.map(({ id }: { id: string }) => id),
      ).toEqual([first.id, second.id])
      expect(
        (
          await api.delete(
            `/partner/restaurants/${restaurantId}/dishes/${first.id}`,
            { ...config, data: { revision: first.revision } },
          )
        ).status,
      ).toBe(200)
      const after = await getMenu()
      expect(after.headers["cache-control"]).toContain("no-store")
      expect(
        after.data.categories[0].dishes.map(
          ({ id, variant_id }: { id: string; variant_id: string }) => ({
            id,
            variant_id,
          }),
        ),
      ).toEqual([{ id: second.id, variant_id: second.variant_id }])
    })
    it("reconciles a lost acknowledgement after recording a removal", async () => {
      const dish = (await post()).data.categories[0].dishes[0]
      const update = service().updateMenuDishes.bind(service())
      const spy = jest
        .spyOn(service(), "updateMenuDishes")
        .mockImplementationOnce(async (...args) => {
          await update(...args)
          throw new Error("acknowledgement lost")
        })
      try {
        const result = await api.delete(
          `/partner/restaurants/${restaurantId}/dishes/${dish.id}`,
          { ...config, data: { revision: 1 } },
        )
        expect(result.status).toBe(200)
      } finally {
        spy.mockRestore()
      }
      expect(await menu()).toEqual([])
      const [content] = await service().listMenuDishes({})
      expect(content.successful_change).toMatchObject({
        kind: "remove",
        actor_id: staffId,
        resource_id: dish.id,
        actor_name: "Sofie",
        occurred_at: expect.any(String),
      })
      expect(
        (
          await api.delete(
            `/partner/restaurants/${restaurantId}/dishes/${dish.id}`,
            { ...config, data: { revision: 1 } },
          )
        ).status,
      ).toBe(404)
      expect(
        (await service().retrieveMenuDish(content.id)).successful_change,
      ).toEqual(content.successful_change)
    })
    it("rolls back removal and its history when the content write fails", async () => {
      const dish = (await post()).data.categories[0].dishes[0]
      const before = await menu()
      const content = (await service().listMenuDishes({}))[0]
      const failure = jest
        .spyOn(service(), "updateMenuDishes")
        .mockRejectedValueOnce(new Error("injected failure"))
      try {
        const result = await api.delete(
          `/partner/restaurants/${restaurantId}/dishes/${dish.id}`,
          { ...config, data: { revision: 1 } },
        )
        expect(result.status).toBeGreaterThanOrEqual(500)
      } finally {
        failure.mockRestore()
      }
      expect(await menu()).toEqual(before)
      const after = await service().retrieveMenuDish(content.id)
      expect(after.successful_change).toEqual(content.successful_change)
      expect(after.revision).toBe(content.revision)
    })
    it("serializes activation against removal of the last dish", async () => {
      const dish = (await post()).data.categories[0].dishes[0]
      await service().createDeliveryAreaPostalCodes({
        restaurant_id: restaurantId,
        postal_code: "2200",
      })
      await service().createCommercialTermsAgreements({
        restaurant_id: restaurantId,
        terms_version: "common_mvp_v1",
        agreed_at: new Date(),
        recorded_by: "operator",
      })
      const user = await getContainer()
        .resolve(Modules.USER)
        .createUsers({ email: "operator-race@example.test" })
      const token = generateJwtToken(
        { actor_id: user.id, actor_type: "user", auth_identity_id: "auth" },
        {
          secret: getContainer().resolve(
            ContainerRegistrationKeys.CONFIG_MODULE,
          ).projectConfig.http.jwtSecret,
          expiresIn: "1h",
        },
      )
      expect(
        evaluateActivationRequirements(
          await readActivationFacts(getContainer(), restaurantId),
        ),
      ).toEqual([])
      const [activation, removal] = await Promise.all([
        api.post(
          `/admin/restaurants/${restaurantId}/activate`,
          {},
          {
            headers: { authorization: `Bearer ${token}` },
            validateStatus: () => true,
          },
        ),
        api.delete(`/partner/restaurants/${restaurantId}/dishes/${dish.id}`, {
          ...config,
          data: { revision: 1 },
        }),
      ])
      if (activation.status === 200) {
        expect(removal.status).toBe(409)
        expect(removal.data.code).toBe("last_published_dish_while_active")
      } else {
        expect(removal.status).toBe(200)
        expect(activation.status).toBe(400)
        expect(activation.data.code).toBe("activation_requirements_missing")
        expect(activation.data.missing).toContain("published_menu_missing")
      }
      const current = await service().retrieveRestaurant(restaurantId)
      const currentMenu = await menu()
      expect(
        [activation.status, removal.status].filter((status) => status === 200),
      ).toHaveLength(1)
      expect(
        current.is_active ? currentMenu[0]?.dishes.length : currentMenu.length,
      ).toBe(current.is_active ? 1 : 0)
    })
    it("serializes removals so an active Restaurant retains one published dish", async () => {
      const first = (await post()).data.categories[0].dishes[0]
      const second = (await post({ request_id: "second" })).data.categories[0]
        .dishes[1]
      await service().updateRestaurants({ id: restaurantId, is_active: true })
      const remove = (id: string) =>
        api.delete(`/partner/restaurants/${restaurantId}/dishes/${id}`, {
          ...config,
          data: { revision: 1 },
        })
      const outcomes = await Promise.all([remove(first.id), remove(second.id)])
      expect(
        outcomes.map(({ status }: { status: number }) => status).sort(),
      ).toEqual([200, 409])
      expect((await menu())[0].dishes).toHaveLength(1)
    })
    it("publishes complete bilingual dishes at exact inclusive prices, appends, and reconciles retries", async () => {
      const first = await post()
      expect(first.status).toBe(200)
      expect(first.data.categories[0].dishes).toEqual([
        expect.objectContaining({
          name: { da: "Dagens ret", en: "Dish of the day" },
          price: { amount: 95.5, currency_code: "dkk", includes_tax: true },
          revision: 1,
          is_sold_out: false,
        }),
      ])
      const second = await post({ request_id: "second", price: "110" })
      expect(second.status).toBe(200)
      expect((await post()).data).toEqual(second.data)
      expect((await menu())[0].dishes).toHaveLength(2)
      expect((await post({ price: "99" })).status).toBe(409)
      expect(await service().retrieveRestaurant(restaurantId)).toMatchObject({
        is_active: false,
        is_open: false,
      })
    })
    it("serializes concurrent retries of one durable creation identity", async () => {
      const [first, second] = await Promise.all([post(), post()])
      expect(first.status).toBe(200)
      expect(second.status).toBe(200)
      expect(first.data).toEqual(second.data)
      expect(first.data.categories[0].dishes).toHaveLength(1)
    })
    it("requires staff to supply an explicit unknown or supplied declaration", async () => {
      const missing = await post({ allergens: undefined })
      expect(missing.status).toBe(400)
      expect(missing.data.code).toBe("dish_input_invalid")
      expect(await menu()).toEqual([])
    })
    it("saves unknown, supplied, and explicitly empty declarations and refuses invalid references", async () => {
      await seedFoodCatalogue({ container: getContainer() })
      const catalogue = (await api.get("/partner/food-catalogue", config)).data
      const cereals = catalogue.allergens[0]
      const nuts = catalogue.allergens[7]
      const wheat = cereals.details.find(
        (detail: { code: string }) => detail.code === "wheat",
      )
      const hazelnut = nuts.details.find(
        (detail: { code: string }) => detail.code === "hazelnut",
      )
      const supplied = {
        status: "supplied",
        contains: [{ allergen_id: cereals.id, detail_ids: [wheat.id] }],
        may_contain: [{ allergen_id: nuts.id, detail_ids: [hazelnut.id] }],
        none_declared: false,
      }
      const first = await post()
      expect(first.data.categories[0].dishes[0].allergens).toEqual({
        status: "unknown",
      })
      const dishId = first.data.categories[0].dishes[0].id
      expect((await edit(dishId, { allergens: supplied })).status).toBe(200)
      expect((await menu())[0].dishes[0].allergens).toEqual(supplied)
      const createdSupplied = await post({
        request_id: "supplied-dish",
        allergens: supplied,
      })
      expect(createdSupplied.status).toBe(200)
      expect(createdSupplied.data.categories[0].dishes[1].allergens).toEqual(
        supplied,
      )
      const empty = {
        status: "supplied",
        contains: [],
        may_contain: [],
        none_declared: true,
      }
      expect(
        (
          await edit(dishId, {
            request_id: "none",
            revision: 2,
            allergens: empty,
          })
        ).status,
      ).toBe(200)
      expect((await menu())[0].dishes[0].allergens).toEqual(empty)
      const createdEmpty = await post({
        request_id: "empty-dish",
        allergens: empty,
      })
      expect(createdEmpty.status).toBe(200)
      expect(createdEmpty.data.categories[0].dishes[2].allergens).toEqual(empty)
      expect((await menu())[0].dishes[0]).toMatchObject({
        revision: 3,
        allergens: empty,
      })
      expect(
        (await service().listMenuDishes({}))[0].successful_change,
      ).toMatchObject({
        actor_id: staffId,
        kind: "edit",
      })
    })
    it("saves fixed food-label references with independent yes, no and unknown states", async () => {
      const labels = (await api.get("/partner/food-catalogue", config)).data
        .food_labels
      const declaration = labels.map((label: { id: string; code: string }) => ({
        food_label_id: label.id,
        state:
          label.code === "halal"
            ? "yes"
            : label.code === "chili"
              ? "no"
              : "unknown",
      }))
      const created = await post({ food_labels: declaration })
      expect(created.status).toBe(200)
      const dishId = created.data.categories[0].dishes[0].id
      expect(created.data.categories[0].dishes[0].food_labels).toEqual(
        declaration,
      )
      const changed = declaration.map(
        (entry: (typeof declaration)[number]) => ({
          ...entry,
          state: entry.state === "yes" ? "no" : "yes",
        }),
      )
      expect((await edit(dishId, { food_labels: changed })).status).toBe(200)
      expect((await menu())[0].dishes[0].food_labels).toEqual(changed)
      expect((await menu())[0].dishes[0].revision).toBe(2)
    })
    it.each([
      {
        reason: "EP: unknown reference",
        scenario: "reference",
        code: "dish_food_labels_invalid",
      },
      {
        reason: "DT: duplicate reference",
        scenario: "duplicate",
        code: "dish_food_labels_invalid",
      },
      {
        reason: "EP: invalid state",
        scenario: "state",
        code: "dish_input_invalid",
      },
    ])("refuses food labels: $reason", async ({ scenario, code }) => {
      const dishId = (await post()).data.categories[0].dishes[0].id
      const invalid = foodLabels.map((entry) => ({ ...entry }))
      if (scenario === "reference") invalid[0].food_label_id = "not-a-label"
      if (scenario === "duplicate")
        invalid[1].food_label_id = invalid[0].food_label_id
      const payload =
        scenario === "state"
          ? invalid.map((entry, index) =>
              index === 0 ? { ...entry, state: "maybe" } : entry,
            )
          : invalid
      const response = await edit(dishId, { food_labels: payload })
      expect(response.status).toBe(400)
      expect(response.data.code).toBe(code)
      expect((await menu())[0].dishes[0]).toMatchObject({
        revision: 1,
        food_labels: foodLabels,
      })
    })
    it.each([
      [
        "empty supplied declaration without confirmation",
        "unconfirmed",
        "dish_allergens_invalid",
      ],
      [
        "one allergen in both states",
        "contradictory",
        "dish_allergens_invalid",
      ],
      ["a nut detail under cereals", "wrong-parent", "dish_allergens_invalid"],
      ["an unknown group ID", "unknown-id", "dish_allergens_invalid"],
      ["lists under unknown state", "unknown-with-list", "dish_input_invalid"],
    ])(
      "refuses %s without changing the dish",
      async (_reason, scenario, code) => {
        await seedFoodCatalogue({ container: getContainer() })
        const catalogue = (await api.get("/partner/food-catalogue", config))
          .data
        const cereals = catalogue.allergens[0]
        const nuts = catalogue.allergens[7]
        const wheat = cereals.details.find(
          (detail: { code: string }) => detail.code === "wheat",
        )
        const hazelnut = nuts.details.find(
          (detail: { code: string }) => detail.code === "hazelnut",
        )
        const contains = [{ allergen_id: cereals.id, detail_ids: [wheat.id] }]
        const cases = {
          unconfirmed: {
            status: "supplied",
            contains: [],
            may_contain: [],
            none_declared: false,
          },
          contradictory: {
            status: "supplied",
            contains,
            may_contain: contains,
            none_declared: false,
          },
          "wrong-parent": {
            status: "supplied",
            contains: [{ allergen_id: cereals.id, detail_ids: [hazelnut.id] }],
            may_contain: [],
            none_declared: false,
          },
          "unknown-id": {
            status: "supplied",
            contains: [{ allergen_id: "missing", detail_ids: [] }],
            may_contain: [],
            none_declared: false,
          },
          "unknown-with-list": { status: "unknown", contains },
        }
        const dishId = (await post()).data.categories[0].dishes[0].id
        const response = await edit(dishId, {
          allergens: cases[scenario as keyof typeof cases],
        })
        expect(response.status).toBe(400)
        expect(response.data.code).toBe(code)
        expect((await menu())[0].dishes[0]).toMatchObject({
          revision: 1,
          allergens: { status: "unknown" },
          food_labels: foodLabels,
        })
      },
    )
    it("publishes an edit together and refuses a colleague's stale version", async () => {
      const created = await post()
      const dishId = created.data.categories[0].dishes[0].id
      const [anna, bo] = await Promise.all([
        edit(dishId, { request_id: "anna", price: "95" }),
        edit(dishId, { request_id: "bo", price: "105" }),
      ])
      expect([anna.status, bo.status].sort()).toEqual([200, 409])
      expect((await menu())[0].dishes[0]).toMatchObject({
        revision: 2,
        description: { da: "Tomat", en: "Tomato" },
      })
      const winner = anna.status === 200 ? anna : bo
      expect((await menu())[0].dishes[0].price.amount).toBe(
        winner === anna ? 95 : 105,
      )
      const stale = await edit(dishId, { revision: 1 })
      expect(stale.data.code).toBe("dish_stale")
      expect(stale.data.dish).toMatchObject({ id: dishId, revision: 2 })
      expect(
        (
          await edit(dishId, {
            request_id: winner === anna ? "anna" : "bo",
            price: winner === anna ? "95" : "105",
          })
        ).status,
      ).toBe(200)
    })
    it("switches only availability, keeps history, and refuses stale or foreign changes", async () => {
      const dishId = (await post()).data.categories[0].dishes[0].id
      const before = (await menu())[0].dishes[0]
      const sold = await availability(dishId)
      expect(sold.status).toBe(200)
      expect(sold.data.dish).toMatchObject({
        id: dishId,
        revision: 2,
        is_sold_out: true,
        name: before.name,
        price: before.price,
      })
      expect((await menu())[0].dishes[0]).toEqual(sold.data.dish)
      expect((await availability(dishId)).status).toBe(200)
      const stale = await availability(dishId, {
        request_id: "other-attempt",
        is_sold_out: false,
      })
      expect(stale.status).toBe(409)
      expect(stale.data).toMatchObject({
        code: "dish_stale",
        dish: { id: dishId, revision: 2, is_sold_out: true },
      })
      expect((await availability(dishId, { is_sold_out: false })).status).toBe(
        409,
      )
      const other = await restaurant("foreign-availability")
      expect((await availability(dishId, {}, other.id)).status).toBe(404)
      const restored = await availability(dishId, {
        request_id: "restore",
        revision: 2,
        is_sold_out: false,
      })
      expect(restored.status).toBe(200)
      const content = (await service().listMenuDishes({}))[0]
      expect(content.availability_history).toMatchObject({
        entries: [
          {
            actor_id: staffId,
            actor_name: "Sofie",
            resource_id: dishId,
            is_sold_out: true,
            occurred_at: expect.any(String),
          },
          {
            actor_id: staffId,
            resource_id: dishId,
            is_sold_out: false,
            occurred_at: expect.any(String),
          },
        ],
      })
      expect(content.availability_history?.entries).toHaveLength(2)
      expect(await service().retrieveRestaurant(restaurantId)).toMatchObject({
        is_active: false,
        is_open: false,
      })
    })
    it("rejects extra dish fields and revoked staff without history", async () => {
      const dishId = (await post()).data.categories[0].dishes[0].id
      expect((await availability(dishId, { price: "1" })).status).toBe(400)
      await service().updateRestaurantStaffs({ id: staffId, status: "revoked" })
      expect((await availability(dishId)).status).toBe(403)
      expect(
        (await service().listMenuDishes({}))[0].availability_history,
      ).toBeNull()
    })
    it("records no availability history for a failed write and reconciles a lost acknowledgement", async () => {
      const dishId = (await post()).data.categories[0].dishes[0].id
      const original = service().updateMenuDishes.bind(service())
      const update = jest
        .spyOn(service(), "updateMenuDishes")
        .mockRejectedValueOnce(new Error("write failed"))
      const failed = await availability(dishId)
      expect(failed.status).toBe(503)
      expect(failed.data.code).toBe("dish_publication_uncertain")
      expect((await menu())[0].dishes[0]).toMatchObject({
        revision: 1,
        is_sold_out: false,
      })
      expect(
        (await service().listMenuDishes({}))[0].availability_history,
      ).toBeNull()
      update.mockImplementationOnce(async (...args) => {
        await original(...args)
        throw new Error("acknowledgement lost")
      })
      expect((await availability(dishId)).status).toBe(200)
      update.mockRestore()
      expect((await availability(dishId)).status).toBe(200)
      expect(
        (await service().listMenuDishes({}))[0].availability_history?.entries,
      ).toHaveLength(1)
    })
    it("keeps the previous menu and change record if the visibility write fails", async () => {
      const created = await post()
      const before = await menu()
      const dishId = before[0].dishes[0].id
      const original = service().updateMenuDishes.bind(service())
      const failed = jest
        .spyOn(service(), "updateMenuDishes")
        .mockImplementationOnce(original)
        .mockRejectedValueOnce(new Error("injected late failure"))
      const response = await edit(dishId)
      expect(response.status).toBe(503)
      failed.mockRestore()
      expect(await menu()).toEqual(before)
      expect(await nativePrice(dishId)).toBe(before[0].dishes[0].price.amount)
      const content = (await service().listMenuDishes({}))[0]
      expect(content.revision).toBe(1)
      expect(content.successful_change).toMatchObject({ kind: "create" })
      expect((await edit(dishId)).status).toBe(200)
    })
    it("reconciles a lost acknowledgement for a committed edit", async () => {
      const dishId = (await post()).data.categories[0].dishes[0].id
      const original = service().updateMenuDishes.bind(service())
      const update = jest
        .spyOn(service(), "updateMenuDishes")
        .mockImplementationOnce(original)
        .mockImplementationOnce(async (...args) => {
          await original(...args)
          throw new Error("acknowledgement lost")
        })
      const first = await edit(dishId)
      expect(first.status).toBe(200)
      update.mockRestore()
      expect((await menu())[0].dishes[0]).toMatchObject({ revision: 2 })
      expect((await edit(dishId)).status).toBe(200)
      expect(await nativePrice(dishId)).toBe(105.5)
    })
    it("changes and removes an optional bilingual description without changing dish identity", async () => {
      const dishId = (await post()).data.categories[0].dishes[0].id
      expect((await edit(dishId)).status).toBe(200)
      expect(
        (
          await edit(dishId, {
            request_id: "second-edit",
            revision: 2,
            description: { da: "Ost", en: "Cheese" },
          })
        ).status,
      ).toBe(200)
      const removed = await edit(dishId, {
        request_id: "third-edit",
        revision: 3,
        description: null,
      })
      expect(removed.status).toBe(200)
      expect((await menu())[0].dishes[0]).toMatchObject({
        id: dishId,
        revision: 4,
        description: null,
      })
    })
    it("validates paired descriptions and protects ownership and revoked access", async () => {
      const dishId = (await post()).data.categories[0].dishes[0].id
      for (const description of [
        { da: "Only Danish", en: "" },
        { da: "a".repeat(2001), en: "English" },
        { da: "<b>markup</b>", en: "English" },
      ])
        expect((await edit(dishId, { description })).status).toBe(400)
      const other = await restaurant("foreign-edit")
      expect((await edit(dishId, {}, other.id)).status).toBe(404)
      await service().updateRestaurantStaffs({ id: staffId, status: "revoked" })
      expect((await edit(dishId)).status).toBe(403)
      expect(
        (await api.get(`/partner/restaurants/${restaurantId}/dishes`, config))
          .status,
      ).toBe(403)
    })

    it("reconciles a lost database acknowledgement after the publication commit", async () => {
      const original = service().updateMenuDishes.bind(service())
      const update = jest
        .spyOn(service(), "updateMenuDishes")
        .mockImplementationOnce(async (...args) => {
          await original(...args)
          throw new Error("acknowledgement lost")
        })
      const uncertain = await post()
      expect(uncertain.status).toBe(503)
      expect(uncertain.data).toMatchObject({
        type: "unexpected_state",
        code: "dish_publication_uncertain",
      })
      update.mockRestore()
      const published = await menu()
      expect(published[0].dishes).toHaveLength(1)
      const retry = await post()
      expect(retry.status).toBe(200)
      expect(retry.data.categories).toEqual(published)
      expect(
        await service().listMenuDishes({ publication_committed: true }),
      ).toHaveLength(1)
    })

    it.each(["0", "-1", "95.555", "95,555", "1,000.00", "1e2"])(
      "refuses %s without changing the menu",
      async (price) => {
        const response = await post({ price })
        expect(response.status).toBe(400)
        expect(response.data.code).toBe("dish_input_invalid")
        expect(await menu()).toEqual([])
      },
    )
    it("refuses foreign categories, foreign Restaurants, revoked access and invalid names", async () => {
      const other = await restaurant("other")
      const foreign = await service().createMenuCategories({
        restaurant_id: other.id,
        name_da: "Andet",
        name_en: "Other",
        request_id: "other",
        creation_name: {},
        history: {},
      })
      expect((await post({ category_id: foreign.id })).status).toBe(404)
      expect((await post({}, other.id)).status).toBe(404)
      expect(
        (await post({ name: { da: "<b>Ret</b>", en: "Dish" } })).status,
      ).toBe(400)
      expect((await post({ name: { da: "Ret", en: "" } })).status).toBe(400)
      await service().updateRestaurantStaffs({ id: staffId, status: "revoked" })
      expect((await post()).status).toBe(403)
      expect(await menu()).toEqual([])
    })
    it("refuses signed-out reads and writes and another actor type", async () => {
      const path = `/partner/restaurants/${restaurantId}/dishes`
      expect((await api.get(path, { validateStatus: () => true })).status).toBe(
        401,
      )
      expect(
        (await api.post(path, {}, { validateStatus: () => true })).status,
      ).toBe(401)
      const token = generateJwtToken(
        { actor_id: staffId, actor_type: "user", auth_identity_id: "auth" },
        {
          secret: getContainer().resolve(
            ContainerRegistrationKeys.CONFIG_MODULE,
          ).projectConfig.http.jwtSecret,
          expiresIn: "1h",
        },
      )
      expect(
        (
          await api.get(path, {
            headers: { authorization: `Bearer ${token}` },
            validateStatus: () => true,
          })
        ).status,
      ).toBe(401)
    })

    it("recovers durable interrupted creation without a second dish", async () => {
      const operation = await service().createMenuDishCreations({
        restaurant_id: restaurantId,
        request_id: "first-dish",
        actor_id: staffId,
        actor_name: "Sofie",
        input: {
          category_id: categoryId,
          name: { da: "Dagens ret", en: "Dish of the day" },
          price: 95.5,
          allergens: { status: "unknown" },
          food_labels: foodLabels,
        },
      })
      await createProductsWorkflow(getContainer()).run({
        input: {
          products: [
            {
              title: "Interrupted",
              handle: `staff-dish-${operation.id.replaceAll("_", "-").toLowerCase()}`,
              options: [{ title: "Portion", values: ["Regular"] }],
            },
          ],
        },
      })
      expect(await menu()).toEqual([])
      const response = await post()
      expect(response.status).toBe(200)
      expect(response.data.categories[0].dishes).toHaveLength(1)
      expect((await post()).data).toEqual(response.data)
    })
    it("hides failed publication and records one successful change after retry", async () => {
      const previous = await post({ request_id: "existing" })
      expect(previous.status).toBe(200)
      const update = jest
        .spyOn(service(), "updateMenuDishes")
        .mockRejectedValueOnce(new Error("publication interrupted"))
      expect((await post()).status).toBe(503)
      update.mockRestore()
      expect(await menu()).toEqual(previous.data.categories)
      const saved = await post()
      expect(saved.status).toBe(200)
      expect((await post()).data).toEqual(saved.data)
      const contents = await service().listMenuDishes({
        publication_committed: true,
      })
      expect(contents).toHaveLength(2)
      expect(
        contents.find(
          ({ successful_change }) =>
            successful_change?.resource_id ===
            saved.data.categories[0].dishes[1].id,
        )?.successful_change,
      ).toMatchObject({
        actor_id: staffId,
        resource_id: saved.data.categories[0].dishes[1].id,
        occurred_at: expect.any(String),
      })
    })
  },
})
