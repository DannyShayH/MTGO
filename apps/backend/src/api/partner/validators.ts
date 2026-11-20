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

export const GetAvailableDeliveriesSchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  postal_codes: z
    .string()
    .optional()
    .transform((value, context) => {
      if (value === undefined) return undefined
      if (value === "") return []
      const codes = value.split(",")
      if (codes.some((code) => !/^\d{4}$/.test(code))) {
        context.addIssue({ code: "custom", message: "postal_code_invalid" })
        return z.NEVER
      }
      return codes
    }),
})
/**
 * A client-chosen retry identity for one intended assignment: the same value
 * on a repeat recovers the original outcome; reused elsewhere it is refused.
 */
export const RetryIdentity = z
  .string()
  .regex(/^[A-Za-z0-9._:-]{1,100}$/, "request_id_invalid")

export const PostClaimDeliverySchema = z.strictObject({
  request_id: RetryIdentity,
})
export type PostClaimDeliveryBody = z.infer<typeof PostClaimDeliverySchema>

/** Pickup takes only its retry identity: never a time, agent or location. */
export const PostConfirmPickupSchema = z.strictObject({
  request_id: RetryIdentity,
})
export type PostConfirmPickupBody = z.infer<typeof PostConfirmPickupSchema>

/**
 * The agent's own position, only to measure distances to pickups in view
 * (#191). Never stored or logged; no accuracy, time or heading is accepted.
 */
export const PostPickupDistancesSchema = z.strictObject({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  order_ids: z.array(z.string().min(1).max(64)).min(1).max(25),
})
export type PostPickupDistancesBody = z.infer<typeof PostPickupDistancesSchema>

export type GetAvailableDeliveriesQuery = z.infer<
  typeof GetAvailableDeliveriesSchema
>

/**
 * Accept, start preparation and ready take no input: clients cannot set a
 * milestone's time, actor or Restaurant.
 */
export const PostPartnerOrderActionSchema = z.strictObject({})
export type PostPartnerOrderActionBody = z.infer<
  typeof PostPartnerOrderActionSchema
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
