import { createLogRecord } from "@dtc/logging"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { RESTAURANT_MODULE } from "../../../modules/restaurant"
import RestaurantModuleService from "../../../modules/restaurant/service"
import { readPublishedMenu } from "../../menu"
import { withResponseFields } from "../../common/response-fields"
import { DishAvailabilityInput } from "../validation"

export type AvailabilityCommand = DishAvailabilityInput & {
  restaurant_id: string
  dish_id: string
  staff_id: string
  actor_name: string
  lock_key: string
}

const refuse = (type: string, code: string) => new MedusaError(type, code, code)
type AvailabilityUndo = {
  content_id: string
  request_id: string
  revision: number
  is_sold_out: boolean
  successful_change: Record<string, unknown> | null
  availability_history: Record<string, unknown> | null
} | null

async function releaseRestaurantLock(container: MedusaContainer, key: string) {
  try {
    await container.resolve(Modules.LOCKING).release([key])
  } catch {
    const record = createLogRecord("backend", "upstream.request.failed", {
      route: "/partner/restaurants/:id/dishes/:dish_id/availability",
      method: "POST",
    })
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .log(record.level, record.msg, record)
  }
}

export const changeDishAvailabilityStep = createStep(
  "change-dish-availability",
  async (input: AvailabilityCommand, { container }) => {
    const menu = await readPublishedMenu(container, input.restaurant_id)
    const dish = menu
      .flatMap(({ dishes }) => dishes)
      .find(({ id }) => id === input.dish_id)
    if (!dish) throw refuse(MedusaError.Types.NOT_FOUND, "dish_not_found")
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: products } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "menu_dish.id",
        "menu_dish.successful_change",
        "menu_dish.availability_history",
      ],
      filters: { id: input.dish_id },
    })
    const content = products[0]?.menu_dish as
      | {
          id: string
          successful_change?: {
            kind?: string
            request_id?: string
            input?: DishAvailabilityInput
          }
          availability_history?: {
            entries: {
              actor_id: string
              actor_name: string
              occurred_at: string
              resource_id: string
              is_sold_out: boolean
            }[]
          } | null
        }
      | undefined
    if (!content) throw refuse(MedusaError.Types.NOT_FOUND, "dish_not_found")
    const previous = content.successful_change
    let undo: AvailabilityUndo = null
    if (
      previous?.request_id === input.request_id &&
      (previous.kind !== "availability" ||
        previous.input?.revision !== input.revision ||
        previous.input.is_sold_out !== input.is_sold_out)
    )
      throw refuse(MedusaError.Types.CONFLICT, "dish_retry_conflict")
    if (
      dish.revision !== input.revision &&
      !(
        previous?.request_id === input.request_id &&
        dish.revision === input.revision + 1
      )
    )
      throw withResponseFields(
        refuse(MedusaError.Types.CONFLICT, "dish_stale"),
        { dish },
      )
    if (
      dish.revision === input.revision &&
      dish.is_sold_out !== input.is_sold_out
    ) {
      const service =
        container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
      try {
        const occurred_at = new Date().toISOString()
        await service.updateMenuDishes({
          id: content.id,
          is_sold_out: input.is_sold_out,
          revision: input.revision + 1,
          successful_change: {
            kind: "availability",
            actor_id: input.staff_id,
            actor_name: input.actor_name,
            occurred_at,
            resource_id: input.dish_id,
            request_id: input.request_id,
            input: {
              revision: input.revision,
              is_sold_out: input.is_sold_out,
            },
          },
          availability_history: {
            entries: [
              ...(content.availability_history?.entries ?? []),
              {
                actor_id: input.staff_id,
                actor_name: input.actor_name,
                occurred_at,
                resource_id: input.dish_id,
                is_sold_out: input.is_sold_out,
              },
            ],
          },
        })
      } catch {
        const current = await service
          .retrieveMenuDish(content.id)
          .catch(() => null)
        if (
          current?.revision !== input.revision + 1 ||
          (current?.successful_change as { request_id?: string } | null)
            ?.request_id !== input.request_id
        )
          throw refuse(
            MedusaError.Types.UNEXPECTED_STATE,
            "dish_publication_uncertain",
          )
      }
      undo = {
        content_id: content.id,
        request_id: input.request_id,
        revision: dish.revision,
        is_sold_out: dish.is_sold_out,
        successful_change: (previous as Record<string, unknown>) ?? null,
        availability_history:
          (content.availability_history as Record<string, unknown>) ?? null,
      }
    }
    await releaseRestaurantLock(container, input.lock_key)
    return new StepResponse<{ dish: typeof dish }, AvailabilityUndo>(
      {
        dish: {
          ...dish,
          revision:
            dish.is_sold_out === input.is_sold_out
              ? dish.revision
              : input.revision + 1,
          is_sold_out: input.is_sold_out,
        },
      },
      undo,
    )
  },
  async (undo, { container }) => {
    if (!undo) return
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    const current = await service.retrieveMenuDish(undo.content_id)
    if (
      current.revision === undo.revision + 1 &&
      (current.successful_change as { request_id?: string } | null)
        ?.request_id === undo.request_id
    )
      await service.updateMenuDishes({
        id: undo.content_id,
        revision: undo.revision,
        is_sold_out: undo.is_sold_out,
        successful_change: undo.successful_change,
        availability_history: undo.availability_history,
      })
  },
)
