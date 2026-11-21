"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Alert, Button } from "@medusajs/ui"
import { DELIVERY_CONTACT_ATTEMPT_ERRORS, type Locale } from "@dtc/i18n"
import { recordContactAttempt } from "@lib/data/delivery-agent"
import { PRESSABLE, type DeliveryCopy as Copy } from "./copy"

type State =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "recorded" }
  | { kind: "uncertain" }
  | { kind: "refused"; message: string }

/**
 * Records one attempt to reach the Customer after arrival (#164; spec #48
 * story 37). Opening the dialer records nothing: the agent taps this after
 * each try, and the attempt claims no outcome. Each attempt has its own
 * retry identity, kept until the server answers, so retrying an uncertain
 * attempt never counts it twice; the next attempt gets a new one.
 */
export function RecordContactAttempt({
  orderId,
  locale,
  copy,
}: {
  orderId: string
  locale: Locale
  copy: Copy
}) {
  const router = useRouter()
  const [state, setState] = useState<State>({ kind: "idle" })
  // The identity of the attempt whose outcome is not yet known.
  const unsettled = useRef<string | null>(null)
  const message = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (state.kind !== "idle" && state.kind !== "pending")
      message.current?.focus()
  }, [state.kind])

  const send = async () => {
    const identity = unsettled.current ?? crypto.randomUUID()
    unsettled.current = identity
    setState({ kind: "pending" })
    const result = await recordContactAttempt(orderId, identity).catch(
      () => ({ status: "uncertain" }) as const,
    )
    if (result.status === "uncertain") {
      setState({ kind: "uncertain" })
      return
    }
    unsettled.current = null
    setState(
      result.status === "recorded"
        ? { kind: "recorded" }
        : {
            kind: "refused",
            message: DELIVERY_CONTACT_ATTEMPT_ERRORS[locale][result.code],
          },
    )
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-2">
      <p
        id="contact-attempt-hint"
        className="text-mtogo-text-secondary break-words text-sm"
      >
        {copy.recordContactAttemptHint}
      </p>
      {state.kind === "recorded" && (
        <div ref={message} tabIndex={-1} role="status" className="rounded">
          <Alert variant="success">{copy.contactAttemptRecorded}</Alert>
        </div>
      )}
      {state.kind === "uncertain" && (
        <div ref={message} tabIndex={-1} role="status" className="rounded">
          <Alert variant="warning">{copy.contactAttemptChecking}</Alert>
        </div>
      )}
      {state.kind === "refused" && (
        <div ref={message} tabIndex={-1} className="rounded">
          <Alert variant="error" role="alert">
            {state.message}
          </Alert>
        </div>
      )}
      <Button
        type="button"
        size="large"
        variant="secondary"
        aria-describedby="contact-attempt-hint"
        onClick={send}
        disabled={state.kind === "pending"}
        isLoading={state.kind === "pending"}
        className={`focus-visible:ring-mtogo-focus-ring min-h-12 w-full whitespace-normal text-base focus-visible:ring-2 focus-visible:ring-offset-2 ${PRESSABLE}`}
      >
        {state.kind === "pending"
          ? copy.recordingContactAttempt
          : copy.recordContactAttempt}
      </Button>
    </div>
  )
}
