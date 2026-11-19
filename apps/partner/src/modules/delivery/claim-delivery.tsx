"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Alert, Button } from "@medusajs/ui"
import {
  DELIVERY_CLAIM_ERRORS,
  type DeliveryClaimErrorCode,
  type Locale,
} from "@dtc/i18n"
import { checkDeliveryClaim, claimDelivery } from "@lib/data/delivery-agent"
import { CLAIM_HINT_ID, PRESSABLE, type DeliveryCopy as Copy } from "./copy"
import { SETTLED_AFTER_MS, useStatusChecks } from "./use-status-checks"

type State =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "checking" }
  | { kind: "not_confirmed" }
  | { kind: "refused"; code: DeliveryClaimErrorCode }

/**
 * Claims one available delivery (#157). The retry identity is fixed for this
 * card, so a second tap or a retry after a lost response recovers the
 * original claim. A claim without a server answer shows Checking status and
 * is reconciled from the current delivery: on a timer with backoff, when the
 * page becomes visible again (after a call or screen lock) and when the
 * browser comes back online. Nothing is shown as claimed until the server
 * says so.
 */
export function ClaimDelivery({
  orderId,
  retryIdentity,
  locale,
  copy,
}: {
  orderId: string
  retryIdentity: string
  locale: Locale
  copy: Copy
}) {
  const router = useRouter()
  // Kept for the card's lifetime: a background refresh renders a new prop,
  // but a retry must reuse the identity of the claim already sent.
  const [identity] = useState(retryIdentity)
  const [state, setState] = useState<State>({ kind: "idle" })
  const message = useRef<HTMLDivElement>(null)
  const sentAt = useRef(0)

  const claimed = useCallback(() => {
    router.push("/delivery#current")
    router.refresh()
  }, [router])

  const check = useCallback(async () => {
    const result = await checkDeliveryClaim(orderId).catch(
      () => "uncertain" as const,
    )
    if (result === "claimed") {
      claimed()
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
  }, [orderId, claimed, router])

  useStatusChecks(state.kind === "checking", check)

  useEffect(() => {
    if (state.kind !== "idle" && state.kind !== "pending")
      message.current?.focus()
  }, [state.kind])

  const claim = async () => {
    setState({ kind: "pending" })
    sentAt.current = Date.now()
    const result = await claimDelivery(orderId, identity).catch(() => ({
      status: "uncertain" as const,
    }))
    if (result.status === "claimed") return claimed()
    if (result.status === "refused") {
      setState({ kind: "refused", code: result.code })
      router.refresh()
      return
    }
    setState({ kind: "checking" })
  }

  const busy = state.kind === "pending" || state.kind === "checking"
  return (
    <div className="flex flex-col gap-2">
      {state.kind === "checking" && (
        <div ref={message} tabIndex={-1} role="status" className="rounded">
          <Alert variant="warning">
            <span className="flex flex-col gap-1">
              <span>{copy.checking}</span>
              <span className="text-ui-fg-subtle">{copy.checkingHint}</span>
            </span>
          </Alert>
        </div>
      )}
      {state.kind === "not_confirmed" && (
        <div ref={message} tabIndex={-1} role="status" className="rounded">
          <Alert variant="info">{copy.notConfirmed}</Alert>
        </div>
      )}
      {state.kind === "refused" && (
        <div ref={message} tabIndex={-1} className="rounded">
          <Alert variant="error" role="alert">
            {DELIVERY_CLAIM_ERRORS[locale][state.code]}
          </Alert>
        </div>
      )}
      {state.kind !== "refused" && (
        <>
          <Button
            type="button"
            size="large"
            onClick={claim}
            disabled={busy}
            isLoading={state.kind === "pending"}
            aria-describedby={CLAIM_HINT_ID}
            className={`focus-visible:ring-mtogo-focus-ring min-h-12 w-full text-base focus-visible:ring-2 focus-visible:ring-offset-2 ${PRESSABLE}`}
          >
            {state.kind === "pending"
              ? copy.claiming
              : state.kind === "checking"
                ? copy.checking
                : copy.claim}
          </Button>
        </>
      )}
    </div>
  )
}
