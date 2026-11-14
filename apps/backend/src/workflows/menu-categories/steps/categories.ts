import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { monotonicFactory } from "ulid"
import { withResponseFields } from "../../common/response-fields"
import { RESTAURANT_MODULE } from "../../../modules/restaurant"
import RestaurantModuleService from "../../../modules/restaurant/service"
import {
  CategoryMutation,
  categoryNameSchema,
  categoryCreateSchema,
  categoryRenameSchema,
  categoryDeleteSchema,
} from "../validation"

const nextId = monotonicFactory()
const refusal = (code: string, category?: Category) => {
  const error = new MedusaError(MedusaError.Types.CONFLICT, code, code)
  return category
    ? withResponseFields(error, { category: publicCategory(category) })
    : error
}
const missing = () =>
  new MedusaError(
    MedusaError.Types.NOT_FOUND,
    "category_not_found",
    "category_not_found",
  )

type Category = Awaited<
  ReturnType<RestaurantModuleService["retrieveMenuCategory"]>
>
const publicCategory = (category: Category) => ({
  id: category.id,
  name: { da: category.name_da, en: category.name_en },
  revision: category.revision,
})

export const listMenuCategoriesStep = createStep(
  "list-menu-categories",
  async (input: { restaurant_id: string }, { container }) => {
    const categories = await container
      .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
      .listMenuCategories(
        { restaurant_id: input.restaurant_id, is_removed: false },
        { order: { position: "ASC", id: "ASC" }, take: null },
      )
    return new StepResponse({ categories: categories.map(publicCategory) })
  },
)

function validateCategoryInput(input: CategoryMutation) {
  let parsed: { success: boolean }
  switch (input.kind) {
    case "create":
      parsed = categoryCreateSchema.safeParse({
        name: input.name,
        request_id: input.request_id,
        revision: input.revision,
      })
      break
    case "rename":
      parsed = categoryRenameSchema.safeParse({
        name: input.name,
        revision: input.revision,
      })
      break
    case "remove":
      parsed = categoryDeleteSchema.safeParse({ revision: input.revision })
      break
  }
  if (!parsed.success)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "category_input_invalid",
      "category_input_invalid",
    )
  return input.kind === "remove"
    ? undefined
    : categoryNameSchema.parse(input.name)
}

type Undo = { created_id: string } | { before: Category } | null

async function createOrRetrieveCategory(
  service: RestaurantModuleService,
  input: Extract<CategoryMutation, { kind: "create" }>,
  name: { da: string; en: string },
  entry: Record<string, unknown>,
): Promise<{ category: ReturnType<typeof publicCategory>; undo: Undo }> {
  const [existing] = await service.listMenuCategories({
    restaurant_id: input.restaurant_id,
    request_id: input.request_id,
  })
  if (existing) {
    const original = existing.creation_name
    if (original.da !== name.da || original.en !== name.en)
      throw refusal("category_retry_conflict", existing)
    if (existing.is_removed) throw refusal("category_retry_removed")
    return { category: publicCategory(existing), undo: null }
  }
  const [last] = await service.listMenuCategories(
    { restaurant_id: input.restaurant_id },
    { order: { position: "DESC" }, take: 1 },
  )
  const category = await service.createMenuCategories({
    id: `mcat_${nextId()}`,
    restaurant_id: input.restaurant_id,
    name_da: name.da,
    name_en: name.en,
    revision: 1,
    position: (last?.position ?? -1) + 1,
    request_id: input.request_id,
    creation_name: name,
    history: { entries: [entry] },
  })
  return {
    category: publicCategory(category),
    undo: { created_id: category.id },
  }
}

/** Caller holds the Restaurant lock and has rechecked the actor under it. */
export const mutateMenuCategoryStep = createStep(
  "mutate-menu-category",
  async (input: CategoryMutation & { actor_name: string }, { container }) => {
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    const name = validateCategoryInput(input)
    const entry = {
      kind: input.kind,
      actor_id: input.staff_id,
      actor_name: input.actor_name,
      occurred_at: new Date().toISOString(),
      ...(name ? { name } : {}),
    }
    if (input.kind === "create") {
      const created = await createOrRetrieveCategory(
        service,
        input,
        name!,
        entry,
      )
      return new StepResponse({ category: created.category }, created.undo)
    }
    const [before] = await service.listMenuCategories({
      id: input.category_id,
      restaurant_id: input.restaurant_id,
    })
    if (!before || before.is_removed) throw missing()
    if (before.revision !== input.revision) throw refusal("category_stale")
    if (input.kind === "remove") {
      const { data } = await container
        .resolve(ContainerRegistrationKeys.QUERY)
        .graph({
          entity: "menu_category",
          fields: ["id", "products.id"],
          filters: { id: before.id },
        })
      if (data[0]?.products?.length) throw refusal("category_not_empty")
    }
    const entries = Array.isArray(before.history.entries)
      ? before.history.entries
      : []
    const category = await service.updateMenuCategories({
      id: before.id,
      revision: before.revision + 1,
      ...(name ? { name_da: name.da, name_en: name.en } : { is_removed: true }),
      history: { entries: [...entries, entry] },
    })
    return new StepResponse<
      { category: ReturnType<typeof publicCategory> },
      Undo
    >({ category: publicCategory(category) }, { before })
  },
  async (undo, { container }) => {
    if (!undo) return
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    if ("created_id" in undo)
      await service.deleteMenuCategories(undo.created_id)
    else {
      const before = undo.before
      await service.updateMenuCategories({
        id: before.id,
        name_da: before.name_da,
        name_en: before.name_en,
        revision: before.revision,
        is_removed: before.is_removed,
        history: before.history,
      })
    }
  },
)
