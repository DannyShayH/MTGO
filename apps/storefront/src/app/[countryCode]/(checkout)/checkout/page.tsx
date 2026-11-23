import { retrieveCart } from "@lib/data/cart"
import { retrieveCustomer } from "@lib/data/current-customer"
import { getCustomerLocale } from "@lib/data/customer-locale"
import PaymentWrapper from "@modules/checkout/components/payment-wrapper"
import CheckoutForm from "@modules/checkout/templates/checkout-form"
import CheckoutSummary from "@modules/checkout/templates/checkout-summary"
import { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Checkout",
}

export default async function Checkout({
  params,
}: {
  params: Promise<{ countryCode: string }>
}) {
  const cart = await retrieveCart(undefined, undefined, { fresh: true })

  if (!cart) {
    return notFound()
  }

  const customer = await retrieveCustomer()

  if (!customer) {
    const { countryCode } = await params
    redirect(`/${countryCode}/account?next=/${countryCode}/checkout`)
  }

  const locale = await getCustomerLocale(customer)

  return (
    <div className="content-container grid grid-cols-1 items-start gap-8 py-6 small:grid-cols-[minmax(0,1fr)_360px] small:py-10">
      <PaymentWrapper cart={cart}>
        <CheckoutForm cart={cart} customer={customer} locale={locale} />
      </PaymentWrapper>
      <CheckoutSummary cart={cart} locale={locale} />
    </div>
  )
}
