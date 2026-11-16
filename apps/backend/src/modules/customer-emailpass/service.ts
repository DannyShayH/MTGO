import EmailPassProvider from "@medusajs/medusa/auth-emailpass"
import {
  AuthenticationInput,
  AuthenticationResponse,
  AuthIdentityProviderService,
} from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { randomUUID } from "node:crypto"

// Use the public ModuleProvider service export rather than its internal build path.
interface EmailPasswordService {
  register(
    input: AuthenticationInput,
    identities: AuthIdentityProviderService,
  ): Promise<AuthenticationResponse>
  authenticate(
    input: AuthenticationInput,
    identities: AuthIdentityProviderService,
  ): Promise<AuthenticationResponse>
  update(
    data: Record<string, unknown>,
    identities: AuthIdentityProviderService,
  ): Promise<AuthenticationResponse>
}
const EmailPassAuthService: new (...args: unknown[]) => EmailPasswordService =
  EmailPassProvider.services[0]

/** Reuses Medusa's scrypt implementation with a separate provider namespace. */
export default class CustomerEmailPassService extends EmailPassAuthService {
  static readonly identifier = "customer-emailpass"
  static readonly DISPLAY_NAME = "Customer Email/Password"

  async update(
    data: Record<string, unknown>,
    identities: AuthIdentityProviderService,
  ): Promise<AuthenticationResponse> {
    if (
      typeof data.password !== "string" ||
      !data.password ||
      typeof data.entity_id !== "string"
    )
      return { success: false, error: "customer_credentials_invalid" }
    const identity = await identities.retrieve({ entity_id: data.entity_id })
    const provider = identity.provider_identities?.find(
      (entry) => entry.provider === "customer-emailpass",
    )
    if (!provider)
      return { success: false, error: "customer_credentials_invalid" }
    return super.update(data, {
      ...identities,
      update: (entityId, updates) =>
        identities.update(entityId, {
          ...updates,
          user_metadata: {
            ...provider.user_metadata,
            security_version: randomUUID(),
          },
        }),
    })
  }

  async register(
    input: AuthenticationInput,
    identities: AuthIdentityProviderService,
  ): Promise<AuthenticationResponse> {
    const parsed = z
      .object({ email: z.email(), password: z.string().min(1) })
      .safeParse(input.body)
    if (!parsed.success)
      return { success: false, error: "customer_credentials_invalid" }
    const email = parsed.data.email.trim().toLowerCase()
    try {
      await identities.retrieve({ entity_id: email })
      return { success: false, error: "customer_identity_exists" }
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
  }

  async authenticate(
    input: AuthenticationInput,
    identities: AuthIdentityProviderService,
  ): Promise<AuthenticationResponse> {
    const email =
      typeof input.body?.email === "string"
        ? input.body.email.trim().toLowerCase()
        : ""
    const result = await super.authenticate(
      { ...input, body: { ...input.body, email } },
      identities,
    )
    return result.success
      ? result
      : { success: false, error: "customer_credentials_invalid" }
  }
}
