"use client"
import { setAddresses } from "@lib/data/cart"
import useToggleState from "@lib/hooks/use-toggle-state"
import compareAddresses from "@lib/util/compare-addresses"
import { CheckCircleSolid } from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import {
  CUSTOMER_ADDRESS_TEXT,
  customerAddressErrorMessage,
  validateCustomerAddress,
  CUSTOMER_CHECKOUT_TEXT,
  LANGUAGE_NAMES,
  customerCheckoutErrorMessage,
  reviewedCheckoutLanguage,
  type Locale,
} from "@dtc/i18n"
import Divider from "@modules/common/components/divider"
import { Heading, Text } from "@modules/common/components/ui"
import Spinner from "@modules/common/icons/spinner"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { toast } from "@medusajs/ui"
import { useActionState, useState } from "react"
import BillingAddress from "../billing_address"
import ErrorMessage from "../error-message"
import ShippingAddress from "../shipping-address"
import { SubmitButton } from "../submit-button"

const Addresses = ({
  cart,
  customer,
  locale,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
  locale: Locale
}) => {
  const searchParams = useSearchParams()
  const text = CUSTOMER_CHECKOUT_TEXT[locale]
  const reviewedLanguage = reviewedCheckoutLanguage(cart?.metadata)
  const router = useRouter()
  const pathname = usePathname()

  const isOpen = searchParams.get("step") === "address"

  const { state: sameAsBilling, toggle: toggleSameAsBilling } = useToggleState(
    cart?.shipping_address && cart?.billing_address
      ? compareAddresses(cart?.shipping_address, cart?.billing_address)
      : true,
  )

  const handleEdit = () => {
    router.push(pathname + "?step=address")
  }

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const explainError = (code: string) =>
    code === "checkout_delivery_failed"
      ? text.deliverySelectionFailed
      : code.startsWith("customer_address_")
        ? customerAddressErrorMessage(code, CUSTOMER_ADDRESS_TEXT[locale])
        : customerCheckoutErrorMessage(code, locale)
  const [message, formAction] = useActionState(
    async (previous: string | null, data: FormData) => {
      const result = await setAddresses(previous, data)
      if (result)
        toast.error(explainError(result), { id: "checkout-address-error" })
      return result
    },
    null,
  )

  return (
    <div className="bg-white">
      <div className="flex flex-row items-center justify-between mb-6">
        <Heading
          level="h2"
          className="flex flex-row text-3xl-regular gap-x-2 items-baseline"
        >
          {text.shippingAddress}
          {!isOpen && <CheckCircleSolid />}
        </Heading>
        {!isOpen && cart?.shipping_address && (
          <Text>
            <button
              onClick={handleEdit}
              className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
              data-testid="edit-address-button"
            >
              {text.edit}
            </button>
          </Text>
        )}
      </div>
      {isOpen ? (
        <form
          action={formAction}
          onInput={(event) => {
            const target = event.target
            if (
              target instanceof HTMLInputElement ||
              target instanceof HTMLSelectElement
            )
              setFieldErrors((previous) => {
                const next = { ...previous }
                delete next[target.name]
                return next
              })
          }}
          noValidate
          onSubmit={(event) => {
            const form = event.currentTarget
            const errors: Record<string, string> = {}
            for (const element of Array.from(form.elements)) {
              if (
                (element instanceof HTMLInputElement ||
                  element instanceof HTMLSelectElement) &&
                !element.validity.valid
              ) {
                errors[element.name] = element.validity.typeMismatch
                  ? text.emailInvalid
                  : text.requiredField
              }
            }
            const data = new FormData(form)
            const field = (name: string) =>
              String(data.get(`shipping_address.${name}`) ?? "").trim()
            const code = validateCustomerAddress({
              first_name: field("first_name"),
              last_name: field("last_name"),
              address_1: field("address_1"),
              postal_code: field("postal_code"),
              city: field("city"),
              country_code: field("country_code"),
              phone: field("phone"),
            })
            if (code) {
              const key = code.includes("name")
                ? field("first_name")
                  ? "last_name"
                  : "first_name"
                : code.includes("street")
                  ? "address_1"
                  : code.includes("postal")
                    ? "postal_code"
                    : code.includes("city")
                      ? "city"
                      : code.includes("country")
                        ? "country_code"
                        : "phone"
              errors[`shipping_address.${key}`] = customerAddressErrorMessage(
                code,
                CUSTOMER_ADDRESS_TEXT[locale],
              )
            }
            setFieldErrors(errors)
            if (!Object.keys(errors).length)
              toast.dismiss("checkout-address-error")
            if (Object.keys(errors).length) {
              event.preventDefault()
              toast.error(Object.values(errors)[0], {
                id: "checkout-address-error",
              })
              const target = form.elements.namedItem(Object.keys(errors)[0])
              if (target instanceof HTMLElement) target.focus()
            }
          }}
        >
          <div className="pb-8">
            <ShippingAddress
              errors={fieldErrors}
              customer={customer}
              checked={sameAsBilling}
              onChange={toggleSameAsBilling}
              cart={cart}
              locale={locale}
            />

            {!sameAsBilling && (
              <div>
                <Heading
                  level="h2"
                  className="text-3xl-regular gap-x-4 pb-6 pt-8"
                >
                  {text.billingAddress}
                </Heading>

                <BillingAddress
                  cart={cart}
                  locale={locale}
                  errors={fieldErrors}
                />
              </div>
            )}
            <SubmitButton className="mt-6" data-testid="submit-address-button">
              {text.continueToPayment}
            </SubmitButton>
            <ErrorMessage
              error={message ? explainError(message) : null}
              data-testid="address-error-message"
            />
          </div>
        </form>
      ) : (
        <div>
          <div className="text-small-regular">
            {cart && cart.shipping_address ? (
              <div className="flex items-start gap-x-8">
                <div className="grid w-full min-w-0 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  <div
                    className="flex min-w-0 flex-col break-words [overflow-wrap:anywhere]"
                    data-testid="shipping-address-summary"
                  >
                    <Text className="txt-medium-plus text-ui-fg-base mb-1">
                      {text.shippingAddress}
                    </Text>
                    <Text className="txt-medium text-ui-fg-subtle">
                      {cart.shipping_address.first_name}{" "}
                      {cart.shipping_address.last_name}
                    </Text>
                    <Text className="txt-medium text-ui-fg-subtle">
                      {cart.shipping_address.address_1}{" "}
                      {cart.shipping_address.address_2}
                    </Text>
                    <Text className="txt-medium text-ui-fg-subtle">
                      {cart.shipping_address.postal_code},{" "}
                      {cart.shipping_address.city}
                    </Text>
                    <Text className="txt-medium text-ui-fg-subtle">
                      {cart.shipping_address.country_code?.toUpperCase()}
                    </Text>
                  </div>

                  <div
                    className="flex min-w-0 flex-col break-words [overflow-wrap:anywhere] "
                    data-testid="shipping-contact-summary"
                  >
                    <Text className="txt-medium-plus text-ui-fg-base mb-1">
                      {text.contact}
                    </Text>
                    <Text className="txt-medium text-ui-fg-subtle">
                      {cart.shipping_address.phone}
                    </Text>
                    <Text className="txt-medium text-ui-fg-subtle">
                      {cart.shipping_address.first_name}{" "}
                      {cart.shipping_address.last_name}
                    </Text>
                    <Text className="txt-medium text-ui-fg-subtle">
                      {cart.email}
                    </Text>
                    {reviewedLanguage && (
                      <Text className="txt-medium text-ui-fg-subtle">
                        {text.orderLanguage}: {LANGUAGE_NAMES[reviewedLanguage]}
                      </Text>
                    )}
                  </div>

                  <div
                    className="flex min-w-0 flex-col break-words [overflow-wrap:anywhere]"
                    data-testid="billing-address-summary"
                  >
                    <Text className="txt-medium-plus text-ui-fg-base mb-1">
                      {text.billingAddress}
                    </Text>

                    {sameAsBilling ? (
                      <Text className="txt-medium text-ui-fg-subtle">
                        {text.billingSameAsDelivery}
                      </Text>
                    ) : (
                      <>
                        <Text className="txt-medium text-ui-fg-subtle">
                          {cart.billing_address?.first_name}{" "}
                          {cart.billing_address?.last_name}
                        </Text>
                        <Text className="txt-medium text-ui-fg-subtle">
                          {cart.billing_address?.address_1}{" "}
                          {cart.billing_address?.address_2}
                        </Text>
                        <Text className="txt-medium text-ui-fg-subtle">
                          {cart.billing_address?.postal_code},{" "}
                          {cart.billing_address?.city}
                        </Text>
                        <Text className="txt-medium text-ui-fg-subtle">
                          {cart.billing_address?.country_code?.toUpperCase()}
                        </Text>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <Spinner />
              </div>
            )}
          </div>
        </div>
      )}
      <Divider className="mt-8" />
    </div>
  )
}

export default Addresses
