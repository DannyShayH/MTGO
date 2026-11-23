"use client"

import { CUSTOMER_CHECKOUT_TEXT, type Locale } from "@dtc/i18n"
import { setShippingMethod } from "@lib/data/cart"
import { useCheckoutStep } from "@lib/hooks/use-checkout-step"
import { CheckCircleSolid, TruckFast } from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import ErrorMessage from "@modules/checkout/components/error-message"
import Divider from "@modules/common/components/divider"
import { Button, Heading, Text } from "@modules/common/components/ui"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import StepEditButton from "../step-edit-button"

type ShippingProps = {
  cart: HttpTypes.StoreCart
  availableShippingMethods: HttpTypes.StoreCartShippingOption[]
  locale: Locale
}

/** The delivery's destination on one line: street, apartment, postal code and town. */
const destinationOf = (cart: HttpTypes.StoreCart) => {
  const address = cart.shipping_address
  return [
    [address?.address_1, address?.address_2].filter(Boolean).join(" "),
    [address?.postal_code, address?.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ")
}

/**
 * MTOGO's one delivery: to the door, included in the price. Shown as the
 * selected option card while the step is open and as a quiet line once it is
 * done, both naming where the food goes, so the Customer can catch a wrong
 * address before paying. "Included" says it in words, not as "0,00 kr.".
 */
function DeliveryCard({
  cart,
  locale,
  isSelected = false,
  "data-testid": testId,
}: {
  cart: HttpTypes.StoreCart
  locale: Locale
  isSelected?: boolean
  "data-testid"?: string
}) {
  const text = CUSTOMER_CHECKOUT_TEXT[locale]
  const destination = destinationOf(cart)
  return (
    <div
      className={
        isSelected
          ? "flex items-start gap-3 rounded-card border-2 border-mtogo-action-primary bg-mtogo-surface-selected p-4"
          : "flex items-start gap-3"
      }
      data-testid={testId}
    >
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-mtogo-surface-card text-mtogo-text-link shadow-[inset_0_0_0_1px] shadow-mtogo-border-subtle">
        <TruckFast aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold text-mtogo-text-primary">
          {text.deliveryToDoor}
        </span>
        {destination && (
          <span className="break-words text-sm text-mtogo-text-secondary">
            {text.deliveryTo.replace("{address}", destination)}
          </span>
        )}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 self-center rounded-full bg-mtogo-status-success-surface px-2.5 py-1 text-sm font-semibold text-mtogo-status-success-text">
        {isSelected && <CheckCircleSolid aria-hidden="true" />}
        {text.included}
      </span>
    </div>
  )
}

export default function Shipping({
  cart,
  availableShippingMethods,
  locale,
}: ShippingProps) {
  const text = CUSTOMER_CHECKOUT_TEXT[locale]
  const router = useRouter()
  const pathname = usePathname()
  const isOpen = useCheckoutStep(cart) === "delivery"
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
          <StepEditButton
            step={text.delivery}
            locale={locale}
            onClick={() =>
              router.push(`${pathname}?step=delivery`, { scroll: false })
            }
            data-testid="edit-delivery-button"
          />
        )}
      </div>
      {isOpen ? (
        <div className="space-y-4">
          {option ? (
            <DeliveryCard
              cart={cart}
              locale={locale}
              isSelected
              data-testid="delivery-option-radio"
            />
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
        <DeliveryCard cart={cart} locale={locale} />
      ) : null}
      <Divider className="mt-8" />
    </section>
  )
}
