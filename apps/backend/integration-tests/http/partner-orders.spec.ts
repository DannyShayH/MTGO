import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import { revokeRestaurantStaffWorkflow } from "../../src/workflows/restaurant-staff"
import legacyOrderPlacements from "../../src/migration-scripts/legacy-order-placements"
import {
  restaurantOrdersHarness,
  type QueueOrder,
} from "../helpers/restaurant-orders"

jest.setTimeout(240000)

medusaIntegrationTestRunner({
  dbName: "medusa_ci_partner_orders_http",
  env: { JWT_SECRET: "ci-only-partner-orders-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer }) => {
    const harness = restaurantOrdersHarness({ api, getContainer })
    const {
      operations,
      restaurants,
      reviewedCartOf,
      complete,
      placePaidOrder,
      signInAsStaffOf,
      queue,
      detail,
      accept,
      recordOf,
    } = harness
    type Seeded = ReturnType<typeof harness.seeded>
    let admin: Seeded["admin"]
    let store: Seeded["store"]
    let customer: Seeded["customer"]
    let customerId: Seeded["customerId"]
    let pizzeriaId: Seeded["pizzeriaId"]
    let burgerId: Seeded["burgerId"]
    beforeEach(() => {
      ;({ admin, store, customer, customerId, pizzeriaId, burgerId } =
        harness.seeded())
    })

    describe("GET /partner/orders", () => {
      it("shows staff their Restaurant's awaiting Orders by earliest deadline, paginated", async () => {
        const first = await placePaidOrder(pizzeriaId, 2)
        const second = await placePaidOrder(pizzeriaId)
        const third = await placePaidOrder(pizzeriaId)
        const foreign = await placePaidOrder(burgerId)
        // Two Orders sharing a deadline keep a stable order by id.
        const records = await operations().listOrderOperations({
          order_id: [second.id, third.id],
        })
        const tie = new Date(first.order_operation.acceptance_deadline)
        tie.setSeconds(tie.getSeconds() + 30)
        await operations().updateOrderOperations(
          records.map(({ id }) => ({ id, acceptance_deadline: tie })),
        )
        const tied = [...records]
          .sort((x, y) => (x.id < y.id ? -1 : 1))
          .map(({ order_id }) => order_id)
        const { headers } = await signInAsStaffOf(
          pizzeriaId,
          "mette@pizzeria.example",
        )

        const page = await queue(headers, "?limit=2")
        expect(page.status).toBe(200)
        expect(page.data).toMatchObject({ count: 3, offset: 0, limit: 2 })
        expect(Date.parse(page.data.server_time)).not.toBeNaN()
        const rest = await queue(headers, "?limit=2&offset=2")
        const ids = [...page.data.orders, ...rest.data.orders].map(
          ({ id }: QueueOrder) => id,
        )
        expect(ids).toEqual([first.id, ...tied])
        expect(ids).not.toContain(foreign.id)

        const [top] = page.data.orders as QueueOrder[]
        expect(top).toMatchObject({
          id: first.id,
          display_id: first.display_id,
          state: "awaiting_acceptance",
          placed_at: first.order_operation.placed_at,
          acceptance_deadline: first.order_operation.acceptance_deadline,
          acceptance_window: "open",
          currency_code: "dkk",
        })
        expect(top.items).toEqual([
          expect.objectContaining({ quantity: 2, name: expect.any(String) }),
        ])
        // Kitchen reads carry no Customer account or contact details.
        const text = JSON.stringify(page.data)
        expect(text).not.toContain("orders-customer@example.test")
        expect(text).not.toContain("Lovelace")
        expect(text).not.toContain(customerId)

        for (const view of ["active", "history"]) {
          const empty = await queue(headers, `?view=${view}`)
          expect(empty.data).toMatchObject({ orders: [], count: 0 })
        }
      })

      it("moves an Order between views by its operational state and reports an elapsed window honestly", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const late = await placePaidOrder(pizzeriaId)
        const { headers } = await signInAsStaffOf(
          pizzeriaId,
          "mette@pizzeria.example",
        )
        const [record] = await operations().listOrderOperations({
          order_id: order.id,
        })
        await operations().updateOrderOperations({
          id: record.id,
          state: "preparing",
        })
        const [lateRecord] = await operations().listOrderOperations({
          order_id: late.id,
        })
        await operations().updateOrderOperations({
          id: lateRecord.id,
          acceptance_deadline: new Date(Date.now() - 1000),
        })

        const active = await queue(headers, "?view=active")
        expect(active.data.orders.map(({ id }: QueueOrder) => id)).toEqual([
          order.id,
        ])
        expect(active.data.orders[0].state).toBe("preparing")
        const awaiting = await queue(headers)
        expect(awaiting.data.orders).toEqual([
          expect.objectContaining({
            id: late.id,
            acceptance_window: "elapsed",
            state: "awaiting_acceptance",
          }),
        ])
        await operations().updateOrderOperations({
          id: record.id,
          state: "cancelled",
        })
        expect((await queue(headers, "?view=history")).data.orders[0].id).toBe(
          order.id,
        )
      })

      it("keeps a closed or deactivated Restaurant's paid Orders readable for its staff", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const { headers } = await signInAsStaffOf(
          pizzeriaId,
          "mette@pizzeria.example",
        )
        await restaurants().updateRestaurants({
          id: pizzeriaId,
          is_open: false,
        })
        expect((await queue(headers)).data.orders[0].id).toBe(order.id)
        await restaurants().updateRestaurants({
          id: pizzeriaId,
          is_active: false,
        })
        expect((await queue(headers)).data.orders[0].id).toBe(order.id)
        expect((await detail(headers, order.id)).status).toBe(200)
      })

      it("shows a legacy Order with unavailable timing instead of an invented deadline", async () => {
        const recent = await placePaidOrder(pizzeriaId)
        const legacy = await placePaidOrder(pizzeriaId)
        // Placed before #140: only the metadata marker recorded placement.
        const [record] = await operations().listOrderOperations({
          order_id: legacy.id,
        })
        await operations().deleteOrderOperations(record.id)
        const orderModule = getContainer().resolve(Modules.ORDER)
        const { metadata } = await orderModule.retrieveOrder(legacy.id, {
          select: ["metadata"],
        })
        await orderModule.updateOrders(legacy.id, {
          metadata: {
            ...metadata,
            mtogo_order_state: "awaiting_restaurant_acceptance",
          },
        })
        expect(
          (await api.get(`/store/orders/${legacy.id}`, { headers: customer }))
            .status,
        ).toBe(200)

        await legacyOrderPlacements({ container: getContainer() })
        await legacyOrderPlacements({ container: getContainer() })
        expect(
          await operations().listOrderOperations({ order_id: legacy.id }),
        ).toHaveLength(1)
        const { headers } = await signInAsStaffOf(
          pizzeriaId,
          "mette@pizzeria.example",
        )
        const { data } = await queue(headers)
        expect(data.orders.map(({ id }: QueueOrder) => id)).toEqual([
          recent.id,
          legacy.id,
        ])
        expect(data.orders[1]).toMatchObject({
          placed_at: null,
          acceptance_deadline: null,
          acceptance_window: "unavailable",
          state: "awaiting_acceptance",
        })
        // No kitchen facts are invented from today's menu for a legacy Order.
        expect(data.orders[1].items[0]).toMatchObject({
          name: "Pizza Margherita (synthetic)",
          quantity: 1,
          purchased: { status: "unavailable" },
        })
        expect(data.orders[0].items[0].purchased.status).toBe("preserved")
      })

      it("serves twenty simultaneous queue journeys with at least 95% within two seconds", async () => {
        const orders: { id: string }[] = []
        for (let i = 0; i < 5; i++)
          orders.push(await placePaidOrder(pizzeriaId))
        const { headers } = await signInAsStaffOf(
          pizzeriaId,
          "mette@pizzeria.example",
        )
        const durations = (
          await Promise.all(
            Array.from({ length: 20 }, async (_, i) => {
              const timed = async (read: () => Promise<{ status: number }>) => {
                const start = performance.now()
                expect((await read()).status).toBe(200)
                return performance.now() - start
              }
              return [
                await timed(() => queue(headers)),
                await timed(() => detail(headers, orders[i % 5].id)),
              ]
            }),
          )
        )
          .flat()
          .sort((a, b) => a - b)
        const percentile = (share: number) =>
          durations[Math.ceil(share * durations.length) - 1]
        console.log(
          `Partner Orders queue, 20 concurrent journeys (list + detail), 5 Orders: ` +
            `p50 ${Math.round(percentile(0.5))} ms, p95 ${Math.round(percentile(0.95))} ms`,
        )
        expect(
          durations.filter((d) => d <= 2000).length / durations.length,
        ).toBeGreaterThanOrEqual(0.95)
      })
    })

    describe("POST /partner/orders/:id/accept", () => {
      it("records the acceptance time, actor and revision without starting preparation or touching the native Order", async () => {
        const { cartId } = await reviewedCartOf(pizzeriaId)
        const order = (await complete(cartId)).data.order
        const { headers, staffId } = await signInAsStaffOf(
          pizzeriaId,
          "mette@pizzeria.example",
        )
        expect((await detail(headers, order.id)).data.order).toMatchObject({
          available_actions: ["accept", "reject"],
          accepted_at: null,
        })

        const before = Date.now()
        const accepted = await accept(headers, order.id)
        expect(accepted.status).toBe(200)
        expect(accepted.data.order).toMatchObject({
          id: order.id,
          state: "accepted",
          acceptance_window: "unavailable",
          available_actions: [],
          placed_at: order.order_operation.placed_at,
          acceptance_deadline: order.order_operation.acceptance_deadline,
        })
        const acceptedAt = Date.parse(accepted.data.order.accepted_at)
        expect(acceptedAt).toBeGreaterThanOrEqual(before - 1000)
        expect(acceptedAt).toBeLessThanOrEqual(Date.now())
        const record = await recordOf(order.id)
        expect(record).toMatchObject({
          state: "accepted",
          accepted_by: staffId,
          revision: 2,
        })

        // Accepted is active kitchen work, still visible to every reader.
        const active = await queue(headers, "?view=active")
        expect(active.data.orders.map(({ id }: QueueOrder) => id)).toEqual([
          order.id,
        ])
        expect((await queue(headers)).data.orders).toEqual([])
        const history = await api.get("/store/orders", { headers: customer })
        expect(history.data.orders).toEqual([
          expect.objectContaining({
            id: order.id,
            order_operation: expect.objectContaining({ state: "accepted" }),
          }),
        ])
        const native = await api.get(
          `/admin/orders/${order.id}?fields=status,fulfillment_status,*fulfillments`,
          { headers: admin },
        )
        expect(native.status).toBe(200)
        expect(native.data.order).toMatchObject({
          status: "pending",
          fulfillment_status: "not_fulfilled",
          fulfillments: [],
        })

        // A retried placement finds the placed Order and leaves it as it is.
        const retried = (await complete(cartId)).data.order
        expect(retried.id).toBe(order.id)
        expect(retried.payment_collections[0].payments).toHaveLength(1)
        expect(await recordOf(order.id)).toMatchObject({
          state: "accepted",
          revision: 2,
          placed_at: record.placed_at,
        })
      })

      it("keeps the original acceptance for a repeat and for a competing staff member", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const mette = await signInAsStaffOf(
          pizzeriaId,
          "mette@pizzeria.example",
        )
        const jonas = await signInAsStaffOf(
          pizzeriaId,
          "jonas@pizzeria.example",
        )

        const competing = await Promise.all([
          accept(mette.headers, order.id),
          accept(jonas.headers, order.id),
        ])
        expect(competing.map(({ status }) => status)).toEqual([200, 200])
        const record = await recordOf(order.id)
        expect(record.revision).toBe(2)
        expect([mette.staffId, jonas.staffId]).toContain(record.accepted_by)
        for (const { data } of competing)
          expect(Date.parse(data.order.accepted_at)).toBe(
            new Date(record.accepted_at!).getTime(),
          )

        const repeated = await accept(mette.headers, order.id)
        expect(repeated.status).toBe(200)
        expect(repeated.data.order.accepted_at).toBe(
          competing[0].data.order.accepted_at,
        )
        expect(await recordOf(order.id)).toMatchObject({
          revision: 2,
          accepted_by: record.accepted_by,
        })
      })

      it.each([
        {
          change: () => ({ acceptance_deadline: new Date() }),
          code: "acceptance_window_elapsed",
          state: "awaiting_acceptance",
          reason: "BVA: the deadline is now, so the server finds it too late",
        },
        {
          change: () => ({ state: "cancelled" as const }),
          code: "order_not_awaiting_acceptance",
          state: "cancelled",
          reason: "DT: a cancelled Order",
        },
        {
          change: () => ({ acceptance_deadline: null, placed_at: null }),
          code: "acceptance_timing_unavailable",
          state: "awaiting_acceptance",
          reason: "DT: a legacy Order without a recorded deadline",
        },
      ])(
        "refuses with the current outcome: $reason",
        async ({ change, code, state }) => {
          const order = await placePaidOrder(pizzeriaId)
          const { headers } = await signInAsStaffOf(
            pizzeriaId,
            "mette@pizzeria.example",
          )
          const record = await recordOf(order.id)
          await operations().updateOrderOperations({
            id: record.id,
            ...change(),
          })

          const refused = await accept(headers, order.id)
          expect(refused.status).toBe(400)
          expect(refused.data).toMatchObject({
            code,
            order: {
              id: order.id,
              state,
              accepted_at: null,
              available_actions: [],
            },
          })
          expect(Date.parse(refused.data.server_time)).not.toBeNaN()
          expect(await recordOf(order.id)).toMatchObject({
            state,
            revision: 1,
            accepted_at: null,
            accepted_by: null,
          })
        },
      )

      it("lets staff accept a closed or deactivated Restaurant's existing paid Orders", async () => {
        const closed = await placePaidOrder(pizzeriaId)
        const inactive = await placePaidOrder(pizzeriaId)
        const { headers } = await signInAsStaffOf(
          pizzeriaId,
          "mette@pizzeria.example",
        )
        await restaurants().updateRestaurants({
          id: pizzeriaId,
          is_open: false,
        })
        expect((await accept(headers, closed.id)).status).toBe(200)
        await restaurants().updateRestaurants({
          id: pizzeriaId,
          is_active: false,
        })
        expect((await accept(headers, inactive.id)).status).toBe(200)
      })

      it("refuses a client-supplied time or actor", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const { headers } = await signInAsStaffOf(
          pizzeriaId,
          "mette@pizzeria.example",
        )
        const refused = await accept(headers, order.id, {
          accepted_at: "2026-11-18T12:00:00.000Z",
          accepted_by: "someone_else",
        })
        expect(refused.status).toBe(400)
        expect((await recordOf(order.id)).state).toBe("awaiting_acceptance")
      })

      type Caller =
        "signed_out" | "customer" | "foreign_staff" | "revoked_staff"
      it.each([
        {
          caller: "signed_out" as Caller,
          status: 401,
          reason: "DT R2: no token",
        },
        {
          caller: "customer" as Caller,
          status: 401,
          reason: "DT R3: wrong actor type (Customer)",
        },
        {
          caller: "foreign_staff" as Caller,
          status: 404,
          code: "order_not_found",
          reason: "DT R4: staff of another Restaurant, answered as missing",
        },
        {
          caller: "revoked_staff" as Caller,
          status: 403,
          code: "staff_access_revoked",
          reason: "DT R5: the owning Restaurant's staff after revocation",
        },
      ])("refuses $reason", async ({ caller, status, code }) => {
        const order = await placePaidOrder(pizzeriaId)
        const own = await signInAsStaffOf(pizzeriaId, "mette@pizzeria.example")
        const headersOf: Record<Caller, () => Promise<Record<string, string>>> =
          {
            signed_out: async () => ({}),
            customer: async () => ({ authorization: customer.authorization }),
            foreign_staff: async () =>
              (await signInAsStaffOf(burgerId, "bo@burger.example")).headers,
            revoked_staff: async () => {
              const { data } = await api.get("/admin/users/me", {
                headers: admin,
              })
              await revokeRestaurantStaffWorkflow(getContainer()).run({
                input: {
                  restaurant_id: pizzeriaId,
                  staff_id: own.staffId,
                  revoked_by: data.user.id,
                },
              })
              return own.headers
            },
          }

        const refused = await accept(await headersOf[caller](), order.id)
        expect(refused.status).toBe(status)
        if (code) expect(refused.data.code).toBe(code)
        expect(JSON.stringify(refused.data)).not.toContain(order.id)
        expect(await recordOf(order.id)).toMatchObject({
          state: "awaiting_acceptance",
          revision: 1,
        })
      })
    })

    describe("access", () => {
      type Caller =
        | "own_staff"
        | "signed_out"
        | "customer"
        | "foreign_staff"
        | "revoked_staff"
      it.each([
        {
          caller: "own_staff" as Caller,
          status: 200,
          sees: true,
          reason: "DT R1: authorized staff of the owning Restaurant",
        },
        {
          caller: "signed_out" as Caller,
          status: 401,
          sees: false,
          reason: "DT R2: no token",
        },
        {
          caller: "customer" as Caller,
          status: 401,
          sees: false,
          reason: "DT R3: signed in, wrong actor type (Customer)",
        },
        {
          caller: "foreign_staff" as Caller,
          status: 404,
          sees: false,
          reason: "DT R4: authorized staff of another Restaurant",
        },
        {
          caller: "revoked_staff" as Caller,
          status: 403,
          sees: false,
          reason:
            "DT R5: staff of the owning Restaurant whose access was revoked",
        },
      ])("$reason", async ({ caller, status, sees }) => {
        const order = await placePaidOrder(pizzeriaId)
        const own = await signInAsStaffOf(pizzeriaId, "mette@pizzeria.example")
        const headersOf: Record<Caller, () => Promise<Record<string, string>>> =
          {
            own_staff: async () => own.headers,
            signed_out: async () => ({}),
            customer: async () => ({ authorization: customer.authorization }),
            foreign_staff: async () =>
              (await signInAsStaffOf(burgerId, "bo@burger.example")).headers,
            revoked_staff: async () => {
              const { data } = await api.get("/admin/users/me", {
                headers: admin,
              })
              await revokeRestaurantStaffWorkflow(getContainer()).run({
                input: {
                  restaurant_id: pizzeriaId,
                  staff_id: own.staffId,
                  revoked_by: data.user.id,
                },
              })
              return own.headers
            },
          }
        const headers = await headersOf[caller]()

        const read = await detail(headers, order.id)
        expect(read.status).toBe(status)
        const list = await queue(headers)
        const listed = (list.data.orders ?? []).map(({ id }: QueueOrder) => id)
        expect(listed.includes(order.id)).toBe(sees)
        if (sees) {
          expect(read.data.order).toMatchObject({
            id: order.id,
            display_id: order.display_id,
          })
          return
        }
        // A refusal carries no Order details at all.
        expect(read.data.order).toBeUndefined()
        expect(JSON.stringify(read.data)).not.toContain(order.id)
        if (caller === "foreign_staff") {
          expect(list.status).toBe(200)
          expect(read.data.code).toBe("order_not_found")
        } else expect(list.status).toBe(status)
        if (caller === "revoked_staff")
          expect(read.data.code).toBe("staff_access_revoked")
      })

      it("answers an unknown Order id exactly like another Restaurant's Order", async () => {
        const { headers } = await signInAsStaffOf(
          pizzeriaId,
          "mette@pizzeria.example",
        )
        const missing = await detail(headers, "order_missing")
        expect(missing.status).toBe(404)
        expect(missing.data.code).toBe("order_not_found")
      })

      it.each([
        { query: "?view=awaiting", status: 200, reason: "EP: a known view" },
        {
          query: "?view=everything",
          status: 400,
          reason: "EP: an unknown view",
        },
        { query: "?limit=0", status: 400, reason: "BVA: limit just below 1" },
        { query: "?limit=1", status: 200, reason: "BVA: limit at the minimum" },
        {
          query: "?limit=50",
          status: 200,
          reason: "BVA: limit at the maximum",
        },
        { query: "?limit=51", status: 400, reason: "BVA: limit just above 50" },
        {
          query: "?offset=-1",
          status: 400,
          reason: "BVA: offset just below 0",
        },
        {
          query: "?offset=0",
          status: 200,
          reason: "BVA: offset at the minimum",
        },
      ])("$reason", async ({ query, status }) => {
        const { headers } = await signInAsStaffOf(
          pizzeriaId,
          "mette@pizzeria.example",
        )
        expect((await queue(headers, query)).status).toBe(status)
      })
    })

    describe("GET /partner/orders/stream", () => {
      type FeedEvent = { event: string; data: Record<string, unknown> }
      /** A bounded wait: every expectation on the stream fails after this. */
      const WAIT = 8000

      /**
       * Opens the kitchen feed like the partner relay does and collects its
       * Server-Sent Events, so a test can wait for one with a bounded timeout.
       */
      const openStream = async (headers: Record<string, string>) => {
        const controller = new AbortController()
        const response = await fetch(
          `${api.defaults.baseURL}/partner/orders/stream`,
          {
            headers: { ...headers, accept: "text/event-stream" },
            signal: controller.signal,
          },
        )
        const events: FeedEvent[] = []
        let waiting: (() => void) | undefined
        let closed = false
        const pump = (async () => {
          if (!response.ok || !response.body) return
          const decoder = new TextDecoder()
          let buffer = ""
          try {
            for await (const chunk of response.body) {
              buffer += decoder.decode(chunk as Uint8Array, { stream: true })
              let end: number
              while ((end = buffer.indexOf("\n\n")) >= 0) {
                const raw = buffer.slice(0, end)
                buffer = buffer.slice(end + 2)
                const field = (name: string) =>
                  raw
                    .split("\n")
                    .find((line) => line.startsWith(`${name}: `))
                    ?.slice(name.length + 2)
                const event = field("event")
                if (event)
                  events.push({
                    event,
                    data: JSON.parse(field("data") ?? "{}"),
                  })
                waiting?.()
              }
            }
          } catch {
            // Aborted by the test.
          } finally {
            closed = true
            waiting?.()
          }
        })()
        const next = async (
          event: string,
          matches: (data: Record<string, unknown>) => boolean = () => true,
        ) => {
          const deadline = Date.now() + WAIT
          for (;;) {
            const index = events.findIndex(
              (entry) => entry.event === event && matches(entry.data),
            )
            if (index >= 0) return events.splice(index, 1)[0].data
            if (closed) throw new Error(`stream closed before "${event}"`)
            const left = deadline - Date.now()
            if (left <= 0) throw new Error(`no "${event}" within ${WAIT} ms`)
            await new Promise<void>((resolve) => {
              waiting = resolve
              setTimeout(resolve, left)
            })
          }
        }
        return {
          response,
          events,
          next,
          /** Resolves when the server ends the stream, within the bounded wait. */
          ended: () =>
            Promise.race([
              pump.then(() => true),
              new Promise((resolve) => setTimeout(() => resolve(false), WAIT)),
            ]),
          close: () => controller.abort(),
        }
      }
      type Stream = Awaited<ReturnType<typeof openStream>>
      const invalidated = (stream: Stream, orderId: string, revision = 1) =>
        stream.next("orders", (data) =>
          (data.orders as { id: string; revision: number }[]).some(
            (order) => order.id === orderId && order.revision === revision,
          ),
        )
      const streams: Stream[] = []
      afterEach(() => streams.splice(0).forEach((stream) => stream.close()))
      const open = async (headers: Record<string, string>) => {
        const stream = await openStream(headers)
        streams.push(stream)
        return stream
      }

      it("announces new paid Orders and persisted changes of its own Restaurant only", async () => {
        const staff = await signInAsStaffOf(
          pizzeriaId,
          "mette@pizzeria.example",
        )
        const stream = await open(staff.headers)
        expect(stream.response.status).toBe(200)
        expect(stream.response.headers.get("content-type")).toContain(
          "text/event-stream",
        )
        // Proxies such as Caddy must neither compress nor buffer the feed.
        expect(stream.response.headers.get("cache-control")).toContain(
          "no-transform",
        )
        await stream.next("ready")

        const foreign = await placePaidOrder(burgerId)
        const order = await placePaidOrder(pizzeriaId)
        await invalidated(stream, order.id)

        // A later transition persisted by another process, such as the worker.
        const [record] = await operations().listOrderOperations({
          order_id: order.id,
        })
        await operations().updateOrderOperations({
          id: record.id,
          state: "accepted",
          revision: 2,
        })
        await invalidated(stream, order.id, 2)
        // The hint carries no Order details; staff read them through the API.
        const { data } = await detail(staff.headers, order.id)
        expect(data.order.state).toBe("accepted")

        const hinted = stream.events
          .filter(({ event }) => event === "orders")
          .flatMap(({ data }) => data.orders as { id: string }[])
        expect(hinted.map(({ id }) => id)).not.toContain(foreign.id)
        expect(JSON.stringify(stream.events)).not.toContain(foreign.id)
        // Each revision is announced once: the two awaited hints were taken
        // from the collected events, so no duplicate may remain.
        expect(hinted.filter(({ id }) => id === order.id)).toHaveLength(0)
      })

      it("announces an acceptance made through the accept action", async () => {
        const staff = await signInAsStaffOf(
          pizzeriaId,
          "mette@pizzeria.example",
        )
        const order = await placePaidOrder(pizzeriaId)
        const stream = await open(staff.headers)
        await stream.next("ready")

        const accepted = await api.post(
          `/partner/orders/${order.id}/accept`,
          {},
          { headers: staff.headers, validateStatus: () => true },
        )
        expect(accepted.status).toBe(200)
        await invalidated(stream, order.id, 2)
      })

      it("starts a reconnected screen from a fresh ready event, so Orders placed meanwhile are read", async () => {
        const staff = await signInAsStaffOf(
          pizzeriaId,
          "mette@pizzeria.example",
        )
        const first = await open(staff.headers)
        await first.next("ready")
        first.close()
        const missed = await placePaidOrder(pizzeriaId)

        const again = await open(staff.headers)
        const ready = await again.next("ready")
        expect(typeof ready.server_time).toBe("string")
        const { data } = await queue(staff.headers)
        expect(data.orders.map(({ id }: QueueOrder) => id)).toContain(missed.id)
      })

      it.each([
        { caller: "signed_out", status: 401, reason: "DT R2: no token" },
        {
          caller: "customer",
          status: 401,
          reason: "DT R3: signed in, wrong actor type (Customer)",
        },
        {
          caller: "revoked_staff",
          status: 403,
          reason: "DT R5: revoked before the stream opens",
        },
      ])("refuses to open: $reason", async ({ caller, status }) => {
        const own = await signInAsStaffOf(pizzeriaId, "mette@pizzeria.example")
        let headers: Record<string, string> = {}
        if (caller === "customer")
          headers = { authorization: customer.authorization }
        if (caller === "revoked_staff") {
          const { data } = await api.get("/admin/users/me", { headers: admin })
          await revokeRestaurantStaffWorkflow(getContainer()).run({
            input: {
              restaurant_id: pizzeriaId,
              staff_id: own.staffId,
              revoked_by: data.user.id,
            },
          })
          headers = own.headers
        }
        const stream = await open(headers)
        expect(stream.response.status).toBe(status)
        expect(stream.response.headers.get("content-type")).not.toContain(
          "text/event-stream",
        )
        if (caller === "revoked_staff")
          expect((await stream.response.json()).code).toBe(
            "staff_access_revoked",
          )
      })

      it("ends an open stream when access is revoked, before publishing further Orders", async () => {
        const own = await signInAsStaffOf(pizzeriaId, "mette@pizzeria.example")
        const stream = await open(own.headers)
        await stream.next("ready")
        const { data } = await api.get("/admin/users/me", { headers: admin })
        await revokeRestaurantStaffWorkflow(getContainer()).run({
          input: {
            restaurant_id: pizzeriaId,
            staff_id: own.staffId,
            revoked_by: data.user.id,
          },
        })
        const order = await placePaidOrder(pizzeriaId)

        expect(await stream.next("ended")).toEqual({
          code: "staff_access_revoked",
        })
        expect(await stream.ended()).toBe(true)
        expect(JSON.stringify(stream.events)).not.toContain(order.id)
      })

      it("ends an open stream when the session token expires", async () => {
        const own = await signInAsStaffOf(pizzeriaId, "mette@pizzeria.example")
        const { auth_identity_id } = JSON.parse(
          Buffer.from(
            own.headers.authorization.split(".")[1],
            "base64url",
          ).toString(),
        )
        const shortLived = generateJwtToken(
          {
            actor_id: own.staffId,
            actor_type: "restaurant_staff",
            auth_identity_id,
          },
          {
            secret: getContainer().resolve(
              ContainerRegistrationKeys.CONFIG_MODULE,
            ).projectConfig.http.jwtSecret,
            expiresIn: "2s",
          },
        )
        const stream = await open({ authorization: `Bearer ${shortLived}` })
        await stream.next("ready")
        expect(await stream.next("ended")).toEqual({ code: "session_expired" })
        expect(await stream.ended()).toBe(true)
      })

      it("stops reading Orders once the kitchen screen disconnects", async () => {
        const staff = await signInAsStaffOf(
          pizzeriaId,
          "mette@pizzeria.example",
        )
        const stream = await open(staff.headers)
        await stream.next("ready")
        await new Promise((resolve) => setTimeout(resolve, 1500))
        const reads = jest.spyOn(operations(), "listOrderOperations")
        stream.close()
        // Let an in-flight read finish, then expect no further reads.
        await new Promise((resolve) => setTimeout(resolve, 1500))
        const settled = reads.mock.calls.length
        await new Promise((resolve) => setTimeout(resolve, 3000))
        expect(reads.mock.calls.length).toBe(settled)
        reads.mockRestore()
      })

      it("proves the open feed works with a heartbeat after its first read", async () => {
        const staff = await signInAsStaffOf(
          pizzeriaId,
          "mette@pizzeria.example",
        )
        const stream = await open(staff.headers)
        await stream.next("ready")
        // Well before the 15 s quiet-feed heartbeat (bounded by WAIT).
        expect(typeof (await stream.next("heartbeat")).server_time).toBe(
          "string",
        )
      })

      it("closes without ending the session when a read fails, so the screen reconnects or polls", async () => {
        const staff = await signInAsStaffOf(
          pizzeriaId,
          "mette@pizzeria.example",
        )
        const stream = await open(staff.headers)
        await stream.next("ready")
        const reads = jest
          .spyOn(operations(), "listOrderOperations")
          .mockRejectedValueOnce(new Error("database unavailable"))
        try {
          expect(await stream.ended()).toBe(true)
        } finally {
          reads.mockRestore()
        }
        expect(stream.events.map(({ event }) => event)).not.toContain("ended")
      })
    })
  },
})
