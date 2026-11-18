import { Container, Text } from "@medusajs/ui"
import { DELIVERY_AGENT_TEXT } from "@dtc/i18n"
import { getMessages } from "@lib/i18n"

export default async function Loading() {
  const { locale } = await getMessages()
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <Container>
        <Text role="status">{DELIVERY_AGENT_TEXT[locale].loading}</Text>
      </Container>
    </main>
  )
}
