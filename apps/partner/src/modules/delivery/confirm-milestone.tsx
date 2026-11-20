"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Alert, Button } from "@medusajs/ui"
import {
  DELIVERY_HANDOVER_ERRORS,
  DELIVERY_PICKUP_ERRORS,
  formatText,
  type Locale,
} from "@dtc/i18n"
import {
  checkHandover,
  checkPickup,
  confirmHandover,
  confirmPickup,
} from "@lib/data/delivery-agent"
import { PRESSABLE, type DeliveryCopy as Copy } from "./copy"
import { SETTLED_AFTER_MS, useStatusChecks } from "./use-status-checks"

export type Milestone = "pickup" | "handover"

type State =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "pending" }
  | { kind: "checking" }
  | { kind: "not_confirmed" }
  | { kind: "refused"; message: string }

const ACTION = `focus-visible:ring-mtogo-focus-ring min-h-12 w-full text-base focus-visible:ring-2 focus-visible:ring-offset-2 ${PRESSABLE}`

type Outcome =
  { status: "done" | "uncertain" } | { status: "refused"; message: string }

/** The server actions of each confirmation, in one shape. */
const ACTIONS: Record<
  Milestone,
  {
    send: (
      orderId: string,
      identity: string,
      locale: Locale,
    ) => Promise<Outcome>
    check: (orderId: string) => Promise<"done" | "uncertain" | "not_done">
  }
> = {
  pickup: {
    send: async (orderId, identity, locale) => {
      const result = await confirmPickup(orderId, identity)
      if (result.status === "refused")
        return {
          status: "refused",
          message: DELIVERY_PICKUP_ERRORS[locale][result.code],
        }
      return { status: result.status === "picked_up" ? "done" : "uncertain" }
    },
    check: async (orderId) => {
      const result = await checkPickup(orderId)
      return result === "picked_up"
        ? "done"
        : result === "uncertain"
          ? "uncertain"
          : "not_done"
    },
  },
  handover: {
    send: async (orderId, identity, locale) => {
      const result = await confirmHandover(orderId, identity)
      if (result.status === "refused")
        return {
          status: "refused",
          message: DELIVERY_HANDOVER_ERRORS[locale][result.code],
        }
      return { status: result.status === "delivered" ? "done" : "uncertain" }
    },
    check: async (orderId) => {
      const result = await checkHandover(orderId)
      return result === "delivered"
        ? "done"
        : result === "uncertain"
          ? "uncertain"
          : "not_done"
    },
  },
}

/** The texts of each confirmation. */
function textsOf(milestone: Milestone, copy: Copy, restaurantName: string) {
  return milestone === "pickup"
    ? {
        open: copy.confirmPickup,
        title: copy.confirmPickupTitle,
        hint: formatText(copy.confirmPickupHint, {
          restaurant: restaurantName,
        }),
        confirm: copy.confirmCollected,
        pending: copy.confirmingPickup,
        checkingHint: copy.pickupCheckingHint,
        notConfirmed: copy.pickupNotConfirmed,
      }
    : {
        open: copy.confirmHandover,
        title: copy.confirmHandoverTitle,
        hint: copy.confirmHandoverHint,
        confirm: copy.confirmDelivered,
        pending: copy.confirmingHandover,
        checkingHint: copy.handoverCheckingHint,
        notConfirmed: copy.handoverNotConfirmed,
      }
}

/**
 * Confirms a delivery milestone the agent alone can witness: collecting
 * ready food (#160; spec #48 stories 33-35) or handing it over to the
 * Customer or their designated recipient (#161; stories 39, 40). The first
 * tap only asks; the agent then confirms, and only then is the milestone
 * sent. The retry identity is fixed for the card, so a double tap or a
 * retry after a lost response keeps the original time. Without a server
 * answer it shows Checking status and reconciles from the server's view;
 * nothing shows as recorded until the server says so. A recorded handover
 * leaves the current delivery, so `donePath` says where the agent goes.
 */
export function ConfirmMilestone({
  milestone,
  orderId,
  restaurantName,
  retryIdentity,
  locale,
  copy,
  donePath,
}: {
  milestone: Milestone
  orderId: string
  restaurantName: string
  retryIdentity: string
  locale: Locale
  copy: Copy
  /** Where to go once recorded; by default the refreshed current view. */
  donePath?: string
}) {
  const router = useRouter()
  // A background refresh renders a new prop; a retry must reuse the first.
  const [identity] = useState(retryIdentity)
  const [state, setState] = useState<State>({ kind: "idle" })
  const message = useRef<HTMLDivElement>(null)
  const question = useRef<HTMLHeadingElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const sentAt = useRef(0)
  const text = textsOf(milestone, copy, restaurantName)
  const questionId = `${milestone}-question`

  const done = useCallback(() => {
    if (donePath) router.replace(donePath)
    else router.refresh()
  }, [donePath, router])

  const check = useCallback(async () => {
    const result = await ACTIONS[milestone]
      .check(orderId)
      .catch(() => "uncertain" as const)
    if (result === "done") {
      done()
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
  }, [orderId, milestone, done, router])

  useStatusChecks(state.kind === "checking", check)

  useEffect(() => {
    if (state.kind === "confirming") question.current?.focus()
    else if (state.kind !== "idle" && state.kind !== "pending")
      message.current?.focus()
  }, [state.kind])

  const send = async () => {
    setState({ kind: "pending" })
    sentAt.current = Date.now()
    const result = await ACTIONS[milestone]
      .send(orderId, identity, locale)
      .catch((): Outcome => ({ status: "uncertain" }))
    if (result.status === "done") return done()
    if (result.status === "refused") {
      setState({ kind: "refused", message: result.message })
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
        aria-labelledby={questionId}
        aria-describedby={`${questionId}-hint`}
        className="bg-mtogo-surface-selected flex flex-col gap-3 rounded-lg p-4"
      >
        <h4
          id={questionId}
          ref={question}
          tabIndex={-1}
          className="text-mtogo-text-primary rounded text-base font-semibold"
        >
          {text.title}
        </h4>
        <p
          id={`${questionId}-hint`}
          className="text-mtogo-text-secondary break-words text-sm"
        >
          {text.hint}
        </p>
        <Button
          type="button"
          size="large"
          onClick={send}
          disabled={state.kind === "pending"}
          isLoading={state.kind === "pending"}
          className={ACTION}
        >
          {state.kind === "pending" ? text.pending : text.confirm}
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
              <span className="text-ui-fg-subtle">{text.checkingHint}</span>
            </span>
          </Alert>
        </div>
      )}
      {state.kind === "not_confirmed" && (
        <div ref={message} tabIndex={-1} role="status" className="rounded">
          <Alert variant="info">{text.notConfirmed}</Alert>
        </div>
      )}
      {state.kind === "refused" && (
        <div ref={message} tabIndex={-1} className="rounded">
          <Alert variant="error" role="alert">
            {state.message}
          </Alert>
        </div>
      )}
      {/* After a refusal the server's refreshed view decides whether the action is still offered. */}
      <Button
        ref={opener}
        type="button"
        size="large"
        onClick={() => setState({ kind: "confirming" })}
        disabled={state.kind === "checking"}
        className={ACTION}
      >
        {state.kind === "checking" ? copy.checking : text.open}
      </Button>
    </div>
  )
}
