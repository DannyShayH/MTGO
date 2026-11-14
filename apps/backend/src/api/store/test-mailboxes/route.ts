import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"

export const AUTHENTICATE = false

/** Disposable-only mailbox inspection for browser verification. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  if (
    process.env.E2E_DISPOSABLE !== "1" ||
    !process.env.TEST_MAILBOX_KEY ||
    req.headers["x-test-mailbox-key"] !== process.env.TEST_MAILBOX_KEY
  ) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Mailbox not found")
  }

  const email = String(req.query.email || "")
    .trim()
    .toLowerCase()
  if (!email)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "mailbox_recipient_required",
    )

  const notifications = req.scope.resolve(Modules.NOTIFICATION)
  const messages = await notifications.listNotifications(
    { to: email, template: "customer-verification" },
    { take: 20, order: { created_at: "DESC" } },
  )

  return res.json({
    messages: messages.map((message) => ({
      to: message.to,
      status: message.status,
      ...(message.data as Record<string, unknown>),
    })),
  })
}
