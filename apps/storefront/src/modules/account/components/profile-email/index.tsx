import type { Locale } from "@dtc/i18n"
import type { HttpTypes } from "@medusajs/types"
import { accountText } from "@lib/util/account-text"

export default function ProfileEmail({
  customer,
  locale,
}: {
  customer: HttpTypes.StoreCustomer
  locale: Locale
}) {
  const text = accountText[locale]
  return (
    <div className="text-small-regular" data-testid="account-email-editor">
      <div className="text-ui-fg-subtle">{text.email}</div>
      <div className="font-semibold break-words">{customer.email}</div>
      <p className="mt-2 text-ui-fg-subtle">{text.emailUnavailable}</p>
    </div>
  )
}
