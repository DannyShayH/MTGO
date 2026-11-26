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
import { POLL_MS, isSettled, serializeRefresh, startPolling } from "./polling"
import {
  INITIAL_TRACKING_CONNECTION,
  RECONCILE_MS,
  WATCHDOG_MS,
  retryDelay,
  nextTrackingConnection,
  type TrackingConnectionEvent,
  type TrackingConnectionStatus,
} from "./connection"
import { locationAge, shownLocationState } from "./location-age"
import DeliveryMap from "@modules/order/components/delivery-map"
import { deliveryMapView } from "@modules/order/components/delivery-map/map-view"

import { acceptProgress, type ConfirmedProgress } from "./confirmed-progress"

/**
 * The Customer's Order timeline of food progress (#147) and the outcome
 * panels that share its progress read. It renders only recorded facts and
 * adopts the server's re-read after an action such as cancelling. The
 * same-origin tracking feed (#215) only hints that something changed: each
 * hint, the feed's readiness, a return to the page and Refresh reread the
 * authorized tracking read. When the feed fails, the page checks every ten
 * seconds while visible and says so. A failed refresh keeps the last
 * progress and says how old it is; a refused one (signed out, no longer the
 * Customer's, or the feed ended the session) clears it and stops refreshing.
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
  const confirmedRef = useRef(confirmed)
  const [failures, setFailures] = useState(initial.state === "failed" ? 1 : 0)
  const [isRefused, setIsRefused] = useState(initial.state === "not_found")
  const [isBusy, setIsBusy] = useState(false)
  const [isLive, setIsLive] = useState(false)
  const [adoptedRead, setAdoptedRead] = useState(initial)
  const generation = useRef(0)
  /** Numbers each read, so only a read after the feed's `ready` reconciles it. */
  const reads = useRef(0)
  const connectionRef = useRef(INITIAL_TRACKING_CONNECTION)
  const [connection, setConnection] = useState<TrackingConnectionStatus>(
    INITIAL_TRACKING_CONNECTION.status,
  )
  /** Bumped to open the feed again after it failed. */
  const [streamAttempt, setStreamAttempt] = useState(0)
  const retryCount = useRef(0)
  const dispatchRef = useRef<(event: TrackingConnectionEvent) => void>(() => {})
  const serializedRefresh = useRef<ReturnType<typeof serializeRefresh> | null>(
    null,
  )

  // The page re-rendered on the server (after an action): adopt its read
  // and restart polling from it.
  if (adoptedRead !== initial) {
    setAdoptedRead(initial)
    if (initial.state === "success") {
      const accepted = acceptProgress(confirmed, initial)
      setConfirmed(accepted)
      if (accepted === initial) {
        setIsLive(true)
        setIsRefused(false)
        setFailures(0)
      } else {
        setFailures((count) => count + 1)
      }
    } else if (initial.state === "not_found") {
      setConfirmed(null)
      setIsRefused(true)
    }
  }
  useEffect(() => {
    confirmedRef.current = confirmed
  }, [confirmed])
  useEffect(
    () => () => {
      generation.current += 1
    },
    [initial, orderId],
  )
  const read = useCallback(async () => {
    const readGeneration = generation.current
    const readNumber = ++reads.current
    const result = await readOrderProgress(orderId).catch(
      () => ({ state: "failed" }) as const,
    )
    if (readGeneration !== generation.current) return false
    if (result.state === "success") {
      const accepted = acceptProgress(confirmedRef.current, result)
      if (accepted !== result) {
        setFailures((count) => count + 1)
        dispatchRef.current({ type: "read_failed", read: readNumber })
        return true
      }
      confirmedRef.current = accepted
      setConfirmed(accepted)
      setIsLive(true)
      setFailures(0)
      setIsRefused(false)
      dispatchRef.current({ type: "read_succeeded", read: readNumber })
    } else if (result.state === "not_found") {
      generation.current += 1
      confirmedRef.current = null
      setConfirmed(null)
      setIsRefused(true)
      return false
    } else {
      setFailures((count) => count + 1)
      dispatchRef.current({ type: "read_failed", read: readNumber })
    }
    return true
  }, [orderId])
  useEffect(() => {
    serializedRefresh.current = serializeRefresh(read)
    return () => {
      serializedRefresh.current = null
    }
  }, [read])
  const refresh = useCallback(async (automatic: boolean) => {
    if (!automatic) setIsBusy(true)
    try {
      await serializedRefresh.current?.(automatic)
    } finally {
      if (!automatic) setIsBusy(false)
    }
  }, [])

  // A reread asked for by the feed always starts after the event, so a read
  // already in flight never stands in for it.
  const reread = useCallback(() => {
    void serializedRefresh.current?.(false)
  }, [])
  useEffect(() => {
    dispatchRef.current = (event) => {
      const next = nextTrackingConnection(connectionRef.current, event)
      connectionRef.current = next.state
      setConnection(next.state.status)
      if (next.shouldReread) reread()
    }
  }, [reread])

  useEffect(() => {
    if (document.visibilityState === "visible") void refresh(true)
  }, [orderId, refresh])

  const isFinal = confirmed ? isSettled(confirmed.progress) : false
  const isTracking = !isFinal && !isRefused

  // Feedback can change after terminal tracking has stopped. Re-read after
  // submission and at the end of the eligibility window, using server time.
  useEffect(() => {
    if (isRefused) return
    const onSubmission = (event: Event) => {
      if ((event as CustomEvent<string>).detail === orderId) void refresh(true)
    }
    window.addEventListener("order-feedback-submitted", onSubmission)
    return () =>
      window.removeEventListener("order-feedback-submitted", onSubmission)
  }, [isRefused, orderId, refresh])

  useEffect(() => {
    const closesAt = confirmed?.progress.feedback_eligibility?.closes_at
    if (
      !confirmed?.progress.feedback_eligibility?.can_submit ||
      !closesAt ||
      isRefused
    )
      return
    const remaining = Date.parse(closesAt) - Date.parse(confirmed.server_time)
    if (!Number.isFinite(remaining) || remaining <= 0) return
    const timer = window.setTimeout(() => void refresh(true), remaining + 1000)
    return () => window.clearTimeout(timer)
  }, [confirmed, isRefused, refresh])

  // The feed: open while tracking and the page is visible. A hidden page
  // closes it; returning opens it again, and its `ready` rereads.
  useEffect(() => {
    if (!isTracking) return
    let source: EventSource | null = null
    let watchdog: number | undefined
    let retry: number | undefined
    const dispatch = (event: TrackingConnectionEvent) =>
      dispatchRef.current(event)
    const close = () => {
      source?.close()
      source = null
      window.clearTimeout(watchdog)
      window.clearTimeout(retry)
    }
    const failed = () => {
      close()
      dispatch({ type: "stream_failed" })
      if (document.visibilityState === "visible") {
        retry = window.setTimeout(open, retryDelay(retryCount.current++))
      }
    }
    const activity = () => {
      window.clearTimeout(watchdog)
      watchdog = window.setTimeout(failed, WATCHDOG_MS)
    }
    const open = () => {
      close()
      const opened = new EventSource(
        `/api/orders/${encodeURIComponent(orderId)}/tracking/stream`,
      )
      source = opened
      activity()
      /** Ignores events of a feed this page has already closed. */
      const whileCurrent = (listener: () => void) => () => {
        if (source === opened) listener()
      }
      opened.addEventListener(
        "ready",
        whileCurrent(() => {
          activity()
          dispatch({ type: "stream_ready", nextRead: reads.current + 1 })
        }),
      )
      opened.addEventListener(
        "heartbeat",
        whileCurrent(() => {
          activity()
          retryCount.current = 0
          dispatch({ type: "heartbeat" })
        }),
      )
      opened.addEventListener(
        "tracking",
        whileCurrent(() => {
          activity()
          retryCount.current = 0
          dispatch({ type: "tracking_hinted" })
        }),
      )
      // Signed out, expired or no longer the Customer's: stop and clear.
      opened.addEventListener(
        "ended",
        whileCurrent(() => {
          close()
          generation.current += 1
          confirmedRef.current = null
          setConfirmed(null)
          setIsRefused(true)
        }),
      )
      // The browser would retry by itself; the page checks instead.
      opened.onerror = whileCurrent(failed)
    }
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        close()
        const next = nextTrackingConnection(connectionRef.current, {
          type: "stream_failed",
        })
        connectionRef.current = next.state
        setConnection(next.state.status)
      } else if (!source) {
        retryCount.current = 0
        open()
      }
    }
    if (document.visibilityState === "visible") open()
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      close()
    }
  }, [orderId, isTracking, streamAttempt])

  // Without the feed, check every ten seconds while the page is visible.
  useEffect(() => {
    if (!isTracking || connection !== "checking") return
    return startPolling(
      () => document.visibilityState === "visible",
      () => void refresh(true),
    )
  }, [isTracking, connection, refresh])

  // A live page still rereads now and then, in case a hint was missed.
  useEffect(() => {
    if (!isTracking || connection !== "live") return
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible")
        dispatchRef.current({ type: "reconcile_due" })
    }, RECONCILE_MS)
    return () => window.clearInterval(timer)
  }, [isTracking, connection])

  /** Try the feed again, if it is the part that is down. */
  const retryStream = useCallback(() => {
    if (connectionRef.current.status === "checking")
      setStreamAttempt((attempt) => attempt + 1)
  }, [])

  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState !== "visible" || isRefused) return
      void refresh(false)
    }
    document.addEventListener("visibilitychange", onReturn)
    return () => {
      document.removeEventListener("visibilitychange", onReturn)
    }
  }, [refresh, isRefused])

  const freshness: Freshness = isRefused
    ? "refused"
    : failures > 0
      ? "stale"
      : "current"

  return (
    <>
      <Timeline
        confirmed={confirmed}
        freshness={freshness}
        isBusy={isBusy}
        isLive={isLive}
        connection={isTracking ? connection : null}
        onRefresh={() => {
          void refresh(false)
          retryStream()
        }}
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

type Freshness = "current" | "stale" | "refused"

const NOTICE =
  "mt-5 max-w-prose rounded-lg p-4 text-sm leading-6 [overflow-wrap:anywhere] motion-safe:animate-swap-in"
const WARNING = `${NOTICE} bg-mtogo-status-warning-surface text-mtogo-status-warning-text`
const ERROR = `${NOTICE} bg-mtogo-status-error-surface text-mtogo-status-error-text`

/** The Order's state at a glance, in the pairs the design brief assigns. */
const STATE_TONE: Record<
  OrderProgress["state"] | "delivered" | "failed" | "picked_up",
  string
> = {
  awaiting_acceptance: "bg-mtogo-surface-selected text-mtogo-text-link",
  accepted: "bg-mtogo-surface-selected text-mtogo-text-link",
  preparing: "bg-mtogo-surface-selected text-mtogo-text-link",
  ready: "bg-mtogo-status-success-surface text-mtogo-status-success-text",
  cancelled: "bg-mtogo-status-error-surface text-mtogo-status-error-text",
  delivered: "bg-mtogo-status-success-surface text-mtogo-status-success-text",
  failed: "bg-mtogo-status-error-surface text-mtogo-status-error-text",
  picked_up: "bg-mtogo-surface-selected text-mtogo-text-link",
}

/** Press feedback and a quiet outline, as the basket's pill controls have. */
const REFRESH_BUTTON =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-mtogo-border-control bg-mtogo-surface-card px-4 text-sm font-medium text-mtogo-text-primary transition-[background-color,transform] duration-150 ease-out-strong active:scale-[0.97] disabled:text-mtogo-text-secondary motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mtogo-focus-ring sm:w-auto [@media(hover:hover)_and_(pointer:fine)]:hover:bg-mtogo-surface-page"

function Timeline({
  confirmed,
  freshness,
  isBusy,
  isLive,
  connection,
  onRefresh,
  locale,
}: {
  confirmed: ConfirmedProgress | null
  freshness: Freshness
  isBusy: boolean
  /** How the page keeps current, while it still tracks the Order. */
  connection: TrackingConnectionStatus | null
  /** A read has arrived since the first paint; only its changes animate. */
  isLive: boolean
  onRefresh: () => void
  locale: Locale
}) {
  const text = CUSTOMER_ORDER_DETAIL_TEXT[locale]
  const pathname = usePathname()
  const headingId = useId()
  const steps = confirmed ? foodProgressSteps(confirmed.progress) : []
  const assignment = steps.find(
    (step) => step.key === "assigned" || step.key === "finding_agent",
  )
  const timeline = steps.filter(
    (step) => step.key !== "assigned" && step.key !== "finding_agent",
  )
  const asOf = confirmed ? formatOrderTime(confirmed.server_time, locale) : ""
  const progress = confirmed?.progress
  const state =
    progress?.state === "cancelled" ||
    progress?.delivery?.outcome === "cancelled"
      ? "cancelled"
      : progress?.delivery?.outcome === "failed"
        ? "failed"
        : progress?.delivery?.outcome === "delivered"
          ? "delivered"
          : progress?.delivery?.picked_up_at
            ? "picked_up"
            : progress?.state

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

      {assignment && (
        <p className="mt-5 rounded-lg bg-mtogo-surface-page p-4 text-sm leading-6">
          {
            text[
              `step_${assignment.key === "assigned" ? "assigned" : "finding_agent"}`
            ]
          }
          {assignment.at && (
            <time
              dateTime={assignment.at}
              className="ml-2 tabular-nums text-mtogo-text-secondary"
            >
              {formatOrderTime(assignment.at, locale)}
            </time>
          )}
        </p>
      )}
      {confirmed && (
        <ol className="mt-5" data-testid="order-progress-steps">
          {timeline.map((step, index) => (
            <StepItem
              key={step.key}
              step={step}
              isLast={index === timeline.length - 1}
              isLive={isLive}
              locale={locale}
            />
          ))}
        </ol>
      )}

      <div role="status">
        {progress?.feedback_eligibility?.can_submit && (
          <div className="mt-5 break-words text-sm leading-6">
            <p>{text.invitation}</p>
            <a
              href={`/${pathname.split("/")[1]}/account/orders/details/${encodeURIComponent(progress.order_id)}#order-feedback`}
              className="mt-2 flex min-h-11 items-center text-mtogo-text-link underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-mtogo-focus-ring"
            >
              {text.invitation_action}
            </a>
          </div>
        )}
      </div>
      {confirmed && freshness !== "refused" && (
        <LocationStatus confirmed={confirmed} locale={locale} />
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
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-mtogo-border-subtle pt-4">
        <div className="min-w-0 space-y-1">
          <p className="text-sm tabular-nums text-mtogo-text-secondary">
            {isBusy
              ? text.progress_updating
              : confirmed &&
                freshness !== "stale" &&
                formatText(text.progress_updated, { time: asOf })}
          </p>
          {/* Always rendered, so a change of connection is announced. */}
          <div role="status">
            {confirmed?.progress.delivery?.outcome === "delivered" &&
            freshness !== "refused" ? (
              <p
                className="text-sm text-mtogo-status-success-text"
                data-testid="order-progress-connection"
              >
                {text.connection_fulfilled}
              </p>
            ) : connection && freshness !== "refused" ? (
              <ConnectionStatus status={connection} locale={locale} />
            ) : null}
          </div>
        </div>
        {/* While the page updates live, a manual refresh would suggest it
            does not; it returns once live updates stop or a read failed. */}
        {(connection !== "live" || freshness !== "current" || !confirmed) && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isBusy}
            className={`${REFRESH_BUTTON} motion-safe:animate-fade-in`}
            data-testid="order-progress-refresh"
          >
            <ArrowPath
              aria-hidden="true"
              className={isBusy ? "motion-safe:animate-spin" : undefined}
            />
            {text.progress_refresh}
          </button>
        )}
      </div>
    </section>
  )
}

