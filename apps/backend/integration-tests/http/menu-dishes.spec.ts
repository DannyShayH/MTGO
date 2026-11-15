import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  QueryContext,
} from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { RESTAURANT_MODULE } from "../../src/modules/restaurant"
import RestaurantModuleService from "../../src/modules/restaurant/service"
import { readPublishedMenu } from "../../src/workflows/menu"

jest.setTimeout(120000)
medusaIntegrationTestRunner({
  dbName: "medusa_ci_menu_dishes_http",
  env: { JWT_SECRET: "ci-only-dishes-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer }) => {
    const config = {
      headers: { authorization: "" },
      validateStatus: () => true,
    }
    let restaurantId: string
    let categoryId: string
    let staffId: string
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
    beforeEach(async () => {
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
