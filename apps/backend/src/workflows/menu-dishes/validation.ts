import { MathBN } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { categoryNameSchema } from "../menu-categories/validation"

export const allergenDeclarationSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("unknown") }),
  z.strictObject({
    status: z.literal("supplied"),
    contains: z.array(
      z.strictObject({
        allergen_id: z.string().min(1),
        detail_ids: z.array(z.string().min(1)),
      }),
    ),
    may_contain: z.array(
      z.strictObject({
        allergen_id: z.string().min(1),
        detail_ids: z.array(z.string().min(1)),
      }),
    ),
    none_declared: z.boolean(),
  }),
])
export type AllergenDeclaration = z.infer<typeof allergenDeclarationSchema>

export const foodLabelDeclarationSchema = z
  .array(
    z.strictObject({
      food_label_id: z.string().min(1),
      state: z.enum(["yes", "no", "unknown"]),
    }),
  )
  .length(3)
export type FoodLabelDeclaration = z.infer<typeof foodLabelDeclarationSchema>

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
  allergens: allergenDeclarationSchema,
  food_labels: foodLabelDeclarationSchema,
})
export type DishCreateInput = z.input<typeof dishCreateSchema>

const plainDescription = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine(
    (value) =>
      !/[<>]/.test(value) &&
      [...value].every(
        (character) => character === "\n" || !/\p{C}/u.test(character),
      ),
  )

export const dishEditSchema = z.strictObject({
  request_id: dishCreateSchema.shape.request_id,
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  name: categoryNameSchema,
  description: z
    .strictObject({ da: plainDescription, en: plainDescription })
    .nullable(),
  price: dishCreateSchema.shape.price,
  allergens: allergenDeclarationSchema,
  food_labels: foodLabelDeclarationSchema,
})
export type DishEditInput = z.input<typeof dishEditSchema>

export const dishAvailabilitySchema = z.strictObject({
  request_id: dishCreateSchema.shape.request_id,
  revision: dishEditSchema.shape.revision,
  is_sold_out: z.boolean(),
})
export type DishAvailabilityInput = z.input<typeof dishAvailabilitySchema>
