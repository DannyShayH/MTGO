import { retrieveOrder } from "@lib/data/orders"
import {
  CUSTOMER_ORDER_CONFIRMATION_TEXT,
  reviewedCheckoutLanguage,
} from "@dtc/i18n"
import OrderCompletedTemplate from "@modules/order/templates/order-completed-template"
import { Metadata } from "next"
import { notFound } from "next/navigation"

type Props = {
  params: Promise<{ id: string }>
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
  const order = await retrieveOrder(params.id).catch(() => null)

  if (!order) {
    return notFound()
  }

  return (
    <OrderCompletedTemplate
      order={order}
      locale={reviewedCheckoutLanguage(order.metadata) ?? "da"}
    />
  )
}
