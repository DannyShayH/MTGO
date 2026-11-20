import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import SystemProviderService from "@medusajs/payment/dist/providers/system"
import { createOrderWorkflow } from "@medusajs/medusa/core-flows"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(240000)

/**
 * The Customer's food-progress timeline (#147) reads only
 * `GET /store/orders/:id/progress`. These pin the public projection it
 * renders: recorded milestones with their real times, later steps left
 * unrecorded, and a cancellation with its separate refund outcome.
 */
medusaIntegrationTestRunner({
  dbName: "medusa_ci_customer_order_progress_http",
  env: {
    JWT_SECRET: "ci-only-customer-order-progress-secret",
    REDIS_URL: "",
  },
  testSuite: ({ api, getContainer, dbUtils }) => {
    const harness = restaurantOrdersHarness({ api, getContainer, dbUtils })
    const {
      operations,
      placePaidOrder,
      signInAsStaffOf,
      accept,
      startPreparation,
      markReady,
      progress,
      cancel,
    } = harness
    type Seeded = ReturnType<typeof harness.seeded>
    let customer: Seeded["customer"]
    let customerId: Seeded["customerId"]
    let regionId: Seeded["regionId"]
    let pizzeriaId: Seeded["pizzeriaId"]
    let staff: Awaited<ReturnType<typeof signInAsStaffOf>>
    beforeEach(async () => {
      ;({ customer, customerId, regionId, pizzeriaId } = harness.seeded())
      staff = await signInAsStaffOf(pizzeriaId, "mette@pizzeria.example")
    })
    afterEach(() => jest.restoreAllMocks())

    const progressOf = async (orderId: string) => {
      const read = await progress(customer, orderId)
      expect(read.status).toBe(200)
      return read.data.progress
    }

    it("shows each milestone at its recorded time and leaves every later step unrecorded", async () => {
      const order = await placePaidOrder(pizzeriaId)
      const placed_at = order.order_operation.placed_at
      const base = {
        order_id: order.id,
        placed_at,
        cancellation: null,
        refund: null,
        // Accepted work awaits an agent: no delivery milestone yet (#161).
        delivery: {
          assigned_at: null,
          picked_up_at: null,
          delivered_at: null,
          outcome: null,
        },
      }

      const { accepted_at } = (await accept(staff.headers, order.id)).data.order
      expect(await progressOf(order.id)).toEqual({
        ...base,
        state: "accepted",
        accepted_at,
        preparation_started_at: null,
        ready_at: null,
        available_actions: [],
      })

      const { preparation_started_at } = (
        await startPreparation(staff.headers, order.id)
      ).data.order
      expect(await progressOf(order.id)).toEqual({
        ...base,
        state: "preparing",
        accepted_at,
        preparation_started_at,
        ready_at: null,
        available_actions: [],
      })

      const { ready_at } = (await markReady(staff.headers, order.id)).data.order
      const ready = await progress(customer, order.id)
      // Readiness is the last food fact: no agent, pickup, delivery or ETA.
      expect(ready.data).toEqual({
        progress: {
          ...base,
          state: "ready",
          accepted_at,
          preparation_started_at,
          ready_at,
          available_actions: [],
        },
        server_time: expect.any(String),
      })
      for (const [earlier, later] of [
        [placed_at, accepted_at],
        [accepted_at, preparation_started_at],
        [preparation_started_at, ready_at],
      ])
        expect(Date.parse(later)).toBeGreaterThanOrEqual(Date.parse(earlier))
    })

    describe("a cancelled Order", () => {
      it("keeps its placement, records no later milestone and shows a succeeded refund apart", async () => {
        const order = await placePaidOrder(pizzeriaId)
        expect((await cancel(customer, order.id)).status).toBe(200)

        expect(await progressOf(order.id)).toEqual({
          order_id: order.id,
          state: "cancelled",
          // Never accepted, so there was never a delivery.
          delivery: null,
          placed_at: order.order_operation.placed_at,
          accepted_at: null,
          preparation_started_at: null,
          ready_at: null,
          available_actions: [],
          cancellation: {
            category: "customer_cancelled",
            cancelled_at: expect.any(String),
            effective_at: expect.any(String),
          },
          refund: {
            status: "succeeded",
            amount_including_vat: expect.any(Number),
            currency_code: "dkk",
            last_attempted_at: expect.any(String),
            succeeded_at: expect.any(String),
          },
        })
      })

      it("shows a failed refund as still owed, without the provider's failure", async () => {
        jest
          .spyOn(SystemProviderService.prototype, "refundPayment")
          .mockRejectedValue(new Error("mock provider declined: secret-detail"))
        const order = await placePaidOrder(pizzeriaId)
        await cancel(customer, order.id)

        const shown = await progress(customer, order.id)

        expect(shown.data.progress).toMatchObject({
          state: "cancelled",
          placed_at: order.order_operation.placed_at,
          cancellation: { category: "customer_cancelled" },
          refund: { status: "failed", succeeded_at: null },
        })
        const body = JSON.stringify(shown.data)
        expect(body).not.toContain("secret-detail")
        expect(body).not.toContain("failure_code")
      })

      it("shows a refund still in progress as pending", async () => {
        const order = await placePaidOrder(pizzeriaId)
        await cancel(customer, order.id)
        // As an interrupted refund leaves it until recovery retries (#144).
        const [obligation] = await operations().listRefundObligations({
          order_id: order.id,
        })
        await operations().updateRefundObligations({
          id: obligation.id,
          status: "pending",
          succeeded_at: null,
        })

        expect((await progressOf(order.id)).refund).toMatchObject({
          status: "pending",
          succeeded_at: null,
        })
      })
    })

    it("hides a provisional Order from an unfinished checkout", async () => {
      const { result: provisional } = await createOrderWorkflow(
        getContainer(),
      ).run({
        input: {
          region_id: regionId,
          customer_id: customerId,
          email: "orders-customer@example.test",
          currency_code: "dkk",
          metadata: { mtogo_checkout_review: { version: 1 } },
          items: [{ title: "Provisional", quantity: 1, unit_price: 100 }],
        },
      })

      const read = await progress(customer, provisional.id)

      expect(read.status).toBe(404)
      expect(JSON.stringify(read.data)).not.toContain("Provisional")
    })

    it("names the Order's Restaurant on request, so the page can show the dishes' menu photos", async () => {
      const order = await placePaidOrder(pizzeriaId)

      const plain = await api.get(`/store/orders/${order.id}`, {
        headers: customer,
      })
      const named = await api.get(`/store/orders/${order.id}`, {
        headers: customer,
        params: { fields: "+restaurant.id,*items" },
      })

      expect(plain.data.order.restaurant).toBeUndefined()
      expect(named.status).toBe(200)
      expect(named.data.order.restaurant).toEqual({ id: pizzeriaId })
      // Only the id: no staff, address or other Restaurant record details.
      expect(Object.keys(named.data.order.restaurant)).toEqual(["id"])
    })

    it("serves twenty simultaneous Order-page journeys with at least 95% of reads within two seconds", async () => {
      const orders: { id: string }[] = []
      for (let i = 0; i < 5; i++) orders.push(await placePaidOrder(pizzeriaId))
      const timed = async (read: () => Promise<{ status: number }>) => {
        const start = performance.now()
        expect((await read()).status).toBe(200)
        return performance.now() - start
      }
      // A journey opens the Order page and then refreshes its progress.
      const durations = (
        await Promise.all(
          Array.from({ length: 20 }, async (_, i) => {
            const id = orders[i % 5].id
            return [
              await timed(() =>
                api.get(`/store/orders/${id}`, { headers: customer }),
              ),
              await timed(() => progress(customer, id)),
              await timed(() => progress(customer, id)),
            ]
          }),
        )
      )
        .flat()
        .sort((a, b) => a - b)
      const percentile = (share: number) =>
        durations[Math.ceil(share * durations.length) - 1]
      console.log(
        `Customer Order progress, 20 concurrent journeys (detail + 2 progress reads), 5 Orders: ` +
          `p50 ${Math.round(percentile(0.5))} ms, p95 ${Math.round(percentile(0.95))} ms`,
      )
      expect(
        durations.filter((d) => d <= 2000).length / durations.length,
      ).toBeGreaterThanOrEqual(0.95)
    })
  },
})
