import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import { createRestaurantWorkflow } from "../../src/workflows/restaurants"
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
const tokenOf = (link: string) => new URL(link).searchParams.get("token")!
const claimsOf = (token: string) =>
  JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())

medusaIntegrationTestRunner({
  dbName: "medusa_ci_partner_staff_invitations_http",
  env: { JWT_SECRET: "ci-only-accept-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer }) => {
    const password = "ci-only-staff-password"
    const mette = { name: "Mette Jensen", email: "mette@pizzeria.example" }
    let admin: { authorization: string }
    let restaurantId: string

    const bearer = (actor_id: string, actor_type: string) =>
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
    /** The operator invites through Admin and copies the link. */
    const invite = async (person = mette, at = restaurantId) => {
      const { data } = await api.post(
        `/admin/restaurants/${at}/staff-invitations`,
        person,
        { headers: admin },
      )
      return {
        staffId: data.invitation.staff_id as string,
        token: tokenOf(data.invitation.invite_link),
      }
    }
    const openInvitation = (token: string) =>
      api.get(`/partner/staff-invitations/${encodeURIComponent(token)}`, {
        validateStatus: () => true,
      })
    /** The partner app registers the login first, then accepts with its token. */
    const register = async (email = mette.email) =>
      (
        await api.post("/auth/restaurant_staff/emailpass/register", {
          email,
          password,
        })
      ).data.token as string
    const accept = (token: string, registration: string | undefined) =>
      api.post(
        "/partner/staff-invitations/accept",
        { token },
        {
          headers: registration
            ? { authorization: `Bearer ${registration}` }
            : {},
          validateStatus: () => true,
        },
      )
    const signIn = (email = mette.email) =>
      api.post(
        "/auth/restaurant_staff/emailpass",
        { email, password },
        { validateStatus: () => true },
      )
    const adminStaff = async () =>
      (
        await api.get(`/admin/restaurants/${restaurantId}`, {
          headers: admin,
        })
      ).data.restaurant

    beforeEach(async () => {
      const user = await getContainer()
        .resolve(Modules.USER)
        .createUsers({ email: "operator@example.test" })
      admin = { authorization: bearer(user.id, "user") }
      restaurantId = await createRestaurant("Pizzeria Nørrebro")
    })

    it("shows a valid invitation with the Restaurant's name and the invited name and email", async () => {
      const { token } = await invite()
      const response = await openInvitation(token)
      expect(response.status).toBe(200)
      expect(response.data).toEqual({
        invitation: {
          restaurant: { name: "Pizzeria Nørrebro" },
          staff: mette,
        },
      })
    })

    it("accepting makes the invited person authorized staff who can sign in, and Admin counts them", async () => {
      const { staffId, token } = await invite()
      const response = await accept(token, await register())
      expect(response.status).toBe(200)
      expect(response.data).toEqual({
        staff: {
          id: staffId,
          ...mette,
          status: "authorized",
          restaurant_id: restaurantId,
        },
        restaurant: { id: restaurantId, name: "Pizzeria Nørrebro" },
      })

      const signedIn = await signIn()
      expect(signedIn.status).toBe(200)
      expect(claimsOf(signedIn.data.token)).toMatchObject({
        actor_type: "restaurant_staff",
        actor_id: staffId,
      })
      const me = await api.get("/partner/me", {
        headers: { authorization: `Bearer ${signedIn.data.token}` },
      })
      expect(me.data).toEqual(response.data)

      const restaurant = await adminStaff()
      expect(restaurant.staff.pending).toEqual([])
      expect(restaurant.staff.authorized).toEqual([
        expect.objectContaining({
          id: staffId,
          ...mette,
          status: "authorized",
          accepted_at: expect.any(String),
          invitation: null,
        }),
      ])
      expect(restaurant.readiness.requirements).toContainEqual({
        code: "authorized_staff_missing",
        missing: false,
      })
    })

    it.each([
      { reason: "EP: another email", email: "jonas@pizzeria.example" },
      {
        reason: "BVA: the invited email with a suffix",
        email: "mette@pizzeria.example.dk",
      },
    ])(
      "refuses a registered email that does not match the invitation: $reason",
      async ({ email }) => {
        const { token } = await invite()
        const response = await accept(token, await register(email))
        expect(response.status).toBe(400)
        expect(response.data.code).toBe("invitation_invalid")
        // Nothing changed: the invited person can still accept.
        expect((await adminStaff()).staff.pending).toHaveLength(1)
        expect((await signIn(email)).status).toBe(200)
        expect(claimsOf((await signIn(email)).data.token).actor_id).toBeFalsy()
        expect((await openInvitation(token)).status).toBe(200)
      },
    )

    it("keeps the invitation pending when linking the login fails, so the person can retry", async () => {
      const { token } = await invite()
      const registration = await register()
      const auth = getContainer().resolve(Modules.AUTH)
      const linking = jest
        .spyOn(auth, "updateAuthIdentities")
        .mockRejectedValueOnce(new Error("Linking the login failed"))
      try {
        expect((await accept(token, registration)).status).toBe(500)
      } finally {
        linking.mockRestore()
      }
      expect((await adminStaff()).staff.pending).toHaveLength(1)
      expect((await openInvitation(token)).status).toBe(200)
      expect((await accept(token, registration)).status).toBe(200)
    })

    it("accepts a registered email that differs only in case", async () => {
      const { token } = await invite()
      const response = await accept(
        token,
        await register("Mette@Pizzeria.Example"),
      )
      expect(response.status).toBe(200)
    })

    it("refuses a login that already belongs to staff", async () => {
      const first = await invite()
      expect((await accept(first.token, await register())).status).toBe(200)
      const staffToken = (await signIn()).data.token
      const second = await invite(
        { name: "Mette Jensen", email: "mette.two@pizzeria.example" },
        await createRestaurant("Other kitchen"),
      )
      const response = await accept(second.token, staffToken)
      expect(response.status).toBe(400)
      expect(response.data.code).toBe("invitation_invalid")
      expect((await openInvitation(second.token)).status).toBe(200)
    })

    it.each([
      { reason: "DT: no token", authorization: async () => undefined },
      {
        reason: "DT: an Admin user token",
        authorization: async () => bearer("user_test", "user").slice(7),
      },
      {
        reason: "DT: a Customer registration",
        authorization: async () =>
          (
            await api.post("/auth/customer/customer-emailpass/register", {
              email: mette.email,
              password,
            })
          ).data.token as string,
      },
    ])(
      "refuses to accept without a staff registration: $reason",
      async ({ authorization }) => {
        const { token } = await invite()
        const response = await accept(token, await authorization())
        expect(response.status).toBe(401)
        expect((await adminStaff()).staff.pending).toHaveLength(1)
      },
    )

    it.each([
      { reason: "EP: missing token", body: {} },
      { reason: "BVA: empty token", body: { token: "" } },
      { reason: "EP: unknown field", body: { token: "x", staff_id: "x" } },
    ])("refuses an invalid accept request: $reason", async ({ body }) => {
      const response = await api.post(
        "/partner/staff-invitations/accept",
        body,
        {
          headers: { authorization: `Bearer ${await register()}` },
          validateStatus: () => true,
        },
      )
      expect(response.status).toBe(400)
      expect(response.data.type).toBe("invalid_data")
    })

    /** Each row turns a fresh invitation into a link that no longer works. */
    const unusableLinks = [
      {
        reason: "BVA: expired",
        unusable: async () => {
          const { staffId, token } = await invite()
          // Time is controlled by moving the stored expiry just past now.
          const service =
            getContainer().resolve<RestaurantModuleService>(RESTAURANT_MODULE)
          const [invitation] = await service.listStaffInvitations({
            staff_id: staffId,
          })
          await service.updateStaffInvitations({
            id: invitation.id,
            expires_at: new Date(Date.now() - 1),
          })
          return token
        },
      },
      {
        reason: "DT: replaced by a resend",
        unusable: async () => {
          const { staffId, token } = await invite()
          await api.post(
            `/admin/restaurants/${restaurantId}/staff-invitations/${staffId}/resend`,
            {},
            { headers: admin },
          )
          return token
        },
      },
      {
        reason: "DT: cancelled",
        unusable: async () => {
          const { staffId, token } = await invite()
          await api.delete(
            `/admin/restaurants/${restaurantId}/staff-invitations/${staffId}`,
            { headers: admin },
          )
          return token
        },
      },
      {
        reason: "DT: already used",
        unusable: async () => {
          const { token } = await invite()
          expect((await accept(token, await register())).status).toBe(200)
          return token
        },
      },
      {
        reason: "EP: unknown but correctly signed",
        unusable: async () =>
          generateJwtToken(
            { staff_id: "rstf_unknown", email: mette.email },
            {
              secret: getContainer().resolve(
                ContainerRegistrationKeys.CONFIG_MODULE,
              ).projectConfig.http.jwtSecret!,
              expiresIn: "1h",
            },
          ),
      },
      { reason: "EP: not a token", unusable: async () => "not-a-token" },
    ]

    it.each(unusableLinks)(
      "shows any unusable link as invitation_invalid: $reason",
      async ({ unusable }) => {
        const response = await openInvitation(await unusable())
        expect(response.status).toBe(400)
        expect(response.data).toEqual({
          type: "not_allowed",
          code: "invitation_invalid",
          message: "invitation_invalid",
        })
      },
    )

    it.each(unusableLinks)(
      "refuses to accept an unusable link with invitation_invalid: $reason",
      async ({ unusable }) => {
        const token = await unusable()
        // A used link's own invitee already accepted, so another person tries it.
        const response = await accept(
          token,
          await register("someone@pizzeria.example"),
        )
        expect(response.status).toBe(400)
        expect(response.data.code).toBe("invitation_invalid")
      },
    )
  },
})
