"use client"

import { isAdyen, isManual, isStripeLike } from "@lib/constants"
import { placeOrder } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"
import { Button, clx } from "@modules/common/components/ui"
import Spinner from "@modules/common/icons/spinner"
import { LockClosedSolid } from "@medusajs/icons"
import { useElements, useStripe } from "@stripe/react-stripe-js"
import { unstable_rethrow, useParams } from "next/navigation"
import React, { useState } from "react"
import ErrorMessage from "../error-message"
import { getPaymentErrorMessage } from "@lib/util/payment-error"
import AdyenPaymentButton from "./adyen-payment-button"
import { toast } from "@medusajs/ui"
import {
  CUSTOMER_CHECKOUT_TEXT,
  cartRefusalToast,
  formatDkk,
  type Locale,
} from "@dtc/i18n"

/**
 * Places the Order, which goes to its confirmation when it succeeds. A
 * refusal shows a toast with what to do next and returns the same words for
 * the inline message by the pay button, which screen readers read (#252).
 * `placeOrder` returns refusals, so a production build never shows a React
 * error number; only the redirect to the confirmation is thrown on.
 */
async function placeOrderOrExplain(locale: Locale): Promise<string | null> {
  let refusal: Awaited<ReturnType<typeof placeOrder>>
  try {
    refusal = await placeOrder()
  } catch (error) {
    unstable_rethrow(error)
    refusal = { error: { code: "order_not_placed" } }
  }
  if (!refusal) return null
  const { title, description } = cartRefusalToast(
    refusal.error.code,
    locale,
    refusal.error.detail,
  )
  toast.error(title, { id: "order-refused", description })
  return `${title}. ${description}`
}

type PaymentButtonProps = {
  cart: HttpTypes.StoreCart
  "data-testid": string
  locale: Locale
}

const PaymentButton: React.FC<PaymentButtonProps> = ({
  cart,
  locale,
  "data-testid": dataTestId,
}) => {
  const notReady =
    !cart ||
    !cart.shipping_address ||
    !cart.billing_address ||
    !cart.email ||
    (cart.shipping_methods?.length ?? 0) < 1

  const paymentSession = cart.payment_collection?.payment_sessions?.[0]

  switch (true) {
    case isStripeLike(paymentSession?.provider_id):
      return (
        <StripePaymentButton
          notReady={notReady}
          cart={cart}
          locale={locale}
          data-testid={dataTestId}
        />
      )
    case isAdyen(paymentSession?.provider_id):
      return (
        <AdyenPaymentButton
          notReady={notReady}
          cart={cart}
          data-testid={dataTestId}
        />
      )
    case isManual(paymentSession?.provider_id):
      return (
        <ManualTestPaymentButton
          notReady={notReady}
          locale={locale}
          total={formatDkk(Number(cart.total ?? 0), locale)}
          data-testid={dataTestId}
        />
      )
    default:
      return (
        <Button disabled>{CUSTOMER_CHECKOUT_TEXT[locale].selectPayment}</Button>
      )
  }
}

