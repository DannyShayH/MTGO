"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ORDER_TEXT, formatText, type Locale } from "@dtc/i18n"
import { Button, Text, clx } from "@medusajs/ui"
import {
  endedPath,
  feedEndedCodeOf,
  onSignOutElsewhere,
  type FeedEndedCode,
} from "@lib/session-ended"
import {
  HEARTBEAT_TIMEOUT_MS,
  INITIAL_CONNECTION,
  POLL_MS,
  RECONCILE_MS,
  nextConnection,
  type ConnectionEvent,
  type ConnectionStatus,
} from "../connection"
import { fetchOrdersCheck } from "../orders-check"

const STATUS_STYLES: Record<ConnectionStatus, { dot: string; text: string }> = {
  connecting: { dot: "bg-ui-fg-muted", text: "text-ui-fg-subtle" },
  live: {
    dot: "bg-mtogo-status-success-text",
    text: "text-mtogo-status-success-text",
  },
  reconnecting: {
    dot: "bg-mtogo-status-warning-text",
    text: "text-mtogo-status-warning-text",
  },
  fallback: {
    dot: "bg-mtogo-status-warning-text",
    text: "text-mtogo-status-warning-text",
  },
  offline: {
    dot: "bg-mtogo-status-error-text",
    text: "text-mtogo-status-error-text",
  },
}

type Timer = "stream" | "poll" | "watchdog" | "reload"

const endedCodeOfEvent = (event: Event): FeedEndedCode => {
  try {
    return feedEndedCodeOf(
      JSON.parse((event as MessageEvent<string>).data).code,
    )
  } catch {
    return "session_expired"
  }
}

/**
 * Keeps the open kitchen screen current (#148). The same-origin feed only
 * hints that Orders changed; every update rereads the page's authorized
 * server projections with `router.refresh()`, which keeps focus and client
 * state. When the feed fails it polls with backoff and keeps trying to
 * restore streaming. The connection rules live in `../connection`.
 */
export function LiveOrders({ locale }: Readonly<{ locale: Locale }>) {
  const text = ORDER_TEXT[locale]
  const router = useRouter()
  const [status, setStatus] = useState<ConnectionStatus>("connecting")
  const [isRefreshing, startTransition] = useTransition()
  const requestRefresh = useRef<() => void>(() => {})

  useEffect(() => {
    let isDisposed = false
    let state = INITIAL_CONNECTION
    let source: EventSource | null = null
    const timers: Partial<Record<Timer, ReturnType<typeof setTimeout>>> = {}
    const clear = (timer: Timer) => {
      clearTimeout(timers[timer])
      delete timers[timer]
    }
    const schedule = (timer: Timer, ms: number, run: () => void) => {
      clear(timer)
      timers[timer] = setTimeout(run, ms)
    }
    /**
     * Asks whether the authorized Orders read works right now. A server
     * render while the backend is down would replace the whole screen with
     * an error, so nothing rereads without this check passing first.
     */
    const checkBeforeReading = async (): Promise<
      "ok" | "unavailable" | "ended"
    > => {
      const check = await fetchOrdersCheck()
      if (check.status === "ended") {
        endSession(feedEndedCodeOf(check.code))
        return "ended"
      }
      return check.status
    }
    // Several hints in quick succession cause one reread. When the check
    // fails, the last good Orders stay on screen with their "Loaded" time.
    const reload = () => {
      if (timers.reload) return
      timers.reload = setTimeout(async () => {
        const check = await checkBeforeReading()
        delete timers.reload
        if (check === "ok") startTransition(() => router.refresh())
        else if (check === "unavailable") dispatch("reload_failed")
      }, 250)
    }
    const closeStream = () => {
      source?.close()
      source = null
      clear("watchdog")
    }
    const endSession = (code: FeedEndedCode) => {
      isDisposed = true
      closeStream()
      window.location.assign(endedPath(code))
    }
    const dispatch = (event: ConnectionEvent) => {
      if (isDisposed) return
      const next = nextConnection(state, event)
      state = next.state
      setStatus(state.status)
      const { effects } = next
      if (effects.reload) reload()
      if (effects.stopPolling) clear("poll")
      if (effects.openStreamInMs !== undefined)
        schedule("stream", effects.openStreamInMs, openStream)
      if (effects.pollInMs !== undefined)
        schedule("poll", effects.pollInMs, () => void poll())
    }
    // A feed that stays silent (for example behind a buffering proxy) is
    // treated as failed, so a quiet screen never pretends to be live.
    const armWatchdog = () =>
      schedule("watchdog", HEARTBEAT_TIMEOUT_MS, () => {
        closeStream()
        dispatch("heartbeat_missed")
      })
    function openStream() {
      closeStream()
      const opened = new EventSource("/api/orders/stream")
      source = opened
      armWatchdog()
      opened.addEventListener("ready", () => {
        armWatchdog()
        dispatch("stream_ready")
      })
      opened.addEventListener("heartbeat", () => {
        armWatchdog()
        dispatch("heartbeat_received")
      })
      opened.addEventListener("orders", () => {
        armWatchdog()
        dispatch("orders_hinted")
      })
      opened.addEventListener("ended", (event) =>
        endSession(endedCodeOfEvent(event)),
      )
      // The browser would retry by itself; the connection rules decide instead.
      opened.onerror = () => {
        if (source !== opened) return
        closeStream()
        dispatch("stream_failed")
      }
    }
    async function poll() {
      const check = await checkBeforeReading()
      if (check !== "ended")
        dispatch(check === "ok" ? "poll_succeeded" : "poll_failed")
    }

    const focused = () => dispatch("focused")
    const visible = () => {
      if (document.visibilityState === "visible") focused()
    }
    requestRefresh.current = () => dispatch("refresh_requested")
    // Signing out elsewhere cannot revoke the token this feed already uses.
    const forgetSignOut = onSignOutElsewhere(() => endSession("signed_out"))
    window.addEventListener("focus", focused)
    window.addEventListener("online", focused)
    document.addEventListener("visibilitychange", visible)
    const reconcile = setInterval(() => dispatch("reconcile_due"), RECONCILE_MS)
    openStream()
    return () => {
      isDisposed = true
      closeStream()
      for (const timer of Object.keys(timers) as Timer[]) clear(timer)
      clearInterval(reconcile)
      forgetSignOut()
      window.removeEventListener("focus", focused)
      window.removeEventListener("online", focused)
      document.removeEventListener("visibilitychange", visible)
    }
  }, [router])

  const styles = STATUS_STYLES[status]
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Text
        size="small"
        role="status"
        className={clx("flex max-w-prose items-start gap-x-2", styles.text)}
      >
        <span
          aria-hidden
          className={clx("mt-1.5 size-2 shrink-0 rounded-full", styles.dot)}
        />
        <span>
          {formatText(text[`connection_${status}`], {
            seconds: POLL_MS / 1000,
          })}
        </span>
      </Text>
      {/* Not `isLoading`: it disables the button, which drops keyboard focus
          on every live update. */}
      <Button
        variant="secondary"
        className="min-h-11 px-4"
        aria-busy={isRefreshing}
        onClick={() => requestRefresh.current()}
      >
        {text.refresh}
      </Button>
    </div>
  )
}
