"use client"

import Link from "next/link"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { BellAlertSolid } from "@medusajs/icons"
import { ORDER_TEXT, formatText, type Locale } from "@dtc/i18n"
import { Badge, Button, Switch, Text, clx } from "@medusajs/ui"
import {
  INITIAL_ARRIVALS,
  dismissArrivals,
  namedArrivals,
  noticeArrivals,
  type AwaitingOrder,
  type AwaitingRead,
} from "../arrivals"
import { playArrivalTone, unlockArrivalSound } from "../arrival-sound"
import {
  ARRIVAL_SOUND_COOKIE,
  initialSound,
  isRemembered,
  isSwitchOn,
  nextSound,
  type Sound,
  type SoundEvent,
} from "../arrival-sound-state"

/** A year, like the language choice; the choice belongs to this device. */
const REMEMBER_SECONDS = 365 * 24 * 60 * 60

function rememberSound(isOn: boolean) {
  const secure = location.protocol === "https:" ? "; Secure" : ""
  document.cookie = `${ARRIVAL_SOUND_COOKIE}=${isOn ? "on" : ""}; Path=/; Max-Age=${
    isOn ? REMEMBER_SECONDS : 0
  }; SameSite=Lax${secure}`
}

type ArrivalAlerts = {
  pending: AwaitingOrder[]
  /** All awaiting Orders at the last read; null before the first one. */
  awaitingCount: number | null
  sound: Sound
  /** Every successful awaiting-queue read reports here (the kitchen feed). */
  notice: (read: AwaitingRead) => void
  dismiss: () => void
  setSoundOn: (isOn: boolean) => void
}

const ArrivalAlertsContext = createContext<ArrivalAlerts | null>(null)

const useArrivalAlerts = () => useContext(ArrivalAlertsContext)

const SOUND_SWITCH_ID = "arrival-sound"
const SOUND_NOTICE_ID = "arrival-sound-notice"
/** The Orders link in the sidebar, where focus goes when no switch is shown. */
export const ORDERS_NAV_ID = "orders-nav"

/**
 * Holds the kitchen's arrival alerts (#149) for the whole dashboard, so the
 * Orders it already knows survive moving between pages; signing out forgets
 * them. The sound choice is remembered on this device in a cookie the layout
 * reads, so a reload renders the switch as staff left it.
 */
export function ArrivalAlertsProvider({
  children,
  isSoundRemembered = false,
}: Readonly<{ children: React.ReactNode; isSoundRemembered?: boolean }>) {
  const arrivalsRef = useRef(INITIAL_ARRIVALS)
  const [pending, setPending] = useState<AwaitingOrder[]>([])
  const [awaitingCount, setAwaitingCount] = useState<number | null>(null)
  const [sound, setSound] = useState<Sound>(() =>
    initialSound(isSoundRemembered),
  )
  const soundRef = useRef<Sound>(sound)
  const changeSound = useCallback((event: SoundEvent) => {
    const previous = soundRef.current
    const next = nextSound(previous, event)
    soundRef.current = next
    setSound(next)
    if (isRemembered(next) !== isRemembered(previous))
      rememberSound(isRemembered(next))
  }, [])

  // A remembered choice waits for the page's first click, tap or key press,
  // the moment the browser lets sound start. Moving here from another page
  // has already had one, so it unlocks at once.
  useEffect(() => {
    if (sound !== "waiting") return
    let isCurrent = true
    const unlock = () =>
      void unlockArrivalSound().then((isUnlocked) => {
        if (isUnlocked && isCurrent) changeSound({ type: "unlocked" })
      })
    unlock()
    const events = ["pointerdown", "keydown"] as const
    for (const event of events)
      window.addEventListener(event, unlock, { capture: true })
    return () => {
      isCurrent = false
      for (const event of events)
        window.removeEventListener(event, unlock, { capture: true })
    }
  }, [sound, changeSound])

  const notice = useCallback(
    (read: AwaitingRead) => {
      const next = noticeArrivals(arrivalsRef.current, read)
      arrivalsRef.current = next.state
      setPending(next.state.pending)
      setAwaitingCount(read.count)
      if (next.arrivals.length && isSwitchOn(soundRef.current))
        void playArrivalTone().then((isPlayed) =>
          changeSound(
            isPlayed ? { type: "unlocked" } : { type: "play_failed" },
          ),
        )
    },
    [changeSound],
  )
  const dismiss = useCallback(() => {
    arrivalsRef.current = dismissArrivals(arrivalsRef.current)
    setPending(arrivalsRef.current.pending)
  }, [])
  // The click is what lets the browser play sound; the test tone proves it.
  const setSoundOn = useCallback(
    (isOn: boolean) => {
      if (!isOn) return changeSound({ type: "switched_off" })
      void playArrivalTone().then((isPlayed) =>
        changeSound({ type: "switched_on", isPlayed }),
      )
    },
    [changeSound],
  )

  const value = useMemo(
    () => ({ pending, awaitingCount, sound, notice, dismiss, setSoundOn }),
    [pending, awaitingCount, sound, notice, dismiss, setSoundOn],
  )
  return (
    <ArrivalAlertsContext.Provider value={value}>
      {children}
    </ArrivalAlertsContext.Provider>
  )
}

const ignoreReads = () => {}

/**
 * How the kitchen feed reports reads. Stable for the provider's lifetime, so
 * it never re-runs the connection effect.
 */
export const useNoticeArrivals = () => useArrivalAlerts()?.notice ?? ignoreReads

/**
 * The arrival banner, on every dashboard page: an icon, a heading with the
 * oldest Order numbers and a reminder, announced by an always-present live
 * region without taking keyboard focus. Hiding it acknowledges only the
 * alert, never the Order.
 */
