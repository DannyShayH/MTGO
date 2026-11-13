"use client"

import { CUSTOMER_AUTH, Locale } from "@dtc/i18n"
import { useState } from "react"

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
  const [locale, setLocale] = useState(initialLocale)
  const [currentView, setCurrentView] = useState("sign-in")

  return (
    <div className="w-full flex justify-start flex-col items-center px-8 py-8">
      <label className="mb-6">
        {CUSTOMER_AUTH[locale].language}
        <select
          aria-label={CUSTOMER_AUTH[locale].language}
          value={locale}
          onChange={(event) => setLocale(event.target.value as Locale)}
        >
          <option value="da">Dansk</option>
          <option value="en">English</option>
        </select>
      </label>
      {currentView === "sign-in" ? (
        <Login setCurrentView={setCurrentView} locale={locale} />
      ) : (
        <Register setCurrentView={setCurrentView} locale={locale} />
      )}
    </div>
  )
}

export default LoginTemplate
