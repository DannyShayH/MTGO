import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  generateJwtToken,
  ContainerRegistrationKeys,
} from "@medusajs/framework/utils"
import { createRestaurantWorkflow } from "../../src/workflows/restaurants"
import {
  createAuthorizedStaffWorkflow,
  revokeRestaurantStaffWorkflow,
} from "../../src/workflows/restaurant-staff"

jest.setTimeout(120000)

medusaIntegrationTestRunner({
  dbName: "medusa_ci_partner_me_http",
  env: { JWT_SECRET: "ci-only-partner-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer }) => {
    const password = "ci-only-staff-password"
    let restaurantId: string
    // Each test gets a fresh database, so one fixed email is enough.
    const email = "sofie@pizzeria.example"

    const bearer = (actor_type: string, actor_id: string) =>
      generateJwtToken(
        { actor_id, actor_type, auth_identity_id: "auth_test" },
        {
          secret: getContainer().resolve(
            ContainerRegistrationKeys.CONFIG_MODULE,
          ).projectConfig.http.jwtSecret,
          expiresIn: "1h",
        },
      )

    /** Registers an email and password identity and makes it authorized staff, as the seed does. */
    const seedAuthorizedStaff = async () => {
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
        input: {
          restaurant_id: restaurantId,
          name: "Sofie Staff",
          email,
          auth_identity_id,
        },
      })
      return result
    }

    const signIn = async () =>
      (
        await api.post("/auth/restaurant_staff/emailpass", {
          email,
          password,
        })
      ).data.token as string

    beforeEach(async () => {
      const { result } = await createRestaurantWorkflow(getContainer()).run({
        input: {
          name: "Pizzeria Nørrebro",
          address_street: "Nørrebrogade 1",
          address_postal_code: "2200",
          address_city: "København N",
          contact_phone: "+45 12 34 56 78",
          contact_email: "kontakt@pizzeria.example",
        },
      })
      restaurantId = result.restaurant.id
    })

    it("lets authorized staff sign in with email and password and see who they are", async () => {
      const staff = await seedAuthorizedStaff()
      const token = await signIn()

      const response = await api.get("/partner/me", {
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.status).toBe(200)
      expect(response.data).toEqual({
        staff: {
          id: staff.id,
          name: "Sofie Staff",
          email,
          status: "authorized",
          restaurant_id: restaurantId,
        },
        restaurant: { id: restaurantId, name: "Pizzeria Nørrebro" },
      })
    })

    it("refuses a wrong password at sign-in", async () => {
      await seedAuthorizedStaff()
      const response = await api.post(
        "/auth/restaurant_staff/emailpass",
        { email, password: "not-the-password" },
        { validateStatus: () => true },
      )
      expect(response.status).toBe(401)
    })

    /** Each row prepares a token (or none) the way that actor would get one. */
    it.each([
      {
        actor: "no token",
        reason: "DT: not signed in",
        token: async () => undefined,
        status: 401,
      },
      {
        actor: "a malformed token",
        reason: "EP: invalid token",
        token: async () => "not-a-token",
        status: 401,
      },
      {
        actor: "an Admin user token",
        reason: "DT: wrong actor type, operator",
        token: async () => bearer("user", "user_test"),
        status: 401,
      },
      {
        actor: "a customer token",
        reason: "DT: wrong actor type, Customer",
        token: async () => bearer("customer", "cus_test"),
        status: 401,
      },
      {
        actor: "a login that never became staff",
        reason: "DT: staff actor type without a staff id",
        token: async () => {
          await api.post("/auth/restaurant_staff/emailpass/register", {
            email,
            password,
          })
          return signIn()
        },
        status: 401,
      },
      {
        actor: "staff whose access was revoked",
        reason: "DT: staff token, staff revoked after sign-in",
        token: async () => {
          const staff = await seedAuthorizedStaff()
          const token = await signIn()
          await revokeRestaurantStaffWorkflow(getContainer()).run({
            input: {
              restaurant_id: restaurantId,
              staff_id: staff.id,
              revoked_by: "user_test",
            },
          })
          return token
        },
        status: 403,
        code: "staff_access_revoked",
      },
      {
        actor: "a staff token for staff that does not exist",
        reason: "DT: staff token, no staff record",
        token: async () => bearer("restaurant_staff", "rstf_unknown"),
        status: 403,
        code: "staff_access_revoked",
      },
    ])(
      "refuses $actor with $status ($reason)",
      async ({ token, status, code }) => {
        const value = await token()
        const response = await api.get("/partner/me", {
          headers: value ? { authorization: `Bearer ${value}` } : {},
          validateStatus: () => true,
        })
        expect(response.status).toBe(status)
        if (code) expect(response.data.code).toBe(code)
      },
    )
  },
})
