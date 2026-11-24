"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import {
  CUSTOMER_ORDER_DETAIL_TEXT,
  CUSTOMER_AUTH,
  foodProgressSteps,
  formatOrderTime,
  formatText,
  type FoodStep,
  type Locale,
} from "@dtc/i18n"
import { ArrowPath, CheckCircleSolid, XCircleSolid } from "@medusajs/icons"
import {
  readOrderProgress,
  type OrderProgress,
  type OrderProgressRead,
} from "@lib/data/orders"
import CancelOrder from "@modules/order/components/cancel-order"
import OrderCancellation from "@modules/order/components/order-cancellation"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { usePathname } from "next/navigation"

/** Automatic refresh while the page is visible; doubled per repeated failure. */
const POLL_MS = 15_000
const MAX_BACKOFF_MS = 120_000
/** About ten minutes at the base rate, then only on return or request. */
const MAX_AUTOMATIC_READS = 40
/** Returning sooner than this after a read does not read again. */
const RETURN_THROTTLE_MS = 5_000

/** A successful read: the progress and the server's time of reading it. */
type ConfirmedProgress = { progress: OrderProgress; server_time: string }

/** Nothing more can happen to the food or the refund on this page. */
const isSettled = ({ state, refund }: OrderProgress) =>
  state === "ready" || (state === "cancelled" && refund?.status === "succeeded")

/** Keep the later of two reads, so a slow older read never undoes a newer one. */
const later = (
  current: ConfirmedProgress | null,
  next: ConfirmedProgress,
): ConfirmedProgress =>
  current && Date.parse(current.server_time) > Date.parse(next.server_time)
    ? current
    : next

/**
 * The Customer's Order timeline of food progress (#147) and the outcome
 * panels that share its progress read. It renders only recorded facts,
 * refreshes them with bounded polling while the page is visible, again on
 * returning to it, and adopts the server's re-read after an action such as
 * cancelling. A failed refresh keeps the last progress and says how old it
 * is; a refused one (signed out, no longer the Customer's) stops refreshing.
 */
export default function OrderProgressPanel({
  orderId,
  orderNumber,
  initial,
  locale,
}: {
  orderId: string
  orderNumber: number
  initial: OrderProgressRead
  locale: Locale
}) {
  const [confirmed, setConfirmed] = useState<ConfirmedProgress | null>(
    initial.state === "success" ? initial : null,
  )
  const [failures, setFailures] = useState(initial.state === "failed" ? 1 : 0)
  const [isRefused, setIsRefused] = useState(initial.state === "not_found")
  const [isBusy, setIsBusy] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [pollTick, setPollTick] = useState(0)
  const [isLive, setIsLive] = useState(false)
  const [adoptedRead, setAdoptedRead] = useState(initial)
  const isReading = useRef(false)
  const automaticReads = useRef(0)
  const lastReadAt = useRef(0)

  // The page re-rendered on the server (after an action): adopt its read
  // and restart polling from it.
  if (adoptedRead !== initial) {
    setAdoptedRead(initial)
    if (initial.state === "success") {
      setConfirmed((current) => later(current, initial))
      setIsLive(true)
      setIsRefused(false)
      setFailures(0)
      setIsPaused(false)
      setPollTick((tick) => tick + 1)
    } else if (initial.state === "not_found") {
      setConfirmed(null)
      setIsRefused(true)
    }
  }
  useEffect(() => {
    lastReadAt.current = Date.now()
    automaticReads.current = 0
  }, [initial])

  const refresh = useCallback(
    async (isAutomatic: boolean) => {
      if (isReading.current) return
      isReading.current = true
      if (isAutomatic) automaticReads.current += 1
      else {
        automaticReads.current = 0
        setIsPaused(false)
        setIsBusy(true)
      }
      const result = await readOrderProgress(orderId).catch(
        () => ({ state: "failed" }) as const,
      )
      isReading.current = false
      lastReadAt.current = Date.now()
      if (result.state === "success") {
        setConfirmed((current) => later(current, result))
        setIsLive(true)
        setFailures(0)
        setIsRefused(false)
      } else if (result.state === "not_found") {
        setConfirmed(null)
        setIsRefused(true)
      } else setFailures((count) => count + 1)
      if (automaticReads.current >= MAX_AUTOMATIC_READS) setIsPaused(true)
      setIsBusy(false)
      setPollTick((tick) => tick + 1)
    },
    [orderId],
  )

  const isFinal = confirmed ? isSettled(confirmed.progress) : false
  useEffect(() => {
    if (isPaused || isFinal || isRefused) return
    const delay = Math.min(
      POLL_MS * 2 ** Math.max(0, failures - 1),
      MAX_BACKOFF_MS,
    )
    const timer = setTimeout(() => {
      // A hidden page waits; returning to it reads and restarts the timer.
      if (document.visibilityState === "visible") void refresh(true)
    }, delay)
    return () => clearTimeout(timer)
  }, [pollTick, failures, isPaused, isFinal, isRefused, refresh])

  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState !== "visible") return
      if (Date.now() - lastReadAt.current < RETURN_THROTTLE_MS) return
      void refresh(false)
    }
    document.addEventListener("visibilitychange", onReturn)
    window.addEventListener("focus", onReturn)
    return () => {
      document.removeEventListener("visibilitychange", onReturn)
      window.removeEventListener("focus", onReturn)
    }
  }, [refresh])

  const freshness: Freshness = isRefused
    ? "refused"
    : failures > 0
      ? "stale"
      : isPaused && !isFinal
        ? "paused"
        : "current"

  return (
    <>
      <Timeline
        confirmed={confirmed}
        freshness={freshness}
        isBusy={isBusy}
        isLive={isLive}
        onRefresh={() => void refresh(false)}
        locale={locale}
      />
      {confirmed && !isRefused && (
        <CancelOrder
          progress={confirmed.progress}
          orderNumber={orderNumber}
          locale={locale}
        />
      )}
      {confirmed && (
        <OrderCancellation progress={confirmed.progress} locale={locale} />
      )}
    </>
  )
}

