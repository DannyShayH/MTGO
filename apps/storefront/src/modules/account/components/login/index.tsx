import { login } from "@lib/data/customer"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"
import { clx, focusRing } from "@modules/common/components/ui"
import { CUSTOMER_AUTH, Locale } from "@dtc/i18n"
import { useActionState } from "react"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
  locale: Locale
  next?: string
}

const Login = ({ setCurrentView, locale, next }: Props) => {
  const [message, formAction] = useActionState(login, null)
  const text = CUSTOMER_AUTH[locale]
  return (
    <div
      className="flex w-full flex-col"
      data-testid="login-page"
      lang={locale}
    >
      <h1 className="mb-2 text-2xl font-semibold leading-8 text-mtogo-text-primary">
        {text.welcome}
      </h1>
      <p className="mb-6 text-base leading-6 text-mtogo-text-secondary">
        {text.introduction}
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
      <form className="w-full" action={formAction}>
        {next && <input type="hidden" name="next" value={next} />}
        <div className="flex flex-col w-full gap-y-3">
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
          className="mt-4 rounded-md bg-mtogo-status-error-surface px-4 py-3 text-base text-mtogo-status-error-text empty:hidden"
          data-testid="login-error-message"
        >
          {message?.state === "error" ? text.errors[message.error] : null}
        </p>
        <SubmitButton data-testid="sign-in-button" className="w-full mt-6">
          {text.signIn}
        </SubmitButton>
      </form>
      <button
        type="button"
        onClick={() => setCurrentView(LOGIN_VIEW.RESET)}
        className={clx(
          "mt-4 min-h-11 text-mtogo-text-link underline underline-offset-4",
          focusRing,
        )}
      >
        {text.forgotPassword}
      </button>
      <span className="mt-4 text-center text-base text-mtogo-text-secondary">
        {text.newCustomer}{" "}
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.REGISTER)}
          className={clx(
            "inline-flex min-h-11 items-center rounded-md font-medium text-mtogo-text-link underline underline-offset-4 hover:text-mtogo-action-primary-pressed",
            focusRing,
          )}
          data-testid="register-button"
        >
          {text.register}
        </button>
      </span>
    </div>
  )
}
export default Login
