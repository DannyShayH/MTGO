"use client"

import { toast } from "@medusajs/ui"
import { accountText } from "@lib/util/account-text"

import {
  deleteCustomerAddress,
  updateCustomerAddressDefault,
  updateCustomerAddress,
} from "@lib/data/customer"
import {
  CUSTOMER_ADDRESS_TEXT,
  customerAddressErrorMessage,
  type Locale,
} from "@dtc/i18n"
import useToggleState from "@lib/hooks/use-toggle-state"
import { PencilSquare as Edit, Trash } from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import { useRouter } from "next/navigation"
import CountrySelect from "@modules/checkout/components/country-select"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"
import Modal from "@modules/common/components/modal"
import { Button, Heading, Text, clx } from "@modules/common/components/ui"
import Spinner from "@modules/common/icons/spinner"
import React, { useActionState, useEffect, useState } from "react"

type EditAddressProps = {
  region: HttpTypes.StoreRegion
  address: HttpTypes.StoreCustomerAddress
  isActive?: boolean
  locale: Locale
}

const EditAddress: React.FC<EditAddressProps> = ({
  region,
  address,
  isActive = false,
  locale,
}) => {
  const text = CUSTOMER_ADDRESS_TEXT[locale]
  const [removing, setRemoving] = useState(false)
  const [defaultPending, setDefaultPending] = useState(false)
  const [actionError, setActionError] = useState(false)
  const { state, open, close: closeModal } = useToggleState(false)
  const router = useRouter()

  const [formState, formAction] = useActionState(updateCustomerAddress, {
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

  const removeAddress = async () => {
    setRemoving(true)
    const result = await deleteCustomerAddress(address.id)
    setActionError(!result.success)
    if (result.success) {
      toast.success(accountText[locale].addressDeleted)
      router.refresh()
    } else toast.error(text.genericError)
    setRemoving(false)
  }

  const changeDefault = async () => {
    setDefaultPending(true)
    const nextIsDefault = !address.is_default_shipping
    const result = await updateCustomerAddressDefault(address.id, nextIsDefault)
    setActionError(!result.success)
    if (result.success) {
      toast.success(accountText[locale].defaultUpdated)
      router.refresh()
    } else toast.error(text.genericError)
    setDefaultPending(false)
  }

  return (
    <>
      <div
        className={clx(
          "border rounded-rounded p-5 min-h-[220px] h-full w-full flex flex-col justify-between transition-colors",
          {
            "border-gray-900": isActive,
          },
        )}
        data-testid="address-container"
      >
        <div className="flex flex-col">
          <Heading
            className="text-left text-base-semi"
            data-testid="address-name"
          >
            {address.first_name} {address.last_name}
          </Heading>
          {address.company && (
            <Text
              className="txt-compact-small text-ui-fg-base"
              data-testid="address-company"
            >
              {address.company}
            </Text>
          )}
          <Text className="flex flex-col text-left text-base-regular mt-2">
            <span data-testid="address-address">
              {address.address_1}
              {address.address_2 && <span>, {address.address_2}</span>}
            </span>
            <span data-testid="address-postal-city">
              {address.postal_code}, {address.city}
            </span>
            <span data-testid="address-province-country">
              {address.province && `${address.province}, `}
              {address.country_code?.toUpperCase()}
            </span>
          </Text>
          {address.is_default_shipping && (
            <span className="mt-3 text-small-regular text-ui-fg-subtle">
              {text.defaultAddress}
            </span>
          )}
        </div>
        <div className="flex items-center gap-x-4">
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-x-2 rounded-md px-2 text-small-regular text-ui-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2"
            onClick={open}
            data-testid="address-edit-button"
          >
            <Edit />
            {text.edit}
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-md px-2 text-small-regular text-ui-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2"
            onClick={changeDefault}
            disabled={defaultPending}
            data-testid="address-default-button"
          >
            {address.is_default_shipping
              ? text.removeDefault
              : text.makeDefault}
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-x-2 rounded-md px-2 text-small-regular text-ui-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2"
            onClick={removeAddress}
            disabled={removing}
            data-testid="address-delete-button"
          >
            {removing ? <Spinner /> : <Trash />}
            {text.remove}
          </button>
        </div>
        {actionError && (
          <p
            className="mt-3 text-small-regular text-mtogo-status-error-text"
            role="alert"
          >
            {text.genericError}
          </p>
        )}
      </div>

      <Modal isOpen={state} close={close} data-testid="edit-address-modal">
        <Modal.Title>
          <Heading className="mb-2">{text.editAddress}</Heading>
        </Modal.Title>
        <form action={formAction}>
          <input type="hidden" name="addressId" value={address.id} />
          <Modal.Body>
            <div className="grid grid-cols-1 gap-y-2">
              <div className="grid grid-cols-2 gap-x-2">
                <Input
                  label={text.firstName}
                  name="first_name"
                  required
                  autoComplete="given-name"
                  defaultValue={address.first_name || undefined}
                  data-testid="first-name-input"
                />
                <Input
                  label={text.lastName}
                  name="last_name"
                  required
                  autoComplete="family-name"
                  defaultValue={address.last_name || undefined}
                  data-testid="last-name-input"
                />
              </div>
              <Input
                label={text.company}
                name="company"
                autoComplete="organization"
                defaultValue={address.company || undefined}
                data-testid="company-input"
              />
              <Input
                label={text.street}
                name="address_1"
                required
                autoComplete="address-line1"
                defaultValue={address.address_1 || undefined}
                data-testid="address-1-input"
              />
              <Input
                label={text.apartment}
                name="address_2"
                autoComplete="address-line2"
                defaultValue={address.address_2 || undefined}
                data-testid="address-2-input"
              />
              <div className="grid grid-cols-[144px_1fr] gap-x-2">
                <Input
                  label={text.postalCode}
                  name="postal_code"
                  required
                  autoComplete="postal-code"
                  defaultValue={address.postal_code || undefined}
                  data-testid="postal-code-input"
                />
                <Input
                  label={text.city}
                  name="city"
                  required
                  autoComplete="locality"
                  defaultValue={address.city || undefined}
                  data-testid="city-input"
                />
              </div>
              <Input
                label={text.province}
                name="province"
                autoComplete="address-level1"
                defaultValue={address.province || undefined}
                data-testid="state-input"
              />
              <CountrySelect
                name="country_code"
                region={region}
                required
                autoComplete="country"
                defaultValue={address.country_code || undefined}
                data-testid="country-select"
              />
              <Input
                label={text.phone}
                name="phone"
                type="tel"
                autoComplete="tel"
                required
                defaultValue={address.phone || undefined}
                data-testid="phone-input"
              />
              <label className="flex items-center gap-3 py-2 text-small-regular">
                <input
                  type="checkbox"
                  name="is_default_shipping"
                  defaultChecked={address.is_default_shipping}
                  className="h-4 w-4 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2"
                  data-testid="default-address-input"
                />
                {text.setDefault}
              </label>
            </div>
            {formState.error && (
              <div className="text-rose-500 text-small-regular py-2">
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

export default EditAddress
