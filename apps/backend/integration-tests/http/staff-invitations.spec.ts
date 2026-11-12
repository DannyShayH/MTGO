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

const PARTNER_URL = "https://partner.ci.example"
const DAY_MS = 24 * 60 * 60 * 1000
// The runner reads medusa-config before it applies `env`, so the module option
// must come from the process environment already.
process.env.PARTNER_PUBLIC_URL = `${PARTNER_URL}/`

const details = (name: string) => ({
  name,
  address_street: "Nørrebrogade 1",
  address_postal_code: "2200",
  address_city: "København N",
  contact_phone: "+45 12 34 56 78",
  contact_email: "kontakt@pizzeria.example",
})
const tokenOf = (link: string) => new URL(link).searchParams.get("token")!
const claimsOf = (token: string) =>
  JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())

medusaIntegrationTestRunner({
  dbName: "medusa_ci_staff_invitations_http",
  env: {
    JWT_SECRET: "ci-only-invitation-secret",
    REDIS_URL: "",
  },
  testSuite: ({ api, getContainer }) => {
    let headers: { authorization: string }
    let operatorId: string
    let restaurantId: string
    let path: string
    const mette = { name: "Mette Jensen", email: "mette@pizzeria.example" }

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
    const invite = (body: object, at = path) =>
      api.post(`${at}/staff-invitations`, body, {
        headers,
        validateStatus: () => true,
      })
    const staffOf = async () =>
      (await api.get(path, { headers })).data.restaurant.staff
    const createRestaurant = async (name: string) =>
      (
        await createRestaurantWorkflow(getContainer()).run({
          input: details(name),
        })
      ).result.restaurant.id
    /** A login of the given actor type, registered as Medusa's emailpass provider does. */
    const registerLogin = async (actor: string, email: string) => {
      const registered = await api.post(`/auth/${actor}/emailpass/register`, {
        email,
        password: "ci-only-password",
      })
      return claimsOf(registered.data.token).auth_identity_id as string
    }

    beforeEach(async () => {
      const user = await getContainer()
        .resolve(Modules.USER)
        .createUsers({ email: "operator@example.test" })
      operatorId = user.id
      headers = { authorization: tokenFor(user.id, "user") }
      restaurantId = await createRestaurant("Pizzeria Nørrebro")
      path = `/admin/restaurants/${restaurantId}`
    })

    it("invites a staff member as Pending with a 24-hour link to the partner app", async () => {
      const before = Date.now()
      const response = await invite(mette)
      expect(response.status).toBe(200)
      const { staff, invitation, restaurant } = response.data
      expect(staff).toEqual({
        id: invitation.staff_id,
        ...mette,
        status: "pending",
      })
      expect(invitation.invite_link).toMatch(
        new RegExp(`^${PARTNER_URL}/invite\\?token=[^&]+$`),
      )
      const expiresAt = new Date(invitation.expires_at).getTime()
      expect(expiresAt).toBeGreaterThanOrEqual(before + DAY_MS - 1000)
      expect(expiresAt).toBeLessThanOrEqual(Date.now() + DAY_MS + 1000)
      const claims = claimsOf(tokenOf(invitation.invite_link))
      expect(claims).toMatchObject({
        staff_id: invitation.staff_id,
        email: mette.email,
      })
      expect(claims.exp * 1000).toBeCloseTo(expiresAt, -4)
      expect(restaurant.staff).toEqual({
        pending: [
          expect.objectContaining({
            id: invitation.staff_id,
            ...mette,
            status: "pending",
            invited_by: operatorId,
            invitation: {
              expires_at: invitation.expires_at,
              invite_link: invitation.invite_link,
            },
          }),
        ],
        authorized: [],
        former: [],
      })
      expect(await staffOf()).toEqual(restaurant.staff)
      expect(restaurant.readiness.requirements).toContainEqual({
        code: "authorized_staff_missing",
        missing: true,
      })
    })

    it("removes pending staff when invitation persistence fails and allows the same email to be retried", async () => {
      const service =
        getContainer().resolve<RestaurantModuleService>(RESTAURANT_MODULE)
      const persistence = jest
        .spyOn(service, "createStaffInvitations")
        .mockRejectedValueOnce(new Error("Invitation persistence failed"))
      try {
        const failed = await invite(mette)
        expect(failed.status).toBe(500)
        expect((await staffOf()).pending).toEqual([])

        const retried = await invite(mette)
        expect(retried.status).toBe(200)
        expect(retried.data.restaurant.staff.pending).toHaveLength(1)
        expect(retried.data.staff).toMatchObject(mette)
      } finally {
        persistence.mockRestore()
      }
    })

    it("resends with a new link, moving the expiry and replacing the old token", async () => {
      const first = (await invite(mette)).data.invitation
      await new Promise((resolve) => setTimeout(resolve, 1100))
      const response = await api.post(
        `${path}/staff-invitations/${first.staff_id}/resend`,
        {},
        { headers },
      )
      expect(response.status).toBe(200)
      const second = response.data.invitation
      expect(second.staff_id).toBe(first.staff_id)
      expect(tokenOf(second.invite_link)).not.toBe(tokenOf(first.invite_link))
      expect(new Date(second.expires_at).getTime()).toBeGreaterThan(
        new Date(first.expires_at).getTime(),
      )
      const [pending] = (await staffOf()).pending
      expect(pending.invitation).toEqual({
        expires_at: second.expires_at,
        invite_link: second.invite_link,
      })
    })

    it("cancels a pending invitation, removing it with its token", async () => {
      const kept = (await invite(mette)).data.invitation
      const cancelled = (
        await invite({ name: "Jonas Holm", email: "jonas@pizzeria.example" })
      ).data.invitation
      const response = await api.delete(
        `${path}/staff-invitations/${cancelled.staff_id}`,
        { headers },
      )
      expect(response.status).toBe(200)
      expect(
        response.data.restaurant.staff.pending.map(({ id }) => id),
      ).toEqual([kept.staff_id])
      expect(response.data.restaurant.staff.pending[0].invitation).toEqual({
        expires_at: kept.expires_at,
        invite_link: kept.invite_link,
      })
      for (const request of [
        api.delete(`${path}/staff-invitations/${cancelled.staff_id}`, {
          headers,
          validateStatus: () => true,
        }),
        api.post(
          `${path}/staff-invitations/${cancelled.staff_id}/resend`,
          {},
          { headers, validateStatus: () => true },
        ),
      ]) {
        const refused = await request
        expect(refused.status).toBe(404)
        expect(refused.data.code).toBe("staff_invitation_not_found")
      }
      const again = await invite({
        name: "Jonas Holm",
        email: "jonas@pizzeria.example",
      })
      expect(again.status).toBe(200)
    })

    it.each([
      {
        reason: "DT: an operator login",
        email: "login@pizzeria.example",
        prepare: () => registerLogin("user", "login@pizzeria.example"),
      },
      {
        reason: "DT: a Customer login",
        email: "login@pizzeria.example",
        prepare: () => registerLogin("customer", "login@pizzeria.example"),
      },
      {
        reason: "EP: a login whose email differs only in case",
        email: "Login@Pizzeria.Example",
        prepare: () => registerLogin("customer", "login@pizzeria.example"),
      },
      {
        reason: "DT: pending staff of this Restaurant",
        email: "mette@pizzeria.example",
        prepare: () => invite(mette),
      },
      {
        reason: "DT: pending staff of another Restaurant",
        email: "mette@pizzeria.example",
        prepare: async () =>
          invite(
            mette,
            `/admin/restaurants/${await createRestaurant("Other kitchen")}`,
          ),
      },
      {
        reason: "DT: authorized staff",
        email: "sofie@pizzeria.example",
        prepare: async () =>
          createAuthorizedStaffWorkflow(getContainer()).run({
            input: {
              restaurant_id: restaurantId,
              name: "Sofie Jensen",
              email: "sofie@pizzeria.example",
              auth_identity_id: await registerLogin(
                "restaurant_staff",
                "sofie@pizzeria.example",
              ),
            },
          }),
      },
    ])(
      "refuses an email that has a login or belongs to staff: $reason",
      async ({ email, prepare }) => {
        await prepare()
        const before = await staffOf()
        const response = await invite({ name: "Someone", email })
        expect(response.status).toBe(400)
        expect(response.data.code).toBe("email_has_login")
        expect(await staffOf()).toEqual(before)
      },
    )

    it("treats wildcard characters in an email literally", async () => {
      await registerLogin("customer", "mette@pizzeria.example")
      const response = await invite({
        name: "Mette",
        email: "met_e@pizzeria.example",
      })
      expect(response.status).toBe(200)
    })

    it("lists authorized and former staff separately and counts only authorized staff for readiness", async () => {
      const { result } = await createAuthorizedStaffWorkflow(
        getContainer(),
      ).run({
        input: {
          restaurant_id: restaurantId,
          name: "Sofie Jensen",
          email: "sofie@pizzeria.example",
          auth_identity_id: await registerLogin(
            "restaurant_staff",
            "sofie@pizzeria.example",
          ),
        },
      })
      const authorized = (await api.get(path, { headers })).data.restaurant
      expect(authorized.staff.authorized.map(({ id }) => id)).toEqual([
        result.id,
      ])
      expect(authorized.readiness.requirements).toContainEqual({
        code: "authorized_staff_missing",
        missing: false,
      })
      await api.post(`${path}/staff/${result.id}/revoke`, {}, { headers })
      const revoked = (await api.get(path, { headers })).data.restaurant
      expect(revoked.staff.authorized).toEqual([])
      expect(revoked.staff.former).toEqual([
        expect.objectContaining({
          id: result.id,
          status: "revoked",
          revoked_by: { id: operatorId, email: "operator@example.test" },
          revoked_at: expect.any(String),
          invitation: null,
        }),
      ])
      expect(revoked.readiness.requirements).toContainEqual({
        code: "authorized_staff_missing",
        missing: true,
      })
    })

    it.each([
      { body: { email: mette.email }, reason: "EP: missing name" },
      { body: { name: "  ", email: mette.email }, reason: "BVA: blank name" },
      { body: { name: mette.name }, reason: "EP: missing email" },
      {
        body: { name: mette.name, email: "mette" },
        reason: "EP: invalid email",
        code: "email_invalid",
      },
      {
        body: { ...mette, status: "authorized" },
        reason: "EP: unknown field",
      },
      {
        body: { name: "x".repeat(256), email: mette.email },
        reason: "BVA: name of 256 chars",
      },
      {
        body: {
          name: mette.name,
          email: `${"m".repeat(239)}@pizzeria.example`,
        },
        reason: "BVA: email of 256 chars",
      },
    ])("refuses an invalid invitation: $reason", async ({ body, code }) => {
      const response = await invite(body)
      expect(response.status).toBe(400)
      if (code) expect(response.data.message).toContain(code)
      expect((await staffOf()).pending).toEqual([])
    })

    it("accepts a name and an email of 255 chars", async () => {
      const response = await invite({
        name: "x".repeat(255),
        email: `${"m".repeat(238)}@pizzeria.example`,
      })
      expect(response.status).toBe(200)
    })

    it("trims the name and email it stores", async () => {
      const response = await invite({
        name: "  Mette Jensen ",
        email: " mette@pizzeria.example ",
      })
      expect(response.data.restaurant.staff.pending[0]).toMatchObject(mette)
    })

    it("returns 404 for an unknown Restaurant or staff that is not pending here", async () => {
      const options = { headers, validateStatus: () => true }
      const pending = (await invite(mette)).data.invitation.staff_id
      const otherPath = `/admin/restaurants/${await createRestaurant("Other kitchen")}`
      const unknown = await invite(
        { name: "Jonas Holm", email: "jonas@pizzeria.example" },
        "/admin/restaurants/res_unknown",
      )
      expect(unknown.status).toBe(404)
      const responses = await Promise.all([
        api.post(
          `/admin/restaurants/res_unknown/staff-invitations/${pending}/resend`,
          {},
          options,
        ),
        api.post(
          `${otherPath}/staff-invitations/${pending}/resend`,
          {},
          options,
        ),
        api.delete(`${otherPath}/staff-invitations/${pending}`, options),
        api.post(`${path}/staff-invitations/rstf_unknown/resend`, {}, options),
        api.delete(`${path}/staff-invitations/rstf_unknown`, options),
      ])
      for (const response of responses) expect(response.status).toBe(404)
      expect((await staffOf()).pending.map(({ id }) => id)).toEqual([pending])
    })

    it("refuses to resend or cancel for authorized staff", async () => {
      const { result } = await createAuthorizedStaffWorkflow(
        getContainer(),
      ).run({
        input: {
          restaurant_id: restaurantId,
          name: "Sofie Jensen",
          email: "sofie@pizzeria.example",
          auth_identity_id: await registerLogin(
            "restaurant_staff",
            "sofie@pizzeria.example",
          ),
        },
      })
      const options = { headers, validateStatus: () => true }
      const resend = await api.post(
        `${path}/staff-invitations/${result.id}/resend`,
        {},
        options,
      )
      const cancel = await api.delete(
        `${path}/staff-invitations/${result.id}`,
        options,
      )
      expect([resend.status, cancel.status]).toEqual([404, 404])
      expect((await staffOf()).authorized).toHaveLength(1)
    })

    it.each([
      { actor: undefined, reason: "DT: not signed in" },
      { actor: "customer", reason: "DT: customer actor" },
      { actor: "restaurant_staff", reason: "DT: staff actor" },
    ])("refuses every invitation route: $reason", async ({ actor }) => {
      const pending = (await invite(mette)).data.invitation
      const options = {
        headers: actor ? { authorization: tokenFor("actor_test", actor) } : {},
        validateStatus: () => true,
      }
      const responses = await Promise.all([
        api.post(
          `${path}/staff-invitations`,
          { name: "Jonas Holm", email: "jonas@pizzeria.example" },
          options,
        ),
        api.post(
          `${path}/staff-invitations/${pending.staff_id}/resend`,
          {},
          options,
        ),
        api.delete(`${path}/staff-invitations/${pending.staff_id}`, options),
      ])
      for (const response of responses)
        expect(actor ? [401, 403] : [401]).toContain(response.status)
      expect((await staffOf()).pending).toEqual([
        expect.objectContaining({
          id: pending.staff_id,
          invitation: {
            expires_at: pending.expires_at,
            invite_link: pending.invite_link,
          },
        }),
      ])
    })
  },
})
