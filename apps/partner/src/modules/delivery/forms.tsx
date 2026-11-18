"use client"

import { useActionState } from "react"
import { Alert, Button, Input, Label, Text } from "@medusajs/ui"
import type { DELIVERY_AGENT_TEXT } from "@dtc/i18n"
import {
  acceptDeliveryInvitation,
  signInDeliveryAgent,
} from "@lib/data/delivery-agent"

type Copy = { [K in keyof typeof DELIVERY_AGENT_TEXT.en]: string }

export function AgentSignInForm({ copy }: { copy: Copy }) {
  const [state, action, pending] = useActionState(signInDeliveryAgent, {})
  return (
    <form
      action={action}
      className="flex flex-col gap-4 [&_button]:min-h-11 [&_input]:min-h-11 [&_input]:text-base"
    >
      {state.error && (
        <Alert variant="error" role="alert">
          {copy.failed}
        </Alert>
      )}
      <div className="flex flex-col gap-1">
        <Label htmlFor="email">{copy.email}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="password">{copy.password}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <Button type="submit" isLoading={pending}>
        {copy.signIn}
      </Button>
    </form>
  )
}

export function AgentInvitationForm({
  token,
  email,
  name,
  copy,
}: {
  token: string
  email: string
  name: string
  copy: Copy
}) {
  const [state, action, pending] = useActionState(acceptDeliveryInvitation, {})
  return (
    <form
      action={action}
      className="flex flex-col gap-4 [&_button]:min-h-11 [&_input]:min-h-11 [&_input]:text-base"
    >
      {state.error && (
        <Alert variant="error" role="alert">
          {state.error === "invalid" ? copy.invalid : copy.failed}
        </Alert>
      )}
      <Text className="break-words">
        {name} · {email}
      </Text>
      <input type="hidden" name="token" value={token} />
      <input
        type="email"
        name="username"
        autoComplete="username"
        value={email}
        readOnly
        hidden
      />
      <div className="flex flex-col gap-1">
        <Label htmlFor="password">{copy.choosePassword}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <Text size="small">{copy.passwordHint}</Text>
      </div>
      <Button type="submit" isLoading={pending}>
        {copy.accept}
      </Button>
    </form>
  )
}
