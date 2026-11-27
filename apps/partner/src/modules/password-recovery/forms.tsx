"use client"

import Link from "next/link"
import { useActionState, useState, useSyncExternalStore } from "react"
import { Alert, Button, Input, Label, Text } from "@medusajs/ui"
import { PASSWORD_RECOVERY_TEXT, type Locale } from "@dtc/i18n"
import {
  requestPasswordReset,
  resetPassword,
} from "@lib/data/password-recovery"
import { RECOVERY_ACCOUNTS, type RecoveryActor } from "@lib/password-recovery"
import { MIN_PASSWORD_LENGTH } from "@lib/password"
import { PHONE_FORM } from "@modules/common/form-styles"

export function RequestPasswordResetForm({
  actor,
  locale,
}: {
  actor: RecoveryActor
  locale: Locale
}) {
  const [state, action, pending] = useActionState(
    requestPasswordReset.bind(null, actor),
    {},
  )
  const [email, setEmail] = useState("")
  const copy = PASSWORD_RECOVERY_TEXT[locale]
  return (
    <form action={action} className={PHONE_FORM}>
      <Text size="small">{copy.requestIntro}</Text>
      {state.sent && (
        <Alert variant="success" role="status">
          {copy.sent}
        </Alert>
      )}
      {state.error && (
        <Alert variant="error" role="alert">
          {copy[state.error]}
        </Alert>
      )}
      <div className="flex flex-col gap-1">
        <Label htmlFor="email">{copy.email}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <Button type="submit" isLoading={pending} disabled={pending}>
        {copy.send}
      </Button>
    </form>
  )
}

function subscribeToHashChange(onChange: () => void) {
  window.addEventListener("hashchange", onChange)
  return () => window.removeEventListener("hashchange", onChange)
}

export function ResetPasswordForm({
  actor,
  locale,
}: {
  actor: RecoveryActor
  locale: Locale
}) {
  const token = useSyncExternalStore(
    subscribeToHashChange,
    () => new URLSearchParams(window.location.hash.slice(1)).get("token") || "",
    () => null,
  )
  if (token === null)
    return <Text role="status">{PASSWORD_RECOVERY_TEXT[locale].loading}</Text>
  return (
    <ChoosePasswordForm
      key={token}
      token={token}
      actor={actor}
      locale={locale}
    />
  )
}

function ChoosePasswordForm({
  actor,
  locale,
  token,
}: {
  actor: RecoveryActor
  locale: Locale
  token: string
}) {
  const [state, action, pending] = useActionState(
    resetPassword.bind(null, actor),
    {},
  )
  const copy = PASSWORD_RECOVERY_TEXT[locale]
  const requestLink = (
    <Link
      prefetch={false}
      href={RECOVERY_ACCOUNTS[actor].request}
      className="text-ui-fg-interactive inline-flex min-h-11 items-center underline"
    >
      {copy.newLink}
    </Link>
  )
  if (state.success)
    return (
      <Alert variant="success" role="status">
        {copy.success}
      </Alert>
    )
  if (!token || state.error === "invalid")
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="warning" role="alert">
          {copy.invalid}
        </Alert>
        {requestLink}
      </div>
    )
  return (
    <form action={action} className={PHONE_FORM}>
      <input type="hidden" name="token" value={token} />
      <Text id="password-hint" size="small">
        {copy.passwordHint}
      </Text>
      {state.error && (
        <Alert variant="error" role="alert">
          {copy[state.error]}
        </Alert>
      )}
      <div className="flex flex-col gap-1">
        <Label htmlFor="password">{copy.password}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          aria-describedby="password-hint"
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="confirmation">{copy.confirmPassword}</Label>
        <Input
          id="confirmation"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </div>
      <Button type="submit" isLoading={pending} disabled={pending}>
        {copy.save}
      </Button>
      {requestLink}
    </form>
  )
}
