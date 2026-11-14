import { z } from "@medusajs/framework/zod"

/**
 * Letters (any script, with accents), numbers, spaces and basic punctuation,
 * with at least one letter or number. Everything else, such as markup,
 * braces, emoji and control characters, is refused. Names are stored
 * verbatim after trimming and always rendered as text.
 */
export const CATEGORY_NAME_PATTERN =
  /^(?=.*[\p{L}\p{N}])[\p{L}\p{M}\p{N} .,\-'’&()/!?:+"%]+$/u
const name = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(CATEGORY_NAME_PATTERN, "category_name_invalid")
export const categoryNameSchema = z.strictObject({ da: name, en: name })
export const categoryCreateSchema = z.strictObject({
  name: categoryNameSchema,
  request_id: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/),
  revision: z.literal(0),
})
export const categoryRenameSchema = z.strictObject({
  name: categoryNameSchema,
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
})
export const categoryDeleteSchema = z.strictObject({
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
})
export type CategoryMutation = {
  restaurant_id: string
  staff_id: string
} & (
  | {
      kind: "create"
      name: { da: string; en: string }
      request_id: string
      revision: 0
    }
  | {
      kind: "rename"
      category_id: string
      name: { da: string; en: string }
      revision: number
    }
  | { kind: "remove"; category_id: string; revision: number }
)