type Freshness = "current" | "stale" | "paused" | "refused"

const NOTICE =
  "mt-5 max-w-prose rounded-lg p-4 text-sm leading-6 [overflow-wrap:anywhere] motion-safe:animate-swap-in"
const WARNING = `${NOTICE} bg-mtogo-status-warning-surface text-mtogo-status-warning-text`
const ERROR = `${NOTICE} bg-mtogo-status-error-surface text-mtogo-status-error-text`

/** The Order's state at a glance, in the pairs the design brief assigns. */
const STATE_TONE: Record<OrderProgress["state"], string> = {
  awaiting_acceptance: "bg-mtogo-surface-selected text-mtogo-text-link",
  accepted: "bg-mtogo-surface-selected text-mtogo-text-link",
  preparing: "bg-mtogo-surface-selected text-mtogo-text-link",
  ready: "bg-mtogo-status-success-surface text-mtogo-status-success-text",
  cancelled: "bg-mtogo-status-error-surface text-mtogo-status-error-text",
}

/** Press feedback and a quiet outline, as the basket's pill controls have. */
const REFRESH_BUTTON =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-mtogo-border-control bg-mtogo-surface-card px-4 text-sm font-medium text-mtogo-text-primary transition-[background-color,transform] duration-150 ease-out-strong active:scale-[0.97] disabled:text-mtogo-text-secondary motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mtogo-focus-ring sm:w-auto [@media(hover:hover)_and_(pointer:fine)]:hover:bg-mtogo-surface-page"

