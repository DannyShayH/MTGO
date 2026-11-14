import { z } from "@medusajs/framework/zod"

export const GetStorePostalCodesSchema = z.object({
  q: z.string().trim().min(1, "q:field_required").max(255),
})
export type GetStorePostalCodesQuery = z.infer<typeof GetStorePostalCodesSchema>
