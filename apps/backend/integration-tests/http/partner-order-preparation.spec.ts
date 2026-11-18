import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import type DeliveryModuleService from "../../src/modules/delivery/service"
import { revokeRestaurantStaffWorkflow } from "../../src/workflows/restaurant-staff"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(240000)

/** Preparation and food readiness on the partner Orders API (#146). */
medusaIntegrationTestRunner({
  dbName: "medusa_ci_partner_order_preparation_http",
  env: {
    JWT_SECRET: "ci-only-partner-order-preparation-secret",
    REDIS_URL: "",
  },
  testSuite: ({ api, getContainer }) => {
    const harness = restaurantOrdersHarness({ api, getContainer })
    const {
      operations,
      restaurants,
      placePaidOrder,
      signInAsStaffOf,
      queue,
      detail,
      accept,
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
    beforeEach(() => {
      ;({ admin, customer, pizzeriaId, burgerId } = harness.seeded())
    })
    const intendedDeliveriesOf = (order_id: string) =>
      getContainer()
        .resolve<DeliveryModuleService>(DELIVERY_MODULE)
        .listIntendedDeliveries({ order_id })

    it("records each milestone's time, actor and revision with no Delivery agent, pickup or native completion", async () => {
      const order = await placePaidOrder(pizzeriaId)
      const { headers, staffId } = await signInAsStaffOf(
        pizzeriaId,
        "mette@pizzeria.example",
      )
      const accepted = (await accept(headers, order.id)).data.order
      const intendedAtAcceptance = await intendedDeliveriesOf(order.id)
      expect(intendedAtAcceptance).toEqual([
        expect.objectContaining({ assigned_agent_id: null }),
      ])
      expect(accepted).toMatchObject({
        state: "accepted",
        preparation_started_at: null,
        ready_at: null,
        available_actions: ["start_preparation"],
      })

      const beforeStart = Date.now()
      const started = await startPreparation(headers, order.id)
      expect(started.status).toBe(200)
      expect(started.data.order).toMatchObject({
        id: order.id,
        state: "preparing",
        accepted_at: accepted.accepted_at,
        ready_at: null,
        available_actions: ["ready"],
      })
      const startedAt = Date.parse(started.data.order.preparation_started_at)
      expect(startedAt).toBeGreaterThanOrEqual(beforeStart - 1000)
      expect(startedAt).toBeGreaterThanOrEqual(Date.parse(accepted.accepted_at))
      expect(await recordOf(order.id)).toMatchObject({
        state: "preparing",
        revision: 3,
        preparation_started_by: staffId,
        ready_by: null,
      })

      const readied = await markReady(headers, order.id)
      expect(readied.status).toBe(200)
      expect(readied.data.order).toMatchObject({
        state: "ready",
        accepted_at: accepted.accepted_at,
        preparation_started_at: started.data.order.preparation_started_at,
        available_actions: [],
      })
      expect(Date.parse(readied.data.order.ready_at)).toBeGreaterThanOrEqual(
        startedAt,
      )
      expect(await recordOf(order.id)).toMatchObject({
        state: "ready",
        revision: 4,
        accepted_by: staffId,
        preparation_started_by: staffId,
        ready_by: staffId,
      })

      // Ready food is still active kitchen work after a fresh read.
      const active = await queue(headers, "?view=active")
      expect(active.data.orders).toEqual([
        expect.objectContaining({ id: order.id, state: "ready" }),
      ])
      expect((await detail(headers, order.id)).data.order).toMatchObject({
        state: "ready",
        ready_at: readied.data.order.ready_at,
      })
      // Readiness is not assignment, pickup, delivery or native completion.
      expect(await intendedDeliveriesOf(order.id)).toEqual(intendedAtAcceptance)
      const native = await api.get(
        `/admin/orders/${order.id}?fields=status,fulfillment_status,*fulfillments`,
        { headers: admin },
      )
      expect(native.data.order).toMatchObject({
        status: "pending",
        fulfillment_status: "not_fulfilled",
        fulfillments: [],
      })
    })

    it("exposes the milestone times, never their actors, in the Customer's progress", async () => {
      const order = await placePaidOrder(pizzeriaId)
      const { headers, staffId } = await signInAsStaffOf(
        pizzeriaId,
        "mette@pizzeria.example",
      )
      const accepted = (await accept(headers, order.id)).data.order
      expect((await progress(customer, order.id)).data.progress).toMatchObject({
        state: "accepted",
        preparation_started_at: null,
        ready_at: null,
      })
      const started = (await startPreparation(headers, order.id)).data.order
      const readied = (await markReady(headers, order.id)).data.order

      const read = await progress(customer, order.id)
      expect(read.status).toBe(200)
      expect(read.data.progress).toMatchObject({
        state: "ready",
        placed_at: order.order_operation.placed_at,
        accepted_at: accepted.accepted_at,
        preparation_started_at: started.preparation_started_at,
        ready_at: readied.ready_at,
        cancellation: null,
        refund: null,
      })
      expect(JSON.stringify(read.data)).not.toContain(staffId)
      expect(JSON.stringify(read.data)).not.toContain("_by")
    })

    it("keeps the first milestone for a repeat and for a competing staff member", async () => {
      const order = await placePaidOrder(pizzeriaId)
      const mette = await signInAsStaffOf(pizzeriaId, "mette@pizzeria.example")
      const jonas = await signInAsStaffOf(pizzeriaId, "jonas@pizzeria.example")
      await accept(mette.headers, order.id)

      const competing = await Promise.all([
        startPreparation(mette.headers, order.id),
        startPreparation(jonas.headers, order.id),
      ])
      expect(competing.map(({ status }) => status)).toEqual([200, 200])
      const started = await recordOf(order.id)
      expect(started.revision).toBe(3)
      expect([mette.staffId, jonas.staffId]).toContain(
        started.preparation_started_by,
      )
      for (const { data } of competing)
        expect(Date.parse(data.order.preparation_started_at)).toBe(
          new Date(started.preparation_started_at!).getTime(),
        )

      const ready = await markReady(jonas.headers, order.id)
      const again = await markReady(mette.headers, order.id)
      const lateStart = await startPreparation(mette.headers, order.id)
      expect([again.status, lateStart.status]).toEqual([200, 200])
      expect(again.data.order.ready_at).toBe(ready.data.order.ready_at)
      expect(lateStart.data.order).toMatchObject({
        state: "ready",
        preparation_started_at: competing[0].data.order.preparation_started_at,
      })
      expect(await recordOf(order.id)).toMatchObject({
        state: "ready",
        revision: 4,
        ready_by: jonas.staffId,
        preparation_started_by: started.preparation_started_by,
      })
    })

    it.each([
      {
        action: "start" as const,
        before: [] as ("accept" | "start")[],
        code: "order_not_accepted",
        state: "awaiting_acceptance",
        actions: ["accept", "reject"],
        reason: "DT: acceptance never starts preparation",
      },
      {
        action: "ready" as const,
        before: [] as ("accept" | "start")[],
        code: "order_not_accepted",
        state: "awaiting_acceptance",
        actions: ["accept", "reject"],
        reason: "DT: an awaiting Order cannot be ready",
      },
      {
        action: "ready" as const,
        before: ["accept"] as ("accept" | "start")[],
        code: "preparation_not_started",
        state: "accepted",
        actions: ["start_preparation"],
        reason: "DT: readiness never skips the preparation start",
      },
      {
        action: "start" as const,
        before: ["accept"] as ("accept" | "start")[],
        cancel: true,
        code: "order_cancelled",
        state: "cancelled",
        actions: [],
        reason: "DT: a cancelled Order is not prepared",
      },
      {
        action: "ready" as const,
        before: ["accept", "start"] as ("accept" | "start")[],
        cancel: true,
        code: "order_cancelled",
        state: "cancelled",
        actions: [],
        reason: "DT: a cancellation during preparation is the current outcome",
      },
    ])(
      "refuses with the current outcome: $reason",
      async ({ action, before, cancel, code, state, actions }) => {
        const order = await placePaidOrder(pizzeriaId)
        const { headers } = await signInAsStaffOf(
          pizzeriaId,
          "mette@pizzeria.example",
        )
        for (const step of before)
          await (step === "accept" ? accept : startPreparation)(
            headers,
            order.id,
          )
        if (cancel)
          await operations().updateOrderOperations({
            id: (await recordOf(order.id)).id,
            state: "cancelled",
          })
        const recorded = await recordOf(order.id)

        const refused = await (
          action === "start" ? startPreparation : markReady
        )(headers, order.id)
        expect(refused.status).toBe(400)
        expect(refused.data).toMatchObject({
          code,
          order: {
            id: order.id,
            state,
            ready_at: null,
            available_actions: actions,
          },
        })
        if (!before.includes("start"))
          expect(refused.data.order.preparation_started_at).toBeNull()
        expect(await recordOf(order.id)).toMatchObject({
          state,
          revision: recorded.revision,
          preparation_started_at: recorded.preparation_started_at,
          ready_at: null,
          ready_by: null,
        })
      },
    )

    it("lets staff prepare a closed or deactivated Restaurant's existing paid Orders", async () => {
      const order = await placePaidOrder(pizzeriaId)
      const { headers } = await signInAsStaffOf(
        pizzeriaId,
        "mette@pizzeria.example",
      )
      await accept(headers, order.id)
      await restaurants().updateRestaurants({
        id: pizzeriaId,
        is_open: false,
      })
      expect((await startPreparation(headers, order.id)).status).toBe(200)
      await restaurants().updateRestaurants({
        id: pizzeriaId,
        is_active: false,
      })
      expect((await markReady(headers, order.id)).status).toBe(200)
    })

    it.each([
      { action: "start" as const, body: { preparation_started_at: "x" } },
      { action: "ready" as const, body: { ready_by: "someone_else" } },
    ])(
      "refuses a client-supplied time or actor for $action",
      async ({ action, body }) => {
        const order = await placePaidOrder(pizzeriaId)
        const { headers } = await signInAsStaffOf(
          pizzeriaId,
          "mette@pizzeria.example",
        )
        await accept(headers, order.id)
        if (action === "ready") await startPreparation(headers, order.id)
        const refused = await (
          action === "start" ? startPreparation : markReady
        )(headers, order.id, body)
        expect(refused.status).toBe(400)
        expect((await recordOf(order.id)).state).toBe(
          action === "start" ? "accepted" : "preparing",
        )
      },
    )

    type Caller = "signed_out" | "customer" | "foreign_staff" | "revoked_staff"
    it.each(
      (["start", "ready"] as const).flatMap((action) => [
        {
          action,
          caller: "signed_out" as Caller,
          status: 401,
          code: undefined,
        },
        {
          action,
          caller: "customer" as Caller,
          status: 401,
          code: undefined,
        },
        {
          action,
          caller: "foreign_staff" as Caller,
          status: 404,
          code: "order_not_found",
        },
        {
          action,
          caller: "revoked_staff" as Caller,
          status: 403,
          code: "staff_access_revoked",
        },
      ]),
    )(
      "refuses $action for $caller",
      async ({ action, caller, status, code }) => {
        const order = await placePaidOrder(pizzeriaId)
        const own = await signInAsStaffOf(pizzeriaId, "mette@pizzeria.example")
        await accept(own.headers, order.id)
        if (action === "ready") await startPreparation(own.headers, order.id)
        const recorded = await recordOf(order.id)
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

        const refused = await (
          action === "start" ? startPreparation : markReady
        )(await headersOf[caller](), order.id)
        expect(refused.status).toBe(status)
        if (code) expect(refused.data.code).toBe(code)
        expect(JSON.stringify(refused.data)).not.toContain(order.id)
        expect(await recordOf(order.id)).toMatchObject({
          state: recorded.state,
          revision: recorded.revision,
        })
      },
    )
  },
})
