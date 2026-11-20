"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { MapPin, Spinner, Target } from "@medusajs/icons"
import { Switch } from "@medusajs/ui"
import type { Locale } from "@dtc/i18n"
import { measurePickupDistances } from "@lib/data/delivery-agent"
import { CARD, PRESSABLE, type DeliveryCopy } from "./copy"
import {
  formatDistance,
  RESEND_AFTER_MS,
  shouldSendPosition,
  sortByNearest,
  type Position,
} from "./pickup-distance"

type Status = "off" | "locating" | "on" | "denied" | "unavailable"
type SortOrder = "oldest" | "nearest"

type SharingState = {
  enabled: boolean
  toggle: (on: boolean) => void
  status: Status
  /** The pickups being measured while sharing is on. */
  orderIds: string[]
  distances: Record<string, number | null>
  order: SortOrder
  setOrder: (order: SortOrder) => void
}

const Sharing = createContext<SharingState | null>(null)

const SWITCH_ID = "share-location"
const HINT_ID = "share-location-hint"

/**
 * Share my location (#191): off on every page load, and only the agent turns
 * it on. Only then does the browser ask for permission. While it is on and
 * the page is visible, the phone's position goes to the backend to measure
 * the route to each listed pickup, at most once a minute or after moving
 * 200 m. Turning it off, hiding the page or leaving it (signing out) stops
 * the watch at once, and late answers are dropped. Nothing is stored here.
 */
