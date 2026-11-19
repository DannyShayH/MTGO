import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import SystemProviderService from "@medusajs/payment/dist/providers/system"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(240000)

type RefundRow = { id: string; amount: unknown; idempotency_key: string }

medusaIntegrationTestRunner({
  dbName: "medusa_ci_customer_order_cancellation_http",
  env: {
    JWT_SECRET: "ci-only-customer-order-cancellation-secret",
    REDIS_URL: "",
  },
  testSuite: ({ api, getContainer }) => {
    const harness = restaurantOrdersHarness({ api, getContainer })
    const {
      operations,
      placePaidOrder,
      registerCustomer,
      signInAsStaffOf,
      accept,
      progress,
      cancel,
      recordOf,
    } = harness
    type Seeded = ReturnType<typeof harness.seeded>
    let customer: Seeded["customer"]
    let customerId: Seeded["customerId"]
    let pizzeriaId: Seeded["pizzeriaId"]
    let staff: Awaited<ReturnType<typeof signInAsStaffOf>>
    beforeEach(async () => {
      ;({ customer, customerId, pizzeriaId } = harness.seeded())
      staff = await signInAsStaffOf(pizzeriaId, "mette@pizzeria.example")
    })
    afterEach(() => jest.restoreAllMocks())

    /** The native Order, its payment and the refunds Medusa persisted. */
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

    describe("POST /store/orders/:id/cancel", () => {
      it("cancels the owning Customer's awaiting Order and fully refunds it through Medusa once", async () => {
        const order = await placePaidOrder(pizzeriaId, 2)
        expect(
          (await progress(customer, order.id)).data.progress.available_actions,
        ).toEqual(["cancel"])

        const cancelled = await cancel(customer, order.id)

        expect(cancelled.status).toBe(200)
        const native = await nativeOf(order.id)
        expect(cancelled.data.progress).toMatchObject({
          order_id: order.id,
          state: "cancelled",
          available_actions: [],
          cancellation: { category: "customer_cancelled" },
          refund: {
            status: "succeeded",
            currency_code: "dkk",
            amount_including_vat: Number(native.payment.amount),
          },
        })
        expect(await recordOf(order.id)).toMatchObject({
          state: "cancelled",
          cancelled_by: customerId,
          cancellation_category: "customer_cancelled",
          cancellation_note: null,
          accepted_at: null,
          revision: 2,
        })
        expect((await recordOf(order.id)).native_cancelled_at).not.toBeNull()
        expect(native.order.status).toBe("canceled")
        expect(native.refunds).toHaveLength(1)
        expect(native.refunds[0].idempotency_key).toBe(
          (await obligationOf(order.id)).idempotency_key,
        )
      })

      it("answers another Customer, a signed-out caller and an unknown Order without details or effects", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const other = await registerCustomer("other-customer@example.test")

        const foreign = await cancel(other.headers, order.id)
        expect(foreign.status).toBe(404)
        expect(JSON.stringify(foreign.data)).not.toContain("awaiting")
        expect((await cancel(other.headers, "order_unknown")).status).toBe(404)
        const signedOut = await cancel(
          { "x-publishable-api-key": other.headers["x-publishable-api-key"] },
          order.id,
        )
        expect(signedOut.status).toBe(401)

        expect((await recordOf(order.id)).state).toBe("awaiting_acceptance")
        expect(await obligationOf(order.id)).toBeUndefined()
      })

      it("refuses a client-supplied actor, time or refund amount", async () => {
        const order = await placePaidOrder(pizzeriaId)
        for (const body of [
          { cancelled_by: "someone_else" },
          { cancelled_at: new Date(0).toISOString() },
          { amount: 1 },
        ]) {
          const refused = await cancel(customer, order.id, body)
          expect(refused.status).toBe(400)
        }
        expect((await recordOf(order.id)).state).toBe("awaiting_acceptance")
      })

      it("refuses after acceptance, shows the accepted Order and leaves it to an operator", async () => {
        const order = await placePaidOrder(pizzeriaId)
        expect((await accept(staff.headers, order.id)).status).toBe(200)
        expect(
          (await progress(customer, order.id)).data.progress.available_actions,
        ).toEqual([])

        const refused = await cancel(customer, order.id)

        expect(refused.status).toBe(400)
        expect(refused.data.code).toBe("order_not_awaiting_acceptance")
        // The storefront's SDK surfaces only the message: it is the code.
        expect(refused.data.message).toBe("order_not_awaiting_acceptance")
        expect(refused.data.progress).toMatchObject({
          state: "accepted",
          available_actions: [],
          cancellation: null,
          refund: null,
        })
        expect(await recordOf(order.id)).toMatchObject({
          state: "accepted",
          cancelled_at: null,
        })
        expect(await obligationOf(order.id)).toBeUndefined()
      })

      it("gives an Order past its deadline the timeout outcome before any sweep has run", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const record = await recordOf(order.id)
        await operations().updateOrderOperations({
          id: record.id,
          acceptance_deadline: new Date(Date.now() - 1000),
        })
        expect(
          (await progress(customer, order.id)).data.progress.available_actions,
        ).toEqual([])

        const late = await cancel(customer, order.id)

        expect(late.status).toBe(200)
        expect(late.data.progress).toMatchObject({
          state: "cancelled",
          cancellation: { category: "acceptance_timeout" },
          refund: { status: "succeeded" },
        })
        expect(await recordOf(order.id)).toMatchObject({
          cancelled_by: "system",
          cancellation_category: "acceptance_timeout",
        })
      })

      it("leaves a legacy Order without a deadline to an operator", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const record = await recordOf(order.id)
        await operations().updateOrderOperations({
          id: record.id,
          acceptance_deadline: null,
        })

        const refused = await cancel(customer, order.id)

        expect(refused.status).toBe(400)
        expect(refused.data.code).toBe("acceptance_timing_unavailable")
        expect(refused.data.progress.state).toBe("awaiting_acceptance")
        expect(await obligationOf(order.id)).toBeUndefined()
      })

      it("answers an Order without an operation record as not found, without effects", async () => {
        const order = await placePaidOrder(pizzeriaId)
        await operations().deleteOrderOperations((await recordOf(order.id)).id)

        const refused = await cancel(customer, order.id)

        expect(refused.status).toBe(404)
        expect(refused.data.code).toBe("order_not_found")
        expect((await progress(customer, order.id)).status).toBe(404)
        expect(await obligationOf(order.id)).toBeUndefined()
      })

      it("keeps one cancellation and one refund for a double tap and a retried lost response", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const provider = jest.spyOn(
          SystemProviderService.prototype,
          "refundPayment",
        )

        const doubleTap = await Promise.all([
          cancel(customer, order.id),
          cancel(customer, order.id),
        ])
        const retried = await cancel(customer, order.id)

        for (const response of [...doubleTap, retried]) {
          // The second tap waits for the lock and sees the cancellation, or
          // is told the Order changed meanwhile; either way it shows the truth.
          expect([200, 409]).toContain(response.status)
          expect(response.data.progress.state).toBe("cancelled")
        }
        expect(retried.status).toBe(200)
        expect(retried.data.progress).toMatchObject({
          cancellation: { category: "customer_cancelled" },
          refund: { status: "succeeded" },
        })
        expect((await recordOf(order.id)).revision).toBe(2)
        const native = await nativeOf(order.id)
        expect(native.refunds).toHaveLength(1)
        expect(native.order.credit_lines).toHaveLength(1)
        expect(provider).toHaveBeenCalledTimes(1)
        expect((await obligationOf(order.id)).attempt_count).toBe(1)
      })

      it("yields one truthful outcome when acceptance races the cancellation", async () => {
        const order = await placePaidOrder(pizzeriaId)

        const [accepted, cancelled] = await Promise.all([
          accept(staff.headers, order.id),
          cancel(customer, order.id),
        ])

        const record = await recordOf(order.id)
        const shown = (await progress(customer, order.id)).data.progress
        if (record.state === "cancelled") {
          expect(cancelled.status).toBe(200)
          expect([400, 409]).toContain(accepted.status)
          expect(record.accepted_at).toBeNull()
          expect(shown).toMatchObject({
            cancellation: { category: "customer_cancelled" },
            refund: { status: "succeeded" },
          })
          expect((await nativeOf(order.id)).refunds).toHaveLength(1)
        } else {
          expect(accepted.status).toBe(200)
          expect([400, 409]).toContain(cancelled.status)
          expect(cancelled.data.progress.state).toBe("accepted")
          expect(record.cancelled_at).toBeNull()
          expect(shown).toMatchObject({ cancellation: null, refund: null })
          expect(await obligationOf(order.id)).toBeUndefined()
        }
        expect(shown.state).toBe(record.state)
      })

      it("keeps the Order cancelled and the refund visibly owed when the mock provider fails", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const provider = jest
          .spyOn(SystemProviderService.prototype, "refundPayment")
          .mockRejectedValue(new Error("mock provider declined: secret-detail"))

        const cancelled = await cancel(customer, order.id)

        expect(cancelled.status).toBe(200)
        expect(cancelled.data.progress).toMatchObject({
          state: "cancelled",
          available_actions: [],
          cancellation: { category: "customer_cancelled" },
          refund: { status: "failed" },
        })
        expect(JSON.stringify(cancelled.data)).not.toContain("secret-detail")
        expect(await obligationOf(order.id)).toMatchObject({
          status: "failed",
          failure_code: "refund_provider_failed",
          attempt_count: 1,
        })
        const native = await nativeOf(order.id)
        expect(native.refunds).toHaveLength(0)
        expect(native.payment).toBeDefined()
        // A repeat neither reactivates nor retries: the owed refund is the
        // operator's to retry (#49).
        expect((await cancel(customer, order.id)).status).toBe(200)
        expect(provider).toHaveBeenCalledTimes(1)
        expect((await recordOf(order.id)).state).toBe("cancelled")
      })
    })
  },
})
