"use client"

import { useEffect, useId, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  formatText,
  ORDER_ACTION_ERRORS,
  ORDER_TEXT,
  type Locale,
  type OrderActionErrorCode,
} from "@dtc/i18n"
import { Alert, Button, Label, Text, Textarea } from "@medusajs/ui"
import { rejectOrder } from "@lib/data/order-actions"
import type { RestaurantOrder } from "@lib/data/orders"

/** The longest optional reason the backend accepts (its shared reason bound). */
const REJECTION_REASON_MAX_LENGTH = 1000

const FOCUS_RING =
  "focus-visible:ring-mtogo-focus-ring focus-visible:ring-2 focus-visible:ring-offset-2"

/**
 * Declining an awaiting Order (#143), kept apart from Accept: the first
 * press only opens a confirmation with an optional reason, so rejection is
 * never one slip away from preparation progress. It is offered only while
 * the backend lists `reject`, and the backend still decides on receipt:
 * past the deadline the Order gets the timeout outcome instead. While the
 * request is pending both buttons are disabled, so a double tap sends one
 * request, and every outcome re-reads the Order.
 */
export function RejectOrder({
  order,
  locale,
}: {
  order: RestaurantOrder
  locale: Locale
}) {
  const text = ORDER_TEXT[locale]
  const router = useRouter()
  const ids = useId()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [error, setError] = useState<OrderActionErrorCode>()
  const [isRejected, setIsRejected] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const notice = useRef<HTMLDivElement>(null)
  const canReject = order.available_actions.includes("reject")

  useEffect(() => {
    if (open) field.current?.focus()
  }, [open])
  useEffect(() => {
    if (error || (isRejected && !canReject)) notice.current?.focus()
  }, [error, isRejected, canReject])

  if (!canReject && !error && !isRejected) return null

  const close = () => {
    setOpen(false)
    // Back to the button that opened the confirmation.
    requestAnimationFrame(() => opener.current?.focus())
  }
  const submit = () =>
    startTransition(async () => {
      setError(undefined)
      const result = await rejectOrder(order.id, reason).catch(() => ({
        error: "unknown_error" as const,
        order: undefined,
      }))
      if (result.error) setError(result.error)
      else setIsRejected(true)
      setOpen(false)
      router.refresh()
    })

  return (
    <div className="flex flex-col gap-y-3">
      {canReject && !open && (
        <Button
          ref={opener}
          type="button"
          variant="secondary"
          size="large"
          onClick={() => setOpen(true)}
          className={`${FOCUS_RING} min-h-12 w-full sm:w-auto sm:self-start`}
        >
          {text.reject}
        </Button>
      )}
      {canReject && open && (
        <form
          aria-labelledby={`${ids}-title`}
          className="border-ui-border-error bg-ui-bg-subtle flex flex-col gap-y-3 rounded-lg border p-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!pending) submit()
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !pending) close()
          }}
        >
          <Text id={`${ids}-title`} weight="plus">
            {text.reject}
          </Text>
          <Text size="small" className="text-ui-fg-subtle max-w-prose">
            {text.reject_intro}
          </Text>
          <div className="flex flex-col gap-y-1">
            <Label htmlFor={`${ids}-reason`} size="small" weight="plus">
              {text.reject_reason}
            </Label>
            <Textarea
              ref={field}
              id={`${ids}-reason`}
              value={reason}
              maxLength={REJECTION_REASON_MAX_LENGTH}
              rows={3}
              disabled={pending}
              onChange={(event) => setReason(event.target.value)}
              aria-describedby={`${ids}-hint ${ids}-count`}
              className="break-words"
            />
            <div className="flex flex-wrap justify-between gap-x-4">
              <Text
                id={`${ids}-hint`}
                size="small"
                className="text-ui-fg-subtle"
              >
                {text.reject_reason_hint}
              </Text>
              <Text
                id={`${ids}-count`}
                size="small"
                className="text-ui-fg-muted tabular-nums"
              >
                {formatText(text.reject_reason_count, {
                  count: reason.length,
                  max: REJECTION_REASON_MAX_LENGTH,
                })}
              </Text>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="submit"
              variant="danger"
              size="large"
              disabled={pending}
              isLoading={pending}
              className={`${FOCUS_RING} min-h-12 w-full sm:w-auto`}
            >
              {pending ? text.rejecting : text.reject_confirm}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="large"
              disabled={pending}
              onClick={close}
              className={`${FOCUS_RING} min-h-12 w-full sm:w-auto`}
            >
              {text.reject_keep}
            </Button>
          </div>
        </form>
      )}
      {isRejected && !canReject && (
        <div
          ref={notice}
          tabIndex={-1}
          role="status"
          className="focus-visible:ring-mtogo-focus-ring rounded focus-visible:outline-none focus-visible:ring-2"
        >
          <Alert variant="success">
            {formatText(text.rejected_notice, { number: order.display_id })}
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
              <span>
                {error === "unknown_error"
                  ? text.reject_unknown
                  : ORDER_ACTION_ERRORS[locale][error]}
              </span>
              <span className="text-ui-fg-subtle">{text.refreshed_hint}</span>
            </span>
          </Alert>
        </div>
      )}
    </div>
  )
}
