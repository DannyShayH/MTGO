import { getCustomerLocale } from "@lib/data/customer-locale"
import {
  readOrderFeedback,
  readOrderProgress,
  retrieveAccountOrder,
} from "@lib/data/orders"
import { accountText } from "@lib/util/account-text"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import OrderDetailsTemplate from "@modules/order/templates/order-details-template"
import { notFound } from "next/navigation"
import { reviewedCheckoutLanguage } from "@dtc/i18n"

type Props = { params: Promise<{ id: string }> }
export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params
  const locale = await getCustomerLocale()
  const [result, progress, feedback] = await Promise.all([
    retrieveAccountOrder(id),
    readOrderProgress(id),
    readOrderFeedback(id),
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
      locale={reviewedCheckoutLanguage(result.order.metadata) ?? "da"}
      progress={progress}
      feedback={feedback}
    />
  )
}
