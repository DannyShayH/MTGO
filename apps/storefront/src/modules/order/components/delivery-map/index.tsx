"use client"

import "leaflet/dist/leaflet.css"
import type { LayerGroup, Map as LeafletMap } from "leaflet"
import { useEffect, useId, useRef, useState } from "react"
import { CUSTOMER_ORDER_DETAIL_TEXT, type Locale } from "@dtc/i18n"
import { DELIVERY_MAP_PROVIDER } from "./provider"
import type { DeliveryMapView } from "./map-view"

type Leaflet = typeof import("leaflet")
type Position = Extract<DeliveryMapView, { kind: "position" }>
type MapState = "loading" | "ready" | "failed"
type DrawnMap = { leaflet: Leaflet; map: LeafletMap; marks: LayerGroup }

/** No tile within this time counts as a failed map, not an endless spinner. */
const LOAD_TIMEOUT_MS = 15_000
/** Tile failures before any tile loads that count as a failed map. */
const FAILED_TILE_LIMIT = 4
/** Close enough to read street names around a measured dot or area. */
const POSITION_ZOOM = 16
/**
 * Unreported accuracy is drawn as a dashed ring of this many metres on the
 * ground, so it grows with zoom and never shrinks to an exact-looking spot.
 */
const UNREPORTED_ACCURACY_RADIUS_M = 500
/** Smallest accuracy circle drawn, so a 0 m report still shows its area. */
const MIN_ACCURACY_RADIUS_M = 1
/** The precise dot: screen pixels, with a card-coloured outline. */
const DOT_RADIUS_PX = 8
const DOT_OUTLINE_PX = 3

/** Fresh marks use the action colour; stale ones turn grey and dashed. */
const MARK_STYLE = {
  fresh: {
    dot: "fill-mtogo-action-primary stroke-mtogo-surface-card",
    area: "fill-mtogo-action-primary stroke-mtogo-action-primary",
    dashArray: undefined,
  },
  stale: {
    dot: "fill-mtogo-text-secondary stroke-mtogo-surface-card",
    area: "fill-mtogo-text-secondary stroke-mtogo-text-secondary",
    dashArray: "4 4",
  },
} as const

/**
 * The presentation adapter for the delivery map (#214): it draws one
 * measured position on the tile service and nothing else (no Restaurant or
 * destination, route, track or estimate). The map library and tiles load in
 * the browser only; while they load, or once they fail, the map says so and
 * the textual location status around it stays usable.
 */
