"use client"

import { CUSTOMER_AUTH, Locale } from "@dtc/i18n"
import { setLocaleCookie } from "@lib/data/locale-actions"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import Register from "@modules/account/components/register"
import Login from "@modules/account/components/login"
import ChevronDown from "@modules/common/icons/chevron-down"

export enum LOGIN_VIEW {
  SIGN_IN = "sign-in",
  REGISTER = "register",
}

const LoginTemplate = ({
  initialLocale = "da",
  next,
}: {
  initialLocale?: Locale
  next?: string
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState(false)
  const [locale, setLocale] = useState(initialLocale)
  const [currentView, setCurrentView] = useState("sign-in")

  return (
    <div className="flex w-full justify-center px-4 py-10 small:py-16">
      <div className="flex w-full max-w-md flex-col gap-y-4 motion-safe:animate-fade-up">
        <div className="rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card p-6 shadow-sm xsmall:p-8">
          {/* The key replays a short fade when the Customer switches between
              signing in and creating an account. */}
          <div key={currentView} className="motion-safe:animate-fade-in">
            {currentView === "sign-in" ? (
              <Login
                setCurrentView={setCurrentView}
                locale={locale}
                next={next}
              />
            ) : (
              <Register
                setCurrentView={setCurrentView}
                locale={locale}
                next={next}
              />
            )}
          </div>
        </div>
        <div className="flex flex-col items-center gap-y-2">
          <label className="flex items-center gap-x-3 text-base text-mtogo-text-secondary">
            {CUSTOMER_AUTH[locale].language}
            <span className="relative inline-flex">
              <select
                aria-label={CUSTOMER_AUTH[locale].language}
                value={locale}
                disabled={pending}
                className="min-h-11 appearance-none rounded-md border border-mtogo-border-control bg-mtogo-surface-card pl-3 pr-9 text-base text-mtogo-text-primary transition-[border-color,opacity] duration-150 hover:border-mtogo-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2 disabled:opacity-60"
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
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mtogo-text-secondary"
              />
            </span>
          </label>
          {error && (
            <p
              role="alert"
              className="rounded-md bg-mtogo-status-error-surface px-4 py-3 text-base text-mtogo-status-error-text"
            >
              {CUSTOMER_AUTH[locale].languageError}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default LoginTemplate
