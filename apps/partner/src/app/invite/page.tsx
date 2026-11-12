import { formatText } from "@dtc/i18n"
import { Alert, Heading, Text } from "@medusajs/ui"
import { getMessages } from "@lib/i18n"
import { retrieveInvitation } from "@lib/data/invitation"
import { BrandMark } from "@modules/layout/components/brand-mark"
import { LanguageSwitch } from "@modules/layout/components/language-switch"
import { InvitationForm } from "@modules/invitation/components/invitation-form"

/** The page an invite link opens (spec stories 37-39). */
export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const invitation = await retrieveInvitation(token)
  const { locale, messages } = await getMessages()
  const { text, codes } = messages
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-y-6 px-4 py-12">
      <div className="bg-ui-bg-base shadow-elevation-card-rest rounded-card flex w-full max-w-sm flex-col gap-y-6 p-8">
        <BrandMark name={text.app_name} />
        <div className="flex flex-col gap-y-1">
          <Heading level="h1">{text.invitation_title}</Heading>
          {invitation && (
            <Text size="small" className="text-ui-fg-subtle">
              {formatText(text.invitation_intro, {
                restaurant: invitation.restaurant.name,
              })}
            </Text>
          )}
        </div>
        {invitation && token ? (
          <InvitationForm
            token={token}
            invitation={invitation}
            text={text}
            codes={codes}
          />
        ) : (
          <Alert variant="warning" role="status">
            {codes.invitation_invalid}
          </Alert>
        )}
      </div>
      <LanguageSwitch locale={locale} label={text.language} />
    </main>
  )
}
