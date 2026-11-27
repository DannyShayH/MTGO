import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import { generateResetPasswordTokenWorkflow } from "@medusajs/medusa/core-flows"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import type DeliveryModuleService from "../../src/modules/delivery/service"
import { RESTAURANT_MODULE } from "../../src/modules/restaurant"
import type RestaurantModuleService from "../../src/modules/restaurant/service"

jest.setTimeout(120000)

const actors = [
  {
    actor: "delivery_agent",
    provider: "delivery-agent-emailpass",
    path: "/delivery-reset-password",
    origin: "https://partner.example.test",
    reason: "EP: Delivery agent",
  },
  {
    actor: "restaurant_staff",
    provider: "emailpass",
    path: "/reset-password",
    origin: "https://partner.example.test",
    reason: "EP: Restaurant staff",
  },
  {
    actor: "user",
    provider: "emailpass",
    path: "/operator-reset-password",
    origin: "https://partner.example.test",
    reason: "EP: MTOGO operator",
  },
]
const secret = "ci-only-password-recovery-secret"
const email = "recovery@example.test"
const password = "original-password"

medusaIntegrationTestRunner({
  dbName: "medusa_ci_password_recovery",
  env: {
    JWT_SECRET: secret,
    REDIS_URL: "",
    RESEND_API_KEY: "",
    PARTNER_PUBLIC_URL: "https://partner.example.test",
    MEDUSA_BACKEND_URL: "https://backend.example.test",
  },
  testSuite: ({ api, getContainer }) => {
    const jwtSecret = () =>
      getContainer().resolve(ContainerRegistrationKeys.CONFIG_MODULE)
        .projectConfig.http.jwtSecret
    async function createAccount(actor: string, provider: string) {
      const container = getContainer()
      let actorId: string
      if (actor === "delivery_agent") {
        const delivery =
          container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
        const agent = await delivery.createDeliveryAgents({
          name: "Recovery agent",
          email,
          status: "pending",
          invited_by: "operator",
        })
        await delivery.createDeliveryAgentInvitations({
          agent_id: agent.id,
          token: "recovery-invitation",
          expires_at: new Date("2099-01-01T00:00:00Z"),
        })
        actorId = agent.id
      } else if (actor === "restaurant_staff") {
        const restaurants =
          container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
        const restaurant = await restaurants.createRestaurants({
          name: "Recovery restaurant",
          address_street: "Test street 1",
          address_postal_code: "2200",
          address_city: "Copenhagen",
          contact_phone: "12345678",
          contact_email: "restaurant@example.test",
          pickup_address_key: "recovery-address",
        })
        const staff = await restaurants.createRestaurantStaffs({
          restaurant_id: restaurant.id,
          name: "Recovery staff",
          email,
          status: "authorized",
        })
        actorId = staff.id
      } else {
        const user = await container
          .resolve(Modules.USER)
          .createUsers({ email })
        actorId = user.id
      }
      const registration = await api.post(
        `/auth/${actor}/${provider}/register`,
        { email, password, invitation_token: "recovery-invitation" },
      )
      expect(registration.status).toBe(200)
      const auth = container.resolve(Modules.AUTH)
      const [identity] = await auth.listProviderIdentities({
        entity_id: email,
        provider,
      })
      await auth.updateAuthIdentities({
        id: identity.auth_identity_id!,
        app_metadata: { [`${actor}_id`]: actorId },
      })
      if (actor === "delivery_agent")
        await container
          .resolve<DeliveryModuleService>(DELIVERY_MODULE)
          .updateDeliveryAgents({ id: actorId, status: "authorized" })
      return actorId
    }

    const update = (
      actor: string,
      provider: string,
      token: string,
      newPassword = "replacement-password",
    ) =>
      api.post(
        `/auth/${actor}/${provider}/update`,
        { password: newPassword },
        {
          headers: { authorization: `Bearer ${token}` },
          validateStatus: () => true,
        },
      )

    it.each(actors)(
      "recovers an account using its emailed, single-use link: $reason",
      async ({ actor, provider, path, origin }) => {
        await createAccount(actor, provider)
        const request = (identifier: string) =>
          api.post(`/auth/${actor}/${provider}/reset-password`, {
            identifier,
            metadata: { language: "en" },
          })
        expect((await request(email)).status).toBe(201)
        expect((await request("unknown@example.test")).status).toBe(201)
        const notifications = getContainer().resolve(Modules.NOTIFICATION)
        let messages = await notifications.listNotifications({
          to: email,
          template: "account-password-reset",
        })
        for (
          let attempt = 0;
          messages.length === 0 && attempt < 50;
          attempt++
        ) {
          await new Promise((resolve) => setTimeout(resolve, 100))
          messages = await notifications.listNotifications({
            to: email,
            template: "account-password-reset",
          })
        }
        expect(messages).toHaveLength(1)
        expect(
          await notifications.listNotifications({ to: "unknown@example.test" }),
        ).toHaveLength(0)
        const url = new URL(String(messages[0].data?.reset_url))
        expect(url.origin).toBe(origin)
        expect(url.pathname).toBe(path)
        expect(messages[0].data?.language).toBe("en")
        expect(url.search).toBe("")
        const token = new URLSearchParams(url.hash.slice(1)).get("token")
        expect(token).toBeTruthy()
        expect((await update(actor, provider, "invalid-token")).status).toBe(
          401,
        )
        expect((await update(actor, provider, token!)).status).toBe(200)
        expect((await update(actor, provider, token!)).status).toBe(401)
        expect(
          (
            await api.post(
              `/auth/${actor}/${provider}`,
              { email, password },
              { validateStatus: () => true },
            )
          ).status,
        ).toBe(401)
        expect(
          (
            await api.post(`/auth/${actor}/${provider}`, {
              email,
              password: "replacement-password",
            })
          ).status,
        ).toBe(200)
      },
    )

    it.each(actors)(
      "rejects replaced, expired and other-role/provider tokens: $reason",
      async ({ actor, provider }) => {
        await createAccount(actor, provider)
        const issue = async () =>
          (
            await generateResetPasswordTokenWorkflow(getContainer()).run({
              input: {
                actorType: actor,
                provider,
                entityId: email,
                secret: jwtSecret(),
              },
            })
          ).result
        const oldToken = await issue()
        const token = await issue()
        expect((await update(actor, provider, oldToken)).status).toBe(401)
        const payload = JSON.parse(
          Buffer.from(token.split(".")[1], "base64url").toString(),
        )
        const expired = generateJwtToken(
          { entity_id: email, actor_type: actor, provider, purpose: "reset" },
          {
            secret: jwtSecret(),
            expiresIn: "-1s",
            jwtOptions: { jwtid: payload.jti },
          },
        )
        expect((await update(actor, provider, expired)).status).toBe(401)
        expect(
          (
            await update(
              actor === "user" ? "restaurant_staff" : "user",
              "emailpass",
              token,
            )
          ).status,
        ).toBe(401)
        expect(
          (await update("customer", "customer-emailpass", token)).status,
        ).toBe(401)
        expect((await update(actor, provider, token)).status).toBe(200)
      },
    )

    it("does not restore revoked Delivery agent access when a previously issued link is used", async () => {
      const actorId = await createAccount(
        "delivery_agent",
        "delivery-agent-emailpass",
      )
      const { result: token } = await generateResetPasswordTokenWorkflow(
        getContainer(),
      ).run({
        input: {
          actorType: "delivery_agent",
          provider: "delivery-agent-emailpass",
          entityId: email,
          secret: jwtSecret(),
        },
      })
      const delivery =
        getContainer().resolve<DeliveryModuleService>(DELIVERY_MODULE)
      await delivery.updateDeliveryAgents({ id: actorId, status: "revoked" })
      expect(
        (await update("delivery_agent", "delivery-agent-emailpass", token))
          .status,
      ).toBe(200)
      expect((await delivery.retrieveDeliveryAgent(actorId)).status).toBe(
        "revoked",
      )
      const login = await api.post(
        "/auth/delivery_agent/delivery-agent-emailpass",
        { email, password: "replacement-password" },
      )
      expect(
        (
          await api.get("/partner/delivery-agent/me", {
            headers: { authorization: `Bearer ${login.data.token}` },
            validateStatus: () => true,
          })
        ).status,
      ).toBe(403)
    })
  },
})
