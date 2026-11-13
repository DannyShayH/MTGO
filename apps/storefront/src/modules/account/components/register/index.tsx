"use client"

import { useActionState } from "react"
import Input from "@modules/common/components/input"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import { signup } from "@lib/data/customer"
import { CUSTOMER_AUTH, Locale } from "@dtc/i18n"

type Props = { setCurrentView: (view: LOGIN_VIEW) => void; locale: Locale }

const Register = ({ setCurrentView, locale }: Props) => {
  const [message, formAction] = useActionState(signup, null)
  const text = CUSTOMER_AUTH[locale]
  return (
    <div
      className="max-w-sm flex flex-col items-center"
      data-testid="register-page"
      lang={locale}
    >
      <h1 className="text-large-semi uppercase mb-6">{text.join}</h1>
      <p className="text-center text-base-regular text-ui-fg-base mb-4">
        {text.description}
      </p>
      {message?.state === "verification_required" && (
        <p role="status">{text.verification}</p>
      )}
      <form className="w-full flex flex-col" action={formAction}>
        <div className="flex flex-col w-full gap-y-2">
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
          className="pt-2 text-rose-500 text-small-regular"
          data-testid="register-error"
        >
          {message?.state === "error" ? text.errors[message.error] : null}
        </p>
        <SubmitButton className="w-full mt-6" data-testid="register-button">
          {text.register}
        </SubmitButton>
      </form>
      <span className="text-center text-ui-fg-base text-small-regular mt-6">
        {text.existing}{" "}
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.SIGN_IN)}
          className="underline"
        >
          {text.signIn}
        </button>
      </span>
    </div>
  )
}
export default Register
