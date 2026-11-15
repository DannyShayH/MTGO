import { retrieveCart } from "@lib/data/cart"
import { retrieveCustomer } from "@lib/data/customer"
import { getCustomerLocale } from "@lib/data/customer-locale"
import { CUSTOMER_CART } from "@dtc/i18n"
import CartMismatchBanner from "@modules/layout/components/cart-mismatch-banner"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
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
  const cart = await retrieveCart()

  if (!cart) {
    return notFound()
  }

  const customer = await retrieveCustomer()

  if (!customer) {
    const { countryCode } = await params
    redirect(`/${countryCode}/account?next=/${countryCode}/checkout`)
  }

  if (cart.customer_id !== customer.id) {
    const locale = await getCustomerLocale(customer)
    const text = CUSTOMER_CART[locale]

    return (
      <div className="content-container py-12" lang={locale}>
        <CartMismatchBanner customer={customer} cart={cart} locale={locale} />
        <div className="mx-auto mt-8 max-w-xl text-center">
          <h1 className="text-large-semi">{text.transferFailed}</h1>
          <LocalizedClientLink
            href="/cart"
            className="mt-6 inline-flex min-h-11 items-center rounded-md bg-mtogo-action-primary px-4 text-mtogo-text-on-primary"
          >
            {text.returnToCart}
          </LocalizedClientLink>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 small:grid-cols-[1fr_416px] content-container gap-x-40 py-12">
      <PaymentWrapper cart={cart}>
        <CheckoutForm cart={cart} customer={customer} />
      </PaymentWrapper>
      <CheckoutSummary cart={cart} />
    </div>
  )
}
