import { confirmCustomerEmailChange } from "@lib/data/customer"
import { CUSTOMER_PROFILE_TEXT } from "@dtc/i18n"
import Link from "next/link"

export default async function ChangeEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; language?: string }>
}) {
  const params = await searchParams
  const locale = params.language === "en" ? "en" : "da"
  const text = CUSTOMER_PROFILE_TEXT[locale]
  const result = params.token
    ? await confirmCustomerEmailChange(params.token)
    : { success: false }

  return (
    <main className="content-container py-16" data-testid="change-email-page">
      <h1 className="text-2xl-semi mb-4">{text.email_change_title}</h1>
      <p className="text-base-regular mb-8">
        {result.success
          ? text.email_change_confirmed
          : text.email_change_link_invalid}
      </p>
      <Link className="underline" href="/dk/account">
        {text.email_change_sign_in}
      </Link>
    </main>
  )
}
