import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  createProductsWorkflow,
} from "@medusajs/medusa/core-flows"
import { FOOD_CATALOGUE_MODULE } from "../../src/modules/food-catalogue"
import FoodCatalogueModuleService from "../../src/modules/food-catalogue/service"
import { RESTAURANT_MODULE } from "../../src/modules/restaurant"
import RestaurantModuleService from "../../src/modules/restaurant/service"
import seedFoodCatalogue from "../../src/migration-scripts/food-catalogue"

jest.setTimeout(120000)

medusaIntegrationTestRunner({
  dbName: "medusa_ci_food_catalogue_http",
  env: { JWT_SECRET: "ci-only-food-catalogue-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer }) => {
    let storeHeaders: { "x-publishable-api-key": string }
    beforeEach(async () => {
      const {
        result: [key],
      } = await createApiKeysWorkflow(getContainer()).run({
        input: {
          api_keys: [
            { title: "Catalogue test", type: "publishable", created_by: "" },
          ],
        },
      })
      storeHeaders = { "x-publishable-api-key": key.token }
    })
    it("seeds the complete bilingual catalogue during normal setup and preserves identities on repeat", async () => {
      await seedFoodCatalogue({ container: getContainer() })
      const response = await api.get("/store/food-catalogue", {
        headers: storeHeaders,
        validateStatus: () => true,
      })
      expect(response.status).toBe(200)
      const { allergens, food_labels } = response.data
      expect(allergens.map((row: { number: number }) => row.number)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
      ])
      expect(new Set(allergens.map((row: { id: string }) => row.id)).size).toBe(
        14,
      )
      expect(allergens[0]).toMatchObject({
        code: "cereals",
        name: {
          da: "Korn, der indeholder gluten",
          en: "Cereals containing gluten",
        },
      })
      expect(allergens[7].details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "brazil_nut",
            name: { da: "Paranød", en: "Brazil nut" },
          }),
        ]),
      )
      expect(allergens[11].description.en).toMatch(/10 mg\/kg.*10 mg\/litre/)
      expect(food_labels.map((row: { code: string }) => row.code)).toEqual([
        "halal",
        "chili",
        "garlic",
      ])
      for (const row of [...allergens, ...food_labels]) {
        expect(row.name.da.length).toBeGreaterThan(0)
        expect(row.name.en.length).toBeGreaterThan(0)
        expect(row.description.da.length).toBeGreaterThan(0)
        expect(row.description.en.length).toBeGreaterThan(0)
      }
      for (const label of food_labels)
        expect(label).not.toHaveProperty("number")
      // Existing commerce references must survive setup; dish editing is a later slice.
      const references = {
        contains: [allergens[0].id],
        may_contain: [allergens[7].id],
        specific_types: [
          allergens[7].details.find(
            (detail: { code: string }) => detail.code === "brazil_nut",
          ).id,
        ],
        food_labels: [food_labels[0].id],
      }
      const {
        result: [product],
      } = await createProductsWorkflow(getContainer()).run({
        input: {
          products: [
            {
              title: "Existing reference fixture",
              options: [{ title: "Portion", values: ["Regular"] }],
              variants: [
                {
                  title: "Regular",
                  options: { Portion: "Regular" },
                  manage_inventory: false,
                  prices: [{ currency_code: "dkk", amount: 95 }],
                },
              ],
              metadata: { food_references: references },
            },
          ],
        },
      })
      const operator = await getContainer()
        .resolve(Modules.USER)
        .createUsers({ email: "catalogue-operator@example.test" })
      const adminToken = generateJwtToken(
        {
          actor_id: operator.id,
          actor_type: "user",
          auth_identity_id: "auth_test",
        },
        {
          secret: getContainer().resolve(
            ContainerRegistrationKeys.CONFIG_MODULE,
          ).projectConfig.http.jwtSecret,
          expiresIn: "1h",
        },
      )
      const before = await api.get(`/admin/products/${product.id}`, {
        headers: { authorization: `Bearer ${adminToken}` },
      })
      await seedFoodCatalogue({ container: getContainer() })
      expect(
        (await api.get("/store/food-catalogue", { headers: storeHeaders }))
          .data,
      ).toEqual(response.data)
      const after = await api.get(`/admin/products/${product.id}`, {
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(after.data.product.metadata).toEqual(before.data.product.metadata)
      expect(after.data.product.metadata.food_references).toEqual(references)
    })

    it.each([
      { number: 1, code: "cereals", reason: "EP: duplicate existing group" },
      { number: 0, code: "invalid", reason: "BVA: below first group" },
      { number: 15, code: "invalid", reason: "BVA: above last group" },
      {
        number: 1,
        code: "another_cereal",
        reason: "EP: duplicate business number",
      },
      { number: 8, code: "cereals", reason: "EP: code mapped to wrong group" },
    ])(
      "rejects invalid catalogue identities: $reason",
      async ({ number, code }) => {
        await seedFoodCatalogue({ container: getContainer() })
        const service = getContainer().resolve<FoodCatalogueModuleService>(
          FOOD_CATALOGUE_MODULE,
        )
        await expect(
          service.createAllergens({
            number,
            code,
            name_da: "Test",
            name_en: "Test",
            description_da: "Test",
            description_en: "Test",
          }),
        ).rejects.toThrow()
        expect(
          (await api.get("/store/food-catalogue", { headers: storeHeaders }))
            .data.allergens,
        ).toHaveLength(14)
      },
    )

    it.each(["name_da", "name_en", "description_da", "description_en"])(
      "rejects a blank translation in %s",
      async (field) => {
        const service = getContainer().resolve<FoodCatalogueModuleService>(
          FOOD_CATALOGUE_MODULE,
        )
        await expect(
          service.createAllergens({
            code: "cereals",
            number: 1,
            name_da: "Korn",
            name_en: "Cereals",
            description_da: "Beskrivelse",
            description_en: "Description",
            [field]: "   ",
          }),
        ).rejects.toThrow()
      },
    )

    it.each([
      { parent_number: 1, code: "brazil_nut", reason: "DT: nut under cereals" },
      { parent_number: 8, code: "wheat", reason: "DT: cereal under nuts" },
      { parent_number: 9, code: "walnut", reason: "EP: unsupported parent" },
      {
        parent_number: 1,
        code: "invented_cereal",
        reason: "EP: unknown subordinate code",
      },
    ])(
      "rejects invalid subordinate references: $reason",
      async ({ parent_number, code }) => {
        const service = getContainer().resolve<FoodCatalogueModuleService>(
          FOOD_CATALOGUE_MODULE,
        )
        await expect(
          service.createAllergenDetails({
            parent_number,
            code,
            name_da: "Test",
            name_en: "Test",
          }),
        ).rejects.toThrow()
      },
    )

    it("refuses subordinate records whose parent does not exist", async () => {
      const service = getContainer().resolve<FoodCatalogueModuleService>(
        FOOD_CATALOGUE_MODULE,
      )
      await expect(
        service.createAllergenDetails({
          parent_number: 1,
          code: "wheat",
          name_da: "Hvede",
          name_en: "Wheat",
        }),
      ).rejects.toThrow()
    })

    it("reads database names for authorized staff of an inactive closed Restaurant and refuses their next request after revocation", async () => {
      await seedFoodCatalogue({ container: getContainer() })
      const service =
        getContainer().resolve<RestaurantModuleService>(RESTAURANT_MODULE)
      const restaurant = await service.createRestaurants({
        name: "Test",
        address_street: "Test 1",
        address_postal_code: "2200",
        address_city: "København N",
        contact_phone: "12345678",
        contact_email: "test@example.test",
        pickup_address_key: "test:1",
      })
      const staff = await service.createRestaurantStaffs({
        restaurant_id: restaurant.id,
        name: "Mette",
        email: "mette@example.test",
        status: "authorized",
      })
      const token = generateJwtToken(
        {
          actor_id: staff.id,
          actor_type: "restaurant_staff",
          auth_identity_id: "auth_test",
        },
        {
          secret: getContainer().resolve(
            ContainerRegistrationKeys.CONFIG_MODULE,
          ).projectConfig.http.jwtSecret,
          expiresIn: "1h",
        },
      )
      const headers = { authorization: `Bearer ${token}` }
      const publicData = (
        await api.get("/store/food-catalogue", { headers: storeHeaders })
      ).data
      const response = await api.get("/partner/food-catalogue", { headers })
      expect(response.data).toEqual(publicData)
      const catalogue = getContainer().resolve<FoodCatalogueModuleService>(
        FOOD_CATALOGUE_MODULE,
      )
      await catalogue.updateAllergens({
        id: publicData.allergens[0].id,
        name_en: "Database cereal name",
      })
      expect(
        (await api.get("/partner/food-catalogue", { headers })).data
          .allergens[0].name.en,
      ).toBe("Database cereal name")
      await service.updateRestaurantStaffs({ id: staff.id, status: "revoked" })
      expect(
        (
          await api.get("/partner/food-catalogue", {
            headers,
            validateStatus: () => true,
          })
        ).status,
      ).toBe(403)
    })

    it.each([
      { actor: undefined, expected: 401, reason: "DT: signed out" },
      { actor: "customer", expected: 401, reason: "DT: Customer actor" },
      { actor: "user", expected: 401, reason: "DT: operator actor" },
      {
        actor: "restaurant_staff",
        expected: 403,
        reason: "DT: absent/revoked staff",
      },
    ])("protects the staff catalogue: $reason", async ({ actor, expected }) => {
      const token =
        actor &&
        generateJwtToken(
          {
            actor_id: "absent",
            actor_type: actor,
            auth_identity_id: "auth_test",
          },
          {
            secret: getContainer().resolve(
              ContainerRegistrationKeys.CONFIG_MODULE,
            ).projectConfig.http.jwtSecret,
            expiresIn: "1h",
          },
        )
      const response = await api.get("/partner/food-catalogue", {
        headers: token ? { authorization: `Bearer ${token}` } : {},
        validateStatus: () => true,
      })
      expect(response.status).toBe(expected)
    })
  },
})
