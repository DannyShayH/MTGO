export type CustomerEmailChange = {
  customer_id: string
  old_email: string
  new_email: string
}

export type CustomerEmailChangeNotice = {
  old_email: string
  new_email: string
  language: "da" | "en"
}

export const getCustomerLanguage = (
  metadata: Record<string, unknown> | null | undefined,
) => (metadata?.preferred_language === "en" ? "en" : "da")
