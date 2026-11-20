import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import SystemProviderService from "@medusajs/payment/dist/providers/system"
import { revokeRestaurantStaffWorkflow } from "../../src/workflows/restaurant-staff"
import { REJECTION_REASON_MAX_LENGTH } from "../../src/workflows/order-operations/rules"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(240000)

type RefundRow = { id: string; amount: unknown; idempotency_key: string }

medusaIntegrationTestRunner({
  dbName: "medusa_ci_partner_order_rejection_http",
  env: { JWT_SECRET: "ci-only-partner-order-rejection-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer, dbUtils }) => {
    const harness = restaurantOrdersHarness({ api, getContainer, dbUtils })
    const {
      operations,
      placePaidOrder,
      registerCustomer,
      signInAsStaffOf,
      queue,
      detail,
      accept,
      reject,
      startPreparation,
      markReady,
      progress,
      recordOf,
    } = harness
    type Seeded = ReturnType<typeof harness.seeded>
    let admin: Seeded["admin"]
    let customer: Seeded["customer"]
    let pizzeriaId: Seeded["pizzeriaId"]
    let burgerId: Seeded["burgerId"]
    let staff: Awaited<ReturnType<typeof signInAsStaffOf>>
    beforeEach(async () => {
      ;({ admin, customer, pizzeriaId, burgerId } = harness.seeded())
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
            "total",
            "credit_lines.id",
            "credit_lines.amount",
            "payment_collections.status",
            "payment_collections.payments.id",
            "payment_collections.payments.amount",
          ],
          filters: { id: order_id },
        })
      const order = data[0] as unknown as {
        status: string
        total: unknown
        credit_lines?: { amount: unknown }[]
        payment_collections: {
          status: string
          payments: { id: string; amount: unknown }[]
        }[]
      }
      const payment = order.payment_collections[0].payments[0]
      const refunds = (await getContainer()
        .resolve(Modules.PAYMENT)
        .listRefunds({ payment_id: payment.id })) as unknown as RefundRow[]
      return { order, payment, refunds }
    }
    const obligationOf = async (order_id: string) =>
      (await operations().listRefundObligations({ order_id }))[0]
    const failRefunds = () =>
      jest
        .spyOn(SystemProviderService.prototype, "refundPayment")
        .mockRejectedValue(new Error("mock provider declined: secret-detail"))

    describe("POST /partner/orders/:id/reject", () => {
      it("cancels without a reason, records the actor and fully refunds through Medusa once", async () => {
        const order = await placePaidOrder(pizzeriaId, 2)
        const before = Date.now()

        const rejected = await reject(staff.headers, order.id)

        expect(rejected.status).toBe(200)
        const { order: current } = rejected.data
        expect(current).toMatchObject({
          id: order.id,
          state: "cancelled",
          available_actions: [],
          cancellation: { category: "restaurant_rejected", note: null },
          refund: { status: "succeeded", currency_code: "dkk" },
        })
        const native = await nativeOf(order.id)
        expect(current.refund.amount_including_vat).toBe(
          Number(native.payment.amount),
        )
        // The one refund credit line brings the native Order's total to zero.
        expect(Number(native.order.total)).toBe(0)
        // ...but the kitchen ticket keeps the purchased total.
        expect(current.total_including_vat).toBe(Number(native.payment.amount))
        const cancelledAt = new Date(current.cancellation.cancelled_at)
        expect(cancelledAt.getTime()).toBeGreaterThanOrEqual(before - 1000)
        expect(await recordOf(order.id)).toMatchObject({
          state: "cancelled",
          cancelled_by: staff.staffId,
          cancellation_category: "restaurant_rejected",
          cancellation_note: null,
          revision: 2,
          accepted_at: null,
        })
        // Native commerce follows through Medusa's own cancellation steps.
        expect(native.order.status).toBe("canceled")
        expect(native.order.payment_collections[0].status).toBe("canceled")
        expect((await recordOf(order.id)).native_cancelled_at).not.toBeNull()
        expect(native.refunds).toHaveLength(1)
        expect(Number(native.refunds[0].amount)).toBe(
          Number(native.payment.amount),
        )
        expect(native.refunds[0].idempotency_key).toBe(
          (await obligationOf(order.id)).idempotency_key,
        )
        expect(native.order.credit_lines).toHaveLength(1)
        expect(await obligationOf(order.id)).toMatchObject({
          status: "succeeded",
          attempt_count: 1,
          refund_id: native.refunds[0].id,
          failure_code: null,
        })
      })

      it("stores an optional reason trimmed and free of control characters, for staff only", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const reason = `  Ovnen er gået i stykker\u0007 og vi kan ikke bage pizza i dag. ${"Lang tekst ".repeat(40)} `

        const rejected = await reject(staff.headers, order.id, { reason })

        expect(rejected.status).toBe(200)
        const stored = reason.replace("\u0007", "").trim()
        expect(rejected.data.order.cancellation.note).toBe(stored)
        expect((await recordOf(order.id)).cancellation_note).toBe(stored)
        const shown = await progress(customer, order.id)
        expect(shown.status).toBe(200)
        expect(JSON.stringify(shown.data)).not.toContain("Ovnen")
      })

      it.each([
        { reason: "x".repeat(REJECTION_REASON_MAX_LENGTH), status: 200 },
        { reason: "x".repeat(REJECTION_REASON_MAX_LENGTH + 1), status: 400 },
        { reason: 42, status: 400 },
        { reason: "   ", status: 200 },
      ])(
        "BVA/EP: a reason of $reason.length characters (or a non-text one) answers $status",
        async ({ reason, status }) => {
          const order = await placePaidOrder(pizzeriaId)
          const response = await reject(staff.headers, order.id, { reason })
          expect(response.status).toBe(status)
          const record = await recordOf(order.id)
          if (status === 400) {
            expect(record.state).toBe("awaiting_acceptance")
            expect(await obligationOf(order.id)).toBeUndefined()
          } else {
            expect(record.state).toBe("cancelled")
            expect(record.cancellation_note).toBe(
              typeof reason === "string" && reason.trim() ? reason : null,
            )
          }
        },
      )

      it("refuses a client-supplied actor, time or refund amount", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const response = await reject(staff.headers, order.id, {
          amount: 1,
          cancelled_by: "someone_else",
        })
        expect(response.status).toBe(400)
        expect((await recordOf(order.id)).state).toBe("awaiting_acceptance")
      })

      it("keeps the original outcome for a repeat and for a competing staff member without new effects", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const colleague = await signInAsStaffOf(
          pizzeriaId,
          "jonas@pizzeria.example",
        )
        const competing = await Promise.all([
          reject(staff.headers, order.id),
          reject(colleague.headers, order.id),
        ])
        const repeated = await reject(staff.headers, order.id, {
          reason: "Retry",
        })

        for (const response of [...competing, repeated]) {
          // The loser of the race either waits for the lock and sees the
          // cancellation, or is told the Order changed meanwhile.
          expect([200, 409]).toContain(response.status)
          expect(response.data.order.state).toBe("cancelled")
        }
        expect(repeated.status).toBe(200)
        const record = await recordOf(order.id)
        expect(record.revision).toBe(2)
        expect(record.cancellation_note).toBeNull()
        expect([staff.staffId, colleague.staffId]).toContain(
          record.cancelled_by,
        )
        const native = await nativeOf(order.id)
        expect(native.refunds).toHaveLength(1)
        expect(native.order.credit_lines).toHaveLength(1)
        expect(
          await operations().listRefundObligations({ order_id: order.id }),
        ).toHaveLength(1)
        expect((await obligationOf(order.id)).attempt_count).toBe(1)
      })

      it("keeps the Order cancelled and the refund visibly owed when the mock provider fails", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const provider = failRefunds()

        const rejected = await reject(staff.headers, order.id)

        expect(rejected.status).toBe(200)
        expect(rejected.data.order).toMatchObject({
          state: "cancelled",
          cancellation: { category: "restaurant_rejected" },
          refund: { status: "failed" },
        })
        expect(JSON.stringify(rejected.data)).not.toContain("secret-detail")
        expect(await obligationOf(order.id)).toMatchObject({
          status: "failed",
          attempt_count: 1,
          failure_code: "refund_provider_failed",
          refund_id: null,
        })
        // Purchase and payment history stay; no money is claimed as returned.
        const native = await nativeOf(order.id)
        expect(native.order.status).toBe("canceled")
        expect(native.payment).toBeDefined()
        expect(native.refunds).toHaveLength(0)
        expect(native.order.credit_lines ?? []).toHaveLength(0)

        const shown = await progress(customer, order.id)
        expect(shown.data.progress).toMatchObject({
          state: "cancelled",
          refund: { status: "failed" },
        })
        expect((await accept(staff.headers, order.id)).data.code).toBe(
          "order_not_awaiting_acceptance",
        )
        // A repeated rejection neither reactivates nor retries: the owed
        // refund is left for the operator's retry (#49).
        expect((await reject(staff.headers, order.id)).status).toBe(200)
        expect(provider).toHaveBeenCalledTimes(1)
        expect((await recordOf(order.id)).state).toBe("cancelled")
      })

      it("keeps the cancellation authoritative and repairable when native cancellation is interrupted", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const orders = getContainer().resolve(Modules.ORDER)
        const interrupted = jest
          .spyOn(orders, "cancel")
          .mockRejectedValueOnce(new Error("order module unavailable"))

        const rejected = await reject(staff.headers, order.id)

        expect(interrupted).toHaveBeenCalled()
        expect(rejected.status).toBe(200)
        expect(rejected.data.order).toMatchObject({
          state: "cancelled",
          available_actions: [],
          refund: { status: "succeeded" },
        })
        // The native Order is not cancelled yet, and the record says so.
        expect((await nativeOf(order.id)).order.status).not.toBe("canceled")
        expect(await recordOf(order.id)).toMatchObject({
          state: "cancelled",
          native_cancelled_at: null,
        })
        expect((await accept(staff.headers, order.id)).data.code).toBe(
          "order_not_awaiting_acceptance",
        )
      })

      it("gives an Order past its deadline the timeout outcome instead of a rejection", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const record = await recordOf(order.id)
        await operations().updateOrderOperations({
          id: record.id,
          acceptance_deadline: new Date(Date.now() - 1000),
        })

        const response = await reject(staff.headers, order.id, {
          reason: "Too busy",
        })

        expect(response.status).toBe(200)
        expect(response.data.order).toMatchObject({
          state: "cancelled",
          cancellation: { category: "acceptance_timeout", note: null },
          refund: { status: "succeeded" },
        })
        expect(await recordOf(order.id)).toMatchObject({
          cancelled_by: "system",
          cancellation_note: null,
        })
        // The refund is credited to the system too, not the staff member.
        const [refund] = (await nativeOf(order.id)).refunds as unknown as {
          created_by: string
        }[]
        expect(refund.created_by).toBe("system")
      })

      it.each([
        {
          state: "accepted",
          after: [] as ("start" | "ready")[],
          actions: ["start_preparation"],
          reason: "DT: acceptance ends the Reject window",
        },
        {
          state: "preparing",
          after: ["start"] as ("start" | "ready")[],
          actions: ["ready"],
          reason: "DT: an Order in preparation cannot be rejected",
        },
        {
          state: "ready",
          after: ["start", "ready"] as ("start" | "ready")[],
          actions: [],
          reason: "DT: ready food cannot be rejected",
        },
      ])(
        "offers no Reject and refuses one with the current Order: $reason",
        async ({ state, after, actions }) => {
          const order = await placePaidOrder(pizzeriaId)
          expect(
            (await detail(staff.headers, order.id)).data.order,
          ).toMatchObject({ available_actions: ["accept", "reject"] })
          await accept(staff.headers, order.id)
          for (const step of after)
            await (step === "start" ? startPreparation : markReady)(
              staff.headers,
              order.id,
            )
          expect(
            (await detail(staff.headers, order.id)).data.order
              .available_actions,
          ).toEqual(actions)
          const recorded = await recordOf(order.id)

          const refused = await reject(staff.headers, order.id)

          expect(refused.status).toBe(400)
          expect(refused.data).toMatchObject({
            code: "order_not_awaiting_acceptance",
            order: { state, cancellation: null, refund: null },
          })
          expect(await recordOf(order.id)).toMatchObject({
            state,
            revision: recorded.revision,
            cancelled_by: null,
          })
          expect(await obligationOf(order.id)).toBeUndefined()
        },
      )

      it("leaves a legacy Order without a deadline to an operator", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const record = await recordOf(order.id)
        await operations().updateOrderOperations({
          id: record.id,
          placed_at: null,
          acceptance_deadline: null,
        })
        const refused = await reject(staff.headers, order.id)
        expect(refused.status).toBe(400)
        expect(refused.data.code).toBe("acceptance_timing_unavailable")
        expect((await recordOf(order.id)).state).toBe("awaiting_acceptance")
      })

      it("keeps a rejected Order in the Restaurant's retained history", async () => {
        const order = await placePaidOrder(pizzeriaId)
        await reject(staff.headers, order.id)
        const history = await queue(staff.headers, "?view=history")
        expect(history.data.orders).toEqual([
          expect.objectContaining({
            id: order.id,
            cancellation: expect.objectContaining({
              category: "restaurant_rejected",
            }),
            refund: expect.objectContaining({ status: "succeeded" }),
          }),
        ])
        expect(history.data.orders[0].items).not.toHaveLength(0)
        const awaiting = await queue(staff.headers)
        expect(awaiting.data.orders).toHaveLength(0)
      })

      it.each([
        { caller: "foreign_staff", status: 404 },
        { caller: "revoked_staff", status: 403 },
        { caller: "customer", status: 401 },
      ])(
        "refuses $caller with $status and changes nothing",
        async ({ caller, status }) => {
          const order = await placePaidOrder(pizzeriaId)
          let headers: Record<string, string> = {
            authorization: customer.authorization,
          }
          if (caller === "foreign_staff")
            headers = (await signInAsStaffOf(burgerId, "bo@burger.example"))
              .headers
          if (caller === "revoked_staff") {
            const { data } = await api.get("/admin/users/me", {
              headers: admin,
            })
            await revokeRestaurantStaffWorkflow(getContainer()).run({
              input: {
                restaurant_id: pizzeriaId,
                staff_id: staff.staffId,
                revoked_by: data.user.id,
              },
            })
            headers = staff.headers
          }
          const refused = await reject(headers, order.id)
          expect(refused.status).toBe(status)
          expect(JSON.stringify(refused.data)).not.toContain(order.id)
          expect((await recordOf(order.id)).state).toBe("awaiting_acceptance")
          expect(await obligationOf(order.id)).toBeUndefined()
        },
      )
    })

    describe("GET /store/orders/:id/progress", () => {
      it("shows an awaiting Order with no cancellation or refund", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const shown = await progress(customer, order.id)
        expect(shown.status).toBe(200)
        expect(shown.data.progress).toEqual({
          order_id: order.id,
          state: "awaiting_acceptance",
          placed_at: order.order_operation.placed_at,
          accepted_at: null,
          preparation_started_at: null,
          ready_at: null,
          available_actions: ["cancel"],
          cancellation: null,
          refund: null,
          // No delivery exists before acceptance (#161).
          delivery: null,
        })
      })

      it("shows the owning Customer the cancellation and the refund outcome, without staff details", async () => {
        const order = await placePaidOrder(pizzeriaId)
        await reject(staff.headers, order.id, { reason: "Ingen mel" })

        const shown = await progress(customer, order.id)

        expect(shown.status).toBe(200)
        expect(shown.data.progress).toMatchObject({
          state: "cancelled",
          cancellation: { category: "restaurant_rejected" },
          refund: {
            status: "succeeded",
            currency_code: "dkk",
            amount_including_vat: expect.any(Number),
          },
        })
        const body = JSON.stringify(shown.data)
        expect(body).not.toContain(staff.staffId)
        expect(body).not.toContain("Ingen mel")
      })

      it("answers another Customer, a signed-out caller and an unknown Order without details", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const other = await registerCustomer("other-customer@example.test")
        expect((await progress(other.headers, order.id)).status).toBe(404)
        expect((await progress(other.headers, "order_unknown")).status).toBe(
          404,
        )
        const signedOut = await progress(
          { "x-publishable-api-key": other.headers["x-publishable-api-key"] },
          order.id,
        )
        expect(signedOut.status).toBe(401)
      })
    })
  },
})
