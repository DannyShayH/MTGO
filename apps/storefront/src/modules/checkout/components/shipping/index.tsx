"use client"

import { CUSTOMER_CHECKOUT_TEXT, type Locale } from "@dtc/i18n"
import { setShippingMethod } from "@lib/data/cart"
import { convertToLocale } from "@lib/util/money"
import { CheckCircleSolid } from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import ErrorMessage from "@modules/checkout/components/error-message"
import Divider from "@modules/common/components/divider"
import { Button, Heading, Text } from "@modules/common/components/ui"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"

type ShippingProps = {
  cart: HttpTypes.StoreCart
  availableShippingMethods: HttpTypes.StoreCartShippingOption[]
  locale: Locale
}

export default function Shipping({
  cart,
  availableShippingMethods,
  locale,
}: ShippingProps) {
  const text = CUSTOMER_CHECKOUT_TEXT[locale]
  const router = useRouter()
  const pathname = usePathname()
  const isOpen = useSearchParams().get("step") === "delivery"
  const [selectedId, setSelectedId] = useState<string | null>(
    cart.shipping_methods?.at(-1)?.shipping_option_id ?? null,
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const option = availableShippingMethods[0]

  const selectDelivery = async () => {
    if (!option || isLoading) return
    setIsLoading(true)
    setError(null)
    try {
      await setShippingMethod({ cartId: cart.id, shippingMethodId: option.id })
      setSelectedId(option.id)
    } catch {
      setError(text.deliverySelectionFailed)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section
      className="bg-mtogo-surface-card"
      aria-labelledby="checkout-delivery-heading"
    >
      <div className="mb-6 flex items-center justify-between gap-3">
        <Heading
          level="h2"
          id="checkout-delivery-heading"
          className="flex items-center gap-2 text-3xl-regular"
        >
          {text.delivery}
          {selectedId && <CheckCircleSolid aria-hidden="true" />}
        </Heading>
        {!isOpen && selectedId && (
          <button
            type="button"
            onClick={() =>
              router.push(`${pathname}?step=delivery`, { scroll: false })
            }
            className="min-h-11 rounded-md text-mtogo-text-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2"
            data-testid="edit-delivery-button"
          >
            {text.edit}
          </button>
        )}
      </div>
      {isOpen ? (
        <div className="space-y-4">
          {option ? (
            <button
              type="button"
              onClick={selectDelivery}
              aria-pressed={selectedId === option.id}
              className="flex min-h-14 w-full items-center justify-between gap-4 rounded-card border border-mtogo-border-control bg-mtogo-surface-card px-4 text-left text-mtogo-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2 aria-pressed:bg-mtogo-surface-selected"
              data-testid="delivery-option-radio"
            >
              <span>{text.deliveryIncluded}</span>
              <span>
                {convertToLocale({
                  amount: 0,
                  currency_code: cart.currency_code,
                  locale: locale === "da" ? "da-DK" : "en-GB",
                })}
              </span>
            </button>
          ) : (
            <Text className="text-mtogo-status-error-text">
              {text.deliveryUnavailable}
            </Text>
          )}
          <ErrorMessage
            error={error}
            data-testid="delivery-option-error-message"
          />
          <Button
            size="large"
            onClick={() =>
              router.push(`${pathname}?step=payment`, { scroll: false })
            }
            disabled={!selectedId || isLoading}
            isLoading={isLoading}
            data-testid="submit-delivery-option-button"
          >
            {text.continueToPayment}
          </Button>
        </div>
      ) : selectedId ? (
        <Text className="text-mtogo-text-secondary">
          {text.deliveryIncluded}
        </Text>
      ) : null}
      <Divider className="mt-8" />
    </section>
  )
}
