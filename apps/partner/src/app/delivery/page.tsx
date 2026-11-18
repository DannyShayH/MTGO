import { redirect } from "next/navigation"
import { Button, Container, Heading, Text } from "@medusajs/ui"
import { DELIVERY_AGENT_TEXT } from "@dtc/i18n"
import { getMessages } from "@lib/i18n"
import {
  getDeliveryAgent,
  getDeliveryFilter,
  getAvailableDeliveries,
  saveDeliveryFilter,
  signOutDeliveryAgent,
} from "@lib/data/delivery-agent"
import { LanguageSwitch } from "@modules/layout/components/language-switch"

export default async function DeliveryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const agent = await getDeliveryAgent()
  if (!agent) redirect("/delivery-sign-in")
  const { locale } = await getMessages()
  const copy = DELIVERY_AGENT_TEXT[locale]
  const selected = await getDeliveryFilter(agent.agent.id, agent.postal_codes)
  const rawPage = Number((await searchParams).page ?? "1")
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1
  const deliveries = await getAvailableDeliveries(
    selected,
    (page - 1) * 20,
  ).catch(() => null)
  const formatTime = (value: string) =>
    new Intl.DateTimeFormat(locale === "da" ? "da-DK" : "en-GB", {
      timeZone: "Europe/Copenhagen",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value))
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
      <section
        className="flex flex-col gap-3"
        aria-labelledby="available-title"
      >
        <div className="flex items-center justify-between gap-3">
          <Heading level="h2" id="available-title">
            {copy.available}
          </Heading>
          <a
            className="min-h-11 rounded-md px-3 py-2 underline focus-visible:outline-2"
            href={`/delivery?page=${page}`}
          >
            {copy.refresh}
          </a>
        </div>
        {!deliveries ? (
          <Container>
            <Text role="alert">{copy.loadFailed}</Text>
          </Container>
        ) : deliveries.deliveries.length ? (
          deliveries.deliveries.map((item) => (
            <Container key={item.id} className="min-w-0 space-y-2">
              <Heading level="h3" className="break-words">
                {item.restaurant_name} · #{item.order_reference}
              </Heading>
              <Text className="break-words">
                {copy.pickup}: {item.pickup_address}
              </Text>
              <Text>
                {copy.destination}: {item.destination_postal_code}
              </Text>
              <Text>
                {copy.preparation}:{" "}
                {item.preparation_status === "ready"
                  ? copy.readyStatus
                  : item.preparation_status === "preparing"
                    ? copy.preparingStatus
                    : copy.acceptedStatus}
              </Text>
              <Text>
                {copy.acceptedAt}: {formatTime(item.accepted_at)}
              </Text>
              <Text>
                {copy.claimBy}: {formatTime(item.claim_deadline)}
              </Text>
              <a
                className="inline-flex min-h-11 items-center underline focus-visible:outline-2"
                href={`/delivery/${encodeURIComponent(item.order_id)}`}
              >
                {copy.details}
              </a>
            </Container>
          ))
        ) : (
          <Container>
            <Text>{copy.empty}</Text>
          </Container>
        )}
        {deliveries && (
          <nav
            className="flex justify-between gap-4"
            aria-label={copy.available}
          >
            {page > 1 && (
              <a
                href={`/delivery?page=${page - 1}`}
                className="min-h-11 underline"
              >
                {copy.previous}
              </a>
            )}
            {deliveries.has_more && (
              <a
                href={`/delivery?page=${page + 1}`}
                className="ml-auto min-h-11 underline"
              >
                {copy.next}
              </a>
            )}
          </nav>
        )}
      </section>
    </main>
  )
}
