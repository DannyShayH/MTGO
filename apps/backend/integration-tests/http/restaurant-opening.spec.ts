import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import { ExecArgs } from "@medusajs/framework/types"
import register from "../../src/modules/postal-code/data/postal-codes.json"
import { syncPostalCodeRegisterWorkflow } from "../../src/workflows/postal-codes"
import {
  createAuthorizedStaffWorkflow,
  revokeRestaurantStaffWorkflow,
} from "../../src/workflows/restaurant-staff"
import {
  RESTAURANT_CLOSED,
  RESTAURANT_OPENED,
} from "../../src/workflows/restaurants"
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

medusaIntegrationTestRunner({
  dbName: "medusa_ci_restaurant_opening_http",
  env: { JWT_SECRET: "ci-only-opening-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer }) => {
    const password = "ci-only-staff-password"
    let admin: { authorization: string }
    let restaurantId: string
    let staff: { staffId: string; token: string }

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
    const createRestaurant = async (name: string) =>
      (
        await api.post(
          "/admin/restaurants",
          { ...pizzeria, name },
          { headers: admin },
        )
      ).data.restaurant.id as string
    /** A signed-in staff member, as accepting an invitation makes one. */
    const signInAsStaffOf = async (restaurant_id: string, email: string) => {
      const registered = await api.post(
        "/auth/restaurant_staff/emailpass/register",
        { email, password },
      )
      const { result } = await createAuthorizedStaffWorkflow(
        getContainer(),
      ).run({
        input: {
          restaurant_id,
          name: "Sofie Jensen",
          email,
          auth_identity_id: claimsOf(registered.data.token).auth_identity_id,
        },
      })
      const { data } = await api.post("/auth/restaurant_staff/emailpass", {
        email,
        password,
      })
      return { staffId: result.id, token: `Bearer ${data.token}` }
    }
    const change = (
      action: "open" | "close",
      authorization: string | null = staff.token,
      id = restaurantId,
    ) =>
      api.post(
        `/partner/restaurants/${id}/${action}`,
        {},
        {
          headers: authorization ? { authorization } : {},
          validateStatus: () => true,
        },
      )
    const adminPath = () => `/admin/restaurants/${restaurantId}`
    const adminView = async () =>
      (await api.get(adminPath(), { headers: admin })).data.restaurant
    const partnerView = async () =>
      (
        await api.get(`/partner/restaurants/${restaurantId}`, {
          headers: { authorization: staff.token },
        })
      ).data.restaurant
    const history = async () =>
      (await api.get(`${adminPath()}/history`, { headers: admin })).data.history
    const activate = async () => {
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
      await seedDemoMenu({
        container: getContainer(),
        args: [restaurantId],
      } as ExecArgs)
      const activated = await api.post(
        `${adminPath()}/activate`,
        {},
        { headers: admin },
      )
      expect(activated.status).toBe(200)
    }
    const deactivate = () =>
      api.post(
        `${adminPath()}/deactivate`,
        { reason: "Hygiene inspection" },
        { headers: admin },
      )
    const emitted = (emit: jest.SpyInstance) =>
      emit.mock.calls
        .flatMap(([message]) => (Array.isArray(message) ? message : [message]))
        .filter(({ name }) =>
          [RESTAURANT_OPENED, RESTAURANT_CLOSED].includes(name),
        )
        .map(({ name, data }) => ({ name, data }))

    beforeEach(async () => {
      await syncPostalCodeRegisterWorkflow(getContainer()).run({
        input: { postal_codes: register.postal_codes },
      })
      const user = await getContainer().resolve(Modules.USER).createUsers({
        email: "operator@example.test",
        first_name: "Lene",
        last_name: "Holm",
      })
      admin = { authorization: tokenFor(user.id, "user") }
      restaurantId = await createRestaurant("Pizzeria Nørrebro")
      staff = await signInAsStaffOf(restaurantId, "sofie@pizzeria.example")
    })

    describe("an active Restaurant", () => {
      beforeEach(activate)

      it("opens, and receives new Orders in both the partner app and Admin", async () => {
        const response = await change("open")
        expect(response.status).toBe(200)
        const expected = {
          id: restaurantId,
          is_active: true,
          is_open: true,
          receiving_new_orders: true,
          reason: null,
        }
        expect(response.data.restaurant).toMatchObject(expected)
        expect(await partnerView()).toMatchObject(expected)
        expect(await adminView()).toMatchObject(expected)
      })

      it("closes, and reports restaurant_closed in both the partner app and Admin", async () => {
        await change("open")
        const response = await change("close")
        expect(response.status).toBe(200)
        const expected = {
          is_active: true,
          is_open: false,
          receiving_new_orders: false,
          reason: "restaurant_closed",
        }
        expect(response.data.restaurant).toMatchObject(expected)
        expect(await partnerView()).toMatchObject(expected)
        expect(await adminView()).toMatchObject(expected)
      })

      it("records opened and closed with the staff member, newest first", async () => {
        await change("open")
        await change("close")
        const actor = {
          actor_type: "restaurant_staff",
          actor_id: staff.staffId,
          actor_name: "Sofie Jensen",
          reason: null,
        }
        expect(await history()).toEqual([
          expect.objectContaining({ kind: "closed", ...actor }),
          expect.objectContaining({ kind: "opened", ...actor }),
          expect.objectContaining({ kind: "activated", actor_type: "user" }),
        ])
      })

      it.each([
        {
          action: "open" as const,
          before: ["open"] as const,
          is_open: true,
          reason: "EP: opening an Open Restaurant",
        },
        {
          action: "close" as const,
          before: [] as const,
          is_open: false,
          reason: "EP: closing a Closed Restaurant",
        },
      ])(
        "returns the current state and records nothing: $reason",
        async ({ action, before, is_open }) => {
          for (const step of before) await change(step)
          const recorded = (await history()).length
          const response = await change(action)
          expect(response.status).toBe(200)
          expect(response.data.restaurant).toMatchObject({ is_open })
          expect(await history()).toHaveLength(recorded)
        },
      )

      it("emits restaurant.opened and restaurant.closed once each, and nothing for a repeat", async () => {
        const emit = jest.spyOn(
          getContainer().resolve(Modules.EVENT_BUS),
          "emit",
        )
        await change("open")
        await change("open")
        await change("close")
        await change("close")
        expect(emitted(emit)).toEqual([
          { name: RESTAURANT_OPENED, data: { id: restaurantId } },
          { name: RESTAURANT_CLOSED, data: { id: restaurantId } },
        ])
        emit.mockRestore()
      })
    })

    describe("an inactive Restaurant", () => {
      it("refuses opening with restaurant_inactive_cannot_open and stays Closed", async () => {
        const response = await change("open")
        expect(response.status).toBe(400)
        expect(response.data).toEqual({
          type: "not_allowed",
          code: "restaurant_inactive_cannot_open",
          message: "restaurant_inactive_cannot_open",
        })
        expect(await partnerView()).toMatchObject({
          is_active: false,
          is_open: false,
          reason: "restaurant_inactive",
        })
        expect(await history()).toEqual([])
      })

      it("refuses opening after deactivation, so reactivation never brings Orders by surprise", async () => {
        await activate()
        await change("open")
        await deactivate()
        const response = await change("open")
        expect(response.data.code).toBe("restaurant_inactive_cannot_open")
        expect(await partnerView()).toMatchObject({
          is_active: false,
          is_open: false,
        })
      })

      it("closing changes nothing and records nothing", async () => {
        const response = await change("close")
        expect(response.status).toBe(200)
        expect(response.data.restaurant).toMatchObject({
          is_active: false,
          is_open: false,
        })
        expect(await history()).toEqual([])
      })
    })

    describe("access", () => {
      it.each([
        { reason: "DT: no token", token: () => null },
        { reason: "DT: an Admin user token", token: () => admin.authorization },
        {
          reason: "DT: a Customer token",
          token: () => tokenFor("cus_test", "customer"),
        },
      ])(
        "refuses opening and closing without a staff token: $reason",
        async ({ token }) => {
          for (const action of ["open", "close"] as const)
            expect((await change(action, token())).status).toBe(401)
        },
      )

      it("answers NOT_FOUND for another Restaurant, as for one that does not exist, and changes nothing", async () => {
        const otherId = await createRestaurant("Other kitchen")
        for (const id of [otherId, "res_unknown"])
          for (const action of ["open", "close"] as const) {
            const response = await change(action, staff.token, id)
            expect(response.status).toBe(404)
            expect(response.data.code).toBe("restaurant_not_found")
          }
        const other = await api.get(`/admin/restaurants/${otherId}`, {
          headers: admin,
        })
        expect(other.data.restaurant.is_open).toBe(false)
      })

      it("refuses revoked staff with staff_access_revoked", async () => {
        await activate()
        await revokeRestaurantStaffWorkflow(getContainer()).run({
          input: {
            restaurant_id: restaurantId,
            staff_id: staff.staffId,
            revoked_by: "user_test",
          },
        })
        const response = await change("open")
        expect(response.status).toBe(403)
        expect(response.data.code).toBe("staff_access_revoked")
        expect((await adminView()).is_open).toBe(false)
      })

      it.each(["open", "close"])(
        "gives operators no route to %s a Restaurant",
        async (action) => {
          const response = await api.post(
            `${adminPath()}/${action}`,
            {},
            { headers: admin, validateStatus: () => true },
          )
          expect(response.status).toBe(404)
        },
      )
    })
  },
})
