"use client"

import { CUSTOMER_AUTH, Locale } from "@dtc/i18n"
import { setLocaleCookie } from "@lib/data/locale-actions"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import Register from "@modules/account/components/register"
import Login from "@modules/account/components/login"

export enum LOGIN_VIEW {
  SIGN_IN = "sign-in",
  REGISTER = "register",
}

const LoginTemplate = ({
  initialLocale = "da",
}: {
  initialLocale?: Locale
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState(false)
  const [locale, setLocale] = useState(initialLocale)
  const [currentView, setCurrentView] = useState("sign-in")

  return (
    <div className="w-full flex justify-start flex-col items-center px-8 py-8">
      <label className="mb-6">
        {CUSTOMER_AUTH[locale].language}
        <select
          aria-label={CUSTOMER_AUTH[locale].language}
          value={locale}
          disabled={pending}
          className="ml-3 min-h-11 border border-mtogo-border-control focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2"
          onChange={(event) => {
            const selected = event.target.value as Locale
            setLocale(selected)
            document.documentElement.lang = selected
            startTransition(async () => {
              setError(false)
              try {
                await setLocaleCookie(selected)
                router.refresh()
              } catch {
                setError(true)
              }
            })
          }}
        >
          <option value="da">Dansk</option>
          <option value="en">English</option>
        </select>
      </label>
      {error && <p role="alert">{CUSTOMER_AUTH[locale].languageError}</p>}
      {currentView === "sign-in" ? (
        <Login setCurrentView={setCurrentView} locale={locale} />
      ) : (
        <Register setCurrentView={setCurrentView} locale={locale} />
      )}
    </div>
  )
}

export default LoginTemplate
