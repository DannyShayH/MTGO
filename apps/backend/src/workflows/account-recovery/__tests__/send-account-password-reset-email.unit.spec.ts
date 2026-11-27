import { asValue } from "@medusajs/framework/awilix"
import {
  createMedusaContainer,
  Modules,
  ContainerRegistrationKeys,
} from "@medusajs/framework/utils"
import { sendAccountPasswordResetEmailWorkflow } from "../send-account-password-reset-email"

describe("account recovery email delivery", () => {
  it.each([
    {
      actor: "customer",
      provider: true,
      actorId: "actor_1",
      access: true,
      expected: false,
      reason: "DT: Customer uses its existing handler",
    },
    {
      actor: "unknown",
      provider: true,
      actorId: "actor_1",
      access: true,
      expected: false,
      reason: "EP: unsupported actor",
    },
    {
      actor: "delivery_agent",
      provider: false,
      actorId: "actor_1",
      access: true,
      expected: false,
      reason: "DT: no credentials",
    },
    {
      actor: "delivery_agent",
      provider: true,
      actorId: null,
      access: true,
      expected: false,
      reason: "DT: no actor linked to credentials",
    },
    {
      actor: "delivery_agent",
      provider: true,
      actorId: "actor_1",
      access: false,
      expected: false,
      reason: "DT: revoked, pending or mismatched agent",
    },
    {
      actor: "restaurant_staff",
      provider: true,
      actorId: "actor_1",
      access: false,
      expected: false,
      reason: "DT: revoked, pending or mismatched staff",
    },
    {
      actor: "user",
      provider: true,
      actorId: "actor_1",
      access: false,
      expected: false,
      reason: "DT: operator no longer exists",
    },
    {
      actor: "delivery_agent",
      provider: true,
      actorId: "actor_1",
      access: true,
      expected: true,
      reason: "DT: authorized agent",
    },
    {
      actor: "restaurant_staff",
      provider: true,
      actorId: "actor_1",
      access: true,
      expected: true,
      reason: "DT: authorized staff",
    },
    {
      actor: "user",
      provider: true,
      actorId: "actor_1",
      access: true,
      expected: true,
      reason: "DT: existing operator",
    },
  ])("$reason", async ({ actor, provider, actorId, access, expected }) => {
    const createNotifications = jest.fn().mockResolvedValue([])
    const list = jest.fn().mockResolvedValue(access ? [{ id: "actor_1" }] : [])
    const container = createMedusaContainer()
    container.register({
      [Modules.AUTH]: asValue({
        listProviderIdentities: jest
          .fn()
          .mockResolvedValue(provider ? [{ auth_identity_id: "auth_1" }] : []),
        retrieveAuthIdentity: jest.fn().mockResolvedValue({
          id: "auth_1",
          app_metadata: { [`${actor}_id`]: actorId },
        }),
      }),
      [Modules.NOTIFICATION]: asValue({ createNotifications }),
      [Modules.USER]: asValue({ listUsers: list }),
      [ContainerRegistrationKeys.CONFIG_MODULE]: asValue({
        admin: {
          path: "/operators",
          backendUrl: "https://admin.example.test/",
        },
      }),
      delivery: asValue({ listDeliveryAgents: list }),
      restaurant: asValue({ listRestaurantStaffs: list }),
    })
    const { result } = await sendAccountPasswordResetEmailWorkflow(
      container,
    ).run({
      input: {
        actor_type: actor,
        entity_id: "recovery@example.test",
        token: "private-token",
      },
    })
    expect(result).toBe(expected)
    expect(createNotifications).toHaveBeenCalledTimes(expected ? 1 : 0)
    if (expected) {
      expect(list).toHaveBeenCalledWith({
        id: "actor_1",
        email: "recovery@example.test",
        ...(actor === "user" ? {} : { status: "authorized" }),
      })
      const message = createNotifications.mock.calls[0][0]
      expect(message.data.language).toBe(actor === "user" ? "en" : "da")
      const url = new URL(message.data.reset_url)
      expect(url.search).toBe("")
      const token = new URLSearchParams(url.hash.slice(1)).get("token")
      expect(token).toBe("private-token")
      expect(url.pathname).toBe(
        actor === "user"
          ? "/operator-reset-password"
          : actor === "delivery_agent"
            ? "/delivery-reset-password"
            : "/reset-password",
      )
    }
  })

  it("reports notification failures without altering credentials", async () => {
    const container = createMedusaContainer()
    const failure = new Error("notification unavailable")
    container.register({
      [Modules.AUTH]: asValue({
        listProviderIdentities: jest
          .fn()
          .mockResolvedValue([{ auth_identity_id: "auth_1" }]),
        retrieveAuthIdentity: jest.fn().mockResolvedValue({
          id: "auth_1",
          app_metadata: { delivery_agent_id: "agent_1" },
        }),
      }),
      delivery: asValue({
        listDeliveryAgents: jest.fn().mockResolvedValue([{ id: "agent_1" }]),
      }),
      [Modules.NOTIFICATION]: asValue({
        createNotifications: jest.fn().mockRejectedValue(failure),
      }),
    })
    const outcome = await sendAccountPasswordResetEmailWorkflow(container).run({
      throwOnError: false,
      input: {
        actor_type: "delivery_agent",
        entity_id: "agent@example.test",
        token: "private-token",
        metadata: { language: "en" },
      },
    })
    expect(outcome.errors).toHaveLength(1)
    expect(outcome.errors[0].error.message).toBe("notification unavailable")
  })
})
