import { resolveCustomerLocale } from "@dtc/i18n"
import { getLocale } from "@lib/data/locale-actions"
import AccountLanguage from "@modules/account/components/account-language"
import { retrieveCustomer } from "@lib/data/customer"
// TODO: Re-add Toaster component when needed
import AccountLayout from "@modules/account/templates/account-layout"

export default async function AccountPageLayout({
  dashboard,
  login,
}: {
  dashboard?: React.ReactNode
  login?: React.ReactNode
}) {
  const customer = await retrieveCustomer().catch(() => null)

  const locale = resolveCustomerLocale(
    customer?.metadata?.preferred_language,
    await getLocale(),
  )

  return (
    <AccountLayout customer={customer}>
      <div lang={locale}>
        {customer && <AccountLanguage locale={locale} />}
        {customer ? dashboard : login}
      </div>
      {/* TODO: Re-add Toaster component when needed */}
    </AccountLayout>
  )
}
