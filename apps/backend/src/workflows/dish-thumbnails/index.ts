import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * The stable, non-expiring path native Admin tables load. It is not a signed
 * URL: the Admin route resolves a fresh one on every read (#150).
 */
export const dishThumbnailPath = (productId: string) =>
  `/admin/products/${productId}/dish/photo`

const listStaleDishThumbnailsStep = createStep(
  "list-stale-dish-thumbnails",
  async (_input: undefined, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    type Row = {
      id: string
      thumbnail: string | null
      menu_dish?: { id: string } | null
    }
    const ids: string[] = []
    const take = 500
    for (let skip = 0; ; skip += take) {
      const { data } = await query.graph({
        entity: "product",
        fields: ["id", "thumbnail", "menu_dish.id"],
        pagination: { skip, take, order: { id: "ASC" } },
      })
      const rows = data as unknown as Row[]
      for (const product of rows)
        if (
          product.menu_dish &&
          product.thumbnail !== dishThumbnailPath(product.id)
        )
          ids.push(product.id)
      if (rows.length < take) break
    }
    return new StepResponse(ids)
  },
)

/** Point the given dish Products at their stable thumbnail path. Repeatable. */
export const setDishThumbnailsWorkflow = createWorkflow(
  "set-dish-thumbnails",
  function (input: { product_ids: string[] }) {
    const products = transform({ input }, ({ input }) => ({
      products: input.product_ids.map((id) => ({
        id,
        thumbnail: dishThumbnailPath(id),
      })),
    }))
    updateProductsWorkflow.runAsStep({ input: products })
    return new WorkflowResponse(input.product_ids)
  },
)

/** Backfill dishes published before #150; ordinary Products are never touched. */
export const backfillDishThumbnailsWorkflow = createWorkflow(
  "backfill-dish-thumbnails",
  function () {
    const ids = listStaleDishThumbnailsStep()
    const result = setDishThumbnailsWorkflow.runAsStep({
      input: transform({ ids }, ({ ids }) => ({ product_ids: ids })),
    })
    return new WorkflowResponse(result)
  },
)
