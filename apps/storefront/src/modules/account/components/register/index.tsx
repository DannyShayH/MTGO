"use client"

import { useActionState, useEffect } from "react"
import { toast } from "@medusajs/ui"
import Input from "@modules/common/components/input"
import { clx, focusRing } from "@modules/common/components/ui"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import { signup } from "@lib/data/customer"
import { CUSTOMER_AUTH, Locale } from "@dtc/i18n"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
  locale: Locale
  next?: string
}

const Register = ({ setCurrentView, locale, next }: Props) => {
  const [message, formAction] = useActionState(signup, null)
  const text = CUSTOMER_AUTH[locale]
  useEffect(() => {
    if (message?.state === "error") toast.error(text.errors[message.error])
    if (message?.state === "verification_required") {
      if (message.delivery_failed) toast.error(text.verificationDeliveryFailed)
      else toast.success(text.verification)
    }
  }, [message, text])
  return (
    <div
      className="flex w-full flex-col"
      data-testid="register-page"
      lang={locale}
    >
      <h1 className="mb-2 text-2xl font-semibold leading-8 text-mtogo-text-primary">
        {text.join}
      </h1>
      <p className="mb-6 text-base leading-6 text-mtogo-text-secondary">
        {text.description}
      </p>
      {message?.state === "verification_required" && (
        <p
          role="status"
          className={clx(
            "mb-6 rounded-md px-4 py-3 text-base motion-safe:animate-fade-in",
            message.delivery_failed
              ? "bg-mtogo-status-warning-surface text-mtogo-status-warning-text"
              : "bg-mtogo-status-success-surface text-mtogo-status-success-text",
          )}
        >
          {message.delivery_failed
            ? text.verificationDeliveryFailed
            : text.verification}
        </p>
      )}
      <form className="w-full flex flex-col" action={formAction}>
        <input type="hidden" name="language" value={locale} />
        {next && <input type="hidden" name="next" value={next} />}
        <div className="flex flex-col w-full gap-y-3">
          <Input
            id="email"
            label={text.email}
            name="email"
            required
            type="email"
            autoComplete="email"
            data-testid="email-input"
          />
          <Input
            id="password"
            label={text.password}
            name="password"
            required
            type="password"
            autoComplete="new-password"
            passwordToggleLabel={text.showPassword}
            data-testid="password-input"
          />
        </div>
        <p
          role="alert"
          className="mt-4 rounded-md bg-mtogo-status-error-surface px-4 py-3 text-base text-mtogo-status-error-text empty:hidden"
          data-testid="register-error"
        >
          {message?.state === "error" ? text.errors[message.error] : null}
        </p>
        <SubmitButton className="w-full mt-6" data-testid="register-button">
          {text.register}
        </SubmitButton>
      </form>
      <span className="mt-4 text-center text-base text-mtogo-text-secondary">
        {text.existing}{" "}
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.SIGN_IN)}
          className={clx(
            "inline-flex min-h-11 items-center rounded-md font-medium text-mtogo-text-link underline underline-offset-4 hover:text-mtogo-action-primary-pressed",
            focusRing,
          )}
        >
          {text.signIn}
        </button>
      </span>
    </div>
  )
}
export default Register
