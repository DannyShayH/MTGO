"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  endedPath,
  feedEndedCodeOf,
  onSignOutElsewhere,
  type FeedEndedCode,
} from "@lib/session-ended"
import {
  HEARTBEAT_TIMEOUT_MS,
  INITIAL_CONNECTION,
  RECONCILE_MS,
  nextConnection,
  type ConnectionEvent,
  type ConnectionStatus,
} from "../connection"
import { fetchOrdersCheck } from "../orders-check"
import { useNoticeArrivals } from "./arrival-alerts"

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

type KitchenFeed = {
  status: ConnectionStatus
  isRefreshing: boolean
  /** Staff pressed Refresh: reread now and retry what is down. */
  requestRefresh: () => void
}

const KitchenFeedContext = createContext<KitchenFeed | null>(null)

export const useKitchenFeed = () => useContext(KitchenFeedContext)

const isOrdersPage = (path: string) =>
  path === "/orders" || path.startsWith("/orders/")

/**
 * Keeps the kitchen current on every dashboard page (#148, #149). The
 * same-origin feed only hints that Orders changed; every hint, reconnect and
 * poll first asks the Orders check, which reports the awaiting Orders to the
 * arrival alert and the Orders badge. On the Orders pages it then rereads the
 * authorized server projections with `router.refresh()`, which keeps focus
 * and client state. When the feed fails it polls with backoff and keeps
 * trying to restore streaming. The connection rules live in `../connection`.
 */
export function KitchenFeedProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter()
  const currentPath = usePathname()
  const pathname = useRef(currentPath)
  const [status, setStatus] = useState<ConnectionStatus>("connecting")
  const [isRefreshing, startTransition] = useTransition()
  const requestRefreshRef = useRef<() => void>(() => {})
  const noticeArrivals = useNoticeArrivals()

  useEffect(() => {
    pathname.current = currentPath
  }, [currentPath])

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
      // Hints, reconnects and polls all pass here, so each new awaiting
      // Order is discovered (and alerted) the same way, once (#149).
      if (check.status === "ok" && !isDisposed) noticeArrivals(check.awaiting)
      return check.status
    }
    // Several hints in quick succession cause one reread. When the check
    // fails, the last good Orders stay on screen with their "Loaded" time.
    const reload = () => {
      if (timers.reload) return
      timers.reload = setTimeout(async () => {
        const check = await checkBeforeReading()
        delete timers.reload
        // Only the Orders pages show Orders; elsewhere the check alone keeps
        // the badge and the alert current, and forms are never re-rendered.
        if (check === "ok" && isOrdersPage(pathname.current))
          startTransition(() => router.refresh())
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
    requestRefreshRef.current = () => dispatch("refresh_requested")
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
  }, [router, noticeArrivals])

  const value = useMemo(
    () => ({
      status,
      isRefreshing,
      requestRefresh: () => requestRefreshRef.current(),
    }),
    [status, isRefreshing],
  )
  return (
    <KitchenFeedContext.Provider value={value}>
      {children}
    </KitchenFeedContext.Provider>
  )
}
