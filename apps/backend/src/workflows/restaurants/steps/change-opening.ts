import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import RestaurantModuleService from "../../../modules/restaurant/service"
import { RESTAURANT_MODULE } from "../../../modules/restaurant"
import { OpeningKind, planOpeningChange } from "../participation"
import { readParticipationOrThrow } from "./restaurant-exists"

type OpeningChange = { kind: OpeningKind | null }
/** The opening to restore on compensation; null when nothing changed. */
type Undo = { id: string; is_open: boolean } | null

/**
 * Opens (`is_opening` true) or closes a Restaurant for staff. An inactive one cannot
 * open, and the state it is already in changes nothing (spec stories 49-50).
 * Callers hold the Restaurant's lock, so this cannot race deactivation.
 */
export const changeRestaurantOpeningStep = createStep(
  "change-restaurant-opening",
  async (
    input: { restaurant_id: string; is_opening: boolean },
    { container },
  ) => {
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    const before = await readParticipationOrThrow(service, input.restaurant_id)
    const kind = planOpeningChange(before, input.is_opening)
    if (!kind) return new StepResponse<OpeningChange, Undo>({ kind }, null)
    await service.updateRestaurants({
      id: input.restaurant_id,
      is_open: input.is_opening,
    })
    return new StepResponse<OpeningChange, Undo>(
      { kind },
      { id: input.restaurant_id, is_open: before.is_open },
    )
  },
  async (before, { container }) => {
    if (!before) return
    await container
      .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
      .updateRestaurants(before)
  },
)
