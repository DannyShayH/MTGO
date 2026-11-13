import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import RestaurantModuleService from "../../../modules/restaurant/service"
import { RESTAURANT_MODULE } from "../../../modules/restaurant"
import {
  DeactivationKind,
  ParticipationState,
  planDeactivationHistory,
} from "../participation"
import { readParticipationOrThrow } from "./restaurant-exists"

type Deactivation = { kinds: DeactivationKind[] }
/** The participation to restore on compensation; null when nothing changed. */
type Undo = (ParticipationState & { id: string }) | null

/**
 * Makes a Restaurant Inactive and Closed (spec stories 31 and 32), so a later
 * reactivation never brings Orders by surprise. An inactive one changes nothing.
 */
export const deactivateRestaurantStep = createStep(
  "deactivate-restaurant",
  async (input: { restaurant_id: string }, { container }) => {
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    const before = await readParticipationOrThrow(service, input.restaurant_id)
    const kinds = planDeactivationHistory(before)
    if (!kinds.length)
      return new StepResponse<Deactivation, Undo>({ kinds }, null)
    await service.updateRestaurants({
      id: input.restaurant_id,
      is_active: false,
      is_open: false,
    })
    return new StepResponse<Deactivation, Undo>(
      { kinds },
      { id: input.restaurant_id, ...before },
    )
  },
  async (before, { container }) => {
    if (!before) return
    await container
      .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
      .updateRestaurants(before)
  },
)
