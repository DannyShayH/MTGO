import ResendNotificationProviderService, { DEFAULT_FROM } from "../service"

const send = jest.fn()
jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send } })),
}))

const logger = { error: jest.fn() } as any
const url = "https://mtogo.corral.dk/dk/verify-account?token=SECRETTOKEN"

const notification = (language: string) =>
  ({
    to: "kunde@example.com",
    channel: "email",
    template: "customer-verification",
    data: {
      verification_url: url,
      expires_at: "2026-11-16T12:00:00.000Z",
      language,
    },
  }) as any

describe("ResendNotificationProviderService", () => {
  beforeEach(() => jest.clearAllMocks())

  it("sends a bilingual delivery invitation without logging its link", async () => {
    send.mockResolvedValue({ data: { id: "re_invite" }, error: null })
    const service = new ResendNotificationProviderService(
      { logger },
      { api_key: "key" },
    )
    await service.send({
      ...notification("da"),
      template: "delivery-agent-invitation",
      data: { invitation_url: url },
    })
    const sent = send.mock.calls[0][0]
    expect(sent.text).toContain("leveringspartner")
    expect(sent.text).toContain("delivery agent")
    expect(sent.text).toContain(url)
    expect(logger.error).not.toHaveBeenCalled()
  })

  it("sends a localized password reset link without logging it", async () => {
    send.mockResolvedValue({ data: { id: "re_reset" }, error: null })
    const service = new ResendNotificationProviderService(
      { logger },
      { api_key: "key" },
    )
    await service.send({
      ...notification("en"),
      template: "customer-password-reset",
      data: { reset_url: url, language: "en" },
    })
    expect(send.mock.calls[0][0].subject).toBe("Reset your MTogo password")
    expect(send.mock.calls[0][0].text).toContain(url)
    expect(logger.error).not.toHaveBeenCalled()
  })

  it("sends a Danish verification email from the default sender", async () => {
    send.mockResolvedValue({ data: { id: "re_1" }, error: null })
    const service = new ResendNotificationProviderService(
      { logger },
      { api_key: "key" },
    )

    await expect(service.send(notification("da"))).resolves.toEqual({
      id: "re_1",
    })

    const sent = send.mock.calls[0][0]
    expect(sent.from).toBe(DEFAULT_FROM)
    expect(sent.to).toEqual(["kunde@example.com"])
    expect(sent.subject).toBe("Bekræft din e-mail hos MTogo")
    expect(sent.text).toContain(url)
    expect(sent.html).toContain(url)
    expect(sent.text).toContain("udløber")
  })

  it("sends English and honours RESEND_FROM_EMAIL", async () => {
    send.mockResolvedValue({ data: { id: "re_2" }, error: null })
    const service = new ResendNotificationProviderService(
      { logger },
      { api_key: "key", from: "Other <x@corral.dk>" },
    )

    await service.send(notification("en"))

    const sent = send.mock.calls[0][0]
    expect(sent.from).toBe("Other <x@corral.dk>")
    expect(sent.subject).toBe("Verify your email at MTogo")
  })

  it("logs a failed send without token, link, address or key, and throws", async () => {
    send.mockResolvedValue({
      data: null,
      error: { message: "Domain not verified" },
    })
    const service = new ResendNotificationProviderService(
      { logger },
      { api_key: "secret-key" },
    )

    await expect(service.send(notification("da"))).rejects.toThrow(
      "email_delivery_failed",
    )

    const logged = logger.error.mock.calls
      .map((c: unknown[]) => c[0])
      .join("\n")
    expect(logged).toContain("customer-verification")
    expect(logged).toContain("example.com")
    expect(logged).toContain("Domain not verified")
    expect(logged).not.toContain("SECRETTOKEN")
    expect(logged).not.toContain("verify-account")
    expect(logged).not.toContain("kunde@")
    expect(logged).not.toContain("secret-key")
  })

  it("rejects an unknown template", async () => {
    const service = new ResendNotificationProviderService(
      { logger },
      { api_key: "key" },
    )
    await expect(
      service.send({ ...notification("da"), template: "other" }),
    ).rejects.toThrow("Unknown email template")
    expect(send).not.toHaveBeenCalled()
  })

  it("requires an API key", () => {
    expect(() => ResendNotificationProviderService.validateOptions({})).toThrow(
      "api_key",
    )
  })
})
