import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import { createRestaurantWorkflow } from "../../src/workflows/restaurants"
import { createAuthorizedStaffWorkflow } from "../../src/workflows/restaurant-staff"
import { RESTAURANT_MODULE } from "../../src/modules/restaurant"
import RestaurantModuleService from "../../src/modules/restaurant/service"

jest.setTimeout(120000)

const details = (name: string) => ({
  name,
  address_street: "Nørrebrogade 1",
  address_postal_code: "2200",
  address_city: "København N",
  contact_phone: "+45 12 34 56 78",
  contact_email: "kontakt@pizzeria.example",
})
const claimsOf = (token: string) =>
  JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())
const password = "ci-only-staff-password"

medusaIntegrationTestRunner({
  dbName: "medusa_ci_staff_revocation_http",
  env: { JWT_SECRET: "ci-only-revocation-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer }) => {
    let headers: { authorization: string }
    let operatorId: string
    let restaurantId: string
    let path: string
    const mette = { name: "Mette Jensen", email: "mette@pizzeria.example" }
    const jonas = { name: "Jonas Holm", email: "jonas@pizzeria.example" }

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
        await createRestaurantWorkflow(getContainer()).run({
          input: details(name),
        })
      ).result.restaurant.id
    /** Registers a login and makes it authorized staff, as accepting an invitation does. */
    const authorize = async (
      person: { name: string; email: string },
      restaurant_id = restaurantId,
    ) => {
      const registered = await api.post(
        "/auth/restaurant_staff/emailpass/register",
        { email: person.email, password },
      )
      const { result } = await createAuthorizedStaffWorkflow(
        getContainer(),
      ).run({
        input: {
          restaurant_id,
          ...person,
          auth_identity_id: claimsOf(registered.data.token).auth_identity_id,
        },
      })
      return result.id as string
    }
    const signIn = async (email: string) =>
      (await api.post("/auth/restaurant_staff/emailpass", { email, password }))
        .data.token as string
    const revoke = (staffId: string, at = path, auth = headers) =>
      api.post(
        `${at}/staff/${staffId}/revoke`,
        {},
        { headers: auth, validateStatus: () => true },
      )
    const restaurantOf = async () =>
      (await api.get(path, { headers })).data.restaurant

    beforeEach(async () => {
      const user = await getContainer()
        .resolve(Modules.USER)
        .createUsers({ email: "operator@example.test" })
      operatorId = user.id
      headers = { authorization: tokenFor(user.id, "user") }
      restaurantId = await createRestaurant("Pizzeria Nørrebro")
      path = `/admin/restaurants/${restaurantId}`
    })

    it("revokes authorized staff, keeping them under Former staff with when and by whom", async () => {
      const metteId = await authorize(mette)
      const jonasId = await authorize(jonas)
      const before = Date.now()

      const response = await revoke(metteId)

      expect(response.status).toBe(200)
      const { staff, readiness } = response.data.restaurant
      expect(staff.authorized.map(({ id }) => id)).toEqual([jonasId])
      expect(staff.former).toEqual([
        expect.objectContaining({
          id: metteId,
          ...mette,
          status: "revoked",
          revoked_by: { id: operatorId, email: "operator@example.test" },
        }),
      ])
      const revokedAt = new Date(staff.former[0].revoked_at).getTime()
      expect(revokedAt).toBeGreaterThanOrEqual(before - 1000)
      expect(revokedAt).toBeLessThanOrEqual(Date.now() + 1000)
      expect(readiness.requirements).toContainEqual({
        code: "authorized_staff_missing",
        missing: false,
      })
      expect(await restaurantOf()).toEqual(response.data.restaurant)
    })

    it("warns with last_authorized_staff only on the last authorized staff member", async () => {
      const metteId = await authorize(mette)
      const jonasId = await authorize(jonas)
      const warningsOf = (restaurant: {
        staff: { authorized: { id: string; revoke_warnings: string[] }[] }
      }) =>
        Object.fromEntries(
          restaurant.staff.authorized.map(({ id, revoke_warnings }) => [
            id,
            revoke_warnings,
          ]),
        )

      expect(warningsOf(await restaurantOf())).toEqual({
        [metteId]: [],
        [jonasId]: [],
      })
      const afterFirst = (await revoke(metteId)).data.restaurant
      expect(warningsOf(afterFirst)).toEqual({
        [jonasId]: ["last_authorized_staff"],
      })
    })

    it("still revokes the last authorized staff member, without changing participation or opening", async () => {
      const metteId = await authorize(mette)
      await getContainer()
        .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
        .updateRestaurants({ id: restaurantId, is_active: true, is_open: true })

      const response = await revoke(metteId)

      expect(response.status).toBe(200)
      const restaurant = response.data.restaurant
      expect(restaurant.staff.authorized).toEqual([])
      expect(restaurant.staff.former.map(({ id }) => id)).toEqual([metteId])
      expect(restaurant).toMatchObject({ is_active: true, is_open: true })
      expect(restaurant.readiness.requirements).toContainEqual({
        code: "authorized_staff_missing",
        missing: true,
      })
    })

    it("refuses the revoked person's next partner request, even with an unexpired token", async () => {
      const metteId = await authorize(mette)
      const token = await signIn(mette.email)
      const partner = { authorization: `Bearer ${token}` }
      expect((await api.get("/partner/me", { headers: partner })).status).toBe(
        200,
      )

      await revoke(metteId)

      for (const request of [
        api.get("/partner/me", {
          headers: partner,
          validateStatus: () => true,
        }),
        api.get(`/partner/restaurants/${restaurantId}`, {
          headers: partner,
          validateStatus: () => true,
        }),
      ]) {
        const response = await request
        expect(response.status).toBe(403)
        expect(response.data).toMatchObject({
          code: "staff_access_revoked",
          type: "forbidden",
          restaurant: { name: "Pizzeria Nørrebro" },
        })
      }
    })

    it("refuses the revoked person again after signing in anew", async () => {
      const metteId = await authorize(mette)
      await revoke(metteId)

      const token = await signIn(mette.email)
      const response = await api.get("/partner/me", {
        headers: { authorization: `Bearer ${token}` },
        validateStatus: () => true,
      })

      expect(response.status).toBe(403)
      expect(response.data).toMatchObject({
        code: "staff_access_revoked",
        restaurant: { name: "Pizzeria Nørrebro" },
      })
    })

    it("keeps the first revocation when staff is revoked twice", async () => {
      const metteId = await authorize(mette)
      const first = (await revoke(metteId)).data.restaurant.staff.former[0]

      const second = await revoke(metteId)

      expect(second.status).toBe(200)
      expect(second.data.restaurant.staff.former).toEqual([first])
    })

    it.each([
      {
        reason: "EP: unknown staff id",
        staff: async () => "rstf_unknown",
        code: "authorized_staff_not_found",
      },
      {
        reason: "DT: pending staff are cancelled, not revoked",
        staff: async () =>
          (
            await api.post(`${path}/staff-invitations`, mette, {
              headers,
            })
          ).data.staff.id as string,
        code: "authorized_staff_not_found",
      },
      {
        reason: "DT: staff of another Restaurant",
        staff: async () =>
          authorize(mette, await createRestaurant("Burger Vesterbro")),
        code: "authorized_staff_not_found",
      },
    ])("answers 404 for $reason", async ({ staff, code }) => {
      const response = await revoke(await staff())
      expect(response.status).toBe(404)
      expect(response.data.code).toBe(code)
    })

    it("answers 404 for an unknown Restaurant", async () => {
      const metteId = await authorize(mette)
      const response = await revoke(metteId, "/admin/restaurants/rest_unknown")
      expect(response.status).toBe(404)
      expect(response.data.code).toBe("restaurant_not_found")
    })

    it.each([
      { reason: "DT: not signed in", auth: () => ({}) },
      {
        reason: "DT: a Customer token",
        auth: () => ({ authorization: tokenFor("cus_test", "customer") }),
      },
      {
        reason: "DT: a staff token",
        auth: () => ({
          authorization: tokenFor("rstf_test", "restaurant_staff"),
        }),
      },
    ])("refuses revocation with 401: $reason", async ({ auth }) => {
      const metteId = await authorize(mette)
      const response = await revoke(metteId, path, auth() as typeof headers)
      expect(response.status).toBe(401)
      expect((await restaurantOf()).staff.authorized).toHaveLength(1)
    })
  },
})
