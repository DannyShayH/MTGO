import { HttpTypes } from "@medusajs/types"
import {
  CUSTOMER_ADDRESS_TEXT,
  CUSTOMER_CHECKOUT_TEXT,
  LANGUAGE_NAMES,
  reviewedCheckoutLanguage,
  type Locale,
} from "@dtc/i18n"
import { Container } from "@modules/common/components/ui"
import Checkbox from "@modules/common/components/checkbox"
import Input from "@modules/common/components/input"
import { mapKeys } from "lodash"
import React, { useEffect, useMemo, useState } from "react"
import AddressSelect from "../address-select"
import CountrySelect from "../country-select"

const ShippingAddress = ({
  customer,
  cart,
  checked,
  onChange,
  locale,
  errors = {},
}: {
  customer: HttpTypes.StoreCustomer | null
  cart: HttpTypes.StoreCart | null
  checked: boolean
  onChange: () => void
  locale: Locale
  errors?: Record<string, string>
}) => {
  const addressText = CUSTOMER_ADDRESS_TEXT[locale]
  const text = CUSTOMER_CHECKOUT_TEXT[locale]
  const reviewedLanguage = reviewedCheckoutLanguage(cart?.metadata)

  const [formData, setFormData] = useState<Record<string, string>>({
    "shipping_address.first_name":
      cart?.shipping_address?.first_name || customer?.first_name || "",
    "shipping_address.last_name":
      cart?.shipping_address?.last_name || customer?.last_name || "",
    "shipping_address.address_1": cart?.shipping_address?.address_1 || "",
    "shipping_address.address_2": cart?.shipping_address?.address_2 || "",
    "shipping_address.company": cart?.shipping_address?.company || "",
    "shipping_address.postal_code": cart?.shipping_address?.postal_code || "",
    "shipping_address.city": cart?.shipping_address?.city || "",
    "shipping_address.country_code": cart?.shipping_address?.country_code || "",
    "shipping_address.province": cart?.shipping_address?.province || "",
    "shipping_address.phone":
      cart?.shipping_address?.phone || customer?.phone || "",
    email: cart?.email || "",
    order_language: reviewedLanguage || locale,
  })

  const countriesInRegion = useMemo(
    () => cart?.region?.countries?.map((c) => c.iso_2),
    [cart?.region],
  )

  // check if customer has saved addresses that are in the current region
  const addressesInRegion = useMemo(
    () =>
      customer?.addresses.filter(
        (a) => a.country_code && countriesInRegion?.includes(a.country_code),
      ),
    [customer?.addresses, countriesInRegion],
  )

  const setFormAddress = (
    address?: HttpTypes.StoreCartAddress,
    email?: string,
  ) => {
    if (address) {
      setFormData((prevState: Record<string, string>) => ({
        ...prevState,
        "shipping_address.first_name": address?.first_name || "",
        "shipping_address.last_name": address?.last_name || "",
        "shipping_address.address_1": address?.address_1 || "",
        "shipping_address.address_2": address?.address_2 || "",
        "shipping_address.company": address?.company || "",
        "shipping_address.postal_code": address?.postal_code || "",
        "shipping_address.city": address?.city || "",
        "shipping_address.country_code": address?.country_code || "",
        "shipping_address.province": address?.province || "",
        "shipping_address.phone": address?.phone || "",
      }))
    }

    if (email) {
      setFormData((prevState: Record<string, string>) => ({
        ...prevState,
        email: email,
      }))
    }
  }

  useEffect(() => {
    // Ensure cart is not null and has a shipping_address before setting form data
    if (cart && cart.shipping_address) {
      setFormAddress(cart?.shipping_address, cart?.email)
    }

    if (cart && !cart.email && customer?.email) {
      setFormAddress(undefined, customer.email)
    }

    if (cart && !cart.shipping_address) {
      const defaultAddress = addressesInRegion?.find(
        (address) => address.is_default_shipping,
      )
      if (defaultAddress)
        setFormAddress(
          defaultAddress as HttpTypes.StoreCartAddress,
          customer?.email,
        )
    }
  }, [addressesInRegion, cart, customer?.email])

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLInputElement | HTMLSelectElement
    >,
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  return (
    <>
      {customer && (addressesInRegion?.length || 0) > 0 && (
        <Container className="mb-6 flex flex-col gap-y-4 p-5">
          <p className="text-small-regular">{text.savedAddresses}</p>
          <AddressSelect
            addresses={addressesInRegion ?? []}
            locale={locale}
            addressInput={
              mapKeys(formData, (_, key) =>
                key.replace("shipping_address.", ""),
              ) as unknown as HttpTypes.StoreCartAddress
            }
            onSelect={setFormAddress}
          />
        </Container>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label={addressText.firstName}
          name="shipping_address.first_name"
          error={errors["shipping_address.first_name"]}
          autoComplete="given-name"
          value={formData["shipping_address.first_name"]}
          onChange={handleChange}
          required
          data-testid="shipping-first-name-input"
        />
        <Input
          label={addressText.lastName}
          name="shipping_address.last_name"
          error={errors["shipping_address.last_name"]}
          autoComplete="family-name"
          value={formData["shipping_address.last_name"]}
          onChange={handleChange}
          required
          data-testid="shipping-last-name-input"
        />
        <Input
          label={addressText.street}
          name="shipping_address.address_1"
          error={errors["shipping_address.address_1"]}
          autoComplete="address-line1"
          value={formData["shipping_address.address_1"]}
          onChange={handleChange}
          required
          data-testid="shipping-address-input"
        />
        <Input
          label={text.apartment}
          name="shipping_address.address_2"
          error={errors["shipping_address.address_2"]}
          autoComplete="address-line2"
          value={formData["shipping_address.address_2"]}
          onChange={handleChange}
          data-testid="shipping-address-2-input"
        />
        <Input
          label={addressText.company}
          name="shipping_address.company"
          error={errors["shipping_address.company"]}
          value={formData["shipping_address.company"]}
          onChange={handleChange}
          autoComplete="organization"
          data-testid="shipping-company-input"
        />
        <Input
          label={addressText.postalCode}
          name="shipping_address.postal_code"
          error={errors["shipping_address.postal_code"]}
          autoComplete="postal-code"
          value={formData["shipping_address.postal_code"]}
          onChange={handleChange}
          required
          data-testid="shipping-postal-code-input"
        />
        <Input
          label={addressText.city}
          name="shipping_address.city"
          error={errors["shipping_address.city"]}
          autoComplete="address-level2"
          value={formData["shipping_address.city"]}
          onChange={handleChange}
          required
          data-testid="shipping-city-input"
        />
        <CountrySelect
          locale={locale}
          aria-label={text.country}
          name="shipping_address.country_code"
          aria-invalid={!!errors["shipping_address.country_code"]}
          autoComplete="country"
          region={cart?.region}
          value={formData["shipping_address.country_code"]}
          onChange={handleChange}
          required
          data-testid="shipping-country-select"
        />
        <Input
          label={addressText.province}
          name="shipping_address.province"
          error={errors["shipping_address.province"]}
          autoComplete="address-level1"
          value={formData["shipping_address.province"]}
          onChange={handleChange}
          data-testid="shipping-province-input"
        />
      </div>
      <div className="my-8">
        <Checkbox
          label={text.billingSameAsDelivery}
          name="same_as_billing"
          checked={checked}
          onChange={onChange}
          data-testid="billing-address-checkbox"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <Input
          label={text.email}
          name="email"
          error={errors["email"]}
          type="email"
          title={text.emailInvalid}
          autoComplete="email"
          value={formData.email}
          onChange={handleChange}
          required
          data-testid="shipping-email-input"
        />
        <Input
          label={addressText.phone}
          name="shipping_address.phone"
          required
          type="tel"
          error={errors["shipping_address.phone"]}
          autoComplete="tel"
          value={formData["shipping_address.phone"]}
          onChange={handleChange}
          data-testid="shipping-phone-input"
        />
      </div>
      <div className="mb-4">
        <label className="text-small-regular" htmlFor="order-language">
          {text.orderLanguage}
        </label>
        <select
          id="order-language"
          name="order_language"
          aria-invalid={!!errors["order_language"]}
          value={formData.order_language}
          onChange={handleChange}
          className="mt-1 w-full rounded-rounded border px-4 py-2"
          data-testid="order-language-select"
        >
          <option value="da">{LANGUAGE_NAMES.da}</option>
          <option value="en">{LANGUAGE_NAMES.en}</option>
        </select>
      </div>
    </>
  )
}

export default ShippingAddress
