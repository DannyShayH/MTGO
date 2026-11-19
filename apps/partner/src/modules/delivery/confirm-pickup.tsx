"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Alert, Button } from "@medusajs/ui"
import {
  DELIVERY_PICKUP_ERRORS,
  formatText,
  type DeliveryPickupErrorCode,
  type Locale,
} from "@dtc/i18n"
import { checkPickup, confirmPickup } from "@lib/data/delivery-agent"
import { PRESSABLE, type DeliveryCopy as Copy } from "./copy"
import { SETTLED_AFTER_MS, useStatusChecks } from "./use-status-checks"

type State =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "pending" }
  | { kind: "checking" }
  | { kind: "not_confirmed" }
  | { kind: "refused"; code: DeliveryPickupErrorCode }

const ACTION = `focus-visible:ring-mtogo-focus-ring min-h-12 w-full text-base focus-visible:ring-2 focus-visible:ring-offset-2 ${PRESSABLE}`

/**
 * Confirms collecting ready food (#160; spec #48 stories 33-35). The first
 * tap only asks; the agent then confirms holding the food, and only then is
 * pickup sent. The retry identity is fixed for the card, so a double tap or
 * a retry after a lost response keeps the original pickup time. Without a
 * server answer it shows Checking status and reconciles from the current
 * delivery; nothing shows as collected until the server says so.
 */
export function ConfirmPickup({
  orderId,
  restaurantName,
  retryIdentity,
  locale,
  copy,
}: {
  orderId: string
  restaurantName: string
  retryIdentity: string
  locale: Locale
  copy: Copy
}) {
  const router = useRouter()
  // A background refresh renders a new prop; a retry must reuse the first.
  const [identity] = useState(retryIdentity)
  const [state, setState] = useState<State>({ kind: "idle" })
  const message = useRef<HTMLDivElement>(null)
  const question = useRef<HTMLHeadingElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const sentAt = useRef(0)

  const check = useCallback(async () => {
    const result = await checkPickup(orderId).catch(() => "uncertain" as const)
    if (result === "picked_up") {
      router.refresh()
      return result
    }
    if (
      result === "uncertain" ||
      Date.now() - sentAt.current < SETTLED_AFTER_MS
    )
      return "uncertain"
    setState({ kind: "not_confirmed" })
    router.refresh()
    return result
  }, [orderId, router])

  useStatusChecks(state.kind === "checking", check)

  useEffect(() => {
    if (state.kind === "confirming") question.current?.focus()
    else if (state.kind !== "idle" && state.kind !== "pending")
      message.current?.focus()
  }, [state.kind])

  const send = async () => {
    setState({ kind: "pending" })
    sentAt.current = Date.now()
    const result = await confirmPickup(orderId, identity).catch(() => ({
      status: "uncertain" as const,
    }))
    if (result.status === "picked_up") return router.refresh()
    if (result.status === "refused") {
      setState({ kind: "refused", code: result.code })
      router.refresh()
      return
    }
    setState({ kind: "checking" })
  }

  const notYet = () => {
    setState({ kind: "idle" })
    requestAnimationFrame(() => opener.current?.focus())
  }

  if (state.kind === "confirming" || state.kind === "pending")
    return (
      <section
        aria-labelledby="pickup-question"
        aria-describedby="pickup-question-hint"
        className="bg-mtogo-surface-selected flex flex-col gap-3 rounded-lg p-4"
      >
        <h4
          id="pickup-question"
          ref={question}
          tabIndex={-1}
          className="text-mtogo-text-primary rounded text-base font-semibold"
        >
          {copy.confirmPickupTitle}
        </h4>
        <p
          id="pickup-question-hint"
          className="text-mtogo-text-secondary break-words text-sm"
        >
          {formatText(copy.confirmPickupHint, { restaurant: restaurantName })}
        </p>
        <Button
          type="button"
          size="large"
          onClick={send}
          disabled={state.kind === "pending"}
          isLoading={state.kind === "pending"}
          className={ACTION}
        >
          {state.kind === "pending"
            ? copy.confirmingPickup
            : copy.confirmCollected}
        </Button>
        <Button
          type="button"
          size="large"
          variant="secondary"
          onClick={notYet}
          disabled={state.kind === "pending"}
          className={ACTION}
        >
          {copy.notYet}
        </Button>
      </section>
    )

  return (
    <div className="flex flex-col gap-2">
      {state.kind === "checking" && (
        <div ref={message} tabIndex={-1} role="status" className="rounded">
          <Alert variant="warning">
            <span className="flex flex-col gap-1">
              <span>{copy.checking}</span>
              <span className="text-ui-fg-subtle">
                {copy.pickupCheckingHint}
              </span>
            </span>
          </Alert>
        </div>
      )}
      {state.kind === "not_confirmed" && (
        <div ref={message} tabIndex={-1} role="status" className="rounded">
          <Alert variant="info">{copy.pickupNotConfirmed}</Alert>
        </div>
      )}
      {state.kind === "refused" && (
        <div ref={message} tabIndex={-1} className="rounded">
          <Alert variant="error" role="alert">
            {DELIVERY_PICKUP_ERRORS[locale][state.code]}
          </Alert>
        </div>
      )}
      {/* After a refusal the server's refreshed view decides whether pickup is still offered. */}
      <Button
        ref={opener}
        type="button"
        size="large"
        onClick={() => setState({ kind: "confirming" })}
        disabled={state.kind === "checking"}
        className={ACTION}
      >
        {state.kind === "checking" ? copy.checking : copy.confirmPickup}
      </Button>
    </div>
  )
}
