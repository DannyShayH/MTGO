"use client"

import { useActionState } from "react"
import { formatText, type Messages } from "@dtc/i18n"
import { Alert, Button, Input, Label, Text } from "@medusajs/ui"
import { acceptInvitation } from "@lib/data/accept-invitation"
import { MIN_PASSWORD_LENGTH } from "@lib/password"
import type { OpenedInvitation } from "@lib/data/invitation"
import { DetailItem } from "@modules/common/components/detail-item"

export function InvitationForm({
  token,
  invitation,
  text,
  codes,
}: {
  token: string
  invitation: OpenedInvitation
  text: Messages["text"]
  codes: Messages["codes"]
}) {
  const [state, action, pending] = useActionState(acceptInvitation, {})
  return (
    <form action={action} className="flex flex-col gap-y-4">
      {state.error && (
        <Alert variant="error" role="alert">
          {formatText(codes[state.error], { min: MIN_PASSWORD_LENGTH })}
        </Alert>
      )}
      <input type="hidden" name="token" value={token} />
      <dl className="flex flex-col gap-y-3">
        <DetailItem label={text.restaurant}>
          {invitation.restaurant.name}
        </DetailItem>
        <DetailItem label={text.name}>{invitation.staff.name}</DetailItem>
        <DetailItem label={text.email}>{invitation.staff.email}</DetailItem>
      </dl>
      {/* Lets password managers save the new login under the invited email. */}
      <input
        type="email"
        name="username"
        autoComplete="username"
        value={invitation.staff.email}
        readOnly
        hidden
      />
      <div className="flex flex-col gap-y-1.5">
        <Label htmlFor="password" size="small" weight="plus">
          {text.choose_password}
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          aria-describedby="password-hint"
          required
        />
        <Text id="password-hint" size="xsmall" className="text-ui-fg-muted">
          {formatText(text.password_hint, { min: MIN_PASSWORD_LENGTH })}
        </Text>
      </div>
      <Button type="submit" isLoading={pending} className="w-full">
        {text.accept_invitation}
      </Button>
    </form>
  )
}
