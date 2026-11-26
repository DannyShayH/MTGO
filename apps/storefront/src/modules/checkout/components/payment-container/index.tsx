import { Radio as RadioGroupOption } from "@headlessui/react"
import { Text, clx } from "@modules/common/components/ui"
import React, { useContext } from "react"

import Radio from "@modules/common/components/radio"

import { getPaymentInfo } from "@lib/constants"
import { getPaymentErrorMessage } from "@lib/util/payment-error"
import SkeletonCardDetails from "@modules/skeletons/components/skeleton-card-details"
import { PaymentElement } from "@stripe/react-stripe-js"
import { StripeContext } from "../payment-wrapper/stripe-wrapper"

type PaymentContainerProps = {
  paymentProviderId: string
  selectedPaymentOptionId: string | null
  disabled?: boolean
  children?: React.ReactNode
  label?: string
}

const PaymentContainer: React.FC<PaymentContainerProps> = ({
  paymentProviderId,
  selectedPaymentOptionId,
  disabled = false,
  children,
  label,
}) => {
  const paymentInfo = getPaymentInfo(paymentProviderId)

  return (
    <RadioGroupOption
      key={paymentProviderId}
      value={paymentProviderId}
      disabled={disabled}
      className={clx(
        "flex flex-col gap-y-2 text-small-regular cursor-pointer py-4 border rounded-rounded px-8 mb-2 hover:shadow-borders-interactive-with-active",
        {
          "border-ui-border-interactive":
            selectedPaymentOptionId === paymentProviderId,
        },
      )}
    >
      <div className="flex items-center justify-between ">
        <div className="flex items-center gap-x-4">
          <Radio checked={selectedPaymentOptionId === paymentProviderId} />
          <Text className="text-base-regular">
            {label || paymentInfo?.title || paymentProviderId}
          </Text>
        </div>
        <span className="justify-self-end text-ui-fg-base">
          {paymentInfo?.icon}
        </span>
      </div>
      {children}
    </RadioGroupOption>
  )
}

export default PaymentContainer

export const StripePaymentContainer = ({
  paymentProviderId,
  selectedPaymentOptionId,
  disabled = false,
  setError,
  setPaymentComplete,
}: Omit<PaymentContainerProps, "children"> & {
  setError: (error: string | null) => void
  setPaymentComplete: (complete: boolean) => void
}) => {
  const stripeReady = useContext(StripeContext)

  return (
    <PaymentContainer
      paymentProviderId={paymentProviderId}
      selectedPaymentOptionId={selectedPaymentOptionId}
      disabled={disabled}
    >
      {selectedPaymentOptionId === paymentProviderId &&
        (stripeReady ? (
          <div className="my-4">
            <Text className="txt-medium-plus text-ui-fg-base mb-1">
              Enter your payment details:
            </Text>
            <PaymentElement
              options={{ layout: "accordion" }}
              onChange={(e) => {
                setError(null)
                setPaymentComplete(e.complete)
              }}
              // Without a handler Stripe.js reports a failed mount as an
              // unhandled "payment Element loaderror" and the option renders
              // blank with no explanation. Surface it in the checkout's own
              // error slot instead.
              onLoadError={(e) => {
                setPaymentComplete(false)
                setError(
                  getPaymentErrorMessage(e.error) ??
                    "Could not load the payment methods.",
                )
              }}
            />
          </div>
        ) : (
          <SkeletonCardDetails />
        ))}
    </PaymentContainer>
  )
}
