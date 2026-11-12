"use client"

import { Alert, Heading, Text } from "@medusajs/ui"

export function SignInNotice({
  title,
  intro,
  notice,
  isWarning,
}: {
  title: string
  intro: string
  notice?: string
  isWarning: boolean
}) {
  return (
    <div className="flex flex-col gap-y-3">
      <div className="flex flex-col gap-y-1">
        <Heading level="h1">{title}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {intro}
        </Text>
      </div>
      {notice && (
        <Alert variant={isWarning ? "warning" : "info"} role="status">
          {notice}
        </Alert>
      )}
    </div>
  )
}
