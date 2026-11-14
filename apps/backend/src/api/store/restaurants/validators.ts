import { z } from "@medusajs/framework/zod"
import { isDanishPostalCode } from "../../../workflows/restaurants/postal-code"

/** One optional browsing location: an exact code or a town name from the lookup. */
export const GetStoreRestaurantsSchema = z.object({
  postal_code: z
    .string()
    .refine(isDanishPostalCode, "postal_code:postal_code_invalid")
    .optional(),
  town: z.string().trim().min(1, "town:field_required").max(255).optional(),
})
export type GetStoreRestaurantsQuery = z.infer<typeof GetStoreRestaurantsSchema>
