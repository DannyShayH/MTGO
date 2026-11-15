import { isDeepStrictEqual } from "node:util"
import { createLogRecord } from "@dtc/logging"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import { z } from "@medusajs/framework/zod"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { RESTAURANT_MODULE } from "../../../modules/restaurant"
import RestaurantModuleService from "../../../modules/restaurant/service"
import { readPublishedMenu } from "../../menu"
import { PublishedCategory } from "../../menu/published-menu"
import { withResponseFields } from "../../common/response-fields"
import { dishEditSchema, DishEditInput } from "../validation"
import { validateAllergens, validateFoodLabels } from "../validate-allergens"

export type EditDishCommand = DishEditInput & {
  restaurant_id: string
  staff_id: string
  dish_id: string
  actor_name: string
}
type Prepared =
  | { saved: true; menu: PublishedCategory[] }
  | {
      saved: false
      menu: PublishedCategory[]
      content_id: string
      product_id: string
      variant_id: string
      data: z.output<typeof dishEditSchema>
    }
type SnapshotUndo = {
  content_id: string
  published_price: string | null
} | null

const refuse = (type: string, code: string) => new MedusaError(type, code, code)

export const prepareDishEditStep = createStep(
  "prepare-dish-edit",
  async (input: EditDishCommand, { container }) => {
    const parsed = dishEditSchema.safeParse({
      request_id: input.request_id,
      revision: input.revision,
      name: input.name,
      description: input.description,
      price: input.price,
      allergens: input.allergens,
      food_labels: input.food_labels,
    })
    if (!parsed.success)
      throw refuse(MedusaError.Types.INVALID_DATA, "dish_input_invalid")
    const data = parsed.data
    await validateAllergens(container, data.allergens)
    await validateFoodLabels(container, data.food_labels)
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
        "menu_dish.published_price",
        "menu_dish.successful_change",
      ],
      filters: { id: input.dish_id },
    })
    const content = products[0]?.menu_dish as
      | {
          id: string
          published_price: string | null
          successful_change?: { request_id?: string; input?: unknown }
        }
      | undefined
    if (!content) throw refuse(MedusaError.Types.NOT_FOUND, "dish_not_found")
    if (dish.revision !== data.revision) {
      if (content.successful_change?.request_id === data.request_id) {
        const previous = content.successful_change.input as
          z.output<typeof dishEditSchema> | undefined
        if (
          !previous ||
          previous.revision !== data.revision ||
          previous.name.da !== data.name.da ||
          previous.name.en !== data.name.en ||
          previous.description?.da !== data.description?.da ||
          previous.description?.en !== data.description?.en ||
          previous.price !== data.price ||
          !isDeepStrictEqual(previous.allergens, data.allergens) ||
          !isDeepStrictEqual(previous.food_labels, data.food_labels)
        )
          throw refuse(MedusaError.Types.CONFLICT, "dish_retry_conflict")
        return new StepResponse<Prepared, SnapshotUndo>(
          { saved: true, menu },
          null,
        )
      }
      throw withResponseFields(
        refuse(MedusaError.Types.CONFLICT, "dish_stale"),
        { dish },
      )
    }
    // Pin the current published price before the commerce workflow changes it.
    // This row remains the previous visible version if any later step fails.
    await container
      .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
      .updateMenuDishes({
        id: content.id,
        published_price: String(dish.price.amount),
      })
    return new StepResponse<Prepared, SnapshotUndo>(
      {
        saved: false,
        menu,
        content_id: content.id,
        product_id: dish.id,
        variant_id: dish.variant_id,
        data,
      },
      { content_id: content.id, published_price: content.published_price },
    )
  },
  async (undo, { container }) => {
    if (undo)
      await container
        .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
        .updateMenuDishes({
          id: undo.content_id,
          published_price: undo.published_price,
        })
  },
)

export const commitDishEditStep = createStep(
  "commit-dish-edit",
  async (
    input: {
      prepared: Prepared
      actor_id: string
      actor_name: string
      request_id: string
      lock_key: string
    },
    { container },
  ) => {
    const { prepared } = input
    let confirmed = true
    let categories: PublishedCategory[] = prepared.menu
    if (!prepared.saved) {
      const { data } = prepared
      try {
        await container
          .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
          .updateMenuDishes({
            id: prepared.content_id,
            name_da: data.name.da,
            name_en: data.name.en,
            description_da: data.description?.da ?? null,
            description_en: data.description?.en ?? null,
            published_price: String(data.price),
            allergen_declaration: data.allergens,
            food_label_declaration: data.food_labels as unknown as Record<
              string,
              unknown
            >,
            revision: data.revision + 1,
            successful_change: {
              kind: "edit",
              actor_id: input.actor_id,
              actor_name: input.actor_name,
              occurred_at: new Date().toISOString(),
              resource_id: prepared.product_id,
              request_id: input.request_id,
              input: data,
            },
          })
      } catch {
        // A committed row can lose its acknowledgement. Inspect it before
        // restoring the native price, then leave the retry identity intact.
        try {
          const current = await container
            .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
            .retrieveMenuDish(prepared.content_id)
          if (
            current.revision !== data.revision + 1 ||
            (current.successful_change as { request_id?: string } | null)
              ?.request_id !== input.request_id
          ) {
            const before = prepared.menu
              .flatMap(({ dishes }) => dishes)
              .find(({ id }) => id === prepared.product_id)!
            await updateProductsWorkflow(container).run({
              input: {
                products: [
                  {
                    id: prepared.product_id,
                    title: before.name.en,
                    variants: [
                      {
                        id: prepared.variant_id,
                        prices: [
                          {
                            amount: before.price.amount,
                            currency_code: "dkk",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            })
            confirmed = false
          }
        } catch {
          confirmed = false
        }
      }
      categories = prepared.menu.map((category) => ({
        ...category,
        dishes: category.dishes.map((dish) =>
          dish.id === prepared.product_id
            ? {
                ...dish,
                revision: data.revision + 1,
                name: data.name,
                description: data.description,
                price: { ...dish.price, amount: data.price },
                allergens: data.allergens,
                food_labels: data.food_labels,
              }
            : dish,
        ),
      }))
    }
    try {
      await container.resolve(Modules.LOCKING).release([input.lock_key])
    } catch {
      const record = createLogRecord("backend", "upstream.request.failed", {
        route: "/partner/restaurants/:id/dishes/:dish_id",
        method: "POST",
      })
      container
        .resolve(ContainerRegistrationKeys.LOGGER)
        .log(record.level, record.msg, record)
    }
    return new StepResponse({ confirmed, categories })
  },
)
