import type { MedusaContainer } from "@medusajs/framework/types"
import { backfillDishThumbnailsWorkflow } from "../workflows/dish-thumbnails"

/** Repeatable: gives dishes published before #150 their stable thumbnail path. */
export default async function dish_thumbnails({
  container,
}: {
  container: MedusaContainer
}) {
  await backfillDishThumbnailsWorkflow(container).run({ input: undefined })
}