const StripePaymentButton = ({
  cart,
  notReady,
  locale,
  "data-testid": dataTestId,
}: {
  cart: HttpTypes.StoreCart
  notReady: boolean
  locale: Locale
  "data-testid"?: string
}) => {
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const onPaymentCompleted = async () => {
    setErrorMessage(await placeOrderOrExplain(locale))
    setSubmitting(false)
  }

  const stripe = useStripe()
  const elements = useElements()
  const { countryCode } = useParams()

  const disabled = !stripe || !elements ? true : false

  const handlePayment = async () => {
    if (!stripe || !elements || !cart) {
      return
    }

    setSubmitting(true)

    await stripe
      .confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/api/payment-return?cart_id=${cart.id}&country_code=${countryCode}`,
          payment_method_data: {
            billing_details: {
              name:
                cart.billing_address?.first_name +
                " " +
                cart.billing_address?.last_name,
              address: {
                city: cart.billing_address?.city ?? undefined,
                country: cart.billing_address?.country_code ?? undefined,
                line1: cart.billing_address?.address_1 ?? undefined,
                line2: cart.billing_address?.address_2 ?? undefined,
                postal_code: cart.billing_address?.postal_code ?? undefined,
                state: cart.billing_address?.province ?? undefined,
              },
              email: cart.email,
              phone: cart.billing_address?.phone ?? undefined,
            },
          },
        },
        // Only leave the site when the selected method actually requires it, so
        // card payments still complete inline.
        redirect: "if_required",
      })
      .then(({ error, paymentIntent }) => {
        if (error) {
          const pi = error.payment_intent

          if (
            (pi && pi.status === "requires_capture") ||
            (pi && pi.status === "succeeded")
          ) {
            void onPaymentCompleted()
            return
          }

          setErrorMessage(getPaymentErrorMessage(error))
          setSubmitting(false)
          return
        }

        if (
          paymentIntent.status === "requires_capture" ||
          paymentIntent.status === "succeeded"
        ) {
          void onPaymentCompleted()
          return
        }

        setSubmitting(false)
      })
      .catch((error) => {
        setErrorMessage(getPaymentErrorMessage(error))
        setSubmitting(false)
      })
  }

  return (
    <>
      <Button
        disabled={disabled || notReady}
        onClick={handlePayment}
        size="large"
        isLoading={submitting}
        data-testid={dataTestId}
      >
        Place order
      </Button>
      <ErrorMessage
        error={errorMessage}
        data-testid="stripe-payment-error-message"
      />
    </>
  )
}

/**
 * One of the pay button's two labels. Both share one grid cell, so the
 * button keeps its width while they cross-fade; a slight blur hides the
 * hand-over. Transitions rather than keyframes, so a fast answer that swaps
 * back mid-fade reverses smoothly. Reduced motion keeps only the fade.
 */
const PayLabel = ({
  isShown,
  children,
}: {
  isShown: boolean
  children: React.ReactNode
}) => (
  <span
    aria-hidden={!isShown}
    className={clx(
      "col-start-1 row-start-1 inline-flex items-center justify-center gap-2 transition-[opacity,filter,transform] duration-200 ease-out-strong",
      isShown
        ? "opacity-100"
        : "opacity-0 motion-safe:scale-[0.96] motion-safe:blur-[2px]",
    )}
  >
    {children}
  </span>
)

const ManualTestPaymentButton = ({
  notReady,
  locale,
  total,
}: {
  notReady: boolean
  locale: Locale
  /** The amount being paid, shown on the button as checkouts usually do. */
  total: string
}) => {
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const onPaymentCompleted = async () => {
    setErrorMessage(await placeOrderOrExplain(locale))
    setSubmitting(false)
  }

  const handlePayment = () => {
    if (submitting) return
    setErrorMessage(null)
    setSubmitting(true)

    void onPaymentCompleted()
  }

  return (
    <>
      {/* Busy is not disabled: the button keeps its colour while the label
          says the payment is going through, and a second press is ignored. */}
      <Button
        disabled={notReady}
        aria-disabled={submitting || undefined}
        aria-busy={submitting || undefined}
        className="w-full sm:w-auto"
        onClick={handlePayment}
        size="large"
        data-testid="submit-order-button"
      >
        <span className="grid">
          <PayLabel isShown={!submitting}>
            <LockClosedSolid aria-hidden="true" />
            {CUSTOMER_CHECKOUT_TEXT[locale].placeOrder}
            <span className="font-normal tabular-nums opacity-90">{total}</span>
          </PayLabel>
          <PayLabel isShown={submitting}>
            <Spinner aria-hidden="true" />
            {CUSTOMER_CHECKOUT_TEXT[locale].placingOrder}
          </PayLabel>
        </span>
      </Button>
      <ErrorMessage
        error={errorMessage}
        data-testid="manual-payment-error-message"
      />
    </>
  )
}

export default PaymentButton
