import { randomUUID } from "node:crypto"
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { acquireLockStep, releaseLockStep } from "@medusajs/medusa/core-flows"
import { restaurantLock } from "../restaurants/restaurant-lock"
import { retrieveAuthorizedStaffStep } from "../restaurant-staff/steps/retrieve-authorized-staff"
import { assertOwnRestaurantStep } from "../restaurant-staff/steps/own-restaurant"
import {
  readMenuArrangementStep,
  changeMenuArrangementStep,
} from "./steps/arrangement"
import { MenuArrangementInput } from "./validation"

type Scope = { restaurant_id: string; staff_id: string }
export const readMenuArrangementWorkflow = createWorkflow(
  "read-menu-arrangement",
  function (input: Scope) {
    const lock = transform(input, ({ restaurant_id }) =>
      restaurantLock(restaurant_id),
    )
    acquireLockStep(lock)
    const current = retrieveAuthorizedStaffStep({ staff_id: input.staff_id })
    const scope = transform({ input, current }, ({ input, current }) => ({
      id: input.restaurant_id,
      staff_restaurant_id: current.restaurant.id,
    }))
    assertOwnRestaurantStep(scope)
    const result = readMenuArrangementStep(input)
    releaseLockStep(lock)
    return new WorkflowResponse(result)
  },
)
export const changeMenuArrangementWorkflow = createWorkflow(
  "change-menu-arrangement",
  function (input: Scope & MenuArrangementInput) {
    const lock = transform(input, ({ restaurant_id }) => ({
      ...restaurantLock(restaurant_id),
      ownerId: randomUUID(),
    }))
    acquireLockStep(lock)
    const current = retrieveAuthorizedStaffStep({ staff_id: input.staff_id })
    const scope = transform({ input, current }, ({ input, current }) => ({
      id: input.restaurant_id,
      staff_restaurant_id: current.restaurant.id,
    }))
    assertOwnRestaurantStep(scope)
    const command = transform(
      { input, current, lock },
      ({ input, current, lock }) => ({
        ...input,
        actor_name: current.staff.name,
        lock,
      }),
    )
    const result = changeMenuArrangementStep(command)
    releaseLockStep(lock)
    return new WorkflowResponse(result)
  },
)
