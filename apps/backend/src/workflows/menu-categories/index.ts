import {
  createWorkflow,
  WorkflowResponse,
  transform,
} from "@medusajs/framework/workflows-sdk"
import { acquireLockStep, releaseLockStep } from "@medusajs/medusa/core-flows"
import { restaurantLock } from "../restaurants/restaurant-lock"
import { retrieveAuthorizedStaffStep } from "../restaurant-staff/steps/retrieve-authorized-staff"
import { assertOwnRestaurantStep } from "../restaurant-staff/steps/own-restaurant"
import {
  listMenuCategoriesStep,
  mutateMenuCategoryStep,
} from "./steps/categories"
import { CategoryMutation } from "./validation"

export const listMenuCategoriesWorkflow = createWorkflow(
  "list-menu-categories",
  function (input: { restaurant_id: string; staff_id: string }) {
    const current = retrieveAuthorizedStaffStep({ staff_id: input.staff_id })
    const scope = transform({ input, current }, ({ input, current }) => ({
      id: input.restaurant_id,
      staff_restaurant_id: current.restaurant.id,
    }))
    assertOwnRestaurantStep(scope)
    return new WorkflowResponse(
      listMenuCategoriesStep({ restaurant_id: input.restaurant_id }),
    )
  },
)

export const mutateMenuCategoryWorkflow = createWorkflow(
  "mutate-menu-category",
  function (input: CategoryMutation) {
    const lock = transform({ input }, ({ input }) =>
      restaurantLock(input.restaurant_id),
    )
    acquireLockStep(lock)
    const current = retrieveAuthorizedStaffStep({ staff_id: input.staff_id })
    const scope = transform({ input, current }, ({ input, current }) => ({
      id: input.restaurant_id,
      staff_restaurant_id: current.restaurant.id,
    }))
    assertOwnRestaurantStep(scope)
    const mutation = transform({ input, current }, ({ input, current }) => ({
      ...input,
      actor_name: current.staff.name,
    }))
    const result = mutateMenuCategoryStep(mutation)
    releaseLockStep(lock)
    return new WorkflowResponse(result)
  },
)