export function ArrivalAlert({ locale }: Readonly<{ locale: Locale }>) {
  const text = ORDER_TEXT[locale]
  const alerts = useArrivalAlerts()
  const pending = alerts?.pending ?? []
  const [first] = pending
  const { named, more } = namedArrivals(pending)
  const numbers = named.map(({ display_id }) => `#${display_id}`).join(", ")
  const heading = !first
    ? ""
    : pending.length === 1
      ? formatText(text.arrival_one, { number: first.display_id })
      : formatText(text.arrival_many, {
          count: pending.length,
          numbers: more
            ? formatText(text.arrival_more, { numbers, more })
            : numbers,
        })
  return (
    <div aria-live="assertive" aria-atomic="true">
      {first && (
        <div className="bg-mtogo-status-warning-surface text-mtogo-status-warning-text border-mtogo-status-warning-text shadow-elevation-flyout motion-safe:animate-fade-up mb-6 flex flex-col gap-3 rounded-lg border-2 border-l-8 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex min-w-0 items-start gap-x-3">
            <BellAlertSolid aria-hidden className="mt-0.5 size-6 shrink-0" />
            <div className="min-w-0">
              <Text
                weight="plus"
                className="txt-compact-large-plus break-words"
              >
                {heading}
              </Text>
              <Text size="small" className="mt-1 max-w-prose">
                {text.arrival_hint}
              </Text>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link
              href="/orders?view=awaiting"
              className="bg-ui-bg-base text-ui-fg-base shadow-borders-base focus-visible:ring-mtogo-focus-ring txt-compact-small-plus ease-out-strong inline-flex min-h-11 items-center rounded-md px-4 transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:active:scale-[0.97]"
            >
              {text.arrival_view}
            </Link>
            <Button
              variant="transparent"
              className="text-mtogo-status-warning-text min-h-11 px-4 underline"
              onClick={() => {
                alerts?.dismiss()
                // The button disappears with the banner. Focus goes to the
                // sound switch on the Orders pages, else to the Orders link.
                const target =
                  document.getElementById(SOUND_SWITCH_ID) ??
                  document.getElementById(ORDERS_NAV_ID)
                target?.focus()
              }}
            >
              {text.arrival_dismiss}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** The opt-in sound switch, compact enough for the Orders toolbar. */
export function ArrivalSoundSwitch({ locale }: Readonly<{ locale: Locale }>) {
  const alerts = useArrivalAlerts()
  if (!alerts) return null
  return (
    <div className="flex items-center gap-x-2">
      <Switch
        id={SOUND_SWITCH_ID}
        checked={isSwitchOn(alerts.sound)}
        onCheckedChange={alerts.setSoundOn}
        aria-describedby={SOUND_NOTICE_ID}
      />
      <label
        htmlFor={SOUND_SWITCH_ID}
        className="txt-compact-small-plus flex min-h-11 cursor-pointer items-center"
      >
        {ORDER_TEXT[locale].sound_label}
      </label>
    </div>
  )
}

/**
 * Speaks only when sound cannot play: the browser refused it, or a
 * remembered choice waits for a click or tap after a reload. The region is
 * always present, so the change is announced when it happens.
 */
export function ArrivalSoundNotice({ locale }: Readonly<{ locale: Locale }>) {
  const sound = useArrivalAlerts()?.sound
  const text = ORDER_TEXT[locale]
  const message =
    sound === "blocked"
      ? text.sound_blocked
      : sound === "waiting"
        ? text.sound_armed
        : ""
  return (
    <Text
      id={SOUND_NOTICE_ID}
      size="small"
      role="status"
      className={clx(
        sound === "blocked"
          ? "text-mtogo-status-warning-text"
          : "text-ui-fg-subtle",
        !message && "hidden",
      )}
    >
      {message}
    </Text>
  )
}

/**
 * The number of Orders awaiting acceptance as a small pill, for the Orders
 * link and the Awaiting tab. Screen readers hear "4 awaiting acceptance".
 * `fallback` is the server's count until the first live read.
 */
export function AwaitingCount({
  locale,
  fallback,
}: Readonly<{ locale: Locale; fallback?: number }>) {
  const count = useArrivalAlerts()?.awaitingCount ?? fallback
  if (!count) return null
  return (
    <>
      <span
        aria-hidden
        className="bg-mtogo-status-warning-surface text-mtogo-status-warning-text txt-compact-xsmall-plus ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 tabular-nums"
      >
        {count}
      </span>
      <span className="sr-only">
        {`, ${formatText(ORDER_TEXT[locale].awaiting_count, { count })}`}
      </span>
    </>
  )
}

/** A "New" mark on a queue row while its arrival alert is showing. */
export function NewOrderMark({
  orderId,
  locale,
}: Readonly<{ orderId: string; locale: Locale }>) {
  const alerts = useArrivalAlerts()
  if (!alerts?.pending.some(({ id }) => id === orderId)) return null
  return (
    <>
      {/* Tints the row once when it appears, linking it to the banner.
          Reduced motion keeps the mark and skips the tint. */}
      <span
        aria-hidden
        className="bg-mtogo-status-warning-surface pointer-events-none absolute inset-0 -z-10 opacity-0 motion-safe:animate-[arrival-tint_1200ms_cubic-bezier(0.23,1,0.32,1)]"
      />
      <Badge size="small" color="orange" className="gap-x-1">
        <BellAlertSolid aria-hidden className="size-3.5" />
        {ORDER_TEXT[locale].arrival_new}
      </Badge>
    </>
  )
}
