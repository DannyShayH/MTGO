import { z } from "@medusajs/framework/zod"

/**
 * A Customer cancellation takes no input: the actor comes from the token and
 * the time, outcome and refund amount from the server (#145).
 */
export const PostStoreCancelOrderSchema = z.strictObject({})
export type PostStoreCancelOrderBody = z.infer<
  typeof PostStoreCancelOrderSchema
>
