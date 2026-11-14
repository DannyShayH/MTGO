import { retrieveCart } from "@lib/data/cart"
import CartDropdown from "../cart-dropdown"

export default async function CartButton({ label }: { label: string }) {
  const cart = await retrieveCart().catch(() => null)

  return <CartDropdown cart={cart} label={label} />
}
