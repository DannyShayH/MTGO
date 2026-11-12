import { redirect } from "next/navigation"
import { isMessageCode } from "@dtc/i18n"
import { getMessages } from "@lib/i18n"
import { getStaffSession } from "@lib/data/staff"
import { BrandMark } from "@modules/layout/components/brand-mark"
import { LanguageSwitch } from "@modules/layout/components/language-switch"
import { SignInForm } from "@modules/sign-in/components/sign-in-form"
import { SignInNotice } from "@modules/sign-in/components/sign-in-notice"

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>
}) {
  const session = await getStaffSession()
  if (session.status === "authorized") redirect("/overview")
  if (session.status === "ended")
    redirect(`/session-ended?code=${session.code}`)
  const { locale, messages } = await getMessages()
  const { message } = await searchParams
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-y-6 px-4 py-12">
      <div className="bg-ui-bg-base shadow-elevation-card-rest rounded-card flex w-full max-w-sm flex-col gap-y-6 p-8">
        <BrandMark name={messages.text.app_name} />
        <SignInNotice
          title={messages.text.sign_in_title}
          intro={messages.text.sign_in_intro}
          notice={isMessageCode(message) ? messages.codes[message] : undefined}
          isWarning={message === "staff_access_revoked"}
        />
        <SignInForm text={messages.text} codes={messages.codes} />
      </div>
      <LanguageSwitch locale={locale} label={messages.text.language} />
    </main>
  )
}
