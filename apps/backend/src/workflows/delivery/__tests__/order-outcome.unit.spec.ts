import { Modules } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../../modules/delivery"
import { ORDER_OPERATION_MODULE } from "../../../modules/order-operation"
import { recordDeliveryEndOnOrder } from "../order-outcome"

const endedAt = new Date("2026-11-23T18:42:00.000Z")

/** A container with the two modules, a lock that runs its work, and a logger. */
function containerWith({ updated }: { updated: unknown[] }) {
  const delivery = {
    listIntendedDeliveries: jest
      .fn()
      .mockResolvedValue([
        { terminal_outcome: "delivered", terminal_at: endedAt },
      ]),
    markOrderOutcomeRecorded: jest.fn(),
  }
  const operations = {
    listOrderOperations: jest
      .fn()
      .mockResolvedValue([
        { id: "ordop_1", revision: 3, delivery_outcome: null },
      ]),
    updateOrderOperations: jest.fn().mockResolvedValue(updated),
  }
  const logger = { log: jest.fn() }
  const services: Record<string, unknown> = {
    [DELIVERY_MODULE]: delivery,
    [ORDER_OPERATION_MODULE]: operations,
    [Modules.LOCKING]: {
      execute: (_key: string, work: () => Promise<void>) => work(),
    },
    logger,
  }
  const container = { resolve: (key: string) => services[key] } as never
  return { container, delivery, operations, logger }
}

describe("Recording a delivery's end on the Order", () => {
  it("writes the outcome under a newer revision guarded by the one it read, then marks the delivery", async () => {
    const { container, delivery, operations } = containerWith({
      updated: [{ id: "ordop_1" }],
    })
    expect(await recordDeliveryEndOnOrder(container, "order_1")).toBe(
      "recorded",
    )
    expect(operations.updateOrderOperations).toHaveBeenCalledWith({
      selector: { id: "ordop_1", revision: 3, delivery_outcome: null },
      data: {
        delivery_outcome: "delivered",
        delivery_ended_at: endedAt,
        revision: 4,
      },
    })
    expect(delivery.markOrderOutcomeRecorded).toHaveBeenCalledTimes(1)
  })

  it("keeps the outcome owed when the Order changed after it was read, so the next sweep records it", async () => {
    const { container, delivery, logger } = containerWith({ updated: [] })
    expect(await recordDeliveryEndOnOrder(container, "order_1")).toBe("pending")
    expect(delivery.markOrderOutcomeRecorded).not.toHaveBeenCalled()
    expect(JSON.stringify(logger.log.mock.calls)).toContain("request.failed")
  })
})
