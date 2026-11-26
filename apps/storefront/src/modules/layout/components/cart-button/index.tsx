import type { Locale } from "@dtc/i18n"
import { retrieveCurrentCart } from "@lib/data/current-cart"
import CartDropdown from "../cart-dropdown"

export default async function CartButton({
  label,
  locale,
}: {
  label: string
  locale: Locale
}) {
  // Shared with the layout and the basket page in this request (#252).
  const cart = await retrieveCurrentCart()

  return <CartDropdown cart={cart} label={label} locale={locale} />
}
