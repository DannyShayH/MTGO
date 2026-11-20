import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import SystemProviderService from "@medusajs/payment/dist/providers/system"
import { recoverOrderOperationsWorkflow } from "../../src/workflows/order-operations"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(240000)

type RefundRow = { id: string; amount: unknown; idempotency_key: string }

// Fixed times: a paid placement whose deadline passed while the
// application was stopped, and the later moment recovery processes it.
const PLACED_AT = new Date("2026-11-18T10:00:00.000Z")
const DEADLINE = new Date("2026-11-18T10:05:00.000Z")
const AFTER_DOWNTIME = new Date("2026-11-18T11:30:00.000Z")

medusaIntegrationTestRunner({
  dbName: "medusa_ci_order_recovery_http",
  env: { JWT_SECRET: "ci-only-order-recovery-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer, dbUtils }) => {
    const harness = restaurantOrdersHarness({ api, getContainer, dbUtils })
    const {
      operations,
      placePaidOrder,
      signInAsStaffOf,
      detail,
      progress,
      accept,
      reject,
      recordOf,
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

    const recover = (now?: Date) =>
      recoverOrderOperationsWorkflow(getContainer()).run({
        input: { now: now?.toISOString() },
      })

    /** A placed Order whose recorded placement is moved to the fixed times. */
    const placeAt = async (placed_at: Date, acceptance_deadline: Date) => {
      const order = await placePaidOrder(pizzeriaId)
      const [record] = await operations().listOrderOperations({
        order_id: order.id,
      })
      await operations().updateOrderOperations({
        id: record.id,
        placed_at,
        acceptance_deadline,
      })
      return order
    }

    const nativeOf = async (order_id: string) => {
      const { data } = await getContainer()
        .resolve(ContainerRegistrationKeys.QUERY)
        .graph({
          entity: "order",
          fields: [
            "id",
            "status",
            "credit_lines.id",
            "payment_collections.payments.id",
            "payment_collections.payments.amount",
          ],
          filters: { id: order_id },
        })
      const order = data[0] as unknown as {
        status: string
        credit_lines?: { id: string }[]
        payment_collections: { payments: { id: string; amount: unknown }[] }[]
      }
      const payment = order.payment_collections[0].payments[0]
      const refunds = (await getContainer()
        .resolve(Modules.PAYMENT)
        .listRefunds({ payment_id: payment.id })) as unknown as RefundRow[]
      return { order, payment, refunds }
    }

    const obligationOf = async (order_id: string) =>
      (await operations().listRefundObligations({ order_id }))[0]
    const providerRefunds = () =>
      jest.spyOn(SystemProviderService.prototype, "refundPayment")

    describe("acceptance timeout", () => {
      it("cancels an Order whose deadline passed during downtime once, refunds it and keeps the effective deadline apart from processing time", async () => {
        const order = await placeAt(PLACED_AT, DEADLINE)

        await recover(AFTER_DOWNTIME)

        const staffView = (await detail(staff.headers, order.id)).data.order
        expect(staffView).toMatchObject({
          state: "cancelled",
          acceptance_deadline: DEADLINE.toISOString(),
          available_actions: [],
          cancellation: {
            category: "acceptance_timeout",
            effective_at: DEADLINE.toISOString(),
            cancelled_at: AFTER_DOWNTIME.toISOString(),
            note: null,
          },
          refund: { status: "succeeded" },
        })
        const shown = (await progress(customer, order.id)).data.progress
        expect(shown).toMatchObject({
          state: "cancelled",
          cancellation: {
            category: "acceptance_timeout",
            effective_at: DEADLINE.toISOString(),
            cancelled_at: AFTER_DOWNTIME.toISOString(),
          },
          refund: { status: "succeeded" },
        })
        const native = await nativeOf(order.id)
        expect(native.order.status).toBe("canceled")
        expect(native.refunds).toHaveLength(1)
        expect(native.order.credit_lines).toHaveLength(1)
        const [record] = await operations().listOrderOperations({
          order_id: order.id,
        })
        expect(record).toMatchObject({
          cancelled_by: "system",
          // The deadline is never moved: no new window was granted.
          acceptance_deadline: DEADLINE,
        })
        expect(record.native_cancelled_at).not.toBeNull()
      })

      it("BVA: leaves an Order alone 1 ms before its deadline and times it out exactly at it", async () => {
        const order = await placeAt(PLACED_AT, DEADLINE)

        const early = await recover(new Date(DEADLINE.getTime() - 1))
        expect(early.result.expired).toEqual([])
        expect((await recordOf(order.id)).state).toBe("awaiting_acceptance")
        expect(await obligationOf(order.id)).toBeUndefined()

        const onTime = await recover(DEADLINE)
        expect(onTime.result.expired).toEqual([order.id])
        expect(await recordOf(order.id)).toMatchObject({
          state: "cancelled",
          cancellation_category: "acceptance_timeout",
          cancelled_at: DEADLINE,
        })
      })

      // The accept and reject routes decide at the server's own clock, so the
      // HTTP cases below place the deadline relative to it; the sweep's own
      // boundaries above use fixed times.
      it("refuses acceptance at the server's expiry rule before any sweep has run", async () => {
        const order = await placeAt(
          new Date(Date.now() - 6 * 60 * 1000),
          new Date(Date.now() - 60 * 1000),
        )

        const staffView = (await detail(staff.headers, order.id)).data.order
        expect(staffView).toMatchObject({
          state: "awaiting_acceptance",
          acceptance_window: "elapsed",
          available_actions: [],
        })
        const refused = await accept(staff.headers, order.id)
        expect(refused.status).toBe(400)
        expect(refused.data.code).toBe("acceptance_window_elapsed")
        // A rejection that late is recorded as the timeout, not the staff's.
        const late = await reject(staff.headers, order.id, { reason: "Busy" })
        expect(late.data.order.cancellation).toMatchObject({
          category: "acceptance_timeout",
          note: null,
        })
      })

      it("never cancels an accepted Order, even long after its deadline", async () => {
        const order = await placePaidOrder(pizzeriaId)
        expect((await accept(staff.headers, order.id)).status).toBe(200)

        // Well past the acceptance deadline, still before the thirty-minute
        // unassigned cancellation (#162), which is a separate outcome.
        const swept = await recover(new Date(Date.now() + 20 * 60 * 1000))

        expect(swept.result.expired).toEqual([])
        expect((await recordOf(order.id)).state).toBe("accepted")
        expect(await obligationOf(order.id)).toBeUndefined()
      })

      it("keeps one outcome when acceptance races the sweep, and a repeated sweep adds no effects", async () => {
        const order = await placeAt(
          new Date(Date.now() - 5 * 60 * 1000 - 1000),
          new Date(Date.now() - 1000),
        )
        const provider = providerRefunds()

        const [accepted] = await Promise.all([
          accept(staff.headers, order.id),
          recover(),
          recover(),
        ])
        await recover()

        expect([400, 409]).toContain(accepted.status)
        const record = await recordOf(order.id)
        expect(record).toMatchObject({
          state: "cancelled",
          cancellation_category: "acceptance_timeout",
          accepted_at: null,
          revision: 2,
        })
        const native = await nativeOf(order.id)
        expect(native.order.status).toBe("canceled")
        expect(native.refunds).toHaveLength(1)
        expect(native.order.credit_lines).toHaveLength(1)
        expect(provider).toHaveBeenCalledTimes(1)
        expect(await obligationOf(order.id)).toMatchObject({
          status: "succeeded",
          attempt_count: 1,
        })
      })
    })

    describe("interrupted cancellation work", () => {
      it("records a refund whose response was lost from its persisted evidence, without moving money again", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const provider = providerRefunds()
        // The refund goes through, but the process loses the answer before
        // it can record the outcome on the obligation.
        const service = operations()
        const update = service.updateRefundObligations.bind(service)
        const lost = jest
          .spyOn(service, "updateRefundObligations")
          .mockImplementation(((data: { status?: string }) =>
            data.status === "pending"
              ? update(data as never)
              : Promise.reject(new Error("process stopped"))) as never)

        const rejected = await reject(staff.headers, order.id)

        expect(rejected.status).toBe(200)
        expect(rejected.data.order).toMatchObject({
          state: "cancelled",
          refund: { status: "pending" },
        })
        lost.mockRestore()
        // Only durable records remain; the next sweep resumes from them.
        const swept = await recover()

        expect(swept.result.resumed).toContain(order.id)
        expect(provider).toHaveBeenCalledTimes(1)
        const native = await nativeOf(order.id)
        expect(native.refunds).toHaveLength(1)
        expect(native.order.credit_lines).toHaveLength(1)
        expect(await obligationOf(order.id)).toMatchObject({
          status: "succeeded",
          attempt_count: 1,
          refund_id: native.refunds[0].id,
        })
        expect(
          (await progress(customer, order.id)).data.progress,
        ).toMatchObject({ refund: { status: "succeeded" } })
      })

      it("resumes native cancellation through the core steps and keeps the business cancellation and its succeeded refund", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const provider = providerRefunds()
        jest
          .spyOn(getContainer().resolve(Modules.ORDER), "cancel")
          .mockRejectedValueOnce(new Error("order module unavailable"))
        await reject(staff.headers, order.id)
        expect((await recordOf(order.id)).native_cancelled_at).toBeNull()
        const before = await recordOf(order.id)

        await recover()
        await recover()

        expect((await nativeOf(order.id)).order.status).toBe("canceled")
        const after = await recordOf(order.id)
        expect(after.native_cancelled_at).not.toBeNull()
        expect(after).toMatchObject({
          state: "cancelled",
          cancelled_by: before.cancelled_by,
          cancelled_at: before.cancelled_at,
          cancellation_category: "restaurant_rejected",
          revision: before.revision,
        })
        // The already-succeeded refund is replayed by neither sweep.
        expect(provider).toHaveBeenCalledTimes(1)
        expect((await nativeOf(order.id)).refunds).toHaveLength(1)
        expect((await nativeOf(order.id)).order.credit_lines).toHaveLength(1)
        expect((await obligationOf(order.id)).attempt_count).toBe(1)
      })

      it("leaves an explicitly failed refund visibly owed instead of retrying it", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const provider = providerRefunds().mockRejectedValue(
          new Error("mock provider declined: secret-detail"),
        )
        // Native cancellation is interrupted too, so the sweep does pick the
        // Order up and has to leave its failed refund alone.
        jest
          .spyOn(getContainer().resolve(Modules.ORDER), "cancel")
          .mockRejectedValueOnce(new Error("order module unavailable"))
        await reject(staff.headers, order.id)

        const swept = await recover()

        expect(swept.result.resumed).toContain(order.id)
        expect((await nativeOf(order.id)).order.status).toBe("canceled")
        expect(provider).toHaveBeenCalledTimes(1)
        expect(await obligationOf(order.id)).toMatchObject({
          status: "failed",
          attempt_count: 1,
          failure_code: "refund_provider_failed",
        })
        const shown = await progress(customer, order.id)
        expect(shown.data.progress.refund).toMatchObject({ status: "failed" })
        expect(JSON.stringify(shown.data)).not.toContain("secret-detail")
        expect((await nativeOf(order.id)).refunds).toHaveLength(0)
      })
    })
  },
})
