import { prepareDishRemovalStep, commitDishRemovalStep } from "./steps/removal"
import { Modules, ProductStatus } from "@medusajs/framework/utils"
import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  acquireLockStep,
  createProductsWorkflow,
  deleteProductsWorkflow,
  createRemoteLinkStep,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows"
import { RESTAURANT_MODULE } from "../../modules/restaurant"
import { restaurantLock } from "../restaurants/restaurant-lock"
import { retrieveAuthorizedStaffStep } from "../restaurant-staff/steps/retrieve-authorized-staff"
import { assertOwnRestaurantStep } from "../restaurant-staff/steps/own-restaurant"
import { ensureMenuCommerceSetupWorkflow } from "../menu"
import {
  CreateDishCommand,
  prepareDishPublicationStep,
  createDishContentStep,
  commitDishPublicationStep,
  readStaffMenuStep,
} from "./steps/publication"
import {
  EditDishCommand,
  prepareDishEditStep,
  commitDishEditStep,
} from "./steps/edit"
import {
  AvailabilityCommand,
  changeDishAvailabilityStep,
} from "./steps/availability"

export const createMenuDishWorkflow = createWorkflow(
  "create-menu-dish",
  function (input: CreateDishCommand) {
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
    const command = transform({ input, current }, ({ input, current }) => ({
      ...input,
      actor_name: current.staff.name,
    }))
    const prepared = prepareDishPublicationStep(command)
    const setup = ensureMenuCommerceSetupWorkflow.runAsStep({
      input: undefined,
    })
    when(
      "discard-interrupted-dish",
      prepared,
      ({ old_product_ids }) => old_product_ids.length > 0,
    ).then(() => {
      deleteProductsWorkflow.runAsStep({
        input: { ids: prepared.old_product_ids },
      })
    })
    const created = when(
      "dish-needs-publication",
      prepared,
      ({ saved }) => !saved,
    ).then(() => {
      const productInput = transform(
        { prepared, setup },
        ({ prepared, setup }) => ({
          products: [
            {
              title: prepared.data.name.en,
              handle: prepared.handle,
              status: ProductStatus.PUBLISHED,
              shipping_profile_id: setup.shipping_profile_id,
              sales_channels: [{ id: setup.sales_channel_id }],
              options: [{ title: "Portion", values: ["Regular"] }],
              variants: [
                {
                  title: "Regular",
                  options: { Portion: "Regular" },
                  manage_inventory: false,
                  prices: [
                    { amount: prepared.data.price, currency_code: "dkk" },
                  ],
                },
              ],
            },
          ],
        }),
      )
      const products = createProductsWorkflow.runAsStep({ input: productInput })
      const contentInput = transform(
        { prepared, products },
        ({ prepared }) => ({
          name: prepared.data.name,
          position: prepared.position,
          category_id: prepared.data.category_id,
          allergens: prepared.data.allergens,
          food_labels: prepared.data.food_labels,
        }),
      )
      const contentId = createDishContentStep(contentInput)
      const links = transform(
        { input, prepared, products, contentId },
        ({ input, prepared, products, contentId }) => [
          {
            [RESTAURANT_MODULE]: { restaurant_id: input.restaurant_id },
            [Modules.PRODUCT]: { product_id: products[0].id },
          },
          {
            [Modules.PRODUCT]: { product_id: products[0].id },
            [RESTAURANT_MODULE]: { menu_dish_id: contentId },
          },
        ],
      )
      const linked = createRemoteLinkStep(links)
      return transform(
        { products, contentId, linked },
        ({ products, contentId }) => ({
          content_id: contentId,
          product_id: products[0].id,
          variant_id: products[0].variants[0].id,
        }),
      )
    })
    const commit = transform(
      { prepared, created, lock },
      ({ prepared, created, lock }) => {
        const categories = prepared.menu
        if (created) {
          const dish = {
            id: created.product_id,
            variant_id: created.variant_id,
            revision: 1,
            name: prepared.data.name,
            description: null,
            is_sold_out: false,
            price: {
              amount: prepared.data.price,
              currency_code: "dkk" as const,
              includes_tax: true as const,
            },
            allergens: prepared.data.allergens,
            food_labels: prepared.data.food_labels,
          }
          const category = categories.find(
            ({ id }) => id === prepared.category.id,
          )
          if (category) category.dishes.push(dish)
          else categories.push({ ...prepared.category, dishes: [dish] })
        }
        categories.sort(
          (a, b) =>
            prepared.category_order.indexOf(a.id) -
            prepared.category_order.indexOf(b.id),
        )
        return {
          content_id: created?.content_id,
          product_id: created?.product_id,
          actor_id: prepared.operation.actor_id,
          actor_name: prepared.operation.actor_name,
          lock_key: lock.key,
          categories,
        }
      },
    )
    const result = commitDishPublicationStep(commit)
    return new WorkflowResponse(result)
  },
)

