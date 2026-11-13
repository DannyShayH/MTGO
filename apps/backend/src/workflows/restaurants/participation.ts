import { MedusaError } from "@medusajs/framework/utils"
import { HistoryKind } from "./steps/history"

export type ParticipationState = { is_active: boolean; is_open: boolean }
export type DeactivationKind = Extract<HistoryKind, "closed" | "deactivated">

/**
 * Plans the history kinds a deactivation records, in recording order.
 * Deactivation also closes, so an open Restaurant records `closed` first and
 * newest first shows the deactivation on top. An inactive one records nothing
 * whether or not it is open (spec story 36).
 */
export function planDeactivationHistory(
  state: ParticipationState,
): DeactivationKind[] {
  if (!state.is_active) return []
  return state.is_open ? ["closed", "deactivated"] : ["deactivated"]
}

export type WhileActiveRefusalCode =
  "last_postal_code_while_active" | "commercial_terms_required_while_active"

/** A setup change refused because it would leave an active Restaurant unable to take Orders. */
export const notAllowedWhileActive = (code: WhileActiveRefusalCode) =>
  new MedusaError(MedusaError.Types.NOT_ALLOWED, code, code)

/** An active Restaurant always keeps a delivery area (spec story 12). */
export function emptiesActiveDeliveryArea(change: {
  is_active: boolean
  remaining_count: number
}): boolean {
  return change.is_active && change.remaining_count === 0
}
