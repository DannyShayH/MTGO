"use client"

import { toast } from "@medusajs/ui"
import { accountText } from "@lib/util/account-text"

import { Plus } from "@medusajs/icons"
import { Button, Heading } from "@modules/common/components/ui"
import { useActionState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  CUSTOMER_ADDRESS_TEXT,
  customerAddressErrorMessage,
  type Locale,
} from "@dtc/i18n"

import { addCustomerAddress } from "@lib/data/customer"
import useToggleState from "@lib/hooks/use-toggle-state"
import { HttpTypes } from "@medusajs/types"
import CountrySelect from "@modules/checkout/components/country-select"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"
import Modal from "@modules/common/components/modal"

const AddAddress = ({
  region,
  locale,
}: {
  region: HttpTypes.StoreRegion
  addresses: HttpTypes.StoreCustomerAddress[]
  locale: Locale
}) => {
  const text = CUSTOMER_ADDRESS_TEXT[locale]
  const { state, open, close: closeModal } = useToggleState(false)
  const router = useRouter()

  const [formState, formAction] = useActionState(addCustomerAddress, {
    success: false,
    error: null,
  } as { success: boolean; error: string | null })

  const close = () => {
    closeModal()
  }

  useEffect(() => {
    if (formState.success) {
      closeModal()
      toast.success(accountText[locale].addressSaved)
      router.refresh()
    } else if (formState.error)
      toast.error(customerAddressErrorMessage(formState.error, text))
  }, [closeModal, formState, router, locale, text])

  return (
    <>
      <button
        type="button"
        className="border border-ui-border-base rounded-rounded p-5 min-h-[220px] h-full w-full flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2"
        onClick={open}
        data-testid="add-address-button"
      >
        <span className="text-base-semi">{text.newAddress}</span>
        <Plus />
      </button>

      <Modal isOpen={state} close={close} data-testid="add-address-modal">
        <Modal.Title>
          <Heading className="mb-2">{text.addAddress}</Heading>
        </Modal.Title>
        <form action={formAction}>
          <Modal.Body>
            <div className="flex flex-col gap-y-2">
              <div className="grid grid-cols-2 gap-x-2">
                <Input
                  label={text.firstName}
                  name="first_name"
                  required
                  autoComplete="given-name"
                  data-testid="first-name-input"
                />
                <Input
                  label={text.lastName}
                  name="last_name"
                  required
                  autoComplete="family-name"
                  data-testid="last-name-input"
                />
              </div>
              <Input
                label={text.company}
                name="company"
                autoComplete="organization"
                data-testid="company-input"
              />
              <Input
                label={text.street}
                name="address_1"
                required
                autoComplete="address-line1"
                data-testid="address-1-input"
              />
              <Input
                label={text.apartment}
                name="address_2"
                autoComplete="address-line2"
                data-testid="address-2-input"
              />
              <div className="grid grid-cols-[144px_1fr] gap-x-2">
                <Input
                  label={text.postalCode}
                  name="postal_code"
                  required
                  autoComplete="postal-code"
                  data-testid="postal-code-input"
                />
                <Input
                  label={text.city}
                  name="city"
                  required
                  autoComplete="locality"
                  data-testid="city-input"
                />
              </div>
              <Input
                label={text.province}
                name="province"
                autoComplete="address-level1"
                data-testid="state-input"
              />
              <CountrySelect
                region={region}
                name="country_code"
                required
                autoComplete="country"
                data-testid="country-select"
              />
              <Input
                label={text.phone}
                name="phone"
                type="tel"
                autoComplete="tel"
                required
                data-testid="phone-input"
              />
              <label className="flex items-center gap-3 py-2 text-small-regular">
                <input
                  type="checkbox"
                  name="is_default_shipping"
                  className="h-4 w-4"
                  data-testid="default-address-input"
                />
                {text.setDefault}
              </label>
            </div>
            {formState.error && (
              <div
                className="text-rose-500 text-small-regular py-2"
                data-testid="address-error"
              >
                {customerAddressErrorMessage(formState.error, text)}
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <div className="flex gap-3 mt-6">
              <Button
                type="reset"
                variant="secondary"
                onClick={close}
                className="h-10"
                data-testid="cancel-button"
              >
                {text.cancel}
              </Button>
              <SubmitButton data-testid="save-button">{text.save}</SubmitButton>
            </div>
          </Modal.Footer>
        </form>
      </Modal>
    </>
  )
}

export default AddAddress
