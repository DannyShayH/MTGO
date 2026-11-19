import {
  renderCustomerEmailChange,
  renderCustomerEmailChangeCompleted,
  renderCustomerPasswordReset,
  renderCustomerVerification,
  renderDeliveryAgentInvitation,
} from "../templates"

const link = 'https://mtogo.corral.dk/dk/x?token=a&b="c"<d>'
const escapedLink =
  "https://mtogo.corral.dk/dk/x?token=a&amp;b=&quot;c&quot;&lt;d&gt;"

describe("email templates", () => {
  const templates = [
    [renderDeliveryAgentInvitation, "invitation_url"],
    [renderCustomerEmailChange, "confirmation_url"],
    [renderCustomerEmailChangeCompleted, "new_email"],
    [renderCustomerPasswordReset, "reset_url"],
    [renderCustomerVerification, "verification_url"],
  ] as const

  it.each([
    { value: () => null, reason: "EP: no data at all" },
    { value: () => ({}), reason: "EP: data without the required field" },
    {
      value: (field: string) => ({ [field]: 42 }),
      reason: "EP: required field that is not text",
    },
    {
      value: (field: string) => ({ [field]: "" }),
      reason: "BVA: required field that is empty text",
    },
  ])("every template refuses $reason", ({ value }) => {
    for (const [render, field] of templates)
      expect(() => render(value(field) as never)).toThrow(
        `${field} is required`,
      )
  })

  it("escapes the link in HTML but keeps it verbatim in the text", () => {
    const rendered = [
      renderDeliveryAgentInvitation({ invitation_url: link }),
      renderCustomerEmailChange({ confirmation_url: link }),
      renderCustomerPasswordReset({ reset_url: link }),
      renderCustomerVerification({ verification_url: link }),
    ]
    for (const { text, html } of rendered) {
      expect(text).toContain(link)
      expect(html).toContain(`href="${escapedLink}"`)
      expect(html).not.toContain(link)
    }
  })

  it("writes a delivery invitation in both languages", () => {
    const { subject, text } = renderDeliveryAgentInvitation({
      invitation_url: link,
    })
    expect(subject).toBe("Invitation til MTogo / MTogo invitation")
    expect(text).toContain("leveringspartner")
    expect(text).toContain("delivery agent")
  })

  it("asks to confirm a new email in Danish unless English is chosen", () => {
    expect(
      renderCustomerEmailChange({ confirmation_url: link, language: "de" })
        .subject,
    ).toBe("Bekræft din nye e-mail hos MTogo")
    const english = renderCustomerEmailChange({
      confirmation_url: link,
      language: "en",
    })
    expect(english.subject).toBe("Confirm your new MTogo email")
    expect(english.text).toContain("within 15 minutes")
  })

  it("tells the old address which email the login changed to", () => {
    const danish = renderCustomerEmailChangeCompleted({
      new_email: "ny@example.com",
    })
    expect(danish.subject).toBe("Din login-e-mail hos MTogo er ændret")
    expect(danish.text).toContain("er nu ny@example.com.")
    expect(danish.text).toContain("kontakte support")
    const english = renderCustomerEmailChangeCompleted({
      new_email: "new@example.com",
      language: "en",
    })
    expect(english.subject).toBe("Your MTogo login email changed")
    expect(english.html).toContain("is now new@example.com.")
    expect(english.html).toContain("contact support")
  })

  it("sends a password reset in Danish unless English is chosen", () => {
    const danish = renderCustomerPasswordReset({ reset_url: link })
    expect(danish.subject).toBe("Nulstil din adgangskode hos MTogo")
    expect(danish.text).toContain("kan du ignorere denne e-mail")
    expect(
      renderCustomerPasswordReset({ reset_url: link, language: "en" }).text,
    ).toContain("you can ignore this email")
  })

  it("states when the verification link expires in Danish time", () => {
    // 12:00 UTC on 16 November is 13:00 in Copenhagen (CET).
    const expires_at = "2026-11-16T12:00:00.000Z"
    const danish = renderCustomerVerification({
      verification_url: link,
      expires_at,
    })
    expect(danish.text).toMatch(/Linket udløber 16\.11\.2026.*13[.:]00/)
    expect(danish.html).toContain("(dansk tid)")
    const english = renderCustomerVerification({
      verification_url: link,
      expires_at,
      language: "en",
    })
    expect(english.text).toMatch(/expires 16\/11\/2026.*13:00/)
  })

  it.each([
    { expires_at: undefined, reason: "EP: no expiry given" },
    { expires_at: "soon", reason: "EP: text that is not a date" },
    { expires_at: 1763294400000, reason: "EP: a timestamp that is not text" },
  ])("leaves out the expiry for $reason", ({ expires_at }) => {
    const { text, html } = renderCustomerVerification({
      verification_url: link,
      expires_at,
    })
    expect(text).not.toContain("udløber")
    expect(html).not.toContain("udløber")
    expect(text.split("\n\n")).toHaveLength(3)
  })
})
