"use client"

import { CUSTOMER_AUTH, Locale } from "@dtc/i18n"
import { saveCustomerLanguage } from "@lib/data/customer-language"
import { useActionState, useState } from "react"
import { Button } from "@modules/common/components/ui"

export default function AccountLanguage({ locale }: { locale: Locale }) {
  const [selection, setSelection] = useState({ locale, value: locale })
  const selected = selection.locale === locale ? selection.value : locale
  const [result, action, pending] = useActionState(saveCustomerLanguage, null)
  const text = CUSTOMER_AUTH[locale]
  return (
    <form
      action={action}
      data-testid="language-settings"
      lang={locale}
      className="mb-8 flex flex-wrap items-center gap-3"
    >
      <label htmlFor="account-language">{text.language}</label>
      <select
        id="account-language"
        name="language"
        data-testid="account-language"
        value={selected}
        onChange={(event) =>
          setSelection({ locale, value: event.target.value as Locale })
        }
        disabled={pending}
        className="min-h-11 border border-mtogo-border-control focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2"
      >
        <option value="da">Dansk</option>
        <option value="en">English</option>
      </select>
      <Button
        type="submit"
        disabled={pending}
        data-testid="save-language"
        className="min-h-11"
      >
        {pending ? text.savingLanguage : text.saveLanguage}
      </Button>
      {result && (
        <p
          role={result.success ? "status" : "alert"}
          className={
            result.success
              ? "text-mtogo-status-success-text"
              : "text-mtogo-status-error-text"
          }
        >
          {result.success ? text.languageSaved : text.languageError}
        </p>
      )}
    </form>
  )
}
