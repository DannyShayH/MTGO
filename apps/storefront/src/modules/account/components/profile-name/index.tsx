"use client"

import React, { useEffect, useActionState } from "react"

import Input from "@modules/common/components/input"

import AccountInfo from "../account-info"
import { HttpTypes } from "@medusajs/types"
import { updateCustomer } from "@lib/data/customer"
import {
  CUSTOMER_PROFILE_TEXT,
  validateCustomerName,
  type Locale,
} from "@dtc/i18n"

type MyInformationProps = {
  customer: HttpTypes.StoreCustomer
  locale: Locale
}

const ProfileName: React.FC<MyInformationProps> = ({ customer, locale }) => {
  const profileText = CUSTOMER_PROFILE_TEXT[locale]
  const [successState, setSuccessState] = React.useState(false)
  const [firstName, setFirstName] = React.useState(customer.first_name ?? "")
  const [lastName, setLastName] = React.useState(customer.last_name ?? "")

  const updateCustomerName = async (
    _currentState: Record<string, unknown>,
    formData: FormData,
  ) => {
    const customer = {
      first_name: String(formData.get("first_name") ?? ""),
      last_name: String(formData.get("last_name") ?? ""),
    }

    const validationError = validateCustomerName(
      customer.first_name,
      customer.last_name,
    )
    if (validationError) return { success: false, error: validationError }

    try {
      await updateCustomer(customer)
      return { success: true, error: null }
    } catch {
      return { success: false, error: "customer_profile_update_failed" }
    }
  }

  const [state, formAction] = useActionState(updateCustomerName, {
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
    <form action={formAction} className="w-full overflow-visible">
      <AccountInfo
        label={profileText.name}
        currentInfo={`${customer.first_name} ${customer.last_name}`}
        isSuccess={successState}
        feedback={state}
        isError={!!state?.error}
        clearState={clearState}
        onCancel={() => {
          setFirstName(customer.first_name ?? "")
          setLastName(customer.last_name ?? "")
        }}
        editLabel={profileText.edit}
        cancelLabel={profileText.cancel}
        saveLabel={profileText.save}
        successMessage={profileText.updated}
        errorMessage={
          state.error === "customer_name_required"
            ? profileText.name_required
            : profileText.generic_error
        }
        data-testid="account-name-editor"
      >
        <div className="grid grid-cols-2 gap-x-4">
          <Input
            label={profileText.first_name}
            name="first_name"
            required
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            data-testid="first-name-input"
          />
          <Input
            label={profileText.last_name}
            name="last_name"
            required
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            data-testid="last-name-input"
          />
        </div>
      </AccountInfo>
    </form>
  )
}

export default ProfileName
