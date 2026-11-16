"use client"

import React, { useEffect, useActionState } from "react"

import Input from "@modules/common/components/input"

import AccountInfo from "../account-info"
import { HttpTypes } from "@medusajs/types"
import { updateCustomer } from "@lib/data/customer"
import {
  CUSTOMER_PROFILE_TEXT,
  validateCustomerPhone,
  type Locale,
} from "@dtc/i18n"

type MyInformationProps = {
  customer: HttpTypes.StoreCustomer
  locale: Locale
}

const ProfilePhone: React.FC<MyInformationProps> = ({ customer, locale }) => {
  const profileText = CUSTOMER_PROFILE_TEXT[locale]
  const [successState, setSuccessState] = React.useState(false)
  const [phone, setPhone] = React.useState(customer.phone ?? "")

  const updateCustomerPhone = async (
    _currentState: Record<string, unknown>,
    formData: FormData,
  ) => {
    const customer = {
      phone: String(formData.get("phone") ?? ""),
    }

    const validationError = validateCustomerPhone(customer.phone)
    if (validationError) return { success: false, error: validationError }

    try {
      await updateCustomer(customer)
      return { success: true, error: null }
    } catch {
      return { success: false, error: "customer_profile_update_failed" }
    }
  }

  const [state, formAction] = useActionState(updateCustomerPhone, {
    error: null as string | null,
    success: false,
  })

  const clearState = () => {
    setSuccessState(false)
  }

  useEffect(() => {
    setSuccessState(state.success)
  }, [state])

  return (
    <form action={formAction} className="w-full">
      <AccountInfo
        label={profileText.phone}
        currentInfo={
          customer.phone ||
          (locale === "da"
            ? "Intet mobilnummer tilføjet"
            : "No mobile number added")
        }
        isSuccess={successState}
        feedback={state}
        isError={!!state.error}
        editLabel={profileText.edit}
        cancelLabel={profileText.cancel}
        saveLabel={profileText.save}
        successMessage={profileText.updated}
        errorMessage={
          state.error === "customer_phone_invalid"
            ? profileText.phone_invalid
            : profileText.generic_error
        }
        clearState={clearState}
        onCancel={() => setPhone(customer.phone ?? "")}
        data-testid="account-phone-editor"
      >
        <div className="grid grid-cols-1 gap-y-2">
          <Input
            label={profileText.phone}
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            data-testid="phone-input"
          />
          <p className="text-small-regular text-ui-fg-subtle">
            {profileText.delivery_contact_help} {profileText.sms_help}
          </p>
        </div>
      </AccountInfo>
    </form>
  )
}

export default ProfilePhone
