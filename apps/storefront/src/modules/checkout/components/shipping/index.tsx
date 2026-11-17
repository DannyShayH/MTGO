"use client"

import { CUSTOMER_CHECKOUT_TEXT, type Locale } from "@dtc/i18n"
import { setShippingMethod } from "@lib/data/cart"
import { convertToLocale } from "@lib/util/money"
import { CheckCircleSolid, MapPin } from "@medusajs/icons"
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
  const selectedId = cart.shipping_methods?.at(-1)?.shipping_option_id ?? null
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const option = availableShippingMethods[0]

  const selectDelivery = async () => {
    if (!option || isLoading) return false
    setIsLoading(true)
    setError(null)
    try {
      await setShippingMethod({ cartId: cart.id, shippingMethodId: option.id })
      return true
    } catch {
      setError(text.deliverySelectionFailed)
      return false
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
            <div
              className="flex min-h-16 items-center gap-3 rounded-card border border-mtogo-border-subtle bg-mtogo-surface-selected p-4"
              data-testid="delivery-option-radio"
            >
              <MapPin
                aria-hidden="true"
                className="shrink-0 text-mtogo-text-link"
              />
              <span className="flex-1 font-medium">
                {text.deliveryIncluded}
              </span>
              <span className="font-semibold tabular-nums">
                {convertToLocale({
                  amount: 0,
                  currency_code: cart.currency_code,
                  locale: locale === "da" ? "da-DK" : "en-GB",
                })}
              </span>
              <CheckCircleSolid
                aria-hidden="true"
                className="shrink-0 text-mtogo-text-link"
              />
            </div>
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
            onClick={async () => {
              if (selectedId === option?.id || (await selectDelivery()))
                router.push(`${pathname}?step=payment`, { scroll: false })
            }}
            disabled={!option || isLoading}
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
