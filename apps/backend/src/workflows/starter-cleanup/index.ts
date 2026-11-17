import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  deleteProductCategoriesWorkflow,
  deleteProductsWorkflow,
  dismissProductVariantsInventoryStep,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"
import {
  CleanupCategory,
  CleanupProduct,
  selectStarterCleanup,
} from "./selection"

const selectStarterCleanupStep = createStep(
  "select-starter-cleanup",
  async (_, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const [{ data: products }, { data: categories }] = await Promise.all([
      query.graph({
        entity: "product",
        fields: [
          "id",
          "handle",
          "title",
          "description",
          "subtitle",
          "images.url",
          "variants.sku",
          "variants.prices.amount",
          "variants.prices.currency_code",
          "restaurant.id",
          "menu_dish.id",
        ],
      }),
      query.graph({
        entity: "product_category",
        fields: ["id", "name", "handle", "products.id", "category_children.id"],
      }),
    ])
    return new StepResponse(
      selectStarterCleanup(
        products as unknown as CleanupProduct[],
        categories as unknown as CleanupCategory[],
      ),
    )
  },
)

/** Soft deletion through core flows keeps historical Order line facts intact. Repeatable. */
export const retireStarterMerchandiseWorkflow = createWorkflow(
  "retire-starter-merchandise",
  function () {
    const selection = selectStarterCleanupStep()
    const categories = when(
      "has-demo-categories",
      selection,
      ({ category_ids }) => category_ids.length > 0,
    ).then(() =>
      deleteProductCategoriesWorkflow.runAsStep({
        input: selection.category_ids,
      }),
    )
    // Category provenance is checked before unlinking Products. A failure compensates both core flows.
    const products = transform({ selection, categories }, ({ selection }) => ({
      ids: selection.product_ids,
    }))
    when("has-demo-products", products, ({ ids }) => ids.length > 0).then(
      () => {
        const { data: variants } = useQueryGraphStep({
          entity: "product_variant",
          fields: ["id"],
          filters: { product_id: products.ids },
        })
        const inventoryLinks = transform({ variants }, ({ variants }) => ({
          variantIds: variants.map(({ id }) => id),
        }))
        // Retire catalogue entries without deleting stock or reservations belonging to older demo Orders.
        // This supported core step compensates by restoring the exact variant/inventory links on failure.
        const dismissed = dismissProductVariantsInventoryStep(inventoryLinks)
        const deletion = transform(
          { products, dismissed },
          ({ products }) => products,
        )
        deleteProductsWorkflow.runAsStep({ input: deletion })
      },
    )
    return new WorkflowResponse(selection)
  },
)