const CONNECTION_TONE: Record<
  TrackingConnectionStatus,
  { dot: string; text: string }
> = {
  connecting: {
    dot: "bg-mtogo-border-control",
    text: "text-mtogo-text-secondary",
  },
  live: {
    dot: "bg-mtogo-status-success-text",
    text: "text-mtogo-status-success-text",
  },
  checking: {
    dot: "bg-mtogo-status-warning-text",
    text: "text-mtogo-status-warning-text",
  },
}

/**
 * How the page keeps current (#215): live updates, or checking every ten
 * seconds. It is about the connection only, never the position's freshness.
 */
function ConnectionStatus({
  status,
  locale,
}: {
  status: TrackingConnectionStatus
  locale: Locale
}) {
  const text = CUSTOMER_ORDER_DETAIL_TEXT[locale]
  const tone = CONNECTION_TONE[status]
  return (
    <p
      className={`flex max-w-prose items-start gap-x-2 text-sm leading-6 ${tone.text}`}
      data-testid="order-progress-connection"
      data-status={status}
    >
      <span
        aria-hidden="true"
        className={`mt-2 size-2 shrink-0 rounded-full ${tone.dot}`}
      />
      <span className="min-w-0 [overflow-wrap:anywhere]">
        {formatText(text[`connection_${status}`], {
          seconds: (POLL_MS / 1000).toString(),
        })}
      </span>
    </p>
  )
}

