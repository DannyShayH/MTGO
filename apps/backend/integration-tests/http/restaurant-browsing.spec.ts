import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import { ExecArgs } from "@medusajs/framework/types"
import {
  createApiKeysWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows"
import register from "../../src/modules/postal-code/data/postal-codes.json"
import { syncPostalCodeRegisterWorkflow } from "../../src/workflows/postal-codes"
import { createAuthorizedStaffWorkflow } from "../../src/workflows/restaurant-staff"
import seedDemoMenu from "../../src/scripts/seed-demo-menu"

jest.setTimeout(180000)

const claimsOf = (token: string) =>
  JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())

const details = (name: string, postalCode: string, city: string) => ({
  name,
  address_street: `${name} street 1`,
  address_postal_code: postalCode,
  address_city: city,
  contact_phone: "+45 12 34 56 78",
  contact_email: `${name.toLowerCase().replace(/\W+/g, "-")}@example.test`,
})

type PublicRestaurant = {
  id: string
  name: string
  delivery_area_match?: {
    served_postal_codes: number
    location_postal_codes: number
  }
}

medusaIntegrationTestRunner({
  dbName: "medusa_ci_restaurant_browsing_http",
  env: { JWT_SECRET: "ci-only-browsing-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer }) => {
    const password = "ci-only-staff-password"
    let admin: { authorization: string }
    let store: { "x-publishable-api-key": string }
    let staffCount = 0

    const browse = (
      params: Partial<Record<string, string>> = {},
      headers: object = store,
    ) =>
      api.get("/store/restaurants", {
        headers,
        params,
        validateStatus: () => true,
      })
    const lookup = (
      params: Partial<Record<string, string>> = {},
      headers: object = store,
    ) =>
      api.get("/store/postal-codes", {
        headers,
        params,
        validateStatus: () => true,
      })
    const names = (response: { data: { restaurants: PublicRestaurant[] } }) =>
      response.data.restaurants.map(({ name }) => name)

    /** A Restaurant with terms, a delivery area and one staff login; inactive until activated. */
    async function setUpRestaurant(
      restaurant: ReturnType<typeof details>,
      deliveryArea: string[],
    ) {
      const container = getContainer()
      const id = (
        await api.post("/admin/restaurants", restaurant, { headers: admin })
      ).data.restaurant.id as string
      const path = `/admin/restaurants/${id}`
      await api.post(
        `${path}/commercial-terms`,
        { terms_version: "common_mvp_v1" },
        { headers: admin },
      )
      await api.post(
        `${path}/delivery-area-postal-codes/batch`,
        { add: deliveryArea },
        { headers: admin },
      )
      const email = `staff-${++staffCount}@example.test`
      const registered = await api.post(
        "/auth/restaurant_staff/emailpass/register",
        { email, password },
      )
      await createAuthorizedStaffWorkflow(container).run({
        input: {
          restaurant_id: id,
          name: "Sofie Jensen",
          email,
          auth_identity_id: claimsOf(registered.data.token).auth_identity_id,
        },
      })
      const staff = {
        authorization: `Bearer ${
          (
            await api.post("/auth/restaurant_staff/emailpass", {
              email,
              password,
            })
          ).data.token
        }`,
      }
      return {
        id,
        path,
        activate: async () => {
          await seedDemoMenu({ container, args: [id] } as ExecArgs)
          const response = await api.post(
            `${path}/activate`,
            {},
            { headers: admin, validateStatus: () => true },
          )
          expect(response.status).toBe(200)
        },
        open: async () => {
          const response = await api.post(
            `/partner/restaurants/${id}/open`,
            {},
            { headers: staff, validateStatus: () => true },
          )
          expect(response.status).toBe(200)
        },
        deactivate: () =>
          api.post(
            `${path}/deactivate`,
            { reason: "Browsing test" },
            { headers: admin },
          ),
        changeDeliveryArea: (body: { add?: string[]; remove?: string[] }) =>
          api.post(`${path}/delivery-area-postal-codes/batch`, body, {
            headers: admin,
          }),
      }
    }

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
      const {
        result: [channel],
      } = await createSalesChannelsWorkflow(container).run({
        input: { salesChannelsData: [{ name: "Default Sales Channel" }] },
      })
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
    })

    it("lists active Restaurants with public fields only and reflects opening, closing and deactivation on the next fetch", async () => {
      const pizzeria = await setUpRestaurant(
        details("Pizzeria Nørrebro", "2200", "København N"),
        ["2200"],
      )
      await setUpRestaurant(
        details("Inactive Kitchen", "2200", "København N"),
        ["2200"],
      )
      expect(names(await browse())).toEqual([])

      await pizzeria.activate()
      const listed = await browse()
      expect(listed.status).toBe(200)
      expect(listed.headers["cache-control"]).toBe("no-store")
      expect(listed.data).toEqual({
        restaurants: [
          {
            id: pizzeria.id,
            name: "Pizzeria Nørrebro",
            address_city: "København N",
            is_open: false,
            receiving_new_orders: false,
            reason: "restaurant_closed",
            cover: null,
          },
        ],
        count: 1,
        location: null,
      })

      await pizzeria.open()
      expect((await browse()).data.restaurants[0]).toMatchObject({
        is_open: true,
        receiving_new_orders: true,
        reason: null,
      })

      await pizzeria.deactivate()
      expect(names(await browse())).toEqual([])
    })

    it("filters an exact postal code by delivery-area membership, never by the pickup address", async () => {
      const aarhus = await setUpRestaurant(
        details("Aarhus Kitchen", "8000", "Aarhus C"),
        ["2200"],
      )
      const copenhagen = await setUpRestaurant(
        details("Nørrebro Kitchen", "2200", "København N"),
        ["8000"],
      )
      await aarhus.activate()
      await copenhagen.activate()

      const served = await browse({ postal_code: "2200" })
      expect(served.status).toBe(200)
      expect(served.data.location).toEqual({
        kind: "postal_code",
        postal_code: "2200",
        name: "København N",
        postal_codes: 1,
      })
      expect(served.data.restaurants).toEqual([
        expect.objectContaining({
          name: "Aarhus Kitchen",
          delivery_area_match: {
            served_postal_codes: 1,
            location_postal_codes: 1,
          },
        }),
      ])
      expect(names(await browse({ postal_code: "8000" }))).toEqual([
        "Nørrebro Kitchen",
      ])

      // A delivery-area change shows on the next fetch, in name order.
      await aarhus.changeDeliveryArea({ add: ["8000"], remove: ["2200"] })
      expect(names(await browse({ postal_code: "2200" }))).toEqual([])
      expect(names(await browse({ postal_code: "8000" }))).toEqual([
        "Aarhus Kitchen",
        "Nørrebro Kitchen",
      ])
    })

    it("resolves a town to every registered code, lists a Restaurant once and says how much of the town it serves", async () => {
      const part = await setUpRestaurant(
        details("Indre By Kitchen", "1050", "København K"),
        ["1050", "1051", "2200"],
      )
      const elsewhere = await setUpRestaurant(
        details("Nørrebro Kitchen", "2200", "København N"),
        ["2200"],
      )
      await part.activate()
      await elsewhere.activate()

      const town = await browse({ town: "københavn k" })
      expect(town.status).toBe(200)
      expect(town.data.location).toEqual({
        kind: "town",
        name: "København K",
        postal_codes: 213,
      })
      expect(town.data.restaurants).toEqual([
        expect.objectContaining({
          name: "Indre By Kitchen",
          delivery_area_match: {
            served_postal_codes: 2,
            location_postal_codes: 213,
          },
        }),
      ])
      expect(town.data.count).toBe(1)
    })

    it.each([
      {
        params: { postal_code: "220" },
        status: 400,
        reason: "BVA: three digits",
      },
      {
        params: { postal_code: "22000" },
        status: 400,
        reason: "BVA: five digits",
      },
      {
        params: { postal_code: "abcd" },
        status: 400,
        reason: "EP: not digits",
      },
      {
        params: { postal_code: "9998" },
        status: 400,
        code: "postal_code_unknown",
        reason: "EP: a well-formed code that is not in the register",
      },
      {
        params: { town: "Atlantis" },
        status: 400,
        code: "town_unknown",
        reason: "EP: a town that is not in the register",
      },
      {
        params: { town: "København" },
        status: 400,
        code: "town_unknown",
        reason: "EP: a partial town name is not a selection",
      },
      {
        params: { town: "" },
        status: 400,
        reason: "BVA: an empty town",
      },
      {
        params: { postal_code: "2200", town: "København N" },
        status: 400,
        code: "location_ambiguous",
        reason: "DT: a code and a town together",
      },
    ])(
      "refuses an unusable location without broadening the list: $reason",
      async ({ params, status, code }) => {
        const response = await browse(params)
        expect(response.status).toBe(status)
        if (code) expect(response.data.code).toBe(code)
        expect(response.data.restaurants).toBeUndefined()
      },
    )

    it("needs the publishable key and no sign-in", async () => {
      expect((await browse({}, {})).status).toBe(400)
      expect((await lookup({ q: "2200" }, {})).status).toBe(400)
      expect((await browse({}, store)).status).toBe(200)
    })

    it.each([
      {
        q: "københavn",
        expected: ["København K", "København N", "København V"],
        reason: "EP: a town name in any case offers every matching town",
      },
      {
        q: "22",
        expected: ["København N"],
        reason: "EP: a postal-code prefix",
      },
      {
        q: "Tårnby Kommune",
        expected: ["Kastrup"],
        reason: "EP: a municipality",
      },
      { q: "Atlantis", expected: [], reason: "EP: no match" },
    ])("looks up locations publicly: $reason", async ({ q, expected }) => {
      const response = await lookup({ q })
      expect(response.status).toBe(200)
      const towns = new Set(
        response.data.postal_codes.map(({ name }: { name: string }) => name),
      )
      for (const town of expected) expect(towns.has(town)).toBe(true)
      if (!expected.length) expect(response.data.postal_codes).toEqual([])
    })

    it("keeps a multi-code town complete in the lookup", async () => {
      const { data } = await lookup({ q: "København K" })
      expect(
        data.postal_codes.filter(
          ({ name }: { name: string }) => name === "København K",
        ),
      ).toHaveLength(213)
    })

    it.each([
      { params: {}, status: 400, reason: "EP: the search text is required" },
      { params: { q: "" }, status: 400, reason: "BVA: empty search text" },
      {
        params: { q: "x".repeat(256) },
        status: 400,
        reason: "BVA: 256 characters",
      },
      {
        params: { q: "x".repeat(255) },
        status: 200,
        reason: "BVA: 255 characters",
      },
    ])("validates the lookup text: $reason", async ({ params, status }) => {
      expect((await lookup(params)).status).toBe(status)
    })
  },
})
