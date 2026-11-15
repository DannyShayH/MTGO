import { createLogRecord } from "@dtc/logging"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { RESTAURANT_MODULE } from "../../../modules/restaurant"
import RestaurantModuleService from "../../../modules/restaurant/service"
import { PublishedCategory } from "../../menu/published-menu"
import { readPublishedMenu } from "../../menu"
import { dishCreateSchema, DishCreateInput } from "../validation"
import { validateAllergens } from "../validate-allergens"

export type CreateDishCommand = DishCreateInput & {
  restaurant_id: string
  staff_id: string
}
const refuse = (type: string, code: string) => new MedusaError(type, code, code)

/** Reservation deliberately survives rollback: an uncertain request keeps its identity. */
export const prepareDishPublicationStep = createStep(
  "prepare-dish-publication",
  async (input: CreateDishCommand & { actor_name: string }, { container }) => {
    const parsed = dishCreateSchema.safeParse({
      request_id: input.request_id,
      category_id: input.category_id,
      name: input.name,
      price: input.price,
      allergens: input.allergens,
    })
    if (!parsed.success)
      throw refuse(MedusaError.Types.INVALID_DATA, "dish_input_invalid")
    const data = parsed.data
    await validateAllergens(container, data.allergens)
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    const [category] = await service.listMenuCategories({
      id: data.category_id,
      restaurant_id: input.restaurant_id,
      is_removed: false,
    })
    if (!category)
      throw refuse(MedusaError.Types.NOT_FOUND, "category_not_found")
    const payload = {
      category_id: data.category_id,
      name: data.name,
      price: data.price,
      allergens: data.allergens,
    }
    let [operation] = await service.listMenuDishCreations({
      restaurant_id: input.restaurant_id,
      request_id: data.request_id,
    })
    if (operation) {
      const original = operation.input
      const name = original.name as { da: string; en: string }
      if (
        original.category_id !== payload.category_id ||
        original.price !== payload.price ||
        name.da !== payload.name.da ||
        name.en !== payload.name.en ||
        JSON.stringify(original.allergens ?? { status: "unknown" }) !==
          JSON.stringify(payload.allergens)
      )
        throw refuse(MedusaError.Types.CONFLICT, "dish_retry_conflict")
    }
    if (!operation)
      operation = await service.createMenuDishCreations({
        restaurant_id: input.restaurant_id,
        request_id: data.request_id,
        input: payload,
        actor_id: input.staff_id,
        actor_name: input.actor_name,
      })
    const handle = `staff-dish-${operation.id.replaceAll("_", "-").toLowerCase()}`
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "menu_dish.*"],
      filters: { handle },
    })
    const existing = products[0] as unknown as
      | {
          id: string
          menu_dish?: { publication_committed: boolean }
        }
      | undefined
    const menu = await readPublishedMenu(container, input.restaurant_id)
    const saved = menu
      .flatMap(({ dishes }) => dishes)
      .find(({ id }) => id === existing?.id)
    if (existing?.menu_dish?.publication_committed && !saved)
      throw refuse(MedusaError.Types.CONFLICT, "dish_recovery_required")
    const dishes = menu.find(({ id }) => id === category.id)?.dishes ?? []
    const categoryOrder = await service.listMenuCategories(
      { restaurant_id: input.restaurant_id, is_removed: false },
      { order: { position: "ASC", id: "ASC" }, take: null },
    )
    return new StepResponse({
      category_order: categoryOrder.map(({ id }) => id),
      operation,
      handle,
      data,
      saved,
      old_product_ids: existing && !saved ? [existing.id] : [],
      position: dishes.length,
      menu,
      category: {
        id: category.id,
        revision: category.revision,
        name: { da: category.name_da, en: category.name_en },
      },
    })
  },
)

export const createDishContentStep = createStep(
  "create-dish-content",
  async (
    input: {
      name: { da: string; en: string }
      position: number
      allergens: DishCreateInput["allergens"]
    },
    { container },
  ) => {
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    const content = await service.createMenuDishes({
      name_da: input.name.da,
      name_en: input.name.en,
      position: input.position,
      allergen_declaration: input.allergens,
      publication_committed: false,
    })
    return new StepResponse(content.id, content.id)
  },
  async (id, { container }) => {
    if (id)
      await container
        .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
        .deleteMenuDishes(id)
  },
)

/** No fallible workflow work follows the visibility write. Uncertain commits reconcile on retry. */
export const commitDishPublicationStep = createStep(
  "commit-dish-publication",
  async (
    input: {
      content_id?: string
      product_id?: string
      actor_id: string
      actor_name: string
      lock_key: string
      categories: PublishedCategory[]
    },
    { container },
  ) => {
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    const locking = container.resolve(Modules.LOCKING)
    let confirmed = true
    if (input.content_id) {
      try {
        await service.updateMenuDishes({
          id: input.content_id,
          publication_committed: true,
          published_price: String(
            input.categories
              .flatMap(({ dishes }) => dishes)
              .find(({ id }) => id === input.product_id)?.price.amount,
          ),
          successful_change: {
            kind: "create",
            actor_id: input.actor_id,
            actor_name: input.actor_name,
            occurred_at: new Date().toISOString(),
            resource_id: input.product_id,
          },
        })
      } catch {
        // A lost database acknowledgement may follow a committed write. Never
        // compensate here: the durable identity reconciles either outcome.
        confirmed = false
      }
    }
    try {
      await locking.release([input.lock_key])
    } catch {
      // The lease expires. A release outage must not roll back a visible dish.
      const record = createLogRecord("backend", "upstream.request.failed", {
        route: "/partner/restaurants/:id/dishes",
        method: "POST",
      })
      container
        .resolve(ContainerRegistrationKeys.LOGGER)
        .log(record.level, record.msg, record)
    }
    return new StepResponse({ confirmed, categories: input.categories })
  },
)

export const readStaffMenuStep = createStep(
  "read-staff-menu",
  async (input: { restaurant_id: string }, { container }) =>
    new StepResponse({
      categories: await readPublishedMenu(container, input.restaurant_id),
    }),
)