function LocationStatus({
  confirmed,
  locale,
}: {
  confirmed: ConfirmedProgress
  locale: Locale
}) {
  const text = CUSTOMER_ORDER_DETAIL_TEXT[locale]
  const location = confirmed.progress.delivery?.location
  const ended =
    confirmed.progress.state === "cancelled" ||
    Boolean(confirmed.progress.delivery?.outcome)
  const [elapsed, setElapsed] = useState(0)
  // Each read restarts the age from its own server time; the section itself
  // stays mounted so the map is not reloaded on every read.
  const [readAt, setReadAt] = useState(confirmed.server_time)
  if (readAt !== confirmed.server_time) {
    setReadAt(confirmed.server_time)
    setElapsed(0)
  }
  useEffect(() => {
    const started = performance.now()
    const update = () => setElapsed(Math.max(0, performance.now() - started))
    const timer = window.setInterval(update, 1000)
    const remaining = location?.observed_at
      ? 60_000 - locationAge(confirmed.server_time, location.observed_at, 0)
      : 0
    const staleTimer =
      remaining > 0 ? window.setTimeout(update, remaining) : undefined
    document.addEventListener("visibilitychange", update)
    return () => {
      window.clearInterval(timer)
      window.clearTimeout(staleTimer)
      document.removeEventListener("visibilitychange", update)
    }
  }, [confirmed.server_time, location?.observed_at])
  const age = location?.observed_at
    ? locationAge(confirmed.server_time, location.observed_at, elapsed)
    : null
  const state = shownLocationState(location ?? null, ended, age)
  const map = deliveryMapView(location ?? null, ended, age)
  return (
    <section
      className="mt-5 rounded-lg bg-mtogo-surface-page p-4 text-sm leading-6 [overflow-wrap:anywhere]"
      aria-label={text.location_heading}
    >
      <h3 className="font-semibold">{text.location_heading}</h3>
      <p>{text[`location_${state}`]}</p>
      {map.kind === "position" && <DeliveryMap view={map} locale={locale} />}
      {age !== null && (state === "fresh" || state === "stale") && (
        <>
          <p>
            {formatText(text.location_age, {
              seconds: Math.floor(age / 1000).toString(),
            })}
          </p>
          {location?.latitude != null && location.longitude != null && (
            <p>
              {formatText(text.location_coordinates, {
                latitude: Math.round(location.latitude).toString(),
                longitude: Math.round(location.longitude).toString(),
              })}
            </p>
          )}
          <p>
            {location?.accuracy_m == null
              ? text.location_accuracy_unknown
              : formatText(text.location_accuracy, {
                  meters: Math.round(location.accuracy_m).toString(),
                })}
          </p>
        </>
      )}
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
        ) : null}
        {/* An upcoming step says so through its dashed marker and, for
            screen readers, the hidden status before its name (#252). */}
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
