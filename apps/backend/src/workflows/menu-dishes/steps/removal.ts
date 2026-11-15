import { createLogRecord } from "@dtc/logging"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { RESTAURANT_MODULE } from "../../../modules/restaurant"
import RestaurantModuleService from "../../../modules/restaurant/service"
import { readPublishedMenu } from "../../menu"
import { withResponseFields } from "../../common/response-fields"

const refuse = (type: string, code: string) => new MedusaError(type, code, code)

export const prepareDishRemovalStep = createStep(
  "prepare-dish-removal",
  async (
    input: { restaurant_id: string; dish_id: string; revision: number },
    { container },
  ) => {
    const menu = await readPublishedMenu(container, input.restaurant_id)
    const dishes = menu.flatMap(({ dishes }) => dishes)
    const dish = dishes.find(({ id }) => id === input.dish_id)
    if (!dish) throw refuse(MedusaError.Types.NOT_FOUND, "dish_not_found")
    if (dish.revision !== input.revision)
      throw withResponseFields(
        refuse(MedusaError.Types.CONFLICT, "dish_stale"),
        { dish },
      )
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    const restaurant = await service.retrieveRestaurant(input.restaurant_id)
    if (restaurant.is_active && dishes.length === 1)
      throw refuse(
        MedusaError.Types.CONFLICT,
        "last_published_dish_while_active",
      )
    const { data } = await container
      .resolve(ContainerRegistrationKeys.QUERY)
      .graph({
        entity: "product",
        fields: ["id", "menu_dish.*"],
        filters: { id: input.dish_id },
      })
    const content = data[0]?.menu_dish as
      | {
          id: string
          category_id: string | null
          publication_committed: boolean
          successful_change: Record<string, unknown> | null
        }
      | undefined
    if (!content) throw refuse(MedusaError.Types.NOT_FOUND, "dish_not_found")
    return new StepResponse({ content, dish, menu })
  },
)

export const commitDishRemovalStep = createStep(
  "commit-dish-removal",
  async (
    input: {
      content: {
        id: string
        category_id: string | null
        publication_committed: boolean
        successful_change: Record<string, unknown> | null
      }
      dish_id: string
      revision: number
      staff_id: string
      actor_name: string
      lock_key: string
    },
    { container },
  ) => {
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    const change = {
      kind: "remove",
      actor_id: input.staff_id,
      actor_name: input.actor_name,
      occurred_at: new Date().toISOString(),
      resource_id: input.dish_id,
    }
    try {
      await service.updateMenuDishes({
        id: input.content.id,
        category_id: null,
        publication_committed: false,
        revision: input.revision + 1,
        successful_change: change,
      })
    } catch (error) {
      const current = await service
        .retrieveMenuDish(input.content.id)
        .catch(() => null)
      const saved = current?.successful_change as
        typeof change | null | undefined
      if (
        current?.revision !== input.revision + 1 ||
        saved?.kind !== "remove" ||
        saved.resource_id !== input.dish_id ||
        saved.occurred_at !== change.occurred_at
      )
        throw error
    }
    try {
      await container.resolve(Modules.LOCKING).release([input.lock_key])
    } catch {
      const record = createLogRecord("backend", "upstream.request.failed", {
        route: "/partner/restaurants/:id/dishes/:dish_id",
        method: "DELETE",
      })
      container
        .resolve(ContainerRegistrationKeys.LOGGER)
        .log(record.level, record.msg, record)
    }
    return new StepResponse({ id: input.dish_id }, input)
  },
  async (undo, { container }) => {
    if (!undo) return
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    const current = await service.retrieveMenuDish(undo.content.id)
    if (current.revision === undo.revision + 1)
      await service.updateMenuDishes({
        id: undo.content.id,
        category_id: undo.content.category_id,
        publication_committed: undo.content.publication_committed,
        revision: undo.revision,
        successful_change: undo.content.successful_change,
      })
  },
)
