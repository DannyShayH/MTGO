import { z } from "@medusajs/framework/zod"
import { RetryIdentity } from "../../partner/validators"

export const ListUnclaimedDeliveriesSchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})
export type ListUnclaimedDeliveriesQuery = z.infer<
  typeof ListUnclaimedDeliveriesSchema
>

export const AssignDeliverySchema = z.strictObject({
  agent_id: z.string().min(1).max(100),
  request_id: RetryIdentity,
})
export type AssignDeliveryBody = z.infer<typeof AssignDeliverySchema>
