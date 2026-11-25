import type { EntityManager } from "@medusajs/framework/mikro-orm/postgresql"
import type { Context } from "@medusajs/framework/types"
import {
  InjectManager,
  MedusaContext,
  MedusaService,
} from "@medusajs/framework/utils"
import Feedback from "./models/feedback"

/** Aggregation stays in this module, where the rating facts are owned. */
class FeedbackModuleService extends MedusaService({ Feedback }) {
  @InjectManager()
  async statistics(
    range: { from: Date | null; to: Date | null },
    @MedusaContext() context?: Context,
  ) {
    const manager = context!.manager as EntityManager
    // A null bound leaves that side of the range open.
    const within =
      range.from || range.to
        ? {
            ...(range.from && { $gte: range.from }),
            ...(range.to && { $lt: range.to }),
          }
        : null
    const grouped = async (fields: string[]) => {
      const query = manager
        .createQueryBuilder("Feedback", "f")
        .select(fields)
        .where({
          ...(within && { delivered_at: within }),
          deleted_at: null,
        })
        .groupBy(fields)
      return query
        .getKnexQuery()
        .count({ count: "f.id" }) as unknown as Promise<
        Record<string, unknown>[]
      >
    }
    const [restaurants, agents, experience] = await Promise.all([
      grouped(["restaurant_id", "food_rating"]),
      grouped(["agent_id", "agent_rating"]),
      grouped(["experience_rating"]),
    ])
    return { restaurants, agents, experience }
  }
}

export default FeedbackModuleService
