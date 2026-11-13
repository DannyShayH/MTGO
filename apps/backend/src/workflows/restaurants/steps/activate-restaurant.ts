import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import RestaurantModuleService from "../../../modules/restaurant/service"
import { RESTAURANT_MODULE } from "../../../modules/restaurant"
import {
  ActivationRequirementCode,
  evaluateActivationRequirements,
} from "../activation-requirements"
import { withResponseFields } from "../../common/response-fields"
import { readActivationFacts } from "./activation-facts"

/** The refusal names every missing code in its message and carries them as `missing` for the UI. */
export const activationRequirementsMissing = (
  missing: ActivationRequirementCode[],
) =>
  withResponseFields(
    new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `activation_requirements_missing: ${missing.join(", ")}`,
      "activation_requirements_missing",
    ),
    { missing },
  )

type Activation = { has_activated: boolean }

/**
 * Makes a Restaurant Active after checking the requirements again (ADR-0008).
 * It stays Closed until its staff open it. An active Restaurant changes nothing.
 */
export const activateRestaurantStep = createStep(
  "activate-restaurant",
  async (input: { restaurant_id: string }, { container }) => {
    const facts = await readActivationFacts(container, input.restaurant_id)
    if (facts.is_active)
      return new StepResponse<Activation, string | null>(
        { has_activated: false },
        null,
      )
    const missing = evaluateActivationRequirements(facts)
    if (missing.length) throw activationRequirementsMissing(missing)
    await container
      .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
      .updateRestaurants({ id: input.restaurant_id, is_active: true })
    return new StepResponse<Activation, string | null>(
      { has_activated: true },
      input.restaurant_id,
    )
  },
  async (activatedId, { container }) => {
    if (!activatedId) return
    await container
      .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
      .updateRestaurants({ id: activatedId, is_active: false })
  },
)
