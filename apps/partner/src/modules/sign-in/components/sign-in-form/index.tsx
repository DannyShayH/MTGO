"use client"

import { useActionState, useState } from "react"
import type { Messages } from "@dtc/i18n"
import { Alert, Button, Input, Label } from "@medusajs/ui"
import { signIn } from "@lib/data/session"

export function SignInForm({
  text,
  codes,
}: {
  text: Messages["text"]
  codes: Messages["codes"]
}) {
  const [state, action, pending] = useActionState(signIn, {})
  // React resets a form after its action runs; keep the email so a wrong
  // password only needs the password typed again.
  const [email, setEmail] = useState("")
  return (
    <form action={action} className="flex flex-col gap-y-4">
      {state.error && (
        <Alert variant="error" role="alert">
          {codes[state.error]}
        </Alert>
      )}
      <div className="flex flex-col gap-y-1.5">
        <Label htmlFor="email" size="small" weight="plus">
          {text.email}
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-y-1.5">
        <Label htmlFor="password" size="small" weight="plus">
          {text.password}
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <Button type="submit" isLoading={pending} className="w-full">
        {text.sign_in}
      </Button>
    </form>
  )
}
