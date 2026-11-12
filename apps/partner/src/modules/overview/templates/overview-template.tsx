"use client"

import type { Messages } from "@dtc/i18n"
import { Container, Heading, Text } from "@medusajs/ui"

export function OverviewTemplate({
  text,
  restaurantName,
}: {
  text: Messages["text"]
  restaurantName: string
}) {
  return (
    <div className="flex flex-col gap-y-4">
      <Heading level="h1">{text.overview}</Heading>
      <Container className="rounded-card flex flex-col gap-y-1 px-6 py-4">
        <Text size="small" className="text-ui-fg-subtle">
          {text.restaurant}
        </Text>
        <Heading level="h2">{restaurantName}</Heading>
      </Container>
    </div>
  )
}
