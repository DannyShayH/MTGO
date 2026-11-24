import { readOrderProgress, retrieveOrder } from "@lib/data/orders"
import { retrieveCustomer } from "@lib/data/current-customer"
import {
  CUSTOMER_ORDER_CONFIRMATION_TEXT,
  reviewedCheckoutLanguage,
} from "@dtc/i18n"
import OrderCompletedTemplate from "@modules/order/templates/order-completed-template"
import { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

type Props = {
  params: Promise<{ id: string; countryCode: string }>
}
export async function generateMetadata(props: Props): Promise<Metadata> {
  const { id } = await props.params
  const order = await retrieveOrder(id).catch(() => null)
  const locale = reviewedCheckoutLanguage(order?.metadata) ?? "da"
  const text = CUSTOMER_ORDER_CONFIRMATION_TEXT[locale]
  return { title: `${text.title} | MTOGO`, description: text.explanation }
}

export default async function OrderConfirmedPage(props: Props) {
  const params = await props.params
  if (!(await retrieveCustomer())) {
    const next = `/${params.countryCode}/order/${encodeURIComponent(params.id)}/confirmed`
    redirect(`/${params.countryCode}/account?next=${encodeURIComponent(next)}`)
  }
  const order = await retrieveOrder(params.id).catch(() => null)

  if (!order) {
    return notFound()
  }

  const progress = await readOrderProgress(params.id)

  return (
    <OrderCompletedTemplate
      order={order}
      locale={reviewedCheckoutLanguage(order.metadata) ?? "da"}
      progress={progress}
    />
  )
}
