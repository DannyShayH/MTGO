import { createLogRecord } from "@dtc/logging"
import type { Logger } from "@medusajs/framework/types"

/** A point on the map, in decimal degrees (WGS 84). */
export type Coordinates = { latitude: number; longitude: number }

/** A Danish street address as the geocoder takes it. */
export type StreetAddress = {
  street: string
  postal_code: string
  city: string
}

export type RoutingOptions = {
  /** The openrouteservice key (`ORS_API_KEY`). Without it nothing is called. */
  api_key?: string
  base_url?: string
  /** The openrouteservice routing profile; agents cycle by default. */
  profile?: string
  /** Each provider call's limit, so a slow provider never holds work up. */
  timeout_ms?: number
}

/**
 * HeiGIT's API, which replaced api.openrouteservice.org (deprecated in 2026,
 * then limited to a tenth of the plan quota). The same key works on it.
 */
const DEFAULT_BASE_URL = "https://api.heigit.org"
/** Geocoding (Pelias) and routing sit under their own paths on that host. */
const GEOCODE_PATH = "/pelias/v1/search/structured"
const ROUTING_PATH = "/openrouteservice/v2"
const DEFAULT_PROFILE = "cycling-regular"
const DEFAULT_TIMEOUT_MS = 3000

/** Distances are shown to 0.1 km, so they are kept to the nearest 100 m. */
export const roundDistance = (meters: number) => Math.round(meters / 100) * 100

const lonLat = ({ latitude, longitude }: Coordinates) => [longitude, latitude]

/** Geocoder layers precise enough to measure a trip from. */
const ADDRESS_LAYERS = new Set(["address", "street"])

/**
 * The street name and house number, with an optional house letter, without
 * the floor and door that follow them in a Danish address line.
 */
export function streetAndNumber(street: string) {
  const words = street.split(",")[0].trim().split(/\s+/)
  // The house number: digits with an optional letter, as in "12" or "12A".
  const number = words.findIndex((word) => HOUSE_NUMBER.test(word))
  if (number < 0) return words.join(" ")
  // A house letter may also stand on its own: "Nørrebrogade 12 B".
  const letter = HOUSE_LETTER.test(words[number + 1] ?? "") ? 1 : 0
  return words.slice(0, number + 1 + letter).join(" ")
}

const HOUSE_NUMBER = /^\d+[A-Za-zÆØÅæøå]?$/
const HOUSE_LETTER = /^[A-Za-zÆØÅæøå]$/

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

/**
 * The openrouteservice adapter (#191): geocoding, one trip distance and
 * distances from one origin to many pickups, on OpenStreetMap data. Every
 * method answers null for "no distance" (no key, a provider error, a timeout,
 * an over-quota response or no route) and never throws, so a missing distance
 * never blocks work. The key travels in a header, never in a URL, and nothing
 * here logs coordinates or addresses.
 */
export default class RoutingModuleService {
  protected logger_: Logger
  protected options_: Required<Omit<RoutingOptions, "api_key">> & {
    api_key?: string
  }

  constructor({ logger }: { logger: Logger }, options: RoutingOptions = {}) {
    this.logger_ = logger
    this.options_ = {
      api_key: options.api_key || undefined,
      base_url: (options.base_url || DEFAULT_BASE_URL).replace(/\/$/, ""),
      profile: options.profile || DEFAULT_PROFILE,
      timeout_ms: options.timeout_ms ?? DEFAULT_TIMEOUT_MS,
    }
  }

  /** Whether a key is configured; without one every distance is unavailable. */
  isConfigured() {
    return !!this.options_.api_key
  }

  /**
   * The address's position, or null when the geocoder only found an area.
   * The street goes without its floor and door ("Rømersgade 9, 1. tv" is
   * sent as "Rømersgade 9") and without the town: a postal district such
   * as "København N" makes the geocoder fall back to the centre of Denmark,
   * while the postal code alone places the street.
   */
  async geocode(address: StreetAddress): Promise<Coordinates | null> {
    const query = new URLSearchParams({
      address: streetAndNumber(address.street),
      postalcode: address.postal_code,
      country: "DK",
      size: "1",
    })
    const body = (await this.request(
      GEOCODE_PATH,
      `${GEOCODE_PATH}?${query}`,
    )) as {
      features?: {
        geometry?: { coordinates?: unknown[] }
        properties?: { layer?: unknown }
      }[]
    } | null
    const feature = body?.features?.[0]
    // A town, district or country centre would measure a made-up trip.
    if (!ADDRESS_LAYERS.has(String(feature?.properties?.layer))) return null
    const [longitude, latitude] = feature?.geometry?.coordinates ?? []
    return isFiniteNumber(latitude) && isFiniteNumber(longitude)
      ? { latitude, longitude }
      : null
  }

  /** The route distance in meters, rounded to 100 m. */
  async tripDistance(
    from: Coordinates,
    to: Coordinates,
  ): Promise<number | null> {
    const body = (await this.request(
      `${ROUTING_PATH}/directions/:profile`,
      `${ROUTING_PATH}/directions/${this.options_.profile}`,
      {
        coordinates: [lonLat(from), lonLat(to)],
        instructions: false,
        geometry: false,
      },
    )) as { routes?: { summary?: { distance?: unknown } }[] } | null
    const distance = body?.routes?.[0]?.summary?.distance
    return isFiniteNumber(distance) ? roundDistance(distance) : null
  }

  /** Route distances in meters from `origin` to each destination, in order. */
  async distancesFrom(
    origin: Coordinates,
    destinations: Coordinates[],
  ): Promise<(number | null)[]> {
    if (!destinations.length) return []
    const body = (await this.request(
      `${ROUTING_PATH}/matrix/:profile`,
      `${ROUTING_PATH}/matrix/${this.options_.profile}`,
      {
        locations: [origin, ...destinations].map(lonLat),
        sources: [0],
        destinations: destinations.map((_, index) => index + 1),
        metrics: ["distance"],
        units: "m",
      },
    )) as { distances?: unknown[][] } | null
    const row = body?.distances?.[0]
    return destinations.map((_, index) => {
      const distance = Array.isArray(row) ? row[index] : null
      return isFiniteNumber(distance) ? roundDistance(distance) : null
    })
  }

  /**
   * One provider call; null on any failure. A failure is logged as
   * `upstream.request.failed` with the constant route pattern, method and
   * status only: never the URL, body, coordinates or provider text.
   */
  private async request(
    route: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    if (!this.options_.api_key) return null
    try {
      const response = await fetch(`${this.options_.base_url}${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          authorization: this.options_.api_key,
          accept: "application/json",
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.options_.timeout_ms),
      })
      if (!response.ok) {
        this.logFailure(route, body, response.status)
        return null
      }
      return await response.json()
    } catch {
      // A timeout, a network failure or an unreadable body: no status.
      this.logFailure(route, body)
      return null
    }
  }

  private logFailure(route: string, body: unknown, status?: number) {
    const record = createLogRecord("backend", "upstream.request.failed", {
      route,
      method: body ? "POST" : "GET",
      ...(status === undefined ? {} : { status }),
    })
    this.logger_.log(record.level, record.msg, record)
  }
}
