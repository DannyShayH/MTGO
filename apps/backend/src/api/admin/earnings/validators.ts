import { z } from "@medusajs/framework/zod"
import { EARNINGS_ORDER_FIELDS } from "../../../workflows/restaurant-finance/earnings-rules"

/** A page of months, newest first: twelve by default for the trend. */
export const GetAdminEarningsSchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(24).default(12),
  offset: z.coerce.number().int().min(0).default(0),
})
export type GetAdminEarningsQuery = z.infer<typeof GetAdminEarningsSchema>

/**
 * One month's Restaurants: sorted by a field (`-` for descending, most
 * earning first by default), searched by name, filtered by completeness
 * (comma-separated) and paged. The month's summary always covers them all.
 */
export const GetAdminEarningsMonthSchema = z.strictObject({
  order: z
    .enum([
      ...EARNINGS_ORDER_FIELDS,
      ...EARNINGS_ORDER_FIELDS.map((field) => `-${field}` as const),
    ])
    .default("-earnings"),
  q: z.string().trim().max(200).optional(),
  completeness: z
    .string()
    .transform((value) => [...new Set(value.split(","))])
    .pipe(
      z.array(z.enum(["complete", "incomplete", "processing_pending"])).min(1),
    )
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})
export type GetAdminEarningsMonthQuery = z.infer<
  typeof GetAdminEarningsMonthSchema
>
