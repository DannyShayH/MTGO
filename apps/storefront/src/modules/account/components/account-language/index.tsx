"use client"

import { Language, ChevronDownMini } from "@medusajs/icons"
import { toast } from "@medusajs/ui"
import { CUSTOMER_AUTH, Locale } from "@dtc/i18n"
import { saveCustomerLanguage } from "@lib/data/customer-language"
import { useActionState, useState, useEffect, startTransition } from "react"
import { Button } from "@modules/common/components/ui"

export default function AccountLanguage({ locale }: { locale: Locale }) {
  const [selection, setSelection] = useState({ locale, value: locale })
  const selected = selection.locale === locale ? selection.value : locale
  const [result, action, pending] = useActionState(saveCustomerLanguage, null)
  const text = CUSTOMER_AUTH[locale]
  useEffect(() => {
    if (result) {
      if (result.success) toast.success(text.languageSaved)
      else toast.error(text.languageError)
    }
  }, [result, text.languageSaved, text.languageError])
  return (
    <form
      onSubmit={(event) => {
        // A form action resets the form afterwards, which would put the select
        // back on its first value after a failed save. Submit by hand instead.
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        startTransition(() => action(formData))
      }}
      data-testid="language-settings"
      lang={locale}
      className="rounded-card border border-mtogo-border-subtle bg-mtogo-surface-page p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-mtogo-surface-selected text-mtogo-text-link"
          aria-hidden="true"
        >
          <Language />
        </span>
        <div className="min-w-0 flex-1">
          <label
            htmlFor="account-language"
            className="block text-base font-semibold"
          >
            {text.language}
          </label>
          <p className="mt-1 text-small-regular text-mtogo-text-secondary">
            {locale === "da"
              ? "Vælg det sprog, du vil bruge på din konto."
              : "Choose the language you want to use for your account."}
          </p>
          <div className="mt-4 flex flex-col gap-3 xsmall:flex-row xsmall:items-center">
            <div className="relative w-full xsmall:w-48">
              <select
                id="account-language"
                name="language"
                data-testid="account-language"
                value={selected}
                onChange={(event) =>
                  setSelection({ locale, value: event.target.value as Locale })
                }
                disabled={pending}
                className="min-h-11 w-full appearance-none rounded-md border border-mtogo-border-control bg-mtogo-surface-card px-3 pr-10 text-base text-mtogo-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2 disabled:opacity-50"
              >
                <option value="da">Dansk</option>
                <option value="en">English</option>
              </select>
              <ChevronDownMini
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mtogo-text-secondary"
              />
            </div>
            <Button
              type="submit"
              disabled={pending}
              data-testid="save-language"
              className="min-h-11 w-full xsmall:w-auto"
            >
              {pending ? text.savingLanguage : text.saveLanguage}
            </Button>
          </div>
        </div>
      </div>
    </form>
  )
}
