import { MedusaError } from "@medusajs/framework/utils"

export type EmailContent = { subject: string; text: string; html: string }

type VerificationData = {
  verification_url?: unknown
  expires_at?: unknown
  language?: unknown
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

const copy = {
  da: {
    subject: "Bekræft din e-mail hos MTogo",
    intro: "Tak fordi du oprettede en konto hos MTogo. Bekræft din e-mail:",
    action: "Bekræft e-mail",
    expiry: (when: string) => `Linket udløber ${when} (dansk tid).`,
    ignore: "Har du ikke oprettet en konto, kan du ignorere denne e-mail.",
    locale: "da-DK",
  },
  en: {
    subject: "Verify your email at MTogo",
    intro: "Thanks for creating an MTogo account. Please verify your email:",
    action: "Verify email",
    expiry: (when: string) => `The link expires ${when} (Danish time).`,
    ignore: "If you did not create an account, you can ignore this email.",
    locale: "en-GB",
  },
} as const

export const supportedTemplates = [
  "delivery-agent-invitation",
  "customer-verification",
  "customer-password-reset",
  "customer-email-change",
  "customer-email-change-completed",
] as const

export function renderDeliveryAgentInvitation(
  data: { invitation_url?: unknown } | null | undefined,
): EmailContent {
  const url =
    typeof data?.invitation_url === "string" ? data.invitation_url : ""
  if (!url)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "invitation_url is required",
    )
  const subject = "Invitation til MTogo / MTogo invitation"
  const danish =
    "Du er inviteret som leveringspartner hos MTogo. Åbn linket inden 24 timer for at vælge din adgangskode."
  const english =
    "You have been invited to join MTogo as a delivery agent. Open the link within 24 hours to set your password."
  return {
    subject,
    text: `${danish}\n\n${english}\n\n${url}`,
    html: `<p>${danish}</p><p>${english}</p><p><a href="${escapeHtml(url)}">Acceptér invitation / Accept invitation</a></p>`,
  }
}

export function renderCustomerEmailChange(
  data:
    | { confirmation_url?: unknown; expires_at?: unknown; language?: unknown }
    | null
    | undefined,
): EmailContent {
  const en = data?.language === "en"
  const url =
    typeof data?.confirmation_url === "string" ? data.confirmation_url : ""
  if (!url)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "confirmation_url is required",
    )
  const subject = en
    ? "Confirm your new MTogo email"
    : "Bekræft din nye e-mail hos MTogo"
  const intro = en
    ? "Confirm your new email address within 15 minutes to finish the change."
    : "Bekræft din nye e-mail inden for 15 minutter for at gennemføre ændringen."
  return {
    subject,
    text: [intro, url].join("\n\n"),
    html: `<p>${intro}</p><p><a href="${escapeHtml(url)}">${subject}</a></p>`,
  }
}

export function renderCustomerEmailChangeCompleted(
  data: { new_email?: unknown; language?: unknown } | null | undefined,
): EmailContent {
  const newEmail = typeof data?.new_email === "string" ? data.new_email : ""
  if (!newEmail)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "new_email is required",
    )
  const en = data?.language === "en"
  const subject = en
    ? "Your MTogo login email changed"
    : "Din login-e-mail hos MTogo er ændret"
  const message = en
    ? `Your MTogo login email is now ${newEmail}.`
    : `Din login-e-mail hos MTogo er nu ${newEmail}.`
  const warning = en
    ? "If you did not make this change, contact support."
    : "Hvis du ikke har foretaget ændringen, skal du kontakte support."
  return {
    subject,
    text: `${message} ${warning}`,
    html: `<p>${message}</p><p>${warning}</p>`,
  }
}

export function renderCustomerPasswordReset(
  data: { reset_url?: unknown; language?: unknown } | null | undefined,
): EmailContent {
  const url = typeof data?.reset_url === "string" ? data.reset_url : ""
  if (!url)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "reset_url is required",
    )
  const en = data?.language === "en"
  const subject = en
    ? "Reset your MTogo password"
    : "Nulstil din adgangskode hos MTogo"
  const intro = en
    ? "Use this link within 15 minutes to reset your password."
    : "Brug dette link inden for 15 minutter til at nulstille din adgangskode."
  const ignore = en
    ? "If you did not request this, you can ignore this email."
    : "Hvis du ikke har anmodet om dette, kan du ignorere denne e-mail."
  return {
    subject,
    text: [intro, url, ignore].join("\n\n"),
    html: `<p>${intro}</p><p><a href="${escapeHtml(url)}">${subject}</a></p><p>${ignore}</p>`,
  }
}

export function renderCustomerVerification(
  data: VerificationData | null | undefined,
): EmailContent {
  const text = copy[data?.language === "en" ? "en" : "da"]
  const url =
    typeof data?.verification_url === "string" ? data.verification_url : ""
  if (!url)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "verification_url is required",
    )

  const expires =
    typeof data?.expires_at === "string" ? new Date(data.expires_at) : null
  const when =
    expires && !Number.isNaN(expires.getTime())
      ? new Intl.DateTimeFormat(text.locale, {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: "Europe/Copenhagen",
        }).format(expires)
      : null
  const expiry = when ? text.expiry(when) : null

  return {
    subject: text.subject,
    text: [text.intro, url, expiry, text.ignore].filter(Boolean).join("\n\n"),
    html: [
      `<p>${text.intro}</p>`,
      `<p><a href="${escapeHtml(url)}">${text.action}</a></p>`,
      expiry ? `<p>${expiry}</p>` : "",
      `<p>${text.ignore}</p>`,
    ].join(""),
  }
}
