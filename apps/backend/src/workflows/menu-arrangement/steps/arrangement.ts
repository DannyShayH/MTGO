import { createHash } from "node:crypto"
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
import { withDishPhotos } from "../../menu/steps/read-menu"
import { PublishedCategory } from "../../menu/published-menu"
import { withResponseFields } from "../../common/response-fields"
import { MenuArrangementInput, menuArrangementSchema } from "../validation"

export async function readArrangement(
  container: MedusaContainer,
  restaurant_id: string,
) {
  const service = container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
  const categories = await service.listMenuCategories(
    { restaurant_id, is_removed: false },
    { order: { position: "ASC", id: "ASC" }, take: null },
  )
  const menu = await readPublishedMenu(container, restaurant_id)
  const rows = categories.map((category) => ({
    id: category.id,
    revision: category.revision,
    name: { da: category.name_da, en: category.name_en },
    dishes: menu.find(({ id }) => id === category.id)?.dishes ?? [],
  }))
  return arrangementOf(
    await withDishPhotos(container, restaurant_id, rows, false),
  )
}

type ArrangementCategory = PublishedCategory
function arrangementOf(rows: PublishedCategory[]) {
  const revision = createHash("sha256")
    .update(
      JSON.stringify(
        rows.map((row) => ({
          id: row.id,
          revision: row.revision,
          dishes: row.dishes.map(({ id, revision }) => ({ id, revision })),
        })),
      ),
    )
    .digest("hex")
  return { revision, categories: rows }
}

export const readMenuArrangementStep = createStep(
  "read-menu-arrangement",
  async (input: { restaurant_id: string }, { container }) =>
    new StepResponse(await readArrangement(container, input.restaurant_id)),
)

const refuse = (code: string) =>
  new MedusaError(MedusaError.Types.CONFLICT, code, code)
function assertPermutation(actual: string[], requested: string[]) {
  if (
    new Set(requested).size !== actual.length ||
    requested.length !== actual.length ||
    requested.some((id) => !actual.includes(id))
  )
    throw refuse("menu_order_invalid")
}

function requestedDishOrder(
  input: Exclude<MenuArrangementInput, { kind: "categories" }>,
  actual: Awaited<ReturnType<typeof readArrangement>>,
) {
  const sourceId = input.kind === "move" ? input.source_id : input.category_id
  const source = actual.categories.find(({ id }) => id === sourceId)
  if (!source) throw refuse("menu_order_invalid")
  if (input.kind === "dishes") {
    assertPermutation(
      source.dishes.map(({ id }) => id),
      input.ids,
    )
    return { order: input.ids, touched: [source.id], move: undefined }
  }
  const target = actual.categories.find(({ id }) => id === input.target_id)
  if (
    !target ||
    source.id === target.id ||
    !source.dishes.some(({ id }) => id === input.dish_id)
  )
    throw refuse("menu_order_invalid")
  return {
    order: [...target.dishes.map(({ id }) => id), input.dish_id],
    touched: [source.id, target.id],
    move: { dish_id: input.dish_id, target_id: target.id },
  }
}

function nextArrangement(
  categories: ArrangementCategory[],
  changes: { id: string; position?: number; revision: number }[],
  placements: Map<
    string,
    { category_id?: string; position: number; revision: number }
  >,
) {
  const dishes = categories.flatMap((category) =>
    category.dishes.map((dish, position) => {
      const update = placements.get(dish.id)
      return {
        category_id: update?.category_id ?? category.id,
        position: update?.position ?? position,
        dish: { ...dish, revision: update?.revision ?? dish.revision },
      }
    }),
  )
  const rows = categories
    .map((category, position) => {
      const update = changes.find(({ id }) => id === category.id)
      return {
        ...category,
        position: update?.position ?? position,
        revision: update?.revision ?? category.revision,
        dishes: dishes
          .filter(({ category_id }) => category_id === category.id)
          .sort((a, b) => a.position - b.position)
          .map(({ dish }) => dish),
      }
    })
    .sort((a, b) => a.position - b.position)
    .map(({ id, name, revision, dishes }) => ({ id, name, revision, dishes }))
  return arrangementOf(rows)
}

function destinationOf(
  id: string,
  move: { dish_id: string; target_id: string } | undefined,
): { category_id?: string } {
  return move?.dish_id === id ? { category_id: move.target_id } : {}
}

function validateCommand(command: unknown) {
  if (!menuArrangementSchema.safeParse(command).success)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "menu_order_invalid",
      "menu_order_invalid",
    )
}

