"use client"

import { useActionState, useEffect, useState } from "react"
import { toast } from "@medusajs/ui"
import { CUSTOMER_AUTH } from "@dtc/i18n"
import { resetCustomerPassword } from "@lib/data/customer"
import Input from "@modules/common/components/input"
import { SubmitButton } from "@modules/common/components/submit-button"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

export default function ResetPassword() {
  const [link, setLink] = useState({ token: "", language: "da" as "da" | "en" })
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    setLink({
      token: params.get("token") || "",
      language: params.get("language") === "en" ? "en" : "da",
    })
  }, [])
  const { token, language } = link
  const text = CUSTOMER_AUTH[language]
  const [state, action] = useActionState(resetCustomerPassword, null)
  useEffect(() => {
    if (state) {
      if (state.success) toast.success(text.resetSuccess)
      else toast.error(text.resetError)
    }
  }, [state, text])
  return (
    <div
      lang={language}
      className="w-full max-w-md rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card p-6"
    >
      <h1 className="text-2xl font-semibold">{text.resetTitle}</h1>
      {state?.success ? (
        <p role="status" className="my-4">
          {text.resetSuccess}
        </p>
      ) : (
        <form action={action} className="my-4 flex flex-col gap-4">
          <input type="hidden" name="token" value={token} />
          <Input
            label={text.resetPassword}
            name="password"
            type="password"
            autoComplete="new-password"
            passwordToggleLabel={text.showPassword}
            required
          />
          {state && <p role="alert">{text.resetError}</p>}
          <SubmitButton>{text.resetSubmit}</SubmitButton>
        </form>
      )}
      <LocalizedClientLink
        href="/account"
        className="text-mtogo-text-link underline"
      >
        {text.backToLogin}
      </LocalizedClientLink>
    </div>
  )
}
