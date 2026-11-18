import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { orderOperationsOf } from "../purchased-items"
import {
  advanceOrderFeed,
  ORDER_FEED_READ_LIMIT,
  orderFeedWindowStart,
  type AnnouncedRevisions,
} from "../order-feed"

/**
 * A bounded read of the durable operational records of one Restaurant that
 * changed inside the feed window, compared with what this connection already
 * announced. Any process may have written the records, the Medusa server or
 * the worker, so the feed needs no messaging between them.
 */
export const readOrderFeedStep = createStep(
  "read-order-feed",
  async (
    input: { restaurant_id: string; announced: AnnouncedRevisions },
    { container },
  ) => {
    const now = new Date()
    const records = await orderOperationsOf(container).listOrderOperations(
      {
        restaurant_id: input.restaurant_id,
        updated_at: { $gte: orderFeedWindowStart(now) },
      },
      {
        select: ["order_id", "revision"],
        order: { updated_at: "DESC", id: "ASC" },
        take: ORDER_FEED_READ_LIMIT,
      },
    )
    const { announced, hints } = advanceOrderFeed(
      input.announced,
      records.map(({ order_id, revision }) => ({ id: order_id, revision })),
    )
    return new StepResponse({
      hints,
      announced,
      server_time: now.toISOString(),
    })
  },
)
