"use client"

import { Heading, Text, clx } from "@modules/common/components/ui"

import PaymentButton from "../payment-button"
import { useCheckoutStep } from "@lib/hooks/use-checkout-step"
import { HttpTypes } from "@medusajs/types"
import { CUSTOMER_CHECKOUT_TEXT, type Locale } from "@dtc/i18n"

const Review = ({
  cart,
  locale,
}: {
  cart: HttpTypes.StoreCart
  locale: Locale
}) => {
  const text = CUSTOMER_CHECKOUT_TEXT[locale]
  const isOpen = useCheckoutStep(cart) === "review"

  const paidByGiftcard = !!(
    (cart as unknown as Record<string, unknown>)?.gift_cards &&
    ((cart as unknown as Record<string, unknown>)?.gift_cards as unknown[])
      ?.length > 0 &&
    cart?.total === 0
  )

  const previousStepsCompleted =
    cart.shipping_address &&
    (cart.shipping_methods?.length ?? 0) > 0 &&
    (cart.payment_collection || paidByGiftcard)

  return (
    <div className="bg-white">
      <div className="flex flex-row items-center justify-between mb-6">
        <Heading
          level="h2"
          className={clx(
            "flex flex-row text-3xl-regular gap-x-2 items-baseline",
            {
              "opacity-50 pointer-events-none select-none": !isOpen,
            },
          )}
        >
          {text.review}
        </Heading>
      </div>
      {isOpen && previousStepsCompleted && (
        <>
          <div className="flex items-start gap-x-1 w-full mb-6 motion-safe:animate-fade-up">
            <div className="w-full">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                {text.reviewNote}
              </Text>
            </div>
          </div>
          <PaymentButton
            cart={cart}
            locale={locale}
            data-testid="submit-order-button"
          />
          {/* Reassurance by the decision, kept to what is true (#252). */}
          <p
            className="mt-3 text-sm text-mtogo-text-secondary"
            data-testid="pay-amount-note"
          >
            {text.payAmountNote}
          </p>
        </>
      )}
    </div>
  )
}

export default Review
