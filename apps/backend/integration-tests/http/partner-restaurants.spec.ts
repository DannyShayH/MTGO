import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
} from "@medusajs/framework/utils"
import register from "../../src/modules/postal-code/data/postal-codes.json"
import { syncPostalCodeRegisterWorkflow } from "../../src/workflows/postal-codes"
import {
  changeDeliveryAreaWorkflow,
  createRestaurantWorkflow,
} from "../../src/workflows/restaurants"
import {
  createAuthorizedStaffWorkflow,
  revokeRestaurantStaffWorkflow,
} from "../../src/workflows/restaurant-staff"
import { RESTAURANT_MODULE } from "../../src/modules/restaurant"
import RestaurantModuleService from "../../src/modules/restaurant/service"

jest.setTimeout(120000)

const pizzeria = {
  name: "Pizzeria Nørrebro",
  address_street: "Nørrebrogade 1",
  address_postal_code: "2200",
  address_city: "København N",
  contact_phone: "+45 12 34 56 78",
  contact_email: "kontakt@pizzeria.example",
}

medusaIntegrationTestRunner({
  dbName: "medusa_ci_partner_restaurants_http",
  env: { JWT_SECRET: "ci-only-partner-restaurant-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer }) => {
    const password = "ci-only-staff-password"
    let restaurantId: string

    const createRestaurant = async (name: string) =>
      (
        await createRestaurantWorkflow(getContainer()).run({
          input: { ...pizzeria, name },
        })
      ).result.restaurant.id
    /** A signed-in staff member of the Restaurant, as the seed and accepting make one. */
    const signInAsStaffOf = async (restaurant_id: string, email: string) => {
      const registered = await api.post(
        "/auth/restaurant_staff/emailpass/register",
        { email, password },
      )
      const { auth_identity_id } = JSON.parse(
        Buffer.from(
          registered.data.token.split(".")[1],
          "base64url",
        ).toString(),
      )
      const { result } = await createAuthorizedStaffWorkflow(
        getContainer(),
      ).run({
        input: { restaurant_id, name: "Mette Jensen", email, auth_identity_id },
      })
      const { data } = await api.post("/auth/restaurant_staff/emailpass", {
        email,
        password,
      })
      return { staffId: result.id, token: data.token as string }
    }
    const readRestaurant = (id: string, token?: string) =>
      api.get(`/partner/restaurants/${id}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
        validateStatus: () => true,
      })
    const bearer = (actor_id: string, actor_type: string) =>
      generateJwtToken(
        { actor_id, actor_type, auth_identity_id: "auth_test" },
        {
          secret: getContainer().resolve(
            ContainerRegistrationKeys.CONFIG_MODULE,
          ).projectConfig.http.jwtSecret,
          expiresIn: "1h",
        },
      )

    beforeEach(async () => {
      await syncPostalCodeRegisterWorkflow(getContainer()).run({
        input: { postal_codes: register.postal_codes },
      })
      restaurantId = await createRestaurant("Pizzeria Nørrebro")
    })

    it("shows staff their own Restaurant's details, delivery area and participation", async () => {
      await changeDeliveryAreaWorkflow(getContainer()).run({
        input: {
          restaurant_id: restaurantId,
          add: ["2200", "2100"],
          remove: [],
        },
      })
      const { token } = await signInAsStaffOf(
        restaurantId,
        "mette@pizzeria.example",
      )
      const response = await readRestaurant(restaurantId, token)
      expect(response.status).toBe(200)
      expect(response.data).toEqual({
        restaurant: {
          id: restaurantId,
          ...pizzeria,
          delivery_area: [
            { postal_code: "2100", name: "København Ø" },
            { postal_code: "2200", name: "København N" },
          ],
          is_active: false,
          is_open: false,
          receiving_new_orders: false,
          reason: "restaurant_inactive",
        },
      })
    })

    it("shows an empty delivery area", async () => {
      const { token } = await signInAsStaffOf(
        restaurantId,
        "mette@pizzeria.example",
      )
      const response = await readRestaurant(restaurantId, token)
      expect(response.data.restaurant.delivery_area).toEqual([])
    })

    it("shows an active Restaurant as active", async () => {
      // No activate route exists until the activation slice (#77); the record
      // changes as activation will change it.
      await getContainer()
        .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
        .updateRestaurants({ id: restaurantId, is_active: true })
      const { token } = await signInAsStaffOf(
        restaurantId,
        "mette@pizzeria.example",
      )
      const { data } = await readRestaurant(restaurantId, token)
      expect(data.restaurant).toMatchObject({
        is_active: true,
        is_open: false,
        receiving_new_orders: false,
        reason: "restaurant_closed",
      })
    })

    it("answers NOT_FOUND for another Restaurant, as for one that does not exist", async () => {
      const otherId = await createRestaurant("Other kitchen")
      const { token } = await signInAsStaffOf(
        restaurantId,
        "mette@pizzeria.example",
      )
      const other = await readRestaurant(otherId, token)
      const unknown = await readRestaurant("res_unknown", token)
      for (const response of [other, unknown]) {
        expect(response.status).toBe(404)
        expect(response.data).toEqual({
          type: "not_found",
          code: "restaurant_not_found",
          message: "restaurant_not_found",
        })
      }
    })

    it.each([
      { reason: "DT: no token", token: async () => undefined, status: 401 },
      {
        reason: "DT: an Admin user token",
        token: async () => bearer("user_test", "user"),
        status: 401,
      },
      {
        reason: "DT: a Customer token",
        token: async () => bearer("cus_test", "customer"),
        status: 401,
      },
      {
        reason: "DT: a login that never became staff",
        token: async () =>
          (
            await api.post("/auth/restaurant_staff/emailpass/register", {
              email: "nobody@pizzeria.example",
              password,
            })
          ).data.token as string,
        status: 401,
      },
      {
        reason: "DT: revoked staff",
        token: async () => {
          const { staffId, token } = await signInAsStaffOf(
            restaurantId,
            "mette@pizzeria.example",
          )
          await revokeRestaurantStaffWorkflow(getContainer()).run({
            input: {
              restaurant_id: restaurantId,
              staff_id: staffId,
              revoked_by: "user_test",
            },
          })
          return token
        },
        status: 403,
        code: "staff_access_revoked",
      },
    ])(
      "refuses the Restaurant without authorized staff access: $reason",
      async ({ token, status, code }) => {
        const response = await readRestaurant(restaurantId, await token())
        expect(response.status).toBe(status)
        if (code) expect(response.data.code).toBe(code)
      },
    )
  },
})
