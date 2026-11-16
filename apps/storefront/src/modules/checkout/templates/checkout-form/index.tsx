import { listCartShippingMethods } from "@lib/data/fulfillment"
import { listCartPaymentMethods } from "@lib/data/payment"
import type { Locale } from "@dtc/i18n"
import { HttpTypes } from "@medusajs/types"
import Addresses from "@modules/checkout/components/addresses"
import Payment from "@modules/checkout/components/payment"
import Review from "@modules/checkout/components/review"
import Shipping from "@modules/checkout/components/shipping"

export default async function CheckoutForm({
  cart,
  customer,
  locale,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
  locale: Locale
}) {
  if (!cart) {
    return null
  }

  const shippingMethods = await listCartShippingMethods(cart.id)
  const paymentMethods = await listCartPaymentMethods(cart.region?.id ?? "")

  if (!shippingMethods || !paymentMethods) {
    return null
  }

  return (
    <div className="w-full grid grid-cols-1 gap-y-8">
      <Addresses cart={cart} customer={customer} locale={locale} />

      <Shipping
        cart={cart}
        availableShippingMethods={shippingMethods.filter(
          ({ name }) => name === "MTOGO delivery included",
        )}
        locale={locale}
      />

      <Payment
        cart={cart}
        availablePaymentMethods={paymentMethods.filter(
          ({ id }) => id === "pp_system_default",
        )}
        locale={locale}
      />

      <Review cart={cart} locale={locale} />
    </div>
  )
}
