"use client"

import type { HttpTypes } from "@medusajs/types"
import { accountText } from "@lib/util/account-text"
import Input from "@modules/common/components/input"
import AccountInfo from "../account-info"
import {
  requestCustomerEmailChange,
  type CustomerEmailChangeState,
} from "@lib/data/customer"
import { CUSTOMER_PROFILE_TEXT, type Locale } from "@dtc/i18n"
import { useActionState, useEffect, useState } from "react"

export default function ProfileEmail({
  customer,
  locale,
}: {
  customer: HttpTypes.StoreCustomer
  locale: Locale
}) {
  const text = accountText[locale]
  const profileText = CUSTOMER_PROFILE_TEXT[locale]
  const [successState, setSuccessState] = useState(false)
  const [state, formAction] = useActionState(requestCustomerEmailChange, {
    success: false,
    error: null,
  } satisfies CustomerEmailChangeState)

  useEffect(() => setSuccessState(state.success), [state])

  return (
    <form action={formAction} className="w-full">
      <AccountInfo
        label={text.email}
        currentInfo={customer.email}
        isSuccess={successState}
        isError={!!state.error}
        feedback={state}
        clearState={() => setSuccessState(false)}
        editLabel={profileText.edit}
        cancelLabel={profileText.cancel}
        saveLabel={profileText.email_change_submit}
        successMessage={profileText.email_change_sent}
        errorMessage={
          state.error === "customer_current_password_invalid"
            ? profileText.email_change_password_invalid
            : state.error === "customer_email_unavailable"
              ? profileText.email_change_unavailable
              : profileText.email_change_error
        }
        data-testid="account-email-editor"
      >
        <div className="grid grid-cols-1 gap-y-3">
          <Input
            label={profileText.email_change_new_email}
            name="new_email"
            type="email"
            autoComplete="email"
            required
            data-testid="new-email-input"
          />
          <Input
            label={profileText.email_change_password}
            name="current_password"
            type="password"
            autoComplete="current-password"
            required
            data-testid="current-password-input"
          />
          <p className="text-small-regular text-ui-fg-subtle">
            {text.emailUnavailable}
          </p>
        </div>
      </AccountInfo>
    </form>
  )
}
