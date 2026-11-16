import type { Locale } from "@dtc/i18n"
import { retrieveCart } from "@lib/data/cart"
import CartDropdown from "../cart-dropdown"

export default async function CartButton({
  label,
  locale,
}: {
  label: string
  locale: Locale
}) {
  const cart = await retrieveCart().catch(() => null)

  return <CartDropdown cart={cart} label={label} locale={locale} />
}
