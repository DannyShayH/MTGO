import { z } from "@medusajs/framework/zod"
import { STATISTICS_PERIODS } from "../../../../workflows/feedback/statistics-period"

export const GetFeedbackStatisticsSchema = z.strictObject({
  period: z.enum(STATISTICS_PERIODS).default("last_30_days"),
})

export type GetFeedbackStatisticsQuery = z.infer<
  typeof GetFeedbackStatisticsSchema
>
