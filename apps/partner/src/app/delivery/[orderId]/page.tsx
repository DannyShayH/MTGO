import { Container, Heading, Text } from "@medusajs/ui"
import { DELIVERY_AGENT_TEXT } from "@dtc/i18n"
import { getMessages } from "@lib/i18n"
import {
  getAvailableDelivery,
  getDeliveryAgent,
} from "@lib/data/delivery-agent"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function DeliveryDetail({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  if (!(await getDeliveryAgent())) redirect("/delivery-sign-in")
  const { locale } = await getMessages()
  const copy = DELIVERY_AGENT_TEXT[locale]
  const result = await getAvailableDelivery((await params).orderId).catch(
    () => undefined,
  )
  const format = (value: string) =>
    new Intl.DateTimeFormat(locale === "da" ? "da-DK" : "en-GB", {
      timeZone: "Europe/Copenhagen",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value))
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <Link
        href="/delivery"
        className="min-h-11 underline focus-visible:outline-2"
      >
        {copy.back}
      </Link>
      {result === undefined ? (
        <Container>
          <Text role="alert">{copy.loadFailed}</Text>
        </Container>
      ) : !result ? (
        <Container>
          <Text>{copy.unavailable}</Text>
        </Container>
      ) : (
        <Container className="min-w-0 space-y-3">
          <Heading level="h1" className="break-words">
            {result.delivery.restaurant_name} · #
            {result.delivery.order_reference}
          </Heading>
          <Text className="break-words">
            {copy.pickup}: {result.delivery.pickup_address}
          </Text>
          <Text>
            {copy.destination}: {result.delivery.destination_postal_code}
          </Text>
          <Text>
            {copy.preparation}:{" "}
            {result.delivery.preparation_status === "ready"
              ? copy.readyStatus
              : result.delivery.preparation_status === "preparing"
                ? copy.preparingStatus
                : copy.acceptedStatus}
          </Text>
          <Text>
            {copy.acceptedAt}: {format(result.delivery.accepted_at)}
          </Text>
          <Text>
            {copy.claimBy}: {format(result.delivery.claim_deadline)}
          </Text>
        </Container>
      )}
    </main>
  )
}
