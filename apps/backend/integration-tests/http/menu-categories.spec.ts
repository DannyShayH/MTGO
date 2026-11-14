import {
  createWorkflow,
  createStep,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { RESTAURANT_MODULE } from "../../src/modules/restaurant"
import RestaurantModuleService from "../../src/modules/restaurant/service"
import { mutateMenuCategoryWorkflow } from "../../src/workflows/menu-categories"

jest.setTimeout(120000)
medusaIntegrationTestRunner({
  dbName: "medusa_ci_menu_categories_http",
  env: { JWT_SECRET: "ci-only-menu-categories-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer }) => {
    const config = {
      headers: { authorization: "" },
      validateStatus: () => true,
    }
    let path: string
    let restaurantId: string
    let staffId: string
    const service = () =>
      getContainer().resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    const fixtureRestaurant = (suffix: string) =>
      service().createRestaurants({
        name: `Category fixture ${suffix}`,
        address_street: "Test 1",
        address_postal_code: "2200",
        address_city: "København N",
        contact_phone: "12345678",
        contact_email: "categories@example.test",
        pickup_address_key: `categories:${suffix}`,
      })
    const token = (id: string, actor = "restaurant_staff") =>
      generateJwtToken(
        { actor_id: id, actor_type: actor, auth_identity_id: "auth_test" },
        {
          secret: getContainer().resolve(
            ContainerRegistrationKeys.CONFIG_MODULE,
          ).projectConfig.http.jwtSecret,
          expiresIn: "1h",
        },
      )
    const create = (
      request_id = "first-request",
      name = { da: "Drikke", en: "Drinks" },
    ) => api.post(path, { request_id, name, revision: 0 }, config)
    beforeEach(async () => {
      const restaurant = await fixtureRestaurant("own")
      restaurantId = restaurant.id
      const staff = await service().createRestaurantStaffs({
        restaurant_id: restaurantId,
        name: "Mette",
        email: "mette@example.test",
        status: "authorized",
      })
      staffId = staff.id
      config.headers.authorization = `Bearer ${token(staffId)}`
      path = `/partner/restaurants/${restaurantId}/categories`
    })

    it("creates complete trimmed bilingual empty categories in append order", async () => {
      const first = await create("first", { da: "  Drikke  ", en: " Drinks " })
      expect(first.status).toBe(200)
      expect(first.data.category).toMatchObject({
        name: { da: "Drikke", en: "Drinks" },
        revision: 1,
      })
      const second = await create("second", { da: "A", en: "A" })
      expect((await api.get(path, config)).data.categories).toEqual([
        first.data.category,
        second.data.category,
      ])
      const renamed = await api.post(
        `${path}/${first.data.category.id}`,
        { name: { da: "Vand", en: "Water" }, revision: 1 },
        config,
      )
      expect(renamed.status).toBe(200)
      expect(renamed.data.category).toMatchObject({
        name: { da: "Vand", en: "Water" },
        revision: 2,
      })
      expect(
        (await api.get(path, config)).data.categories.map(
          (row: { id: string }) => row.id,
        ),
      ).toEqual([first.data.category.id, second.data.category.id])
    })

    it.each([
      { name: { da: "", en: "Valid" }, reason: "BVA: empty Danish" },
      { name: { da: "Valid", en: "   " }, reason: "EP: whitespace English" },
      { name: { da: "Valid" }, reason: "EP: missing English" },
      {
        name: { da: "x".repeat(121), en: "Valid" },
        reason: "BVA: Danish above maximum",
      },
      {
        name: { da: "Valid", en: "x".repeat(121) },
        reason: "BVA: English above maximum",
      },
      {
        name: { da: "<img src=x onerror=alert(1)>", en: "Valid" },
        reason: "EP: HTML",
      },
      {
        name: { da: "Valid", en: "Bad\u0000name" },
        reason: "EP: control characters",
      },
      { name: { da: "{hej}", en: "Valid" }, reason: "EP: braces" },
      { name: { da: "Valid", en: "Pizza 🍕" }, reason: "EP: emoji" },
      { name: { da: "#1 *mad*", en: "Valid" }, reason: "EP: symbols" },
      { name: { da: "Valid", en: "&-!" }, reason: "EP: punctuation only" },
    ])(
      "rejects invalid creation and rename without publication: $reason",
      async ({ name }) => {
        const original = (await create()).data.category
        expect(
          (
            await api.post(
              path,
              { name, revision: 0, request_id: "invalid" },
              config,
            )
          ).status,
        ).toBe(400)
        const response = await api.post(
          `${path}/${original.id}`,
          { name, revision: 1 },
          config,
        )
        expect(response.status).toBe(400)
        expect(response.data.code).toBe("category_input_invalid")
        expect((await api.get(path, config)).data.categories).toEqual([
          original,
        ])
      },
    )

    it("accepts one-character and 120-character names as inert plain text", async () => {
      const result = await create("boundaries", {
        da: "x",
        en: "x".repeat(120),
      })
      expect(result.status).toBe(200)
      const plain = await create("plain", {
        da: "Pizza & pasta",
        en: 'Pizza "special" & pasta',
      })
      expect(plain.status).toBe(200)
      expect(plain.data.category.name.en).toBe('Pizza "special" & pasta')
      const punctuation = await create("punctuation", {
        da: "Børnemenu (3-8 år), 100% øko!",
        en: "Kids’ menu: soup/salad + drink?",
      })
      expect(punctuation.status).toBe(200)
    })

    it("refuses nested or shared category input and requires revisions", async () => {
      const original = (await create()).data.category
      for (const extra of [
        { parent_id: original.id },
        { restaurant_id: "other" },
      ]) {
        expect(
          (
            await api.post(
              path,
              {
                name: { da: "A", en: "A" },
                request_id: "bad",
                revision: 0,
                ...extra,
              },
              config,
            )
          ).status,
        ).toBe(400)
      }
      expect(
        (
          await api.post(
            `${path}/${original.id}`,
            { name: { da: "A", en: "A" } },
            config,
          )
        ).status,
      ).toBe(400)
      expect((await api.delete(`${path}/${original.id}`, config)).status).toBe(
        400,
      )
    })

    it.each([
      { actor: "customer", expected: 401, reason: "DT: Customer" },
      { actor: "user", expected: 401, reason: "DT: operator" },
      { actor: "signed_out", expected: 401, reason: "DT: signed out" },
      { actor: "revoked", expected: 403, reason: "DT: revoked staff" },
    ])(
      "protects every category endpoint: $reason",
      async ({ actor, expected }) => {
        const category = (await create()).data.category
        if (actor === "revoked")
          await service().updateRestaurantStaffs({
            id: staffId,
            status: "revoked",
          })
        const auth =
          actor === "revoked"
            ? config
            : {
                ...config,
                headers:
                  actor === "signed_out"
                    ? {}
                    : { authorization: `Bearer ${token(staffId, actor)}` },
              }
        expect((await api.get(path, auth)).status).toBe(expected)
        expect(
          (
            await api.post(
              path,
              {
                name: { da: "A", en: "A" },
                request_id: "forbidden",
                revision: 0,
              },
              auth,
            )
          ).status,
        ).toBe(expected)
        expect(
          (
            await api.post(
              `${path}/${category.id}`,
              { name: { da: "A", en: "A" }, revision: 1 },
              auth,
            )
          ).status,
        ).toBe(expected)
        expect(
          (
            await api.delete(`${path}/${category.id}`, {
              ...auth,
              data: { revision: 1 },
            })
          ).status,
        ).toBe(expected)
      },
    )

    it("refuses another Restaurant and another Restaurant's category ID", async () => {
      const own = (await create()).data.category
      const other = await fixtureRestaurant("other")
      const otherPath = `/partner/restaurants/${other.id}/categories`
      expect((await api.get(otherPath, config)).status).toBe(404)
      expect(
        (
          await api.post(
            otherPath,
            { request_id: "other", name: { da: "A", en: "A" }, revision: 0 },
            config,
          )
        ).status,
      ).toBe(404)
      expect(
        (
          await api.post(
            `${otherPath}/${own.id}`,
            { name: { da: "A", en: "A" }, revision: 1 },
            config,
          )
        ).status,
      ).toBe(404)
      const otherStaff = await service().createRestaurantStaffs({
        restaurant_id: other.id,
        name: "Other",
        email: "other@example.test",
        status: "authorized",
      })
      const otherConfig = {
        ...config,
        headers: { authorization: `Bearer ${token(otherStaff.id)}` },
      }
      const otherCategory = (
        await api.post(
          otherPath,
          {
            request_id: "other",
            name: { da: "Anden", en: "Other" },
            revision: 0,
          },
          otherConfig,
        )
      ).data.category
      expect(
        (
          await api.post(
            `${path}/${otherCategory.id}`,
            { name: { da: "A", en: "A" }, revision: 1 },
            config,
          )
        ).status,
      ).toBe(404)
      expect(
        (
          await api.delete(`${path}/${otherCategory.id}`, {
            ...config,
            data: { revision: 1 },
          })
        ).status,
      ).toBe(404)
      expect((await api.get(otherPath, otherConfig)).data.categories).toEqual([
        otherCategory,
      ])
    })

    it("retries creation exactly once and refuses conflicting or removed retries", async () => {
      const [first, retry] = await Promise.all([create(), create()])
      expect(first.status).toBe(200)
      expect(retry.status).toBe(200)
      expect(retry.data).toEqual(first.data)
      const persisted = await service().retrieveMenuCategory(
        first.data.category.id,
      )
      expect(persisted.history.entries).toEqual([
        expect.objectContaining({
          kind: "create",
          actor_id: staffId,
          actor_name: "Mette",
          name: { da: "Drikke", en: "Drinks" },
          occurred_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
        }),
      ])

      expect(
        (await create("first-request", { da: "Anden", en: "Other" })).data.code,
      ).toBe("category_retry_conflict")
      const id = first.data.category.id
      expect(
        (
          await api.delete(`${path}/${id}`, {
            ...config,
            data: { revision: 1 },
          })
        ).status,
      ).toBe(200)
      expect((await create()).data.code).toBe("category_retry_removed")
      const removed = await service().retrieveMenuCategory(id)
      expect(removed.restaurant_id).toBe(restaurantId)
      expect(removed.history.entries).toEqual([
        ...(persisted.history.entries as unknown[]),
        expect.objectContaining({
          kind: "remove",
          actor_id: staffId,
          actor_name: "Mette",
        }),
      ])

      expect((await api.get(path, config)).data.categories).toEqual([])
    })

    it("accepts one concurrent revision winner and refuses stale renames and removal", async () => {
      const category = (await create()).data.category
      const responses = await Promise.all(
        ["A", "B"].map((name) =>
          api.post(
            `${path}/${category.id}`,
            { name: { da: name, en: name }, revision: 1 },
            config,
          ),
        ),
      )
      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 409,
      ])
      expect(
        responses.find((response) => response.status === 409)!.data.code,
      ).toBe("category_stale")
      const current = (await api.get(path, config)).data.categories[0]
      const beforeRefusal = await service().retrieveMenuCategory(category.id)
      expect(beforeRefusal.history.entries).toHaveLength(2)
      expect(beforeRefusal.history.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "rename",
            actor_id: staffId,
            name: current.name,
          }),
        ]),
      )

      expect(
        (
          await api.delete(`${path}/${category.id}`, {
            ...config,
            data: { revision: 1 },
          })
        ).data.code,
      ).toBe("category_stale")
      expect((await api.get(path, config)).data.categories).toEqual([current])
      expect(
        (await service().retrieveMenuCategory(category.id)).history,
      ).toEqual(beforeRefusal.history)

      expect(
        (
          await api.delete(`${path}/${category.id}`, {
            ...config,
            data: { revision: current.revision },
          })
        ).status,
      ).toBe(200)
      expect((await api.get(path, config)).data.categories).toEqual([])
    })

    it("refuses removal of a category containing a Product at both HTTP and workflow boundaries", async () => {
      const category = (await create()).data.category
      const {
        result: [product],
      } = await createProductsWorkflow(getContainer()).run({
        input: {
          products: [
            {
              title: "Category dish",
              options: [{ title: "Portion", values: ["Regular"] }],
              variants: [
                {
                  title: "Regular",
                  options: { Portion: "Regular" },
                  manage_inventory: false,
                },
              ],
            },
          ],
        },
      })
      await getContainer()
        .resolve(ContainerRegistrationKeys.LINK)
        .create({
          [RESTAURANT_MODULE]: { menu_category_id: category.id },
          [Modules.PRODUCT]: { product_id: product.id },
        })
      const response = await api.delete(`${path}/${category.id}`, {
        ...config,
        data: { revision: 1 },
      })
      expect(response.status).toBe(409)
      expect(response.data.code).toBe("category_not_empty")
      const refused = await mutateMenuCategoryWorkflow(getContainer()).run({
        throwOnError: false,
        input: {
          kind: "remove",
          restaurant_id: restaurantId,
          staff_id: staffId,
          category_id: category.id,
          revision: 1,
        },
      })
      expect(refused.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            error: expect.objectContaining({ message: "category_not_empty" }),
          }),
        ]),
      )
      expect((await api.get(path, config)).data.categories).toEqual([category])
    })

    it("compensates a saved revision and its audit when a later boundary fails", async () => {
      const original = (await create()).data.category
      const persisted = await service().retrieveMenuCategory(original.id)
      const failAfterSave = createStep(
        "category-test-boundary-failure",
        async (_categoryId: string) => {
          throw new Error("external_boundary_unavailable")
        },
      )
      const failingWorkflow = createWorkflow(
        "category-test-compensation",
        function (input: {
          restaurant_id: string
          staff_id: string
          category_id: string
        }) {
          const saved = mutateMenuCategoryWorkflow.runAsStep({
            input: {
              kind: "rename",
              restaurant_id: input.restaurant_id,
              staff_id: input.staff_id,
              category_id: input.category_id,
              revision: 1,
              name: { da: "Fejl", en: "Failure" },
            },
          })
          failAfterSave(saved.category.id)
          return new WorkflowResponse(saved)
        },
      )
      const result = await failingWorkflow(getContainer()).run({
        throwOnError: false,
        input: {
          restaurant_id: restaurantId,
          staff_id: staffId,
          category_id: original.id,
        },
      })
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            error: expect.objectContaining({
              message: "external_boundary_unavailable",
            }),
          }),
        ]),
      )
      expect((await api.get(path, config)).data.categories).toEqual([original])
      expect(
        (await service().retrieveMenuCategory(original.id)).history,
      ).toEqual(persisted.history)
    })

    it("a compensated creation leaves no publication, history or reserved retry identity", async () => {
      const failAfterCreate = createStep(
        "category-test-create-failure",
        async (_categoryId: string) => {
          throw new Error("external_boundary_unavailable")
        },
      )
      const failingWorkflow = createWorkflow(
        "category-test-create-compensation",
        function (input: { restaurant_id: string; staff_id: string }) {
          const saved = mutateMenuCategoryWorkflow.runAsStep({
            input: {
              kind: "create",
              restaurant_id: input.restaurant_id,
              staff_id: input.staff_id,
              request_id: "compensated-creation",
              revision: 0,
              name: { da: "Drikke", en: "Drinks" },
            },
          })
          failAfterCreate(saved.category.id)
          return new WorkflowResponse(saved)
        },
      )
      const result = await failingWorkflow(getContainer()).run({
        throwOnError: false,
        input: { restaurant_id: restaurantId, staff_id: staffId },
      })
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            error: expect.objectContaining({
              message: "external_boundary_unavailable",
            }),
          }),
        ]),
      )
      expect((await api.get(path, config)).data.categories).toEqual([])
      expect(
        await service().listMenuCategories({
          restaurant_id: restaurantId,
          request_id: "compensated-creation",
        }),
      ).toEqual([])
      const retried = await create("compensated-creation")
      expect(retried.status).toBe(200)
      expect(
        (await service().retrieveMenuCategory(retried.data.category.id)).history
          .entries,
      ).toHaveLength(1)
    })

    it("enforces validation and authorization for direct workflow callers too", async () => {
      const invalid = await mutateMenuCategoryWorkflow(getContainer()).run({
        throwOnError: false,
        input: {
          kind: "create",
          restaurant_id: restaurantId,
          staff_id: staffId,
          name: { da: " ", en: "English" },
          request_id: "invalid",
          revision: 0,
        },
      })
      expect(invalid.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            error: expect.objectContaining({
              message: "category_input_invalid",
            }),
          }),
        ]),
      )
      await service().updateRestaurantStaffs({ id: staffId, status: "revoked" })
      const revoked = await mutateMenuCategoryWorkflow(getContainer()).run({
        throwOnError: false,
        input: {
          kind: "create",
          restaurant_id: restaurantId,
          staff_id: staffId,
          name: { da: "Dansk", en: "English" },
          request_id: "revoked",
          revision: 0,
        },
      })
      expect(revoked.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            error: expect.objectContaining({ message: "staff_access_revoked" }),
          }),
        ]),
      )
    })
  },
})
