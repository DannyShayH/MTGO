import { z } from "@medusajs/framework/zod"

export const GetFeedbackStatisticsSchema = z.strictObject({
  period: z.literal("last_30_days").default("last_30_days"),
})
