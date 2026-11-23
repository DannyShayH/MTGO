import { z } from "@medusajs/framework/zod"
import { OPEN_REFUND_STATUSES } from "../../../workflows/order-operations/refunds"

/** `status=failed,pending` (both by default), paged like the attention list. */
export const GetAdminRefundsSchema = z.strictObject({
  status: z
    .string()
    .default(OPEN_REFUND_STATUSES.join(","))
    .transform((value) => [...new Set(value.split(","))])
    .pipe(z.array(z.enum(OPEN_REFUND_STATUSES)).min(1)),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})
export type ListRefundsQuery = z.infer<typeof GetAdminRefundsSchema>

/** A retry takes nothing from the client: amount and key are stored. */
export const PostAdminRetryRefundSchema = z.strictObject({})
