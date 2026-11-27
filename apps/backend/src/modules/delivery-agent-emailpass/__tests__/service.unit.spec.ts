import type {
  AuthenticationInput,
  AuthIdentityProviderService,
} from "@medusajs/framework/types"
import DeliveryAgentEmailPassService from "../service"

describe("Delivery agent recovery password", () => {
  const identities: AuthIdentityProviderService = {
    retrieve: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    setState: jest.fn(),
    getState: jest.fn(),
  }
  it.each([
    { password: undefined, reason: "EP: missing password" },
    { password: 12345678, reason: "EP: password is not text" },
    { password: "", reason: "EP: empty password" },
    { password: "1234567", reason: "BVA: one below the minimum" },
  ])(
    "rejects invalid passwords before changing credentials: $reason",
    async ({ password }) => {
      const service = new DeliveryAgentEmailPassService({}, {})
      expect(
        await service.update(
          { entity_id: "agent@example.test", password },
          identities,
        ),
      ).toEqual({ success: false, error: "delivery_agent_credentials_invalid" })
      expect(identities.update).not.toHaveBeenCalled()
    },
  )
})

describe("Delivery agent credential boundaries", () => {
  const identities: AuthIdentityProviderService = {
    retrieve: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    setState: jest.fn(),
    getState: jest.fn(),
  }
  it.each([
    {
      body: {},
      expected: "delivery_agent_credentials_invalid",
      reason: "EP: missing registration fields",
    },
    {
      body: { email: "agent@example.test", password: "1234567" },
      expected: "delivery_agent_credentials_invalid",
      reason: "BVA: registration below the password minimum",
    },
    {
      body: { email: "agent@example.test", password: "12345678" },
      expected: "invitation_invalid",
      reason: "DT: valid credentials without invitation guard",
    },
  ])(
    "preserves invitation-only registration: $reason",
    async ({ body, expected }) => {
      const service = new DeliveryAgentEmailPassService({}, {})
      expect(
        await service.register({ body } as AuthenticationInput, identities),
      ).toEqual({ success: false, error: expected })
    },
  )

  it("keeps existing credentials when an invitation does not permit recovery", async () => {
    const service = new DeliveryAgentEmailPassService({}, {})
    const body = {
      email: "agent@example.test",
      password: "12345678",
      agent_registration_guard: (
        register: (recovery: boolean) => Promise<unknown>,
      ) => register(false),
    }
    identities.retrieve = jest.fn().mockResolvedValue({ id: "auth_1" })
    expect(
      await service.register(
        { body } as unknown as AuthenticationInput,
        identities,
      ),
    ).toEqual({ success: false, error: "delivery_agent_identity_exists" })
  })

  it("refuses authentication without a textual email", async () => {
    const service = new DeliveryAgentEmailPassService({}, {})
    expect(
      (
        await service.authenticate(
          {
            body: { email: 1, password: "12345678" },
          } as unknown as AuthenticationInput,
          identities,
        )
      ).success,
    ).toBe(false)
  })
})
