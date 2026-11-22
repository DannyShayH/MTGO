"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Text, clx } from "@medusajs/ui"
import { formatText } from "@dtc/i18n"
import type { DeliveryCheck } from "@lib/data/delivery-feed-relay"
import {
  deliveryEndedPath,
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
} from "../orders/connection"

type Timer = "stream" | "poll" | "watchdog" | "reload"

type Copy = {
  connection_connecting: string
  connection_live: string
  connection_reconnecting: string
  connection_fallback: string
  connection_offline: string
}

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

const endedCodeOfEvent = (event: Event): FeedEndedCode => {
  try {
    return feedEndedCodeOf(
      JSON.parse((event as MessageEvent<string>).data).code,
    )
  } catch {
    return "session_expired"
  }
}

/** A network failure or an unreadable answer counts as unavailable. */
async function fetchDeliveryCheck(): Promise<DeliveryCheck> {
  try {
    const response = await fetch("/api/delivery/check", { cache: "no-store" })
    return (await response.json()) as DeliveryCheck
  } catch {
    return { status: "unavailable" }
  }
}

/**
 * Keeps the Delivery agent workspace current (#165). The same-origin feed
 * only hints that something changed; every hint, reconnect, focus and poll
 * first asks the authorized check, and only then rereads the server
 * projections with `router.refresh()`, which keeps focus and client state
 * (pending actions stay pending until the server answers). A hint is never
 * treated as a confirmed claim or milestone. When the feed fails the screen
 * polls with backoff, says so, and keeps trying to restore streaming. The
 * connection rules are the kitchen feed's (`../orders/connection`).
 * Returning from a call or screen lock reconciles at once.
 */
export function DeliveryFeed({ copy }: Readonly<{ copy: Copy }>) {
  const router = useRouter()
  const [status, setStatus] = useState<ConnectionStatus>("connecting")
  const [, startTransition] = useTransition()
  const routerRef = useRef(router)

  useEffect(() => {
    routerRef.current = router
  }, [router])

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
    const checkBeforeReading = async (): Promise<
      "ok" | "unavailable" | "ended"
    > => {
      const check = await fetchDeliveryCheck()
      if (check.status === "ended") {
        endSession(feedEndedCodeOf(check.code))
        return "ended"
      }
      return check.status
    }
    // Several hints in quick succession cause one reread. When the check
    // fails, the last good projections stay on screen.
    const reload = () => {
      if (timers.reload) return
      timers.reload = setTimeout(async () => {
        const check = await checkBeforeReading()
        delete timers.reload
        if (isDisposed) return
        if (check === "ok") startTransition(() => routerRef.current.refresh())
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
      for (const timer of Object.keys(timers) as Timer[]) clear(timer)
      window.location.assign(deliveryEndedPath(code))
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
    // A feed that stays silent (a buffering proxy, a suspended phone) is
    // treated as failed, so a quiet screen never pretends to be live.
    const armWatchdog = () =>
      schedule("watchdog", HEARTBEAT_TIMEOUT_MS, () => {
        closeStream()
        dispatch("heartbeat_missed")
      })
    function openStream() {
      closeStream()
      const opened = new EventSource("/api/delivery/stream")
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
      opened.addEventListener("deliveries", () => {
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
    // Signing out elsewhere cannot revoke the token this feed already uses.
    const forgetSignOut = onSignOutElsewhere(() => endSession("signed_out"))
    window.addEventListener("focus", focused)
    window.addEventListener("online", focused)
    window.addEventListener("pageshow", focused)
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
      window.removeEventListener("pageshow", focused)
      document.removeEventListener("visibilitychange", visible)
    }
  }, [])

  const styles = STATUS_STYLES[status]
  return (
    <Text
      size="small"
      role="status"
      className={clx("flex max-w-prose items-start gap-x-2", styles.text)}
    >
      <span
        aria-hidden
        className={clx("mt-1.5 size-2 shrink-0 rounded-full", styles.dot)}
      />
      <span className="min-w-0 break-words">
        {formatText(copy[`connection_${status}`], { seconds: POLL_MS / 1000 })}
      </span>
    </Text>
  )
}
