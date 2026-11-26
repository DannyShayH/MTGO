import { CUSTOMER_CART } from "@dtc/i18n"
import { retrieveBasketDishes } from "@lib/data/basket-dishes"
import { retrieveCurrentCart } from "@lib/data/current-cart"
import { retrieveCustomer } from "@lib/data/current-customer"
import { getCustomerLocale } from "@lib/data/customer-locale"
import { restaurantIdOfCart } from "@lib/util/basket"
import CartTemplate from "@modules/cart/templates"
import { Metadata } from "next"

export async function generateMetadata(): Promise<Metadata> {
  const text = CUSTOMER_CART[await getCustomerLocale()]
  return { title: text.pageTitle }
}

export default async function Cart() {
  // Shared with the layout and the header basket in this request (#252).
  const cart = await retrieveCurrentCart()

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
