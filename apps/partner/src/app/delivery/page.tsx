import { redirect } from "next/navigation"
import { Button, Container, Heading, Text } from "@medusajs/ui"
import { DELIVERY_AGENT_TEXT } from "@dtc/i18n"
import { getMessages } from "@lib/i18n"
import {
  getDeliveryAgent,
  getDeliveryFilter,
  saveDeliveryFilter,
  signOutDeliveryAgent,
} from "@lib/data/delivery-agent"
import { LanguageSwitch } from "@modules/layout/components/language-switch"

export default async function DeliveryPage() {
  const agent = await getDeliveryAgent()
  if (!agent) redirect("/delivery-sign-in")
  const { locale } = await getMessages()
  const copy = DELIVERY_AGENT_TEXT[locale]
  const selected = await getDeliveryFilter(agent.agent.id, agent.postal_codes)
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Heading level="h1">{copy.title}</Heading>
          <Text className="break-words">{agent.agent.name}</Text>
        </div>
        <form action={signOutDeliveryAgent}>
          <Button variant="secondary" type="submit" className="min-h-11">
            {copy.signOut}
          </Button>
        </form>
      </header>
      <LanguageSwitch locale={locale} label={copy.language} />
      <Container className="flex flex-col gap-4">
        <Heading level="h2">{copy.approved}</Heading>
        {agent.postal_codes.length ? (
          <form action={saveDeliveryFilter} className="flex flex-col gap-4">
            <fieldset>
              <legend>{copy.filter}</legend>
              <div className="flex flex-wrap gap-3">
                {agent.postal_codes.map((code) => (
                  <label
                    key={code}
                    className="flex min-h-11 items-center gap-2"
                  >
                    <input
                      type="checkbox"
                      name="postal_codes"
                      value={code}
                      defaultChecked={selected.includes(code)}
                    />
                    {code}
                  </label>
                ))}
              </div>
            </fieldset>
            <Button type="submit" className="min-h-11 self-start">
              {copy.save}
            </Button>
          </form>
        ) : (
          <Text>{copy.noAreas}</Text>
        )}
      </Container>
      <Container>
        <Text>{copy.empty}</Text>
      </Container>
    </main>
  )
}
