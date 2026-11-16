import { getCustomerLocale } from "@lib/data/customer-locale"
import { accountText } from "@lib/util/account-text"
import Spinner from "@modules/common/icons/spinner"

export default async function LoadingOrders() {
  const locale = await getCustomerLocale()
  return (
    <div role="status" className="flex items-center gap-3 py-8">
      <Spinner />
      {accountText[locale].loading}
    </div>
  )
}
