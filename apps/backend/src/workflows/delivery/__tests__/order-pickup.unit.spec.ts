import { Modules } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../../modules/delivery"
import { ORDER_OPERATION_MODULE } from "../../../modules/order-operation"
import { recordPickupOnOrder } from "../order-pickup"

const pickedUpAt = new Date("2026-11-26T10:56:00.000Z")

/** A container with the two modules, a lock that runs its work, and a logger. */
function containerWith({
  updated,
  recorded = null,
}: {
  updated: unknown[]
  recorded?: Date | null
}) {
  const delivery = {
    listIntendedDeliveries: jest
      .fn()
      .mockResolvedValue([{ picked_up_at: pickedUpAt }]),
    markOrderPickupRecorded: jest.fn(),
  }
  const operations = {
    listOrderOperations: jest
      .fn()
      .mockResolvedValue([
        { id: "ordop_1", revision: 5, delivery_picked_up_at: recorded },
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

describe("Recording an agent's pickup on the Order", () => {
  it("writes the pickup time under a newer revision guarded by the one it read, then marks the delivery", async () => {
    const { container, delivery, operations } = containerWith({
      updated: [{ id: "ordop_1" }],
    })
    expect(await recordPickupOnOrder(container, "order_1")).toBe("recorded")
    expect(operations.updateOrderOperations).toHaveBeenCalledWith({
      selector: { id: "ordop_1", revision: 5, delivery_picked_up_at: null },
      data: { delivery_picked_up_at: pickedUpAt, revision: 6 },
    })
    expect(delivery.markOrderPickupRecorded).toHaveBeenCalledTimes(1)
  })

  it("writes nothing when the Order already has the pickup, and only marks the delivery", async () => {
    const { container, delivery, operations } = containerWith({
      updated: [],
      recorded: pickedUpAt,
    })
    expect(await recordPickupOnOrder(container, "order_1")).toBe("recorded")
    expect(operations.updateOrderOperations).not.toHaveBeenCalled()
    expect(delivery.markOrderPickupRecorded).toHaveBeenCalledTimes(1)
  })

  it("keeps the pickup owed when the Order changed after it was read, so the next sweep records it", async () => {
    const { container, delivery, logger } = containerWith({ updated: [] })
    expect(await recordPickupOnOrder(container, "order_1")).toBe("pending")
    expect(delivery.markOrderPickupRecorded).not.toHaveBeenCalled()
    expect(JSON.stringify(logger.log.mock.calls)).toContain("request.failed")
  })
})
