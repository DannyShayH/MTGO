export type CustomerEmailChange = {
  customer_id: string
  old_email: string
  new_email: string
}

export type CustomerEmailChangeNotice = {
  id?: string
  old_email: string
  new_email: string
  language: "da" | "en"
}

export const maskEmail = (email: string) => {
  const [localPart, domain] = email.split("@")
  return `${localPart?.slice(0, 1) || "*"}***@${domain || "unknown"}`
}

export const getCustomerLanguage = (
  metadata: Record<string, unknown> | null | undefined,
) => (metadata?.preferred_language === "en" ? "en" : "da")

/** Reads notices written before and after the queue was introduced. */
export function getPendingEmailChangeNotices(
  metadata: Record<string, unknown> | null | undefined,
): CustomerEmailChangeNotice[] {
  const queued = metadata?.pending_customer_email_change_notices
  const legacy = metadata?.pending_customer_email_change_notice as
    CustomerEmailChangeNotice | undefined
  return [
    ...(legacy?.old_email && legacy.new_email ? [legacy] : []),
    ...(Array.isArray(queued) ? (queued as CustomerEmailChangeNotice[]) : []),
  ]
}

export type CustomerEmailChangeRecovery = {
  provider_id: string
  identity_id: string
  previous_customer_metadata: Record<string, unknown>
  previous_identity_metadata: Record<string, unknown>
  old_email: string
  new_email: string
  security_version: string
  language: "da" | "en"
}

export function noticeIdempotencyKey(
  customerId: string,
  notice: CustomerEmailChangeNotice,
) {
  return `customer-email-change-completed:${customerId}:${notice.id ?? notice.new_email}`
}