/** Authorization and the Restaurant lock have already been checked. */
export const changeMenuArrangementStep = createStep(
  "change-menu-arrangement",
  async (
    input: MenuArrangementInput & {
      restaurant_id: string
      staff_id: string
      actor_name: string
      lock: { key: string; ownerId: string }
    },
    { container },
  ) => {
    const { restaurant_id, staff_id, actor_name, lock, ...command } = input
    validateCommand(command)
    const actual = await readArrangement(container, restaurant_id)
    if (actual.revision !== input.revision)
      throw withResponseFields(refuse("menu_order_stale"), { menu: actual })
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    const categories = await service.listMenuCategories(
      { restaurant_id: input.restaurant_id, is_removed: false },
      { take: null },
    )
    const entry = {
      kind: input.kind === "move" ? "dish_moved" : "reordered",
      actor_id: staff_id,
      actor_name,
      occurred_at: new Date().toISOString(),
      input:
        command.kind === "categories"
          ? { kind: command.kind, revision: command.revision }
          : command,
    }
    const changes: {
      id: string
      position?: number
      revision: number
      history: Record<string, unknown>
    }[] = []
    const touch = (id: string, position?: number) => {
      const category = categories.find((row) => row.id === id)
      if (!category) throw refuse("menu_order_invalid")
      changes.push({
        id,
        ...(position === undefined ? {} : { position }),
        revision: category.revision + 1,
        history: {
          entries: [
            ...(Array.isArray(category.history.entries)
              ? category.history.entries
              : []),
            { ...entry, ...(position === undefined ? {} : { position }) },
          ],
        },
      })
    }
    const undoDishes: {
      id: string
      category_id: string | null
      position: number
      revision: number
      successful_change: Record<string, unknown> | null
    }[] = []
    const placements = new Map<
      string,
      { category_id?: string; position: number; revision: number }
    >()
    const dishUpdates: {
      id: string
      category_id?: string
      position: number
      revision: number
      successful_change: Record<string, unknown>
    }[] = []
    if (input.kind === "categories") {
      assertPermutation(
        actual.categories.map(({ id }) => id),
        input.ids,
      )
      input.ids.forEach((id, position) => touch(id, position))
    } else {
      const { order, touched, move } = requestedDishOrder(input, actual)
      touched.forEach((id) => touch(id))
      const { data } = await container
        .resolve(ContainerRegistrationKeys.QUERY)
        .graph({
          entity: "product",
          fields: ["id", "menu_dish.*"],
          filters: { id: order },
        })
      for (const [position, id] of order.entries()) {
        const content = data.find((row) => row.id === id)?.menu_dish as
          | {
              id: string
              revision: number
              category_id: string | null
              position: number
              successful_change: Record<string, unknown> | null
            }
          | undefined
        if (!content) throw refuse("menu_order_invalid")
        undoDishes.push({
          id: content.id,
          category_id: content.category_id,
          position: content.position,
          revision: content.revision,
          successful_change: content.successful_change,
        })
        const destination = destinationOf(id, move)
        placements.set(id, {
          ...destination,
          position,
          revision: content.revision + 1,
        })
        dishUpdates.push({
          id: content.id,
          ...destination,
          position,
          revision: content.revision + 1,
          successful_change: { ...entry, resource_id: id },
        })
      }
    }
    const next = nextArrangement(actual.categories, changes, placements)
    const undo = {
      lock,
      categories: categories
        .filter(({ id }) => changes.some((change) => change.id === id))
        .map(({ id, position, revision, history }) => ({
          id,
          position,
          revision,
          history,
        })),
      dishes: undoDishes,
    }
    await service.updateMenuArrangement({
      dishes: dishUpdates,
      categories: changes,
    })
    return new StepResponse(next, undo)
  },
  async (undo, { container }) => {
    if (!undo) return
    const locking = container.resolve(Modules.LOCKING)
    // Release only our lease, then reacquire with automatic renewal. If release
    // already took effect, a newer writer may proceed; revision guards below
    // preserve its work while the fresh Restaurant lock protects restoration.
    await locking.release(undo.lock.key, { ownerId: undo.lock.ownerId })
    await locking.execute(
      undo.lock.key,
      async () => {
        const service =
          container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
        const current = await service.listMenuCategories(
          { id: undo.categories.map(({ id }) => id) },
          { take: null },
        )
        if (
          undo.categories.some(
            (before) =>
              current.find(({ id }) => id === before.id)?.revision !==
              before.revision + 1,
          )
        )
          return
        const currentDishes = undo.dishes.length
          ? await service.listMenuDishes(
              { id: undo.dishes.map(({ id }) => id) },
              { take: null },
            )
          : []
        if (
          undo.dishes.some(
            (before) =>
              currentDishes.find(({ id }) => id === before.id)?.revision !==
              before.revision + 1,
          )
        )
          return
        await service.updateMenuArrangement(undo)
      },
      { timeout: 5 },
    )
  },
)
