import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import { ExecArgs } from "@medusajs/framework/types"
import register from "../../src/modules/postal-code/data/postal-codes.json"
import { syncPostalCodeRegisterWorkflow } from "../../src/workflows/postal-codes"
import { createAuthorizedStaffWorkflow } from "../../src/workflows/restaurant-staff"
import {
  createLinksWorkflow,
  createProductsWorkflow,
} from "@medusajs/medusa/core-flows"
import { RESTAURANT_ACTIVATED } from "../../src/workflows/restaurants"
import seedDemoMenu from "../../src/scripts/seed-demo-menu"
import { RESTAURANT_MODULE } from "../../src/modules/restaurant"

jest.setTimeout(120000)

const claimsOf = (token: string) =>
  JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())
const details = (name: string) => ({
  name,
  address_street: "Nørrebrogade 1",
  address_postal_code: "2200",
  address_city: "København N",
  contact_phone: "+45 12 34 56 78",
  contact_email: "kontakt@pizzeria.example",
})

medusaIntegrationTestRunner({
  dbName: "medusa_ci_restaurant_activation_http",
  env: { JWT_SECRET: "ci-only-activation-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer }) => {
    let headers: { authorization: string }
    let path: string
    let restaurantId: string
    let operatorId: string

    const tokenFor = (actor_id: string, actor_type: string) =>
      `Bearer ${generateJwtToken(
        { actor_id, actor_type, auth_identity_id: "auth_test" },
        {
          secret: getContainer().resolve(
            ContainerRegistrationKeys.CONFIG_MODULE,
          ).projectConfig.http.jwtSecret,
          expiresIn: "1h",
        },
      )}`
    const activate = (at = path, auth = headers) =>
      api.post(
        `${at}/activate`,
        {},
        { headers: auth, validateStatus: () => true },
      )

    /** Registers a login and makes it authorized staff, as accepting an invitation does. */
    const authorizeStaff = async (email = "sofie@pizzeria.example") => {
      const registered = await api.post(
        "/auth/restaurant_staff/emailpass/register",
        { email, password: "ci-only-staff-password" },
      )
      const { result } = await createAuthorizedStaffWorkflow(
        getContainer(),
      ).run({
        input: {
          restaurant_id: restaurantId,
          name: "Sofie Jensen",
          email,
          auth_identity_id: claimsOf(registered.data.token).auth_identity_id,
        },
      })
      return result.id as string
    }
    const addDeliveryArea = () =>
      api.post(
        `${path}/delivery-area-postal-codes`,
        { postal_code: "2200" },
        { headers },
      )
    const recordTerms = () =>
      api.post(
        `${path}/commercial-terms`,
        { terms_version: "common_mvp_v1" },
        { headers },
      )
    const seedMenu = (id = restaurantId) =>
      seedDemoMenu({ container: getContainer(), args: [id] } as ExecArgs)
    /** A dish of the Restaurant's own; a sold-out one has a stocked variant without inventory. */
    const linkDish = async (
      status: "draft" | "published",
      { isSoldOut = false } = {},
    ) => {
      const { result } = await createProductsWorkflow(getContainer()).run({
        input: {
          products: [
            {
              title: `Dish ${status}${isSoldOut ? " sold out" : ""}`,
              status,
              options: [{ title: "Size", values: ["Regular"] }],
              variants: [
                {
                  title: "Regular",
                  options: { Size: "Regular" },
                  manage_inventory: isSoldOut,
                  prices: [{ amount: 95, currency_code: "dkk" }],
                },
              ],
            },
          ],
        },
      })
      await createLinksWorkflow(getContainer()).run({
        input: [
          {
            [RESTAURANT_MODULE]: { restaurant_id: restaurantId },
            [Modules.PRODUCT]: { product_id: result[0].id },
          },
        ],
      })
    }
    const completeSetup = async () => {
      await authorizeStaff()
      await recordTerms()
      await addDeliveryArea()
      await seedMenu()
    }

    beforeEach(async () => {
      await syncPostalCodeRegisterWorkflow(getContainer()).run({
        input: { postal_codes: register.postal_codes },
      })
      const user = await getContainer().resolve(Modules.USER).createUsers({
        email: "operator@example.test",
        first_name: "Lene",
        last_name: "Holm",
      })
      operatorId = user.id
      headers = { authorization: tokenFor(user.id, "user") }
      const created = await api.post(
        "/admin/restaurants",
        details("Pizzeria Nørrebro"),
        { headers },
      )
      restaurantId = created.data.restaurant.id
      path = `/admin/restaurants/${restaurantId}`
    })

    it("refuses activation naming all four setup requirements when none is done (A7)", async () => {
      const response = await activate()
      expect(response.status).toBe(400)
      expect(response.data).toMatchObject({
        type: "not_allowed",
        missing: [
          "authorized_staff_missing",
          "commercial_terms_missing",
          "published_menu_missing",
          "delivery_area_missing",
        ],
      })
      expect(response.data.message).toBe(
        "activation_requirements_missing: authorized_staff_missing, commercial_terms_missing, published_menu_missing, delivery_area_missing",
      )
      const { restaurant } = (await api.get(path, { headers })).data
      expect(restaurant).toMatchObject({ is_active: false, is_open: false })
    })

    it("activates a Restaurant that meets every requirement and leaves it Closed (A9)", async () => {
      await completeSetup()
      const response = await activate()
      expect(response.status).toBe(200)
      expect(response.data.restaurant).toMatchObject({
        id: restaurantId,
        is_active: true,
        is_open: false,
        receiving_new_orders: false,
        reason: "restaurant_closed",
        menu: { published_dish_count: 1 },
        readiness: { can_activate: true },
      })
      const listed = (
        await api.get("/admin/restaurants", { headers })
      ).data.restaurants.find(({ id }: { id: string }) => id === restaurantId)
      expect(listed).toMatchObject({ is_active: true, is_open: false })
    })

    it("records an activated history entry with time and operator", async () => {
      await completeSetup()
      const before = Date.now()
      await activate()
      const { data } = await api.get(`${path}/history`, { headers })
      expect(data.history).toEqual([
        {
          id: expect.any(String),
          kind: "activated",
          occurred_at: expect.any(String),
          actor_type: "user",
          actor_id: operatorId,
          actor_name: "Lene Holm",
          reason: null,
        },
      ])
      const occurred = new Date(data.history[0].occurred_at).getTime()
      expect(occurred).toBeGreaterThanOrEqual(before - 1000)
      expect(occurred).toBeLessThanOrEqual(Date.now())
    })

    it("names the operator by email when they have no name", async () => {
      await completeSetup()
      const user = await getContainer()
        .resolve(Modules.USER)
        .createUsers({ email: "nameless@example.test" })
      await activate(path, { authorization: tokenFor(user.id, "user") })
      const { data } = await api.get(`${path}/history`, { headers })
      expect(data.history[0].actor_name).toBe("nameless@example.test")
    })

    it("returns the current state and records nothing when the Restaurant is already active", async () => {
      await completeSetup()
      await activate()
      const second = await activate()
      expect(second.status).toBe(200)
      expect(second.data.restaurant).toMatchObject({
        is_active: true,
        is_open: false,
      })
      const { data } = await api.get(`${path}/history`, { headers })
      expect(data.history).toHaveLength(1)
    })

    it("has an empty history before activation", async () => {
      const { data } = await api.get(`${path}/history`, { headers })
      expect(data.history).toEqual([])
    })
    it.each([
      {
        rule: "A1",
        setup: async () => {
          await api.post(
            `${path}/staff-invitations`,
            { name: "Mette Jensen", email: "mette@pizzeria.example" },
            { headers },
          )
          await recordTerms()
          await addDeliveryArea()
          await seedMenu()
        },
        missing: ["authorized_staff_missing"],
        reason: "DT: only a pending invitation",
      },
      {
        rule: "A2",
        setup: async () => {
          const staffId = await authorizeStaff()
          await api.post(`${path}/staff/${staffId}/revoke`, {}, { headers })
          await recordTerms()
          await addDeliveryArea()
          await seedMenu()
        },
        missing: ["authorized_staff_missing"],
        reason: "DT: every staff member revoked",
      },
      {
        rule: "A3",
        setup: async () => {
          await authorizeStaff()
          await addDeliveryArea()
          await seedMenu()
        },
        missing: ["commercial_terms_missing"],
        reason: "DT: no commercial terms",
      },
      {
        rule: "A4",
        setup: async () => {
          await authorizeStaff()
          await recordTerms()
          await addDeliveryArea()
        },
        missing: ["published_menu_missing"],
        reason: "DT, BVA: zero dishes",
      },
      {
        rule: "A5",
        setup: async () => {
          await authorizeStaff()
          await recordTerms()
          await addDeliveryArea()
          await linkDish("draft")
        },
        missing: ["published_menu_missing"],
        reason: "EP: only unpublished dishes",
      },
      {
        rule: "A6",
        setup: async () => {
          await authorizeStaff()
          await recordTerms()
          await seedMenu()
        },
        missing: ["delivery_area_missing"],
        reason: "DT, BVA: zero delivery-area postal codes",
      },
    ])(
      "refuses activation with $missing ($rule: $reason)",
      async ({ setup, missing }) => {
        await setup()
        const response = await activate()
        expect(response.status).toBe(400)
        expect(response.data.missing).toEqual(missing)
        expect(response.data.message).toBe(
          `activation_requirements_missing: ${missing.join(", ")}`,
        )
        const { data } = await api.get(path, { headers })
        expect(data.restaurant.is_active).toBe(false)
        expect(
          (await api.get(`${path}/history`, { headers })).data.history,
        ).toEqual([])
      },
    )

    it("activates when every published dish is sold out (A8)", async () => {
      await authorizeStaff()
      await recordTerms()
      await addDeliveryArea()
      await linkDish("published", { isSoldOut: true })
      await linkDish("draft")
      const response = await activate()
      expect(response.status).toBe(200)
      expect(response.data.restaurant).toMatchObject({
        is_active: true,
        is_open: false,
        menu: { published_dish_count: 1 },
      })
    })

    it("emits restaurant.activated once, and not for a second activation", async () => {
      await completeSetup()
      const eventBus = getContainer().resolve(Modules.EVENT_BUS)
      const emit = jest.spyOn(eventBus, "emit")
      await activate()
      await activate()
      const activations = emit.mock.calls
        .flatMap(([message]) => (Array.isArray(message) ? message : [message]))
        .filter(({ name }) => name === RESTAURANT_ACTIVATED)
      expect(activations.map(({ data }) => data)).toEqual([
        { id: restaurantId },
      ])
      emit.mockRestore()
    })

    it("seeding the menu twice links one synthetic dish", async () => {
      await seedMenu()
      await seedMenu()
      const { data } = await api.get(path, { headers })
      expect(data.restaurant.menu.published_dish_count).toBe(1)
    })

    it("returns 404 for an unknown Restaurant", async () => {
      const unknown = "/admin/restaurants/res_unknown"
      const activated = await activate(unknown)
      expect(activated.status).toBe(404)
      expect(activated.data.message).toBe("restaurant_not_found")
      const history = await api.get(`${unknown}/history`, {
        headers,
        validateStatus: () => true,
      })
      expect(history.status).toBe(404)
    })

    it("refuses activation and history to anyone but an operator", async () => {
      await completeSetup()
      const customer = { authorization: tokenFor("cus_test", "customer") }
      const staff = { authorization: tokenFor("rstf_test", "restaurant_staff") }
      expect((await activate(path, customer)).status).toBe(401)
      expect((await activate(path, staff)).status).toBe(401)
      expect((await activate(path, {} as never)).status).toBe(401)
      const history = await api.get(`${path}/history`, {
        headers: customer,
        validateStatus: () => true,
      })
      expect(history.status).toBe(401)
      const staffHistory = await api.get(`${path}/history`, {
        headers: staff,
        validateStatus: () => true,
      })
      expect(staffHistory.status).toBe(401)
      expect((await api.get(path, { headers })).data.restaurant.is_active).toBe(
        false,
      )
    })
  },
})
