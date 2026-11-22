import type {
  KeptPosition,
  LocationFacts,
  LocationOutcome,
} from "../../modules/delivery/service"
import type { TerminalOutcome } from "../../modules/delivery/models/intended-delivery"

/** Refusals because of the delivery, the Order or the sample (`NOT_ALLOWED`, 400). */
export const LOCATION_REFUSALS = [
  "pickup_not_recorded",
  "delivery_not_responsible",
  "delivery_not_active",
  "location_observed_in_future",
  "location_observation_too_old",
] as const

/** Refusals because a newer sample is already retained (`CONFLICT`, 409). */
export const LOCATION_CONFLICTS = ["location_out_of_order"] as const

export type LocationRefusal =
  | (typeof LOCATION_REFUSALS)[number]
  | (typeof LOCATION_CONFLICTS)[number]
  | "delivery_agent_not_authorized"

/** The module's outcomes the rule itself decides, with its refusal codes. */
export type LocationDecision =
  | Extract<LocationOutcome, { outcome: "record" | "coalesced" }>
  | { outcome: "refused"; code: LocationRefusal }

/** A location is labelled stale this long after its observation (story 56). */
export const LOCATION_STALE_AFTER_MS = 60 * 1000
/** Phone clocks may run slightly ahead; beyond this an observation is refused. */
export const LOCATION_FUTURE_TOLERANCE_MS = 5 * 1000
/** An observation older than this is refused rather than shown at all. */
export const LOCATION_MAX_AGE_MS = 10 * 60 * 1000
/** Samples arriving sooner than this after the retained one are not stored. */
export const LOCATION_MIN_INTERVAL_MS = 5 * 1000

export type { LocationFacts }

/**
 * The location sample rule (#166; spec #48 stories 51-56). Only the
 * responsible, authorized agent of active, collected work shares location.
 * Freshness comes from the phone's observation, never from the receipt: an
 * observation in the server's future beyond a small clock tolerance is
 * refused, a slightly fast clock is capped at the receipt time, and a
 * sample must be newer than the retained one, so a delayed or replayed
 * request never makes an older position look current. A newer sample that
 * arrives within five seconds of the retained one is coalesced: it is not
 * stored and nothing is refused.
 */
export function decideLocationSample(
  facts: LocationFacts,
  now: Date,
): LocationDecision {
  const { agent, delivery, latest } = facts
  const refuse = (code: LocationRefusal): LocationDecision => ({
    outcome: "refused",
    code,
  })
  if (agent.status !== "authorized")
    return refuse("delivery_agent_not_authorized")
  if (delivery.assigned_agent_id !== agent.id)
    return refuse("delivery_not_responsible")
  if (
    delivery.terminal_outcome ||
    !facts.order_active ||
    delivery.active_agent_id !== agent.id
  )
    return refuse("delivery_not_active")
  if (!delivery.picked_up_at) return refuse("pickup_not_recorded")
  const observed = facts.observed_at.getTime()
  const received = now.getTime()
  if (observed > received + LOCATION_FUTURE_TOLERANCE_MS)
    return refuse("location_observed_in_future")
  if (observed < received - LOCATION_MAX_AGE_MS)
    return refuse("location_observation_too_old")
  const observed_at = new Date(Math.min(observed, received))
  if (latest) {
    if (observed_at.getTime() <= new Date(latest.observed_at).getTime())
      return refuse("location_out_of_order")
    if (
      received - new Date(latest.received_at).getTime() <
      LOCATION_MIN_INTERVAL_MS
    )
      return { outcome: "coalesced" }
  }
  return { outcome: "record", observed_at }
}

/**
 * What the ordering Customer may know of the agent's position (#166; spec
 * #48 stories 55-57, 64), for #50's map: `not_started` before pickup,
 * `unavailable` in transit without a sample, `fresh` or `stale` with the
 * latest coordinate, and `ended` once the delivery ended. Never interpolated:
 * a missing position stays unavailable.
 */
export type DeliveryLocationView = {
  state: "not_started" | "unavailable" | "fresh" | "stale" | "ended"
  latitude: number | null
  longitude: number | null
  accuracy_m: number | null
  observed_at: string | null
  received_at: string | null
  /** When this sample becomes stale, without a newer one. */
  stale_at: string | null
}

const withoutCoordinate = (
  state: DeliveryLocationView["state"],
): DeliveryLocationView => ({
  state,
  latitude: null,
  longitude: null,
  accuracy_m: null,
  observed_at: null,
  received_at: null,
  stale_at: null,
})

/** Freshness at the server's time: stale from exactly sixty seconds after observation. */
export function deliveryLocationView(
  delivery: {
    picked_up_at: Date | string | null
    terminal_outcome: TerminalOutcome | null
  } | null,
  sample: KeptPosition | null,
  now: Date,
): DeliveryLocationView {
  if (delivery?.terminal_outcome) return withoutCoordinate("ended")
  if (!delivery?.picked_up_at) return withoutCoordinate("not_started")
  if (!sample) return withoutCoordinate("unavailable")
  const observed = new Date(sample.observed_at).getTime()
  const staleAt = observed + LOCATION_STALE_AFTER_MS
  return {
    state: now.getTime() >= staleAt ? "stale" : "fresh",
    latitude: sample.latitude,
    longitude: sample.longitude,
    accuracy_m: sample.accuracy_m,
    observed_at: new Date(observed).toISOString(),
    received_at: new Date(sample.received_at).toISOString(),
    stale_at: new Date(staleAt).toISOString(),
  }
}
