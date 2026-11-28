import { z } from "@medusajs/framework/zod"

/** All Restaurants by default, or the one an operator chose (#264). */
export const GetAdminOperationsSchema = z.strictObject({
  restaurant_id: z.string().trim().min(1).optional(),
})

export type GetAdminOperationsQuery = z.infer<typeof GetAdminOperationsSchema>
