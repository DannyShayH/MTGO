import { z } from "@medusajs/framework/zod"
import {
  QUEUE_VIEWS,
  REJECTION_REASON_MAX_LENGTH,
  rejectionNote,
} from "../../workflows/order-operations/rules"

export const PostPartnerAcceptStaffInvitationSchema = z.strictObject({
  token: z.string().min(1, "token:field_required"),
})
export type PostPartnerAcceptStaffInvitationBody = z.infer<
  typeof PostPartnerAcceptStaffInvitationSchema
>

export {
  categoryCreateSchema as PostPartnerCreateCategorySchema,
  categoryRenameSchema as PostPartnerRenameCategorySchema,
  categoryDeleteSchema as DeletePartnerCategorySchema,
} from "../../workflows/menu-categories/validation"
import {
  categoryCreateSchema,
  categoryRenameSchema,
  categoryDeleteSchema,
} from "../../workflows/menu-categories/validation"
export type PostPartnerCreateCategoryBody = z.infer<typeof categoryCreateSchema>
export type PostPartnerRenameCategoryBody = z.infer<typeof categoryRenameSchema>
export type DeletePartnerCategoryBody = z.infer<typeof categoryDeleteSchema>

/** One bounded page of one queue view; awaiting is the kitchen's default. */
export const GetPartnerOrdersSchema = z.strictObject({
  view: z.enum(QUEUE_VIEWS).default("awaiting"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})
export type GetPartnerOrdersQuery = z.infer<typeof GetPartnerOrdersSchema>

/** Acceptance takes no input: clients cannot set its time, actor or Restaurant. */
export const PostPartnerAcceptOrderSchema = z.strictObject({})
export type PostPartnerAcceptOrderBody = z.infer<
  typeof PostPartnerAcceptOrderSchema
>

/**
 * Rejection takes only an optional reason, bounded like other free-text
 * reasons and stored without control characters; blank means none.
 */
export const PostPartnerRejectOrderSchema = z.strictObject({
  reason: z
    .string("reason:field_invalid")
    .max(REJECTION_REASON_MAX_LENGTH, "reason:field_too_long")
    .nullish()
    .transform((reason) => rejectionNote(reason)),
})
export type PostPartnerRejectOrderBody = z.infer<
  typeof PostPartnerRejectOrderSchema
>