function Timeline({
  confirmed,
  freshness,
  isBusy,
  isLive,
  onRefresh,
  locale,
}: {
  confirmed: ConfirmedProgress | null
  freshness: Freshness
  isBusy: boolean
  /** A read has arrived since the first paint; only its changes animate. */
  isLive: boolean
  onRefresh: () => void
  locale: Locale
}) {
  const text = CUSTOMER_ORDER_DETAIL_TEXT[locale]
  const pathname = usePathname()
  const headingId = useId()
  const steps = confirmed ? foodProgressSteps(confirmed.progress) : []
  const asOf = confirmed ? formatOrderTime(confirmed.server_time, locale) : ""
  const state = confirmed?.progress.state

  return (
    <section
      aria-labelledby={headingId}
      aria-busy={isBusy}
      className="rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card p-5 sm:p-6"
      data-testid="order-progress"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id={headingId} className="text-lg font-semibold">
          {text.progress_heading}
        </h2>
        {state && (
          <span
            key={state}
            className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${STATE_TONE[state]} ${
              isLive ? "motion-safe:animate-swap-in" : ""
            }`}
            data-testid="order-progress-state"
          >
            {text[`state_${state}`]}
          </span>
        )}
      </div>
      {/* Always rendered, so a refresh that changes the stage is announced. */}
      <p
        role="status"
        className="mt-2 max-w-prose text-sm leading-6 text-mtogo-text-secondary"
      >
        {state && text[`now_${state}`]}
      </p>

      {confirmed && (
        <ol className="mt-5" data-testid="order-progress-steps">
          {steps.map((step, index) => (
            <StepItem
              key={step.key}
              step={step}
              isLast={index === steps.length - 1}
              isLive={isLive}
              locale={locale}
            />
          ))}
        </ol>
      )}

      <div role="status">
        {!confirmed && freshness !== "refused" && (
          <p className={ERROR}>{text.progress_unavailable}</p>
        )}
        {confirmed && freshness === "stale" && (
          <p className={WARNING}>
            {formatText(text.progress_stale, { time: asOf })}
          </p>
        )}
        {freshness === "refused" && (
          <div className={ERROR}>
            <p>{text.progress_refused}</p>
            <LocalizedClientLink
              href={`/account?next=${encodeURIComponent(pathname)}`}
              className="mt-2 inline-flex min-h-11 items-center underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mtogo-focus-ring"
            >
              {CUSTOMER_AUTH[locale].signIn}
            </LocalizedClientLink>
          </div>
        )}
        {freshness === "paused" && (
          <p className="mt-5 max-w-prose text-sm leading-6 text-mtogo-text-secondary motion-safe:animate-swap-in">
            {text.progress_paused}
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-mtogo-border-subtle pt-4">
        <p className="text-sm tabular-nums text-mtogo-text-secondary">
          {isBusy
            ? text.progress_updating
            : confirmed &&
              freshness !== "stale" &&
              formatText(text.progress_updated, { time: asOf })}
        </p>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isBusy}
          className={REFRESH_BUTTON}
          data-testid="order-progress-refresh"
        >
          <ArrowPath
            aria-hidden="true"
            className={isBusy ? "motion-safe:animate-spin" : undefined}
          />
          {text.progress_refresh}
        </button>
      </div>
    </section>
  )
}

const LABEL_TONE = {
  completed: "font-semibold text-mtogo-text-primary",
  current: "font-semibold text-mtogo-text-primary",
  upcoming: "text-mtogo-text-secondary",
} as const

function StepItem({
  step,
  isLast,
  isLive,
  locale,
}: {
  step: FoodStep
  isLast: boolean
  /** The page has loaded, so a step that appears now is a change. */
  isLive: boolean
  locale: Locale
}) {
  const text = CUSTOMER_ORDER_DETAIL_TEXT[locale]
  const isCurrent = step.status === "current"
  // A step animates only when a refresh changed it, never on first paint.
  const [first] = useState({ status: step.status, isLive })
  const hasChanged = first.isLive || first.status !== step.status
  return (
    <li
      aria-current={isCurrent ? "step" : undefined}
      className="relative flex gap-3 pb-6 last:pb-0"
      data-step={step.key}
      data-status={step.status}
    >
      {!isLast && (
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-[11px] top-7 w-0.5 overflow-hidden rounded-full bg-mtogo-border-subtle"
        >
          {/* Fills top-down when the step is done; transform only. */}
          <span
            className={`block h-full w-full origin-top bg-mtogo-action-primary transition-transform duration-300 ease-out-strong motion-reduce:transition-none ${
              step.status === "completed" ? "scale-y-100" : "scale-y-0"
            }`}
          />
        </span>
      )}
      <span
        key={step.status}
        className={`relative flex shrink-0 ${
          hasChanged ? "motion-safe:animate-pop-in" : ""
        }`}
      >
        <StepMarker step={step} />
      </span>
      <div className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
        <p className={`text-sm leading-6 ${LABEL_TONE[step.status]}`}>
          <span className="sr-only">{text[`step_${step.status}`]}: </span>
          {text[`step_${step.key}`]}
          {isCurrent && (
            <span
              aria-hidden="true"
              className="ml-2 inline-flex items-center rounded-full bg-mtogo-surface-selected px-2 py-0.5 align-middle text-xs font-medium text-mtogo-text-link"
            >
              {text.step_current}
            </span>
          )}
        </p>
        {step.at ? (
          <time
            dateTime={step.at}
            className="text-sm tabular-nums text-mtogo-text-secondary"
          >
            {new Intl.DateTimeFormat(locale === "da" ? "da-DK" : "en-GB", {
              timeZone: "Europe/Copenhagen",
              day: "numeric",
              month: "short",
              year: "numeric",
            }).format(new Date(step.at))}{" "}
            {formatOrderTime(step.at, locale)}
          </time>
        ) : (
          step.status === "upcoming" && (
            <p aria-hidden="true" className="text-sm text-mtogo-text-secondary">
              {text.step_upcoming}
            </p>
          )
        )}
      </div>
    </li>
  )
}

function StepMarker({ step }: { step: FoodStep }) {
  if (step.key === "cancelled")
    return (
      <XCircleSolid
        aria-hidden="true"
        className="h-6 w-6 text-mtogo-status-error-text"
      />
    )
  if (step.status === "completed")
    return (
      <CheckCircleSolid
        aria-hidden="true"
        className="h-6 w-6 text-mtogo-action-primary"
      />
    )
  if (step.status === "current")
    return (
      <span
        aria-hidden="true"
        className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-mtogo-action-primary bg-mtogo-surface-card"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-mtogo-action-primary" />
      </span>
    )
  return (
    <span
      aria-hidden="true"
      className="h-6 w-6 rounded-full border-2 border-dashed border-mtogo-border-control bg-mtogo-surface-card"
    />
  )
}
