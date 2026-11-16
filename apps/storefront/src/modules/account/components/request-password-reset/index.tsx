"use client"

import { useActionState, useEffect } from "react"
import { toast } from "@medusajs/ui"
import { CUSTOMER_AUTH, type Locale } from "@dtc/i18n"
import { requestPasswordReset } from "@lib/data/customer"
import Input from "@modules/common/components/input"
import { SubmitButton } from "@modules/common/components/submit-button"

export default function RequestPasswordReset({
  locale,
  email,
  onBack,
}: {
  locale: Locale
  email?: string
  onBack?: () => void
}) {
  const [state, action] = useActionState(requestPasswordReset, null)
  const text = CUSTOMER_AUTH[locale]
  useEffect(() => {
    if (state?.sent) toast.success(text.resetSent)
  }, [state, text.resetSent])
  return (
    <div lang={locale} className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold">{text.resetTitle}</h2>
      {state?.sent && <p role="status">{text.resetSent}</p>}
      <form action={action} className="flex flex-col gap-4">
        <Input
          label={text.email}
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={email}
          required
        />
        <SubmitButton>{text.resetRequest}</SubmitButton>
      </form>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 text-mtogo-text-link underline"
        >
          {text.backToLogin}
        </button>
      )}
    </div>
  )
}
