"use client"

import { useActionState, useState } from "react"
import { accessEndedMessage, type Messages } from "@dtc/i18n"
import { Alert, Button, Input, Label } from "@medusajs/ui"
import { signIn } from "@lib/data/session"

export function SignInForm({ messages }: { messages: Messages }) {
  const { text, codes } = messages
  const [state, action, pending] = useActionState(signIn, {})
  // React resets a form after its action runs; keep the email so a wrong
  // password only needs the password typed again.
  const [email, setEmail] = useState("")
  return (
    <form
      action={action}
      // Medusa UI outlines an empty required field in red before anyone has
      // typed; the last two rules keep the red for fields the person has left
      // invalid.
      className="flex flex-col gap-y-4 [&_button]:min-h-11 [&_input:invalid:not(:user-invalid):focus-visible]:!shadow-borders-interactive-with-active [&_input:invalid:not(:user-invalid):not(:focus-visible)]:!shadow-borders-base [&_input]:min-h-11 [&_input]:text-base"
    >
      {state.error && (
        <Alert variant="error" role="alert">
          {state.error === "staff_access_revoked"
            ? accessEndedMessage(messages, state.restaurant_name)
            : codes[state.error]}
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
      <Button
        type="submit"
        isLoading={pending}
        className="w-full transition-[background-color,box-shadow,transform] duration-150 ease-out-strong motion-safe:active:scale-[0.97]"
      >
        {text.sign_in}
      </Button>
    </form>
  )
}
