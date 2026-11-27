import Link from "next/link"
import { Heading } from "@medusajs/ui"
import { PASSWORD_RECOVERY_TEXT } from "@dtc/i18n"
import { getMessages } from "@lib/i18n"
import { RECOVERY_ACCOUNTS, type RecoveryActor } from "@lib/password-recovery"
import { BrandMark } from "@modules/common/components/brand-mark"
import { LanguageSwitch } from "@modules/common/components/language-switch"
import { RequestPasswordResetForm, ResetPasswordForm } from "./forms"

export default async function PasswordRecoveryPage({
  actor,
  reset = false,
}: {
  actor: RecoveryActor
  reset?: boolean
}) {
  const { locale: chosenLocale, messages } = await getMessages()
  const locale = actor === "user" ? "en" : chosenLocale
  const copy = PASSWORD_RECOVERY_TEXT[locale]
  return (
    <main
      lang={locale}
      className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12"
    >
      <div className="bg-ui-bg-base shadow-elevation-card-rest rounded-card flex w-full max-w-sm flex-col gap-6 p-6 sm:p-8">
        <BrandMark name={messages.text.app_name} />
        <Heading level="h1">
          {reset ? copy.resetTitle : copy.requestTitle}
        </Heading>
        {reset ? (
          <ResetPasswordForm actor={actor} locale={locale} />
        ) : (
          <RequestPasswordResetForm actor={actor} locale={locale} />
        )}
        <Link
          prefetch={false}
          href={
            actor === "user"
              ? `${(process.env.ADMIN_PUBLIC_URL || "http://localhost:9000/app").replace(/\/$/, "")}/login`
              : RECOVERY_ACCOUNTS[actor].signIn
          }
          className="text-ui-fg-interactive inline-flex min-h-11 items-center underline"
        >
          {copy.back}
        </Link>
      </div>
      {actor !== "user" && (
        <LanguageSwitch locale={locale} label={messages.text.language} />
      )}
    </main>
  )
}
