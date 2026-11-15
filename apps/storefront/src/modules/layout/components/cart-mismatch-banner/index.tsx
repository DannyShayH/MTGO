"use client"

import { transferCart } from "@lib/data/customer"
import { CUSTOMER_CART, type Locale } from "@dtc/i18n"
import { ExclamationCircleSolid } from "@medusajs/icons"
import { StoreCart, StoreCustomer } from "@medusajs/types"
import { Button } from "@modules/common/components/ui"
import { useRouter } from "next/navigation"
import { useState } from "react"
function CartMismatchBanner(props: {
  customer: StoreCustomer
  cart: StoreCart
  locale: Locale
}) {
  const { customer, cart, locale } = props
  const router = useRouter()
  const text = CUSTOMER_CART[locale]
  const [isPending, setIsPending] = useState(false)
  const [actionText, setActionText] = useState<string>(text.retryTransfer)

  if (!customer || cart.customer_id === customer.id) {
    return
  }

  const handleSubmit = async () => {
    try {
      setIsPending(true)
      setActionText(text.transferring)

      await transferCart()
      router.refresh()
    } catch {
      setActionText(text.retryTransfer)
      setIsPending(false)
    }
  }

  return (
    <div className="mt-2 flex items-center justify-center gap-1 bg-mtogo-status-error-surface p-2 text-center text-sm text-mtogo-status-error-text small:gap-2 small:p-4">
      <div className="flex flex-col small:flex-row small:gap-2 gap-1 items-center">
        <span className="flex items-center gap-1">
          <ExclamationCircleSolid className="inline" />
          {text.transferFailed}
        </span>

        <span>·</span>

        <Button
          variant="transparent"
          className="bg-transparent p-0 text-mtogo-status-error-text hover:bg-transparent active:bg-transparent focus:bg-transparent disabled:text-mtogo-status-error-text"
          size="medium"
          disabled={isPending}
          onClick={handleSubmit}
        >
          {actionText}
        </Button>
      </div>
    </div>
  )
}

export default CartMismatchBanner
