import Link from "next/link"
import { redirect } from "next/navigation"
import { Heading } from "@medusajs/ui"
import { DELIVERY_AGENT_TEXT } from "@dtc/i18n"
import { getMessages } from "@lib/i18n"
import { getDeliveryAgent } from "@lib/data/delivery-agent"
import { BrandMark } from "@modules/layout/components/brand-mark"
import { LanguageSwitch } from "@modules/layout/components/language-switch"
import { AgentSignInForm } from "@modules/delivery/forms"

export default async function DeliverySignInPage() {
  if (await getDeliveryAgent()) redirect("/delivery")
  const { locale, messages } = await getMessages()
  const copy = DELIVERY_AGENT_TEXT[locale]
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12">
      <div className="bg-ui-bg-base shadow-elevation-card-rest rounded-card flex w-full max-w-sm flex-col gap-6 p-6 sm:p-8">
        <BrandMark name={messages.text.app_name} />
        <Heading level="h1">{copy.signInTitle}</Heading>
        <AgentSignInForm copy={copy} />
        <Link href="/sign-in" className="text-ui-fg-interactive">
          {copy.staff}
        </Link>
      </div>
      <LanguageSwitch locale={locale} label={copy.language} />
    </main>
  )
}
