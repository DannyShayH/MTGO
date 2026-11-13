import { login } from "@lib/data/customer"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"
import { CUSTOMER_AUTH, Locale } from "@dtc/i18n"
import { useActionState } from "react"

type Props = { setCurrentView: (view: LOGIN_VIEW) => void; locale: Locale }

const Login = ({ setCurrentView, locale }: Props) => {
  const [message, formAction] = useActionState(login, null)
  const text = CUSTOMER_AUTH[locale]
  return (
    <div
      className="max-w-sm w-full flex flex-col items-center"
      data-testid="login-page"
      lang={locale}
    >
      <h1 className="text-large-semi uppercase mb-6">{text.welcome}</h1>
      <p className="text-center text-base-regular text-ui-fg-base mb-8">
        {text.introduction}
      </p>
      {message?.state === "verification_required" && (
        <p role="status">{text.verification}</p>
      )}
      <form className="w-full" action={formAction}>
        <div className="flex flex-col w-full gap-y-2">
          <Input
            id="email"
            label={text.email}
            name="email"
            type="email"
            autoComplete="email"
            required
            data-testid="email-input"
          />
          <Input
            id="password"
            label={text.password}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            passwordToggleLabel={text.showPassword}
            data-testid="password-input"
          />
        </div>
        <p
          role="alert"
          className="pt-2 text-rose-500 text-small-regular"
          data-testid="login-error-message"
        >
          {message?.state === "error" ? text.errors[message.error] : null}
        </p>
        <SubmitButton data-testid="sign-in-button" className="w-full mt-6">
          {text.signIn}
        </SubmitButton>
      </form>
      <span className="text-center text-ui-fg-base text-small-regular mt-6">
        {text.newCustomer}{" "}
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.REGISTER)}
          className="underline"
          data-testid="register-button"
        >
          {text.register}
        </button>
      </span>
    </div>
  )
}
export default Login
