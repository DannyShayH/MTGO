import { asValue } from "@medusajs/framework/awilix"
import { createMedusaContainer, MedusaError } from "@medusajs/framework/utils"
import { ORDER_OPERATION_MODULE } from "../../../modules/order-operation"
import { readOrderProgress } from "../steps/read-order-progress"

/**
 * The route middleware already refuses an Order without an operation record,
 * so HTTP cannot reach this guard; it keeps the read from inventing progress
 * if it is ever called without that check.
 */
describe("Reading an Order's progress", () => {
  it("DT: an Order without an operation record is not found, never empty progress", async () => {
    const container = createMedusaContainer()
    container.register(
      ORDER_OPERATION_MODULE,
      asValue({ listOrderOperations: jest.fn().mockResolvedValue([]) }),
    )

    await expect(
      readOrderProgress(container, "order_without_record"),
    ).rejects.toMatchObject({
      type: MedusaError.Types.NOT_FOUND,
      message: "order_not_found",
    })
  })
})
