import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { assertOwnRestaurant } from "../../restaurants/steps/read-restaurants"

/** Refuses another Restaurant with NOT_FOUND before anything changes (spec story 53). */
export const assertOwnRestaurantStep = createStep(
  "assert-own-restaurant",
  async (input: { id: string; staff_restaurant_id: string }) => {
    assertOwnRestaurant(input)
    return new StepResponse(undefined)
  },
)
