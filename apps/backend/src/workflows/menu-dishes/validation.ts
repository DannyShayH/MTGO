import { MathBN } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { categoryNameSchema } from "../menu-categories/validation"

/** Staff enter display-unit DKK. Reject precision and separators before conversion. */
export const dishCreateSchema = z.strictObject({
  request_id: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/),
  category_id: z.string().min(1).max(100),
  name: categoryNameSchema,
  price: z
    .string()
    .regex(/^\d+(?:[.,]\d{1,2})?$/)
    .refine((value) => {
      const decimal = value.replace(",", ".")
      return (
        /^\d+(?:\.\d{1,2})?$/.test(decimal) &&
        Number.isFinite(Number(decimal)) &&
        MathBN.eq(decimal, Number(decimal))
      )
    })
    .transform((value) => Number(value.replace(",", ".")))
    .refine(
      (amount) =>
        Number.isFinite(amount) &&
        amount > 0 &&
        amount <= Number.MAX_SAFE_INTEGER / 100,
    ),
})
export type DishCreateInput = z.input<typeof dishCreateSchema>
