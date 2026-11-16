import { z } from "@medusajs/framework/zod"

export const photoInputSchema = z.object({
  request_id: z.uuid(),
  revision: z.number().int().positive(),
  content: z.string().min(1).max(7_000_000),
})

export type PhotoInput = z.infer<typeof photoInputSchema>

export const photoRemovalSchema = z.object({
  request_id: z.uuid(),
  revision: z.number().int().positive(),
})
export type PhotoRemovalInput = z.infer<typeof photoRemovalSchema>
