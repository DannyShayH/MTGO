import EmailPassProvider from "@medusajs/medusa/auth-emailpass"
import type {
  AuthenticationInput,
  AuthenticationResponse,
  AuthIdentityProviderService,
} from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"

interface EmailPasswordService {
  update(
    data: Record<string, unknown>,
    identities: AuthIdentityProviderService,
  ): Promise<AuthenticationResponse>
  register(
    input: AuthenticationInput,
    identities: AuthIdentityProviderService,
  ): Promise<AuthenticationResponse>
  authenticate(
    input: AuthenticationInput,
    identities: AuthIdentityProviderService,
  ): Promise<AuthenticationResponse>
}
const EmailPassAuthService: new (...args: unknown[]) => EmailPasswordService =
  EmailPassProvider.services[0]
const MIN_PASSWORD_LENGTH = 8

/** A separate provider namespace prevents credentials from crossing actor types. */
export default class DeliveryAgentEmailPassService extends EmailPassAuthService {
  static readonly identifier = "delivery-agent-emailpass"
  static readonly DISPLAY_NAME = "Delivery Agent Email/Password"

  async update(
    data: Record<string, unknown>,
    identities: AuthIdentityProviderService,
  ): Promise<AuthenticationResponse> {
    if (
      typeof data.password !== "string" ||
      data.password.length < MIN_PASSWORD_LENGTH
    )
      return { success: false, error: "delivery_agent_credentials_invalid" }
    return super.update(data, identities)
  }

  async register(
    input: AuthenticationInput,
    identities: AuthIdentityProviderService,
  ): Promise<AuthenticationResponse> {
    const parsed = z
      .object({
        email: z.email(),
        password: z.string().min(MIN_PASSWORD_LENGTH),
      })
      .safeParse(input.body)
    if (!parsed.success)
      return { success: false, error: "delivery_agent_credentials_invalid" }
    const email = parsed.data.email.trim().toLowerCase()
    const guard = (
      input.body as unknown as { agent_registration_guard?: unknown }
    )?.agent_registration_guard
    if (typeof guard !== "function")
      return { success: false, error: "invitation_invalid" }
    return guard(async (recovery: boolean) => {
      try {
        await identities.retrieve({ entity_id: email })
        if (!recovery)
          return { success: false, error: "delivery_agent_identity_exists" }
        return super.update(
          { entity_id: email, password: parsed.data.password },
          identities,
        )
      } catch (error) {
        if (
          !(error instanceof MedusaError) ||
          error.type !== MedusaError.Types.NOT_FOUND
        )
          throw error
      }
      return super.register(
        { ...input, body: { ...parsed.data, email } },
        identities,
      )
    })
  }

  async authenticate(
    input: AuthenticationInput,
    identities: AuthIdentityProviderService,
  ): Promise<AuthenticationResponse> {
    const email =
      typeof input.body?.email === "string"
        ? input.body.email.trim().toLowerCase()
        : ""
    return super.authenticate(
      { ...input, body: { ...input.body, email } },
      identities,
    )
  }
}
