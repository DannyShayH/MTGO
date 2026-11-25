import { CUSTOMER_CART } from "@dtc/i18n"
import { httpStatus } from "@dtc/logging"
import { logUpstreamFailure } from "@lib/logger"
import { retrieveBasketDishes } from "@lib/data/basket-dishes"
import { retrieveCart } from "@lib/data/cart"
import { retrieveCustomer } from "@lib/data/current-customer"
import { getCustomerLocale } from "@lib/data/customer-locale"
import { restaurantIdOfCart } from "@lib/util/basket"
import CartTemplate from "@modules/cart/templates"
import { Metadata } from "next"
import { notFound } from "next/navigation"

export async function generateMetadata(): Promise<Metadata> {
  const text = CUSTOMER_CART[await getCustomerLocale()]
  return { title: text.pageTitle }
}

export default async function Cart() {
  const cart = await retrieveCart().catch((error) => {
    logUpstreamFailure({
      route: "/:countryCode/cart",
      method: "GET",
      status: httpStatus(error),
    })
    return notFound()
  })

  const customer = await retrieveCustomer()
  const restaurantId = restaurantIdOfCart(cart)
  const [locale, dishes] = await Promise.all([
    getCustomerLocale(customer),
    restaurantId ? retrieveBasketDishes(restaurantId) : null,
  ])

  return (
    <CartTemplate
      cart={cart}
      customer={customer}
      locale={locale}
      dishes={dishes}
    />
  )
}
