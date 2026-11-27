import { Modules } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../../modules/delivery"
import { ORDER_OPERATION_MODULE } from "../../../modules/order-operation"
import { recordAssignmentOnOrder } from "../order-assignment"

const assignedAt = new Date("2026-11-26T10:56:00.000Z")

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
      .mockResolvedValue([{ assigned_at: assignedAt }]),
    markOrderAssignmentRecorded: jest.fn(),
  }
  const operations = {
    listOrderOperations: jest
      .fn()
      .mockResolvedValue([
        { id: "ordop_1", revision: 5, delivery_assigned_at: recorded },
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

describe("Recording an agent's assignment on the Order", () => {
  it.each([
    {
      recorded: null,
      updated: [{ id: "ordop_1" }],
      expected: "recorded",
      writes: true,
      marks: true,
      reason:
        "DT R1: not yet on the Order and the guarded write lands, so it records under a newer revision and marks the delivery",
    },
    {
      recorded: assignedAt,
      updated: [],
      expected: "recorded",
      writes: false,
      marks: true,
      reason:
        "DT R2: already on the Order, so it writes nothing and only marks the delivery",
    },
    {
      recorded: null,
      updated: [],
      expected: "pending",
      writes: true,
      marks: false,
      reason:
        "DT R3: the Order changed after it was read, so the assignment stays owed for the next sweep",
    },
  ])("$reason", async ({ recorded, updated, expected, writes, marks }) => {
    const { container, delivery, operations, logger } = containerWith({
      updated,
      recorded,
    })
    expect(await recordAssignmentOnOrder(container, "order_1")).toBe(expected)
    if (writes)
      expect(operations.updateOrderOperations).toHaveBeenCalledWith({
        selector: { id: "ordop_1", revision: 5, delivery_assigned_at: null },
        data: { delivery_assigned_at: assignedAt, revision: 6 },
      })
    else expect(operations.updateOrderOperations).not.toHaveBeenCalled()
    expect(delivery.markOrderAssignmentRecorded).toHaveBeenCalledTimes(
      marks ? 1 : 0,
    )
    if (!marks)
      expect(JSON.stringify(logger.log.mock.calls)).toContain("request.failed")
  })
})
