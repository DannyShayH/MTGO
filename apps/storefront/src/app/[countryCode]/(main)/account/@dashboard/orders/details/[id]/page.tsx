import { getCustomerLocale } from "@lib/data/customer-locale"
import { readOrderProgress, retrieveAccountOrder } from "@lib/data/orders"
import { accountText } from "@lib/util/account-text"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import OrderDetailsTemplate from "@modules/order/templates/order-details-template"
import { notFound } from "next/navigation"

type Props = { params: Promise<{ id: string }> }
export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params
  const locale = await getCustomerLocale()
  const [result, progress] = await Promise.all([
    retrieveAccountOrder(id),
    readOrderProgress(id),
  ])
  if (result.state !== "success") {
    if (result.state === "not_found") notFound()
    const text = accountText[locale]
    return (
      <div role="alert" className="space-y-4">
        <p>{text.failed}</p>
        <LocalizedClientLink
          href={`/account/orders/details/${id}`}
          className="underline text-mtogo-text-link"
        >
          {text.retry}
        </LocalizedClientLink>
      </div>
    )
  }
  return (
    <OrderDetailsTemplate
      order={result.order}
      locale={locale}
      progress={progress}
    />
  )
}
