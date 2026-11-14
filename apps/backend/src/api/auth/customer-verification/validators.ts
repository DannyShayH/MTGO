import { z } from "@medusajs/framework/zod"

export const PostCustomerVerificationRequestSchema = z.strictObject({
  entity_id: z.email(),
  metadata: z
    .strictObject({
      preferred_language: z.enum(["da", "en"]).optional(),
      return_to: z.string().optional(),
    })
    .optional(),
})
export type PostCustomerVerificationRequestBody = z.infer<
  typeof PostCustomerVerificationRequestSchema
>
