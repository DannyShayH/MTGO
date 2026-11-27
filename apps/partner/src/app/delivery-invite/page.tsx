import { Alert, Heading, Toaster } from "@medusajs/ui"
import { DELIVERY_AGENT_TEXT } from "@dtc/i18n"
import { getMessages } from "@lib/i18n"
import { getDeliveryInvitation } from "@lib/data/delivery-agent"
import { BrandMark } from "@modules/common/components/brand-mark"
import { LanguageSwitch } from "@modules/common/components/language-switch"
import { AgentInvitationForm } from "@modules/delivery/forms"

export default async function DeliveryInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const invitation = await getDeliveryInvitation(token)
  const { locale, messages } = await getMessages()
  const copy = DELIVERY_AGENT_TEXT[locale]
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12">
      {/* Top, so the phone keyboard never covers an error. */}
      <Toaster position="top-center" />
      <div className="bg-ui-bg-base shadow-elevation-card-rest rounded-card flex w-full max-w-sm flex-col gap-6 p-6 sm:p-8">
        <BrandMark name={messages.text.app_name} />
        <Heading level="h1">{copy.invitation}</Heading>
        {invitation && token ? (
          <AgentInvitationForm
            token={token}
            name={invitation.name}
            email={invitation.email}
            copy={copy}
          />
        ) : (
          <Alert variant="warning" role="status">
            {copy.invalid}
          </Alert>
        )}
      </div>
      <LanguageSwitch locale={locale} label={copy.language} />
    </main>
  )
}
