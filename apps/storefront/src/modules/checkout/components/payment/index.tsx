"use client"
import { RadioGroup } from "@headlessui/react"
import { getPaymentInfo, isManual, isStripeLike } from "@lib/constants"
import { initiatePaymentSession } from "@lib/data/cart"
import { CheckCircleSolid, CreditCard } from "@medusajs/icons"
import ErrorMessage from "@modules/checkout/components/error-message"
import PaymentContainer, {
  StripePaymentContainer,
} from "@modules/checkout/components/payment-container"
import Divider from "@modules/common/components/divider"
import {
  Button,
  Heading,
  Input,
  Text,
  clx,
} from "@modules/common/components/ui"
import { HttpTypes } from "@medusajs/types"
import { showCheckoutStep } from "@lib/util/show-checkout-step"
import { useEffect, useState } from "react"
import {
  CUSTOMER_CHECKOUT_TEXT,
  cartRefusalToast,
  type CartRefusalCode,
  type Locale,
} from "@dtc/i18n"
import { toast } from "@medusajs/ui"
import { useCheckoutStep } from "@lib/hooks/use-checkout-step"
import StepEditButton from "../step-edit-button"

const Payment = ({
  cart,
  availablePaymentMethods,
  locale,
}: {
  cart: HttpTypes.StoreCart
  availablePaymentMethods: { id: string }[]
  locale: Locale
}) => {
  const text = CUSTOMER_CHECKOUT_TEXT[locale]
  const activeSession = cart.payment_collection?.payment_sessions?.find(
    (paymentSession) => paymentSession.status === "pending",
  )

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentComplete, setPaymentComplete] = useState(false)
  const [testCard, setTestCard] = useState("")
  const [testExpiry, setTestExpiry] = useState("")
  const [testCode, setTestCode] = useState("")
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(
    activeSession?.provider_id ??
      (availablePaymentMethods.length === 1
        ? availablePaymentMethods[0].id
        : ""),
  )

  const isOpen = useCheckoutStep(cart) === "payment"

  /** A toast with what to do next, and the same words inline (#252). */
  const explainRefusal = (code: CartRefusalCode) => {
    const { title, description } = cartRefusalToast(code, locale)
    toast.error(title, { id: "payment-refused", description })
    setError(`${title}. ${description}`)
  }

  const setPaymentMethod = async (method: string) => {
    setError(null)
    setSelectedPaymentMethod(method)
    if (isStripeLike(method)) {
      const refused = await initiatePaymentSession(cart, {
        provider_id: method,
      })
      if (refused) explainRefusal(refused.error.code)
    }
  }

  const paidByGiftcard = !!(
    (cart as unknown as Record<string, unknown>)?.gift_cards &&
    ((cart as unknown as Record<string, unknown>)?.gift_cards as unknown[])
      ?.length > 0 &&
    cart?.total === 0
  )

  const paymentReady =
    (activeSession && (cart?.shipping_methods?.length ?? 0) !== 0) ||
    paidByGiftcard

  const handleEdit = () => {
    showCheckoutStep("payment")
  }

  const handleSubmit = async () => {
    if (isManual(selectedPaymentMethod)) {
      const match = /^(0[1-9]|1[0-2])\s*\/\s*(\d{2})$/.exec(testExpiry)
      const now = new Date()
      const expiryValid =
        match &&
        (2000 + Number(match[2]) > now.getFullYear() ||
          (2000 + Number(match[2]) === now.getFullYear() &&
            Number(match[1]) >= now.getMonth() + 1))
      const invalidField =
        testCard.replace(/\s/g, "") !== "4242424242424242"
          ? "number"
          : !expiryValid
            ? "expiry"
            : !/^\d{3}$/.test(testCode)
              ? "code"
              : null
      if (invalidField) {
        setError(
          invalidField === "number"
            ? text.testCardNumberError
            : invalidField === "expiry"
              ? text.testExpiryError
              : text.testCodeError,
        )
        document.getElementById(`test-card-${invalidField}`)?.focus()
        return
      }
      setError(null)
    }
    setIsLoading(true)
    try {
      const shouldInputPaymentDetails =
        isStripeLike(selectedPaymentMethod) && !activeSession

      const checkActiveSession =
        activeSession?.provider_id === selectedPaymentMethod

      if (!checkActiveSession) {
        const refused = await initiatePaymentSession(cart, {
          provider_id: selectedPaymentMethod,
        })
        if (refused) {
          explainRefusal(refused.error.code)
          return
        }
      }

      if (!shouldInputPaymentDetails) {
        setTestCard("")
        setTestExpiry("")
        setTestCode("")
        return showCheckoutStep("review")
      }
    } catch {
      setError(text.orderNotPlaced)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    setError(null)
  }, [isOpen])

  return (
    <div className="bg-white">
      <div className="flex flex-row items-center justify-between mb-6">
        <Heading
          level="h2"
          className={clx(
            "flex flex-row text-3xl-regular gap-x-2 items-baseline",
            {
              "opacity-50 pointer-events-none select-none":
                !isOpen && !paymentReady,
            },
          )}
        >
          {text.payment}
          {!isOpen && paymentReady && <CheckCircleSolid />}
        </Heading>
        {!isOpen && paymentReady && (
          <StepEditButton
            step={text.payment}
            locale={locale}
            onClick={handleEdit}
            data-testid="edit-payment-button"
          />
        )}
      </div>
      <div>
        <div
          className={isOpen ? "block motion-safe:animate-fade-up" : "hidden"}
        >
          {!paidByGiftcard && !!availablePaymentMethods?.length && (
            <>
              {!(
                availablePaymentMethods.length === 1 &&
                isManual(selectedPaymentMethod)
              ) && (
                <RadioGroup
                  value={selectedPaymentMethod}
                  onChange={(value: string) => setPaymentMethod(value)}
                >
                  {availablePaymentMethods.map((paymentMethod) => (
                    <div key={paymentMethod.id}>
                      {isStripeLike(paymentMethod.id) ? (
                        <StripePaymentContainer
                          paymentProviderId={paymentMethod.id}
                          selectedPaymentOptionId={selectedPaymentMethod}
                          setError={setError}
                          setPaymentComplete={setPaymentComplete}
                        />
                      ) : (
                        <PaymentContainer
                          paymentProviderId={paymentMethod.id}
                          selectedPaymentOptionId={selectedPaymentMethod}
                          label={
                            isManual(paymentMethod.id)
                              ? text.testPaymentSummary
                              : text.paymentMethod
                          }
                        />
                      )}
                    </div>
                  ))}
                </RadioGroup>
              )}
              {isManual(selectedPaymentMethod) && (
                <div className="my-4 rounded-xl border border-mtogo-border-control bg-mtogo-surface-card p-5 sm:p-6">
                  <div className="mb-6 flex flex-col items-start gap-3">
                    <div className="flex items-center gap-2 font-semibold text-mtogo-text-primary">
                      <CreditCard aria-hidden="true" />
                      <span>{text.testPaymentSummary}</span>
                    </div>
                    <Text
                      className="text-mtogo-text-secondary"
                      id="test-payment-help"
                    >
                      {text.testPaymentNotice}
                    </Text>
                    <Button
                      type="button"
                      variant="secondary"
                      size="small"
                      onClick={() => {
                        setTestCard("4242 4242 4242 4242")
                        setTestExpiry(
                          `12/${String(new Date().getFullYear() + 1).slice(-2)}`,
                        )
                        setTestCode("123")
                        setError(null)
                      }}
                    >
                      {text.fillTestCard}
                    </Button>
                  </div>
                  <div className="grid min-w-0 gap-5">
                    <label
                      className="grid gap-2 text-sm font-medium"
                      htmlFor="test-card-number"
                    >
                      {text.testCardNumber}
                      <Input
                        id="test-card-number"
                        className="h-12 font-normal tabular-nums"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={19}
                        value={testCard}
                        placeholder="4242 4242 4242 4242"
                        aria-describedby="test-payment-help payment-method-error-message"
                        onChange={(event) => {
                          setTestCard(
                            event.target.value
                              .replace(/\D/g, "")
                              .slice(0, 16)
                              .replace(/(.{4})/g, "$1 ")
                              .trim(),
                          )
                          setError(null)
                        }}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <label
                        className="grid min-w-0 gap-2 text-sm font-medium"
                        htmlFor="test-card-expiry"
                      >
                        {text.testExpiry}
                        <Input
                          id="test-card-expiry"
                          className="h-12 font-normal tabular-nums"
                          autoComplete="off"
                          inputMode="numeric"
                          maxLength={5}
                          placeholder="MM/YY"
                          value={testExpiry}
                          aria-describedby="payment-method-error-message"
                          onChange={(event) => {
                            const digits = event.target.value
                              .replace(/\D/g, "")
                              .slice(0, 4)
                            setTestExpiry(
                              digits.length > 2
                                ? `${digits.slice(0, 2)}/${digits.slice(2)}`
                                : digits,
                            )
                            setError(null)
                          }}
                        />
                      </label>
                      <label
                        className="grid min-w-0 gap-2 text-sm font-medium"
                        htmlFor="test-card-code"
                      >
                        {text.testSecurityCode}
                        <Input
                          id="test-card-code"
                          className="h-12 font-normal tabular-nums"
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={3}
                          placeholder="123"
                          value={testCode}
                          aria-describedby="payment-method-error-message"
                          onChange={(event) => {
                            setTestCode(
                              event.target.value.replace(/\D/g, "").slice(0, 3),
                            )
                            setError(null)
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {paidByGiftcard && (
            <div className="flex flex-col w-1/3">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                {text.paymentMethod}
              </Text>
              <Text
                className="txt-medium text-ui-fg-subtle"
                data-testid="payment-method-summary"
              >
                Gift card
              </Text>
            </div>
          )}

          <ErrorMessage
            error={error}
            data-testid="payment-method-error-message"
          />

          <Button
            size="large"
            className="mt-6 w-full sm:w-auto"
            onClick={handleSubmit}
            isLoading={isLoading}
            disabled={
              (isStripeLike(selectedPaymentMethod) && !paymentComplete) ||
              (!selectedPaymentMethod && !paidByGiftcard)
            }
            data-testid="submit-payment-button"
          >
            {!activeSession && isStripeLike(selectedPaymentMethod)
              ? text.enterPaymentDetails
              : text.continueToReview}
          </Button>
        </div>

        <div className={isOpen ? "hidden" : "block"}>
          {cart && paymentReady && activeSession ? (
            <div className="flex items-start gap-4 rounded-lg border border-mtogo-border-subtle bg-mtogo-surface-page p-4 sm:p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-mtogo-surface-card text-mtogo-text-link">
                <CreditCard aria-hidden="true" />
              </span>
              <div className="min-w-0 space-y-1">
                <Text
                  className="font-semibold text-mtogo-text-primary"
                  data-testid="payment-method-summary"
                >
                  {isManual(activeSession.provider_id)
                    ? text.paymentDetails
                    : getPaymentInfo(activeSession.provider_id)?.title ||
                      activeSession.provider_id}
                </Text>
                <Text
                  className="text-sm leading-6 text-mtogo-text-secondary"
                  data-testid="payment-details-summary"
                >
                  {isManual(activeSession.provider_id)
                    ? text.testPaymentSummary
                    : text.anotherStepFollows}
                </Text>
              </div>
            </div>
          ) : paidByGiftcard ? (
            <div className="flex flex-col w-1/3">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                Payment method
              </Text>
              <Text
                className="txt-medium text-ui-fg-subtle"
                data-testid="payment-method-summary"
              >
                Gift card
              </Text>
            </div>
          ) : null}
        </div>
      </div>
      <Divider className="mt-8" />
    </div>
  )
}

export default Payment
