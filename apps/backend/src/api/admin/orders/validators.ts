import { z } from "@medusajs/framework/zod"
import {
  REJECTION_REASON_MAX_LENGTH,
  rejectionNote,
} from "../../../workflows/order-operations/rules"

// Medusa keeps the message only of a custom issue, so a missing, blank or
// non-text reason is one custom check that carries the agreed code, and the
// length limit is a custom check too so `field_too_long` reaches the response.
/**
 * An Operator cancellation (#199) requires a reason, cleaned of control
 * characters and bounded like rejection and deactivation reasons. A reason
 * that is only control characters or whitespace is no reason.
 */
export const PostAdminOperatorCancelSchema = z.strictObject({
  reason: z
    .custom<string>(
      (value) => typeof value === "string" && !!rejectionNote(value),
      "reason:operator_cancellation_reason_required",
    )
    .transform((reason) => rejectionNote(reason) as string)
    .refine(
      (reason) => reason.length <= REJECTION_REASON_MAX_LENGTH,
      "reason:field_too_long",
    ),
})
export type PostAdminOperatorCancelBody = z.infer<
  typeof PostAdminOperatorCancelSchema
>