export function LocationSharing({
  orderIds,
  children,
}: {
  /** The pickups on screen: the available list and a not yet collected current delivery. */
  orderIds: string[]
  children: ReactNode
}) {
  const [enabled, setEnabled] = useState(false)
  const [status, setStatus] = useState<Status>("off")
  const [distances, setDistances] = useState<Record<string, number | null>>({})
  const [order, setOrder] = useState<SortOrder>("oldest")
  const idsKey = orderIds.join(",")

  useEffect(() => {
    if (!enabled || !idsKey) return
    const ids = idsKey.split(",")
    let active = true
    let watch: number | null = null
    let latest: Position | null = null
    let last: { position: Position; at: number } | null = null

    const send = (position: Position) => {
      if (!active || document.visibilityState !== "visible") return
      if (!shouldSendPosition(last, position, Date.now())) return
      last = { position, at: Date.now() }
      measurePickupDistances(position, ids)
        .catch(() => ({ status: "unavailable" as const }))
        .then((result) => {
          // Switched off, hidden or left meanwhile: the answer is dropped.
          if (!active || document.visibilityState !== "visible") return
          setDistances(result.status === "measured" ? result.distances : {})
          setStatus("on")
        })
    }
    const start = () => {
      if (watch !== null || document.visibilityState !== "visible") return
      watch = navigator.geolocation.watchPosition(
        ({ coords }) => {
          latest = { latitude: coords.latitude, longitude: coords.longitude }
          send(latest)
        },
        (error) => {
          if (!active) return
          if (error.code === error.PERMISSION_DENIED) {
            setEnabled(false)
            setStatus("denied")
          } else setStatus("unavailable")
        },
        { enableHighAccuracy: false, maximumAge: 30_000, timeout: 20_000 },
      )
    }
    const stop = () => {
      if (watch !== null) navigator.geolocation.clearWatch(watch)
      watch = null
    }
    const onVisibility = () =>
      document.visibilityState === "visible" ? start() : stop()
    // A standing agent's phone may report no new position: resend the last.
    const timer = window.setInterval(() => {
      if (latest) send(latest)
    }, RESEND_AFTER_MS)

    start()
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      active = false
      stop()
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [enabled, idsKey])

  const toggle = useCallback((on: boolean) => {
    if (on && !("geolocation" in navigator)) {
      setStatus("unavailable")
      return
    }
    setEnabled(on)
    setStatus(on ? "locating" : "off")
    if (!on) {
      setDistances({})
      setOrder("oldest")
    }
  }, [])

  return (
    <Sharing.Provider
      value={{
        enabled,
        toggle,
        // With nothing on screen to measure, sharing has nothing to wait for.
        status: enabled && !idsKey ? "on" : status,
        orderIds,
        distances,
        order,
        setOrder,
      }}
    >
      {children}
    </Sharing.Provider>
  )
}

/**
 * The Share my location card at the top of the workspace: label and switch
 * on one row, its purpose under it, and what the phone is doing now.
 */
export function LocationSwitch({ copy }: { copy: DeliveryCopy }) {
  const sharing = useContext(Sharing)
  if (!sharing) return null
  const { enabled, toggle, status } = sharing
  const notice =
    status === "locating"
      ? copy.locating
      : status === "denied"
        ? copy.locationDenied
        : status === "unavailable"
          ? copy.locationUnavailable
          : null
  return (
    <section
      aria-labelledby={`${SWITCH_ID}-label`}
      className={`${CARD} flex flex-col gap-2 p-4`}
    >
      <div className="flex items-center justify-between gap-4">
        <label
          id={`${SWITCH_ID}-label`}
          htmlFor={SWITCH_ID}
          className="text-mtogo-text-primary flex min-h-11 flex-1 cursor-pointer items-center gap-2.5 text-base font-semibold"
        >
          <span
            aria-hidden
            className={`flex size-8 shrink-0 items-center justify-center rounded-full ${enabled ? "bg-mtogo-surface-selected text-mtogo-action-primary" : "bg-ui-bg-subtle text-mtogo-text-secondary"}`}
          >
            {status === "locating" ? (
              <Spinner className="motion-safe:animate-spin" />
            ) : (
              <MapPin />
            )}
          </span>
          {copy.shareLocation}
        </label>
        <Switch
          id={SWITCH_ID}
          checked={enabled}
          onCheckedChange={toggle}
          aria-describedby={HINT_ID}
          className="focus-visible:ring-mtogo-focus-ring shrink-0 focus-visible:ring-2 focus-visible:ring-offset-2"
        />
      </div>
      <p id={HINT_ID} className="text-mtogo-text-secondary text-sm">
        {copy.shareLocationHint}
      </p>
      <p
        role="status"
        className={
          status === "denied"
            ? "text-mtogo-status-warning-text bg-mtogo-status-warning-surface rounded-lg p-3 text-sm empty:hidden"
            : "text-mtogo-text-secondary text-sm empty:hidden"
        }
      >
        {notice}
      </p>
    </section>
  )
}

/** Oldest first or nearest pickup, offered only once distances are in. */
export function SortControl({ copy }: { copy: DeliveryCopy }) {
  const sharing = useContext(Sharing)
  if (!sharing || sharing.status !== "on" || sharing.orderIds.length < 2)
    return null
  const { order, setOrder } = sharing
  return (
    <div
      role="radiogroup"
      aria-labelledby="delivery-order-label"
      className="flex flex-wrap items-center gap-2"
    >
      <span
        id="delivery-order-label"
        className="text-mtogo-text-secondary text-sm"
      >
        {copy.sortBy}
      </span>
      {(
        [
          ["oldest", copy.sortOldest],
          ["nearest", copy.sortNearest],
        ] as const
      ).map(([value, label]) => (
        <label
          key={value}
          className={`has-[:checked]:bg-mtogo-surface-selected has-[:checked]:text-mtogo-text-link has-[:checked]:border-mtogo-action-primary border-mtogo-border-subtle has-[:focus-visible]:ring-mtogo-focus-ring flex min-h-11 cursor-pointer items-center rounded-full border px-3 text-sm font-medium has-[:focus-visible]:ring-2 ${PRESSABLE}`}
        >
          <input
            type="radio"
            name="delivery-order"
            value={value}
            checked={order === value}
            onChange={() => setOrder(value)}
            className="sr-only"
          />
          {label}
        </label>
      ))}
    </div>
  )
}

/** "≈ 0,8 km fra dig" beside the pickup while sharing; nothing when off. */
export function PickupDistance({
  orderId,
  copy,
  locale,
}: {
  orderId: string
  copy: DeliveryCopy
  locale: Locale
}) {
  const sharing = useContext(Sharing)
  if (
    !sharing ||
    sharing.status !== "on" ||
    !sharing.orderIds.includes(orderId)
  )
    return null
  const distance = formatDistance(sharing.distances[orderId], locale)
  return distance ? (
    <span className="bg-mtogo-surface-selected text-mtogo-text-link inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold tabular-nums">
      <Target aria-hidden className="shrink-0" />
      {distance} {copy.fromYou}
    </span>
  ) : (
    <span className="bg-ui-bg-subtle text-mtogo-text-secondary inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-sm">
      <Target aria-hidden className="shrink-0" />
      {copy.distanceUnavailable}
    </span>
  )
}

/**
 * The available cards, oldest acceptance first unless the agent chose the
 * nearest pickup. Sorting is of the cards on this page only.
 */
export function AvailableList({
  items,
}: {
  items: { order_id: string; node: ReactNode }[]
}) {
  const sharing = useContext(Sharing)
  const shown =
    sharing?.status === "on" && sharing.order === "nearest"
      ? sortByNearest(items, sharing.distances)
      : items
  return (
    <ul className="flex flex-col gap-3">
      {shown.map(({ order_id, node }) => (
        <li key={order_id}>{node}</li>
      ))}
    </ul>
  )
}
