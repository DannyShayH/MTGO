"use client"

import { toast } from "@medusajs/ui"
import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@modules/common/components/ui"
import { confirmEmailVerification } from "@lib/data/customer"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { CUSTOMER_VERIFICATION } from "@dtc/i18n"

type VerificationState = "verifying" | "success" | "error"

const VerifyAccount = () => {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const language = searchParams.get("language") === "en" ? "en" : "da"
  const returnTo = searchParams.get("return_to")
  const copy = CUSTOMER_VERIFICATION[language]
  const signInHref = returnTo
    ? `/account?next=${encodeURIComponent(returnTo)}`
    : "/account"
  const [state, setState] = useState<VerificationState>("verifying")
  // Guard against the effect running twice in React Strict Mode, which would
  // consume the single-use token before the customer sees the result.
  const confirmed = useRef(false)

  useEffect(() => {
    if (confirmed.current) {
      return
    }
    confirmed.current = true

    if (!token) {
      setState("error")
      return
    }

    void confirmEmailVerification(token).then(({ success }) =>
      setState(success ? "success" : "error"),
    )
  }, [token])

  useEffect(() => {
    if (state === "success") toast.success(copy.success)
    if (state === "error") toast.error(copy.error)
  }, [state, copy])

  return (
    <div
      className="flex w-full max-w-md flex-col items-start gap-y-4 rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card p-6 shadow-sm motion-safe:animate-fade-up xsmall:p-8"
      data-testid="verify-account-page"
    >
      <h1 className="text-2xl font-semibold leading-8 text-mtogo-text-primary">
        {copy.title}
      </h1>

      {state === "verifying" && (
        <p className="text-base leading-6 text-mtogo-text-secondary">
          {copy.verifying}
        </p>
      )}

      {state === "success" && (
        <>
          <p className="rounded-md bg-mtogo-status-success-surface px-4 py-3 text-base text-mtogo-status-success-text motion-safe:animate-fade-in">
            {copy.success}
          </p>
          <LocalizedClientLink href={signInHref}>
            <Button variant="primary">{copy.signIn}</Button>
          </LocalizedClientLink>
        </>
      )}

      {state === "error" && (
        <>
          <p className="rounded-md bg-mtogo-status-error-surface px-4 py-3 text-base text-mtogo-status-error-text motion-safe:animate-fade-in">
            {copy.error}
          </p>
          <LocalizedClientLink href={signInHref}>
            <Button variant="secondary">{copy.signIn}</Button>
          </LocalizedClientLink>
        </>
      )}
    </div>
  )
}

export default VerifyAccount
