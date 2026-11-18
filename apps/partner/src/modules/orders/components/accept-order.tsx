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
import { acceptOrder } from "@lib/data/order-actions"
import type { RestaurantOrder } from "@lib/data/orders"

/**
 * The status-specific primary action for an awaiting Order (#142). It is only
 * offered when the backend listed `accept`, but the backend still decides at
 * the moment it receives the request. While a request is pending the button
 * is disabled, so a double tap sends one request; every outcome re-reads the
 * Order, so a refusal shows the current state next to its reason.
 */
export function AcceptOrder({
  order,
  locale,
}: {
  order: RestaurantOrder
  locale: Locale
}) {
  const text = ORDER_TEXT[locale]
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<OrderActionErrorCode>()
  const [isAccepted, setIsAccepted] = useState(false)
  const notice = useRef<HTMLDivElement>(null)
  const canAccept = order.available_actions.includes("accept")

  // The button leaves the page once the Order is accepted or refused; keep
  // keyboard focus on the outcome instead of losing it to the document.
  // The success notice appears only once the refresh has removed the button,
  // so focus follows `canAccept` as well as the outcome.
  useEffect(() => {
    if (error || (isAccepted && !canAccept)) notice.current?.focus()
  }, [error, isAccepted, canAccept])

  if (!canAccept && !error && !isAccepted) return null

  const accept = () =>
    startTransition(async () => {
      setError(undefined)
      const result = await acceptOrder(order.id).catch(() => ({
        error: "unknown_error" as const,
        order: undefined,
      }))
      if (result.error) setError(result.error)
      else setIsAccepted(true)
      router.refresh()
    })

  return (
    <div className="flex flex-col gap-y-3">
      {canAccept && (
        <div className="flex flex-col gap-y-2">
          <Button
            type="button"
            size="large"
            onClick={accept}
            disabled={pending}
            isLoading={pending}
            aria-describedby="accept-hint"
            className="focus-visible:ring-mtogo-focus-ring min-h-12 w-full focus-visible:ring-2 focus-visible:ring-offset-2 sm:w-auto sm:self-start"
          >
            {pending ? text.accepting : text.accept}
          </Button>
          <Text
            id="accept-hint"
            size="small"
            className="text-ui-fg-subtle max-w-prose"
          >
            {text.accept_hint}
          </Text>
        </div>
      )}
      {isAccepted && !canAccept && (
        <div
          ref={notice}
          tabIndex={-1}
          role="status"
          className="focus-visible:ring-mtogo-focus-ring rounded focus-visible:outline-none focus-visible:ring-2"
        >
          <Alert variant="success">
            {formatText(text.accepted_notice, { number: order.display_id })}
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
              <span className="text-ui-fg-subtle">{text.refreshed_hint}</span>
            </span>
          </Alert>
        </div>
      )}
    </div>
  )
}