export const listMenuDishesWorkflow = createWorkflow(
  "list-menu-dishes",
  function (input: { restaurant_id: string; staff_id: string }) {
    const current = retrieveAuthorizedStaffStep({ staff_id: input.staff_id })
    const scope = transform({ input, current }, ({ input, current }) => ({
      id: input.restaurant_id,
      staff_restaurant_id: current.restaurant.id,
    }))
    assertOwnRestaurantStep(scope)
    return new WorkflowResponse(
      readStaffMenuStep({ restaurant_id: input.restaurant_id }),
    )
  },
)

export const editMenuDishWorkflow = createWorkflow(
  "edit-menu-dish",
  function (input: Omit<EditDishCommand, "actor_name">) {
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
    const command = transform({ input, current }, ({ input, current }) => ({
      ...input,
      actor_name: current.staff.name,
    }))
    const prepared = prepareDishEditStep(command)
    when(
      "dish-edit-needs-commerce-update",
      prepared,
      ({ saved }) => !saved,
    ).then(() => {
      const update = transform({ prepared }, ({ prepared }) => {
        if (prepared.saved) return { products: [] }
        return {
          products: [
            {
              id: prepared.product_id,
              title: prepared.data.name.en,
              variants: [
                {
                  id: prepared.variant_id,
                  prices: [
                    { amount: prepared.data.price, currency_code: "dkk" },
                  ],
                },
              ],
            },
          ],
        }
      })
      updateProductsWorkflow.runAsStep({ input: update })
    })
    const commit = transform(
      { prepared, input, current, lock },
      ({ prepared, input, current, lock }) => ({
        prepared,
        actor_id: input.staff_id,
        actor_name: current.staff.name,
        request_id: input.request_id,
        lock_key: lock.key,
      }),
    )
    return new WorkflowResponse(commitDishEditStep(commit))
  },
)

export const changeMenuDishAvailabilityWorkflow = createWorkflow(
  "change-menu-dish-availability",
  function (input: Omit<AvailabilityCommand, "actor_name" | "lock_key">) {
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
    const command = transform(
      { input, current, lock },
      ({ input, current, lock }) => ({
        ...input,
        actor_name: current.staff.name,
        lock_key: lock.key,
      }),
    )
    return new WorkflowResponse(changeDishAvailabilityStep(command))
  },
)

export const removeMenuDishWorkflow = createWorkflow(
  "remove-menu-dish",
  function (input: {
    restaurant_id: string
    dish_id: string
    staff_id: string
    revision: number
  }) {
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
    const prepared = prepareDishRemovalStep(input)
    const command = transform(
      { input, current, prepared, lock },
      ({ input, current, prepared, lock }) => ({
        ...input,
        content: prepared.content,
        actor_name: current.staff.name,
        lock_key: lock.key,
      }),
    )
    const result = commitDishRemovalStep(command)
    return new WorkflowResponse(result)
  },
)
