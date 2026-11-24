import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { owedRefund, purchasedFood } from "../cancellation"

/** A container whose Query returns the given Orders. */
function containerReading(orders: unknown[]) {
  const query = { graph: jest.fn().mockResolvedValue({ data: orders }) }
  const container = {
    resolve: (key: string) =>
      key === ContainerRegistrationKeys.QUERY ? query : undefined,
  } as never
  return { container, query }
}

describe("The Order reads a cancellation after acceptance commits with (#162, #199)", () => {
  it("returns the purchased lines and currency the prepared-food credit is calculated from", async () => {
    const lines = [{ raw_unit_price: { value: "95" }, quantity: 2 }]
    const { container } = containerReading([
      { currency_code: "dkk", items: lines },
    ])

    await expect(purchasedFood(container, "order_1")).resolves.toEqual({
      currency_code: "dkk",
      lines,
    })
  })

  it("treats a recorded placement without its Order as a bug, never a guessed credit", async () => {
    const { container } = containerReading([])

    await expect(purchasedFood(container, "order_1")).rejects.toMatchObject({
      type: MedusaError.Types.UNEXPECTED_STATE,
    })
  })

  it.each([
    { orders: [], reason: "EP: the Order is not readable" },
    { orders: [{ id: "order_1" }], reason: "EP: no payment collection" },
    {
      orders: [{ id: "order_1", payment_collections: [{}] }],
      reason: "EP: a payment collection without payments",
    },
  ])(
    "owes no refund when nothing was captured ($reason)",
    async ({ orders }) => {
      const { container } = containerReading(orders)

      await expect(owedRefund(container, "order_1")).resolves.toBeNull()
    },
  )
})
