import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import SystemProviderService from "@medusajs/payment/dist/providers/system"
import { cancelLegacyAwaitingOrdersWorkflow } from "../../src/workflows/order-operations"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(240000)

medusaIntegrationTestRunner({
  dbName: "medusa_ci_legacy_order_cancellation_http",
  env: {
    JWT_SECRET: "ci-only-legacy-order-cancellation-secret",
    REDIS_URL: "",
  },
  testSuite: ({ api, getContainer, dbUtils }) => {
    const harness = restaurantOrdersHarness({ api, getContainer, dbUtils })
    const {
      operations,
      placePaidOrder,
      signInAsStaffOf,
      detail,
      progress,
      accept,
      recordOf,
      refundAttemptsOf,
    } = harness
    type Seeded = ReturnType<typeof harness.seeded>
    let customer: Seeded["customer"]
    let pizzeriaId: Seeded["pizzeriaId"]
    let staff: Awaited<ReturnType<typeof signInAsStaffOf>>
    beforeEach(async () => {
      ;({ customer, pizzeriaId } = harness.seeded())
      staff = await signInAsStaffOf(pizzeriaId, "mette@pizzeria.example")
    })
    afterEach(() => jest.restoreAllMocks())

    /** A paid Order recorded the way the legacy placement script records one. */
    const placeLegacyOrder = async () => {
      const order = await placePaidOrder(pizzeriaId)
      const record = await recordOf(order.id)
      await operations().updateOrderOperations({
        id: record.id,
        placed_at: null,
        acceptance_deadline: null,
      })
      return order
    }
    const run = (apply: boolean) =>
      cancelLegacyAwaitingOrdersWorkflow(getContainer()).run({
        input: { apply },
      })
    const nativeStatus = async (order_id: string) => {
      const { data } = await getContainer()
        .resolve(ContainerRegistrationKeys.QUERY)
        .graph({
          entity: "order",
          fields: ["status"],
          filters: { id: order_id },
        })
      return (data[0] as { status: string }).status
    }

    it("lists legacy awaiting Orders without changing anything in a dry run", async () => {
      const legacy = await placeLegacyOrder()
      const current = await placePaidOrder(pizzeriaId)
      const provider = jest.spyOn(
        SystemProviderService.prototype,
        "refundPayment",
      )

      const { result } = await run(false)

      expect(result).toEqual({ found: [legacy.id], cancelled: [] })
      expect((await recordOf(legacy.id)).state).toBe("awaiting_acceptance")
      expect((await recordOf(current.id)).state).toBe("awaiting_acceptance")
      expect(
        await operations().listRefundObligations({ order_id: legacy.id }),
      ).toEqual([])
      expect(provider).not.toHaveBeenCalled()
    })

    it("cancels each legacy awaiting Order as the system's timeout with a full refund, and leaves other Orders alone", async () => {
      const legacy = await placeLegacyOrder()
      const current = await placePaidOrder(pizzeriaId)
      const accepted = await placeLegacyOrder()
      // An accepted legacy Order is kitchen work, not waiting: never touched.
      const acceptedRecord = await recordOf(accepted.id)
      await operations().updateOrderOperations({
        id: acceptedRecord.id,
        state: "accepted",
        accepted_at: new Date(),
        accepted_by: staff.staffId,
      })

      const { result } = await run(true)

      expect(result).toEqual({ found: [legacy.id], cancelled: [legacy.id] })
      expect(await recordOf(legacy.id)).toMatchObject({
        state: "cancelled",
        cancelled_by: "system",
        cancellation_category: "acceptance_timeout",
        cancellation_note: null,
        // No deadline is invented for it.
        acceptance_deadline: null,
        revision: 2,
      })
      expect(await nativeStatus(legacy.id)).toBe("canceled")
      expect(
        (await operations().listRefundObligations({ order_id: legacy.id }))[0],
      ).toMatchObject({ status: "succeeded", attempt_count: 1 })
      expect(await refundAttemptsOf(legacy.id)).toEqual([
        expect.objectContaining({
          attempted_by: "system",
          outcome: "succeeded",
        }),
      ])
      // Staff and the Customer see an ordinary system cancellation that took
      // effect when it was processed.
      const staffView = (await detail(staff.headers, legacy.id)).data.order
      expect(staffView).toMatchObject({
        state: "cancelled",
        cancellation: { category: "acceptance_timeout" },
        refund: { status: "succeeded" },
      })
      expect(staffView.cancellation.effective_at).toBe(
        staffView.cancellation.cancelled_at,
      )
      expect((await progress(customer, legacy.id)).data.progress).toMatchObject(
        { state: "cancelled", refund: { status: "succeeded" } },
      )
      expect((await recordOf(current.id)).state).toBe("awaiting_acceptance")
      expect((await recordOf(accepted.id)).state).toBe("accepted")
      expect((await accept(staff.headers, current.id)).status).toBe(200)
    })

    it("adds nothing when run again", async () => {
      const legacy = await placeLegacyOrder()
      await run(true)
      const provider = jest.spyOn(
        SystemProviderService.prototype,
        "refundPayment",
      )

      const { result } = await run(true)

      expect(result).toEqual({ found: [], cancelled: [] })
      expect(provider).not.toHaveBeenCalled()
      expect((await recordOf(legacy.id)).revision).toBe(2)
      expect(await refundAttemptsOf(legacy.id)).toHaveLength(1)
    })
  },
})
