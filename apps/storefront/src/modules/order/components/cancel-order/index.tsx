"use client"

import { useEffect, useId, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  CUSTOMER_ORDER_DETAIL_TEXT,
  formatText,
  type CustomerCancelErrorCode,
  type Locale,
} from "@dtc/i18n"
import { cancelOrder, type OrderProgress } from "@lib/data/orders"
import { Button } from "@modules/common/components/ui"

/**
 * The owning Customer's Cancel action before Restaurant acceptance (#145).
 * It is offered only while the backend lists `cancel`, and the backend still
 * decides on receipt: past the deadline the Order gets the timeout outcome,
 * after acceptance the Customer is sent to MTOGO. The first press only asks
 * for confirmation; while the request is pending both buttons are disabled,
 * so a double tap sends one request. Every outcome re-reads the page, so it
 * then shows the recorded cancellation and refund rather than a guess.
 */
export default function CancelOrder({
  progress,
  orderNumber,
  locale,
}: {
  progress: OrderProgress
  orderNumber: number
  locale: Locale
}) {
  const text = CUSTOMER_ORDER_DETAIL_TEXT[locale]
  const router = useRouter()
  const ids = useId()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<CustomerCancelErrorCode>()
  const [cancelled, setCancelled] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  const confirm = useRef<HTMLButtonElement>(null)
  const notice = useRef<HTMLDivElement>(null)
  const canCancel = progress.available_actions.includes("cancel")

  useEffect(() => {
    if (open) confirm.current?.focus()
  }, [open])
  useEffect(() => {
    if (error || cancelled) notice.current?.focus()
  }, [error, cancelled])

  if (!canCancel && !error && !cancelled) return null

  const close = () => {
    setOpen(false)
    // Back to the button that opened the confirmation.
    requestAnimationFrame(() => opener.current?.focus())
  }
  const submit = () =>
    startTransition(async () => {
      setError(undefined)
      const result = await cancelOrder(progress.order_id).catch(() => ({
        ok: false as const,
        error: "unknown_error" as const,
      }))
      if (result.ok) setCancelled(true)
      else setError(result.error)
      setOpen(false)
      router.refresh()
    })

  return (
    <section
      aria-labelledby={`${ids}-heading`}
      className="rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card p-5 sm:p-6"
      data-testid="cancel-order"
    >
      {canCancel && (
        <>
          <h2 id={`${ids}-heading`} className="text-lg font-semibold">
            {text.cancel_heading}
          </h2>
          <p className="mt-2 max-w-prose text-sm leading-6 text-mtogo-text-secondary">
            {text.cancel_intro}
          </p>
        </>
      )}
      {canCancel && !open && (
        <Button
          ref={opener}
          type="button"
          variant="secondary"
          onClick={() => setOpen(true)}
          className="mt-4 w-full sm:w-auto"
          data-testid="cancel-order-button"
        >
          {text.cancel}
        </Button>
      )}
      {canCancel && open && (
        <form
          aria-labelledby={`${ids}-question`}
          className="mt-4 rounded-lg border border-mtogo-border-control bg-mtogo-surface-page p-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!pending) submit()
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !pending) close()
          }}
        >
          <p
            id={`${ids}-question`}
            className="max-w-prose text-sm font-medium leading-6 [overflow-wrap:anywhere]"
          >
            {formatText(text.cancel_question, { number: orderNumber })}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              ref={confirm}
              type="submit"
              isLoading={pending}
              className="w-full sm:w-auto"
              data-testid="cancel-order-confirm"
            >
              {pending ? text.cancelling : text.cancel_confirm}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={close}
              className="w-full sm:w-auto"
            >
              {text.cancel_keep}
            </Button>
          </div>
        </form>
      )}
      {(cancelled || error) && (
        <div
          ref={notice}
          tabIndex={-1}
          role={error ? "alert" : "status"}
          // The heading above is gone once the Order is no longer cancellable.
          id={canCancel ? undefined : `${ids}-heading`}
          className={`max-w-prose rounded-lg p-4 text-sm leading-6 [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2 ${
            canCancel ? "mt-4" : ""
          } ${
            error
              ? "bg-mtogo-status-error-surface text-mtogo-status-error-text"
              : "bg-mtogo-status-success-surface text-mtogo-status-success-text"
          }`}
          data-testid="cancel-order-notice"
        >
          {error
            ? formatText(text[`cancel_refused_${error}`], {
                number: orderNumber,
              })
            : text.cancelled_notice}
        </div>
      )}
    </section>
  )
}
