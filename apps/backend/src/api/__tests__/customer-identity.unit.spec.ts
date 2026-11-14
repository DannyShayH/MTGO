import {
  authenticate,
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { asValue } from "@medusajs/deps/awilix"
import { createMedusaContainer } from "@medusajs/utils"
import {
  discardLegacyCustomerIdentity,
  requireIsolatedCustomerIdentity,
  requireVerifiedCustomer,
} from "../customer-identity"

function customerRequest(provider = "customer-emailpass") {
  const context = {
    actor_type: "customer",
    actor_id: "cus_test",
    auth_identity_id: "authid_test",
    auth_provider: provider,
  }
  const retrieveAuthIdentity = jest.fn().mockResolvedValue({
    app_metadata: { customer_id: "cus_test" },
    provider_identities: [{ provider: "customer-emailpass" }],
  })
  const listAuthVerifications = jest
    .fn()
    .mockResolvedValue([{ verified_at: new Date() }])
  const scope = createMedusaContainer()
  scope.register(
    Modules.AUTH,
    asValue({ retrieveAuthIdentity, listAuthVerifications }),
  )
  scope.register(
    "configModule",
    asValue({ projectConfig: { http: { jwtSecret: "ci-only-secret" } } }),
  )
  scope.register("logger", asValue({ debug: jest.fn(), info: jest.fn() }))
  const req = {
    auth_context: context,
    headers: { authorization: "Bearer legacy-token" },
    session: { auth_context: context },
    scope,
  } as unknown as AuthenticatedMedusaRequest
  return { req, retrieveAuthIdentity, listAuthVerifications }
}

const res = {} as MedusaResponse

it.each([
  { source: "bearer", reason: "EP: legacy bearer token" },
  { source: "session", reason: "EP: legacy session" },
  { source: "both", reason: "EP: legacy token and session" },
])(
  "permits public access but refuses protected access: $reason",
  async ({ source }) => {
    const { req } = customerRequest("emailpass")
    if (source === "bearer") delete req.session.auth_context
    if (source === "session") delete req.headers.authorization
    const next = jest.fn()
    await discardLegacyCustomerIdentity(req, res, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(req.auth_context).toBeUndefined()
    expect(req.headers.authorization).toBeUndefined()
    expect(req.session.auth_context).toBeUndefined()

    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() }
    const protectedNext = jest.fn()
    await authenticate("customer", ["bearer", "session"])(
      req,
      response as unknown as MedusaResponse,
      protectedNext,
    )
    expect(response.status).toHaveBeenCalledWith(401)
    expect(protectedNext).not.toHaveBeenCalled()
  },
)

it("preserves an isolated Customer's authentication", async () => {
  const { req } = customerRequest()
  const context = req.auth_context
  const next = jest.fn()
  await discardLegacyCustomerIdentity(req, res, next)
  expect(req.auth_context).toBe(context)
  expect(req.session.auth_context).toBe(context)
  expect(req.headers.authorization).toBe("Bearer legacy-token")
  expect(next).toHaveBeenCalledTimes(1)
})

it.each([
  { middleware: discardLegacyCustomerIdentity, reason: "EP: Store request" },
  {
    middleware: requireIsolatedCustomerIdentity,
    reason: "EP: refresh/session request",
  },
])(
  "propagates unexpected lookup failures unchanged: $reason",
  async ({ middleware }) => {
    const { req, retrieveAuthIdentity } = customerRequest()
    const failure = new Error("Database unavailable")
    retrieveAuthIdentity.mockRejectedValue(failure)
    const next = jest.fn()
    await expect(middleware(req, res, next)).rejects.toBe(failure)
    expect(next).not.toHaveBeenCalled()
  },
)

it("treats a missing identity as signed-out", async () => {
  const { req, retrieveAuthIdentity } = customerRequest()
  retrieveAuthIdentity.mockRejectedValue(
    new MedusaError(MedusaError.Types.NOT_FOUND, "Identity not found"),
  )
  await discardLegacyCustomerIdentity(req, res, jest.fn())
  expect(req.auth_context).toBeUndefined()
})

it("rejects legacy credentials for refresh and session creation", async () => {
  const { req } = customerRequest("emailpass")
  await expect(
    requireIsolatedCustomerIdentity(req, res, jest.fn()),
  ).rejects.toMatchObject({
    type: MedusaError.Types.UNAUTHORIZED,
    message: "customer_sign_in_required",
  })
})

it("allows a verified Customer to complete checkout", async () => {
  const { req } = customerRequest()
  const next = jest.fn()

  await requireVerifiedCustomer(req, res, next)

  expect(next).toHaveBeenCalledTimes(1)
})

it("refuses an unverified Customer at the checkout boundary", async () => {
  const { req, listAuthVerifications } = customerRequest()
  listAuthVerifications.mockResolvedValue([{ verified_at: null }])
  await expect(
    requireVerifiedCustomer(req, res, jest.fn()),
  ).rejects.toMatchObject({
    type: MedusaError.Types.UNAUTHORIZED,
    message: "customer_email_verification_required",
  })
})
