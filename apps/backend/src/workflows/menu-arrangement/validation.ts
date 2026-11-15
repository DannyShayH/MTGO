import { z } from "@medusajs/framework/zod"

const revision = z.string().regex(/^[a-f0-9]{64}$/)
const id = z.string().min(1).max(100)
const ids = z.array(id).max(2000)
export const menuArrangementSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("categories"), revision, ids }),
  z.strictObject({ kind: z.literal("dishes"), revision, category_id: id, ids }),
  z.strictObject({
    kind: z.literal("move"),
    revision,
    dish_id: id,
    source_id: id,
    target_id: id,
  }),
])
export type MenuArrangementInput = z.infer<typeof menuArrangementSchema>
