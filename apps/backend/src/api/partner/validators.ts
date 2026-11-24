import { z } from "@medusajs/framework/zod"
import { PROBLEM_CATEGORIES } from "../../modules/delivery/models/delivery-attention"
import {
  CANCELLATION_CATEGORIES,
  DELIVERY_OUTCOMES,
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

/**
 * One bounded page of one queue view; awaiting is the kitchen's default.
 * `q` is an Order number as staff read it (`42` or `#42`); the placement
 * window is from inclusive, to exclusive. `delivery_outcome` narrows to
 * Orders whose delivery ended that way and that were not cancelled (#204).
 */
export const GetPartnerOrdersSchema = z
  .strictObject({
    view: z.enum(QUEUE_VIEWS).default("awaiting"),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    offset: z.coerce.number().int().min(0).default(0),
    q: z
      .string()
      .trim()
      .regex(/^#?\d{1,9}$/, "order_search_invalid")
      .transform((value) => Number(value.replace("#", "")))
      .optional(),
    placed_from: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .optional(),
    placed_to: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .optional(),
    cancellation_category: z.enum(CANCELLATION_CATEGORIES).optional(),
    delivery_outcome: z.enum(DELIVERY_OUTCOMES).optional(),
  })
  .refine(
    ({ placed_from, placed_to }) =>
      !placed_from || !placed_to || placed_from < placed_to,
    { message: "placed_range_invalid", path: ["placed_to"] },
  )
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

/** A bounded free-text note; the original body is never logged. */
export const PostProblemReportSchema = z.strictObject({
  category: z.enum(PROBLEM_CATEGORIES),
  note: z
    .string()
    .max(280)
    .optional()
    .transform(
      (value) =>
        value?.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim() || null,
    ),
})
export type PostProblemReportBody = z.infer<typeof PostProblemReportSchema>

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

/**
 * Handover takes only its retry identity: never a time, agent, location,
 * photo, signature or code (#161).
 */
export const PostConfirmHandoverSchema = z.strictObject({
  request_id: RetryIdentity,
})
export type PostConfirmHandoverBody = z.infer<typeof PostConfirmHandoverSchema>

/**
 * One location sample from the phone (#166): coordinates (Zod numbers are
 * always finite), the accuracy radius when the phone gave one (up to
 * 100 km) and the time the phone measured it. The agent and delivery come from the server; no
 * heading, speed, route or batch of samples is accepted.
 */
export const PostShareDeliveryLocationSchema = z.strictObject({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy_m: z.number().min(0).max(100_000).nullable().optional(),
  observed_at: z.iso.datetime({ offset: true }),
})
export type PostShareDeliveryLocationBody = z.infer<
  typeof PostShareDeliveryLocationSchema
>

/** Arrival takes only its retry identity: never a time, agent or location (#164). */
export const PostRecordArrivalSchema = z.strictObject({
  request_id: RetryIdentity,
})
export type PostRecordArrivalBody = z.infer<typeof PostRecordArrivalSchema>

/**
 * A contact attempt takes only its own retry identity: never a time or an
 * outcome such as the Customer having answered (#164).
 */
export const PostRecordContactAttemptSchema = z.strictObject({
  request_id: RetryIdentity,
})
export type PostRecordContactAttemptBody = z.infer<
  typeof PostRecordContactAttemptSchema
>

/** One page of the agent's own completed history. */
export const GetCompletedDeliveriesSchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})
export type GetCompletedDeliveriesQuery = z.infer<
  typeof GetCompletedDeliveriesSchema
>

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

/** A page of Restaurant statement entries or month summaries (#227). */
export const GetPartnerStatementsSchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})
export type GetPartnerStatementsQuery = z.infer<
  typeof GetPartnerStatementsSchema
>
