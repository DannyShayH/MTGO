import { resolveCustomerLocale } from "@dtc/i18n"
import { getLocale } from "@lib/data/locale-actions"
import { retrieveCustomer } from "@lib/data/current-customer"
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
    <AccountLayout customer={customer} locale={locale}>
      <div lang={locale}>{customer ? dashboard : login}</div>
    </AccountLayout>
  )
}
