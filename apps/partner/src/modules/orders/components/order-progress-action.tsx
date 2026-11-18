"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  formatText,
  ORDER_ACTION_ERRORS,
  ORDER_TEXT,
  type Locale,
  type OrderActionErrorCode,
} from "@dtc/i18n"
import { Alert, Button, Text } from "@medusajs/ui"
import { runOrderAction } from "@lib/data/order-actions"
import type { MilestoneAction, RestaurantOrder } from "@lib/data/orders"

type ActionText = {
  label: string
  pending: string
  hint: string
  notice: string
}

const actionText = (locale: Locale): Record<MilestoneAction, ActionText> => {
  const text = ORDER_TEXT[locale]
  return {
    accept: {
      label: text.accept,
      pending: text.accepting,
      hint: text.accept_hint,
      notice: text.accepted_notice,
    },
    start_preparation: {
      label: text.start_preparation,
      pending: text.starting_preparation,
      hint: text.start_preparation_hint,
      notice: text.preparation_started_notice,
    },
    ready: {
      label: text.ready,
      pending: text.marking_ready,
      hint: text.ready_hint,
      notice: text.ready_notice,
    },
  }
}

/**
 * The one obvious next kitchen step for an Order (#142, #146): Accept, Start
 * preparing or Ready for pickup. It is only offered when the backend listed
 * it, but the backend still decides at the moment it receives the request.
 * While a request is pending the button is disabled, so a double tap sends
 * one request; every outcome re-reads the Order, so a refusal shows the
 * current state next to its reason. Nothing here undoes a recorded step.
 */
export function OrderProgressAction({
  order,
  locale,
}: {
  order: RestaurantOrder
  locale: Locale
}) {
  const texts = actionText(locale)
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<OrderActionErrorCode>()
  const [done, setDone] = useState<MilestoneAction>()
  const notice = useRef<HTMLDivElement>(null)
  // Reject has its own confirmation (#143); this offers the next milestone.
  const next = order.available_actions.find(
    (action): action is MilestoneAction => action !== "reject",
  )
  // The success notice appears once the refresh no longer offers the step
  // just recorded, so it never sits next to that same step's button.
  const recorded = done && done !== next ? done : undefined

  // The button changes or leaves once a step is recorded or refused; keep
  // keyboard focus on the outcome instead of losing it to the document. The
  // next step's button follows the notice, so Tab reaches it from there.
  useEffect(() => {
    if (error || recorded) notice.current?.focus()
  }, [error, recorded])

  if (!next && !error && !recorded) return null

  const run = (action: MilestoneAction) =>
    startTransition(async () => {
      setError(undefined)
      setDone(undefined)
      const result = await runOrderAction(order.id, action).catch(() => ({
        error: "unknown_error" as const,
        order: undefined,
      }))
      if (result.error) setError(result.error)
      else setDone(action)
      router.refresh()
    })

  return (
    <div className="flex flex-col gap-y-3">
      {recorded && (
        <div
          ref={notice}
          tabIndex={-1}
          role="status"
          className="focus-visible:ring-mtogo-focus-ring rounded focus-visible:outline-none focus-visible:ring-2"
        >
          <Alert variant="success">
            {formatText(texts[recorded].notice, { number: order.display_id })}
          </Alert>
        </div>
      )}
      {error && (
        <div
          ref={notice}
          tabIndex={-1}
          className="focus-visible:ring-mtogo-focus-ring rounded focus-visible:outline-none focus-visible:ring-2"
        >
          <Alert variant="error" role="alert">
            <span className="flex flex-col gap-y-1">
              <span>{ORDER_ACTION_ERRORS[locale][error]}</span>
              <span className="text-ui-fg-subtle">
                {ORDER_TEXT[locale].refreshed_hint}
              </span>
            </span>
          </Alert>
        </div>
      )}
      {next && (
        <div className="flex flex-col gap-y-2">
          <Button
            type="button"
            size="large"
            onClick={() => run(next)}
            disabled={pending}
            isLoading={pending}
            aria-describedby="order-action-hint"
            className="focus-visible:ring-mtogo-focus-ring min-h-12 w-full focus-visible:ring-2 focus-visible:ring-offset-2 sm:w-auto sm:self-start"
          >
            {pending ? texts[next].pending : texts[next].label}
          </Button>
          <Text
            id="order-action-hint"
            size="small"
            className="text-ui-fg-subtle max-w-prose"
          >
            {texts[next].hint}
          </Text>
        </div>
      )}
    </div>
  )
}