export default function DeliveryMap({
  view,
  locale,
}: {
  view: Position
  locale: Locale
}) {
  const text = CUSTOMER_ORDER_DETAIL_TEXT[locale]
  const captionId = useId()
  const container = useRef<HTMLDivElement>(null)
  const drawn = useRef<DrawnMap | null>(null)
  const latest = useRef(view)
  const [state, setState] = useState<MapState>("loading")

  useEffect(() => {
    if (!container.current) return
    let isCancelled = false
    let created: LeafletMap | null = null
    // Only a loading map changes state: a failure is final, so a late tile
    // never brings back an empty frame.
    const settle = (next: MapState) => {
      if (!isCancelled) setState((s) => (s === "loading" ? next : s))
    }
    const timer = window.setTimeout(() => settle("failed"), LOAD_TIMEOUT_MS)
    import("leaflet")
      .then((module) => {
        if (isCancelled || !container.current) return
        const leaflet = (module.default ?? module) as Leaflet
        const start = latest.current
        created = leaflet.map(container.current, {
          center: [start.latitude, start.longitude],
          zoom: POSITION_ZOOM,
          maxZoom: DELIVERY_MAP_PROVIDER.maxZoom,
          scrollWheelZoom: false,
          zoomAnimation: false,
          fadeAnimation: false,
          markerZoomAnimation: false,
        })
        let loadedTiles = 0
        let failedTiles = 0
        leaflet
          .tileLayer(DELIVERY_MAP_PROVIDER.tileUrl, {
            attribution: DELIVERY_MAP_PROVIDER.attribution,
            maxZoom: DELIVERY_MAP_PROVIDER.maxZoom,
            referrerPolicy: DELIVERY_MAP_PROVIDER.referrerPolicy,
          })
          .on("tileload", () => {
            loadedTiles += 1
            settle("ready")
          })
          .on("tileerror", () => {
            failedTiles += 1
            if (loadedTiles === 0 && failedTiles >= FAILED_TILE_LIMIT)
              settle("failed")
          })
          .addTo(created)
        drawn.current = {
          leaflet,
          map: created,
          marks: leaflet.layerGroup().addTo(created),
        }
        draw(drawn.current, latest.current, true)
      })
      .catch(() => settle("failed"))
    return () => {
      isCancelled = true
      window.clearTimeout(timer)
      created?.remove()
      drawn.current = null
    }
  }, [])

  // Redraw only when what is drawn changes, not on every age tick.
  const drawnKey = JSON.stringify(view)
  useEffect(() => {
    latest.current = view
    if (drawn.current) draw(drawn.current, view, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `drawnKey` is `view` by value
  }, [drawnKey])

  if (state === "failed")
    return (
      <p
        role="status"
        className="mt-3 rounded-lg bg-mtogo-status-warning-surface p-4 text-mtogo-status-warning-text"
        data-testid="delivery-map"
        data-map-state="failed"
      >
        {text.map_failed}
      </p>
    )
  return (
    <figure className="mt-3" data-testid="delivery-map" data-map-state={state}>
      <div className="relative">
        <div
          ref={container}
          role="region"
          aria-label={text.map_label}
          aria-describedby={captionId}
          className="isolate h-56 w-full rounded-lg border border-mtogo-border-subtle bg-mtogo-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2 sm:h-72"
        />
        {state === "loading" && (
          <p
            role="status"
            className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center rounded-lg bg-mtogo-surface-page text-mtogo-text-secondary"
          >
            {text.map_loading}
          </p>
        )}
      </div>
      <figcaption
        id={captionId}
        aria-live="polite"
        className="mt-2 text-mtogo-text-secondary"
      >
        {view.precision === "precise" ? text.map_precise : text.map_approximate}
        {view.freshness === "stale" && <> {text.map_stale}</>}
      </figcaption>
    </figure>
  )
}

/**
 * Replace the drawn position with the measured one, exactly where it was
 * measured. A precise sample is a dot inside its accuracy circle; a coarse or
 * unreported one is only an area on the ground, so at any zoom it never reads
 * as an exact spot. The view moves only to keep a new position in sight,
 * never by animation.
 */
function draw(
  { leaflet, map, marks }: DrawnMap,
  view: Position,
  isFirst: boolean,
) {
  const position: [number, number] = [view.latitude, view.longitude]
  const style = MARK_STYLE[view.freshness]
  const isUnreported = view.accuracy_m === null
  marks.clearLayers()
  const accuracyArea = leaflet
    .circle(position, {
      radius: isUnreported
        ? UNREPORTED_ACCURACY_RADIUS_M
        : Math.max(view.accuracy_m ?? 0, MIN_ACCURACY_RADIUS_M),
      className: style.area,
      weight: isUnreported ? 2 : 1,
      fillOpacity: 0.15,
      dashArray: isUnreported ? "4 4" : style.dashArray,
      interactive: false,
    })
    .addTo(marks)
  if (view.precision === "precise")
    leaflet
      .circleMarker(position, {
        radius: DOT_RADIUS_PX,
        className: style.dot,
        weight: DOT_OUTLINE_PX,
        fillOpacity: 1,
        interactive: false,
      })
      .addTo(marks)
  const bounds = accuracyArea.getBounds()
  if (isFirst || !map.getBounds().contains(bounds))
    map.fitBounds(bounds, {
      animate: false,
      maxZoom: POSITION_ZOOM,
    })
}
