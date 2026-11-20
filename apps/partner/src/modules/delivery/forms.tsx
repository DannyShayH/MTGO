"use client"

import { useActionState, useEffect, useState } from "react"
import { Button, Input, Label, Text, toast } from "@medusajs/ui"
import type { DELIVERY_AGENT_TEXT } from "@dtc/i18n"
import {
  acceptDeliveryInvitation,
  signInDeliveryAgent,
  type AgentActionState,
} from "@lib/data/delivery-agent"
import { PHONE_FORM } from "@modules/common/form-styles"

type Copy = { [K in keyof typeof DELIVERY_AGENT_TEXT.en]: string }

const ERROR_TEXT = {
  failed: "failed",
  invalid: "invalid",
  wrong_credentials: "wrongCredentials",
  ended: "accessEnded",
} as const satisfies Record<NonNullable<AgentActionState["error"]>, keyof Copy>

/**
 * Shows each refused submission as a toast instead of a box above the form.
 * Every submission returns a new state, so a repeated error toasts again.
 */
function useErrorToast(state: AgentActionState, copy: Copy) {
  useEffect(() => {
    if (state.error)
      toast.error(copy[ERROR_TEXT[state.error]], { duration: 8000 })
  }, [state, copy])
}

export function AgentSignInForm({ copy }: { copy: Copy }) {
  const [state, action, pending] = useActionState(signInDeliveryAgent, {})
  useErrorToast(state, copy)
  // React resets a form after its action runs; keep the email so a wrong
  // password only needs the password typed again.
  const [email, setEmail] = useState("")
  return (
    <form action={action} className={PHONE_FORM}>
      <div className="flex flex-col gap-1">
        <Label htmlFor="email">{copy.email}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
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
  useErrorToast(state, copy)
  return (
    <form action={action} className={PHONE_FORM}>
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
