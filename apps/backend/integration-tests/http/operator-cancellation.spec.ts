import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import SystemProviderService from "@medusajs/payment/dist/providers/system"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import type DeliveryModuleService from "../../src/modules/delivery/service"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(240000)

type Headers = Record<string, string>

medusaIntegrationTestRunner({
  dbName: "medusa_ci_operator_cancellation_http",
  env: { JWT_SECRET: "ci-only-operator-cancellation-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer, dbUtils }) => {
    const harness = restaurantOrdersHarness({ api, getContainer, dbUtils })
    const {
      operations,
      placePaidOrder,
      signInAsStaffOf,
      accept,
      detail,
      progress,
      startPreparation,
      markReady,
      recordOf,
      refundAttemptsOf,
      reject,
    } = harness
    type Seeded = ReturnType<typeof harness.seeded>
    let customer: Seeded["customer"]
    let pizzeriaId: string
    let staff: Headers
    let operator: { id: string; headers: Headers }
    beforeEach(async () => {
      ;({ customer, pizzeriaId } = harness.seeded())
      staff = (
        await signInAsStaffOf(pizzeriaId, "operator-cancel-staff@example.test")
      ).headers
      const user = await getContainer()
        .resolve(Modules.USER)
        .createUsers({ email: "cancelling-operator@example.test" })
      operator = {
        id: user.id,
        headers: { authorization: tokenFor(user.id, "user") },
      }
    })
    afterEach(() => jest.restoreAllMocks())

    const tokenFor = (actor_id: string, actor_type: string) =>
      `Bearer ${generateJwtToken(
        { actor_id, actor_type, auth_identity_id: "auth_test" },
        {
          secret: getContainer().resolve(
            ContainerRegistrationKeys.CONFIG_MODULE,
          ).projectConfig.http.jwtSecret,
          expiresIn: "1h",
        },
      )}`
    const delivery = () =>
      getContainer().resolve<DeliveryModuleService>(DELIVERY_MODULE)
    let agents = 0
    const agentFor = async () => {
      agents += 1
      const agent = await delivery().createDeliveryAgents({
        name: `Cancel agent ${agents}`,
        email: `operator-cancel-agent-${agents}@example.test`,
        status: "authorized",
        invited_by: "operator",
      })
      await delivery().createDeliveryAgentAreas({
        agent_id: agent.id,
        postal_code: "2200",
      })
      return {
        id: agent.id,
        headers: { authorization: tokenFor(agent.id, "delivery_agent") },
      }
    }
    type Agent = Awaited<ReturnType<typeof agentFor>>
    let requests = 0
    const post = (path: string, headers: Headers, body: object) =>
      api.post(path, body, { headers, validateStatus: () => true })
    const cancel = (
      order_id: string,
      body: object = { reason: "Restaurant lost power" },
      headers: Headers = operator.headers,
    ) => post(`/admin/orders/${order_id}/operator-cancel`, headers, body)
    const claim = (agent: Agent, order_id: string) =>
      post(
        `/partner/delivery-agent/available/${order_id}/claim`,
        agent.headers,
        {
          request_id: `cancel-claim-${++requests}`,
        },
      )
    const pickup = (agent: Agent, order_id: string) =>
      post(`/partner/deliveries/${order_id}/pickup`, agent.headers, {
        request_id: `cancel-pickup-${++requests}`,
      })
    const deliver = (agent: Agent, order_id: string) =>
      post(`/partner/deliveries/${order_id}/deliver`, agent.headers, {
        request_id: `cancel-deliver-${++requests}`,
      })
    const current = async (agent: Agent) =>
      (
        await api.get("/partner/delivery-agent/current", {
          headers: agent.headers,
        })
      ).data.delivery
    const deliveryOf = async (order_id: string) =>
      (await delivery().listIntendedDeliveries({ order_id }))[0]
    const obligationOf = async (order_id: string) =>
      (await operations().listRefundObligations({ order_id }))[0]
    const creditsOf = (order_id: string) =>
      operations().listFoodCredits({ order_id })
    const providerRefunds = () =>
      jest.spyOn(SystemProviderService.prototype, "refundPayment")
    const nativeRefunds = async (order_id: string) => {
      const { data } = await getContainer()
        .resolve(ContainerRegistrationKeys.QUERY)
        .graph({
          entity: "order",
          fields: ["status", "payment_collections.payments.id"],
          filters: { id: order_id },
        })
      const order = data[0] as unknown as {
        status: string
        payment_collections: { payments: { id: string }[] }[]
      }
      const refunds = await getContainer()
        .resolve(Modules.PAYMENT)
        .listRefunds({
          payment_id: order.payment_collections[0].payments[0].id,
        })
      return { status: order.status, refunds }
    }

    /** An Order brought to `stage` through the real staff and agent routes. */
    const orderAt = async (
      stage: "accepted" | "preparing" | "ready" | "assigned" | "picked_up",
    ) => {
      const order = await placePaidOrder(pizzeriaId)
      expect((await accept(staff, order.id)).status).toBe(200)
      let agent: Agent | null = null
      if (stage === "assigned" || stage === "picked_up") {
        agent = await agentFor()
        expect((await claim(agent, order.id)).status).toBe(200)
      }
      if (stage !== "accepted" && stage !== "assigned")
        expect((await startPreparation(staff, order.id)).status).toBe(200)
      if (stage === "ready" || stage === "picked_up")
        expect((await markReady(staff, order.id)).status).toBe(200)
      if (stage === "picked_up")
        expect((await pickup(agent!, order.id)).status).toBe(200)
      return { order, agent }
    }

    describe("POST /admin/orders/:id/operator-cancel", () => {
      it.each([
        {
          stage: "accepted",
          prepared: false,
          reason: "EP: accepted, unassigned",
        },
        { stage: "preparing", prepared: true, reason: "EP: preparing" },
        { stage: "ready", prepared: true, reason: "EP: ready" },
        { stage: "assigned", prepared: false, reason: "EP: assigned agent" },
        { stage: "picked_up", prepared: true, reason: "EP: picked up" },
      ] as const)(
        "cancels with a full refund ($reason)",
        async ({ stage, prepared }) => {
          const { order, agent } = await orderAt(stage)
          const before = await deliveryOf(order.id)
          const provider = providerRefunds()

          const response = await cancel(order.id, {
            reason: "  Restaurant lost\u0007 power  ",
          })

          expect(response.status).toBe(200)
          expect(response.data.cancellation).toMatchObject({
            order_id: order.id,
            cancelled_now: true,
            cancellation: {
              category: "operator_cancelled",
              cancelled_by: operator.id,
              reason: "Restaurant lost power",
            },
            delivery: { outcome: "cancelled" },
            refund: { status: "succeeded", currency_code: "dkk" },
          })
          expect(await recordOf(order.id)).toMatchObject({
            state: "cancelled",
            cancelled_by: operator.id,
            cancellation_category: "operator_cancelled",
            cancellation_note: "Restaurant lost power",
            delivery_outcome: "not_delivered",
          })
          expect(provider).toHaveBeenCalledTimes(1)
          const native = await nativeRefunds(order.id)
          expect(native.status).toBe("canceled")
          expect(native.refunds).toHaveLength(1)
          expect(await refundAttemptsOf(order.id)).toEqual([
            expect.objectContaining({
              attempted_by: operator.id,
              outcome: "succeeded",
            }),
          ])

          // The delivery ends as cancelled with its milestones kept.
          expect(await deliveryOf(order.id)).toMatchObject({
            terminal_outcome: "cancelled",
            terminal_by: operator.id,
            active_agent_id: null,
            assigned_agent_id: before.assigned_agent_id,
            picked_up_at: before.picked_up_at,
          })

          // Only food whose preparation had started is credited, by MTOGO.
          const credits = await creditsOf(order.id)
          expect(credits).toHaveLength(prepared ? 1 : 0)
          if (prepared)
            expect(credits[0]).toMatchObject({
              funded_by: "mtogo",
              reason: "operator_cancelled",
              restaurant_id: pizzeriaId,
            })
          expect(response.data.cancellation.food_credit).toEqual(
            prepared ? expect.objectContaining({ funded_by: "mtogo" }) : null,
          )

          // The agent is free for new work.
          if (agent) {
            expect(await current(agent)).toBeNull()
            const history = await api.get(
              `/partner/delivery-agent/history/${order.id}`,
              { headers: agent.headers },
            )
            expect(history.data.delivery).toMatchObject({
              outcome: "cancelled",
              picked_up_at: before.picked_up_at
                ? new Date(before.picked_up_at).toISOString()
                : null,
            })
            const next = await orderAt("accepted")
            expect((await claim(agent, next.order.id)).status).toBe(200)
          }
        },
      )

      it("shows the cancellation to the Customer and to staff, without the operator's reason", async () => {
        const { order } = await orderAt("preparing")

        expect((await cancel(order.id)).status).toBe(200)

        const staffView = (await detail(staff, order.id)).data.order
        expect(staffView).toMatchObject({
          state: "cancelled",
          available_actions: [],
          cancellation: { category: "operator_cancelled", note: null },
          refund: { status: "succeeded" },
        })
        const shown = (await progress(customer, order.id)).data.progress
        expect(shown).toMatchObject({
          state: "cancelled",
          cancellation: { category: "operator_cancelled" },
          refund: { status: "succeeded" },
        })
        expect(JSON.stringify(shown)).not.toContain("lost power")
        // The kitchen can record nothing more.
        expect((await markReady(staff, order.id)).data.code).toBe(
          "order_cancelled",
        )
      })

      it("resolves the Order's open attention", async () => {
        const { order, agent } = await orderAt("assigned")
        const reported = await post(
          `/partner/deliveries/${order.id}/problem-report`,
          agent!.headers,
          { category: "restaurant_unavailable" },
        )
        expect(reported.status).toBe(201)
        const listed = async () =>
          (
            await api.get("/admin/deliveries/attention", {
              headers: operator.headers,
            })
          ).data.attention.map(({ order_id }: { order_id: string }) => order_id)
        expect(await listed()).toContain(order.id)

        expect((await cancel(order.id)).status).toBe(200)

        expect(await listed()).not.toContain(order.id)
      })

      it("returns the recorded outcome for a repeat and for a double request, cancelling and refunding once", async () => {
        const { order } = await orderAt("ready")
        const provider = providerRefunds()

        const [first, second] = await Promise.all([
          cancel(order.id, { reason: "First" }),
          cancel(order.id, { reason: "Second" }),
        ])
        const repeat = await cancel(order.id, { reason: "Third" })

        const outcomes = [first, second, repeat]
        expect(outcomes.map(({ status }) => status)).toEqual([200, 200, 200])
        expect(
          outcomes.filter(({ data }) => data.cancellation.cancelled_now),
        ).toHaveLength(1)
        const reason = (await recordOf(order.id)).cancellation_note
        expect(["First", "Second"]).toContain(reason)
        expect(repeat.data.cancellation.cancellation.reason).toBe(reason)
        expect(provider).toHaveBeenCalledTimes(1)
        expect((await nativeRefunds(order.id)).refunds).toHaveLength(1)
        expect(await creditsOf(order.id)).toHaveLength(1)
      })

      it("shows the amount a cancellation would refund before anything is committed", async () => {
        const { order } = await orderAt("preparing")

        const preview = await api.get(
          `/admin/orders/${order.id}/operator-cancel`,
          { headers: operator.headers },
        )

        expect(preview.status).toBe(200)
        expect(preview.data.preview).toEqual({
          order_id: order.id,
          refund: {
            amount_including_vat: expect.any(Number),
            currency_code: "dkk",
          },
        })
        expect(
          preview.data.preview.refund.amount_including_vat,
        ).toBeGreaterThan(0)
        expect((await recordOf(order.id)).state).toBe("preparing")
        const cancelled = await cancel(order.id)
        expect(cancelled.data.cancellation.refund.amount_including_vat).toBe(
          preview.data.preview.refund.amount_including_vat,
        )
        const unknown = await api.get(
          "/admin/orders/order_unknown/operator-cancel",
          { headers: operator.headers, validateStatus: () => true },
        )
        expect(unknown.status).toBe(404)
      })

      it("ends work an interrupted cancellation left active when the operator repeats it", async () => {
        const { order, agent } = await orderAt("assigned")
        const service = delivery()
        const end = jest
          .spyOn(service, "endDelivery")
          .mockRejectedValueOnce(new Error("process stopped"))

        const interrupted = await cancel(order.id)
        expect(interrupted.status).toBeGreaterThanOrEqual(500)
        expect((await recordOf(order.id)).state).toBe("cancelled")
        expect((await deliveryOf(order.id)).terminal_outcome).toBeNull()
        end.mockRestore()

        const repeat = await cancel(order.id)

        expect(repeat.status).toBe(200)
        expect(repeat.data.cancellation).toMatchObject({
          cancelled_now: false,
          delivery: { outcome: "cancelled" },
        })
        expect(await deliveryOf(order.id)).toMatchObject({
          terminal_outcome: "cancelled",
          terminal_by: operator.id,
          active_agent_id: null,
        })
        expect(await current(agent!)).toBeNull()
      })

      it("returns the recorded outcome of an Order cancelled another way, without the operator's reason or a second refund", async () => {
        const rejected = await placePaidOrder(pizzeriaId)
        expect((await reject(staff, rejected.id)).status).toBe(200)
        const provider = providerRefunds()

        const response = await cancel(rejected.id)

        expect(response.status).toBe(200)
        expect(response.data.cancellation).toMatchObject({
          cancelled_now: false,
          cancellation: {
            category: "restaurant_rejected",
            reason: null,
          },
          delivery: null,
          refund: { status: "succeeded" },
        })
        expect(provider).not.toHaveBeenCalled()
        expect((await recordOf(rejected.id)).cancellation_category).toBe(
          "restaurant_rejected",
        )
      })

      it("answers order_changed and writes nothing when another change wins the guarded write", async () => {
        const { order } = await orderAt("accepted")
        const service = operations()
        const list = service.listOrderOperations.bind(service)
        // Another transition commits between the guarded read and the write.
        let isStale = true
        jest.spyOn(service, "listOrderOperations").mockImplementation((async (
          filters: { order_id?: string },
          ...rest: unknown[]
        ) => {
          const rows = (await (
            list as (...a: unknown[]) => Promise<{ revision?: number }[]>
          )(filters, ...rest)) as { revision?: number }[]
          if (!isStale || filters?.order_id !== order.id) return rows
          isStale = false
          return rows.map((row) => ({
            ...row,
            revision: (row.revision as number) - 1,
          }))
        }) as never)

        const response = await cancel(order.id)

        expect(response.status).toBe(409)
        expect(response.data.code).toBe("order_changed")
        jest.restoreAllMocks()
        expect((await recordOf(order.id)).state).toBe("accepted")
        expect(await obligationOf(order.id)).toBeUndefined()
        expect((await deliveryOf(order.id)).terminal_outcome).toBeNull()
      })

      it("refuses an Order awaiting acceptance, a delivered Order and an unknown Order without effects", async () => {
        const awaiting = await placePaidOrder(pizzeriaId)
        const refused = await cancel(awaiting.id)
        expect(refused.status).toBe(400)
        expect(refused.data.code).toBe("order_not_accepted")
        expect((await recordOf(awaiting.id)).state).toBe("awaiting_acceptance")

        const { order, agent } = await orderAt("picked_up")
        expect((await deliver(agent!, order.id)).status).toBe(200)
        const delivered = await cancel(order.id)
        expect(delivered.status).toBe(400)
        expect(delivered.data.code).toBe("order_delivered")
        expect((await recordOf(order.id)).state).toBe("ready")
        expect(await obligationOf(order.id)).toBeUndefined()

        const unknown = await cancel("order_unknown")
        expect(unknown.status).toBe(404)
      })

      it.each([
        {
          body: {},
          code: "operator_cancellation_reason_required",
          reason: "EP: no reason",
        },
        {
          body: { reason: "" },
          code: "operator_cancellation_reason_required",
          reason: "BVA: empty",
        },
        {
          body: { reason: " \u0007\u001F " },
          code: "operator_cancellation_reason_required",
          reason: "EP: only spaces and control characters",
        },
        {
          body: { reason: 42 },
          code: "operator_cancellation_reason_required",
          reason: "EP: not text",
        },
        {
          body: { reason: "x".repeat(1001) },
          code: "field_too_long",
          reason: "BVA: 1001 characters",
        },
        {
          body: { reason: "Closed", refund: 10 },
          code: "Unrecognized",
          reason: "EP: unknown field",
        },
      ])("refuses an invalid reason ($reason)", async ({ body, code }) => {
        const { order } = await orderAt("accepted")

        const response = await cancel(order.id, body)

        expect(response.status).toBe(400)
        expect(response.data.message).toContain(code)
        expect((await recordOf(order.id)).state).toBe("accepted")
      })

      it("BVA: accepts a reason of exactly 1000 characters", async () => {
        const { order } = await orderAt("accepted")

        const response = await cancel(order.id, { reason: "x".repeat(1000) })

        expect(response.status).toBe(200)
        expect((await recordOf(order.id)).cancellation_note).toHaveLength(1000)
      })

      it("keeps the Order cancelled and the refund on the Refunds page when the provider fails", async () => {
        const { order } = await orderAt("accepted")
        jest
          .spyOn(SystemProviderService.prototype, "refundPayment")
          .mockRejectedValue(new Error("mock provider declined: secret-detail"))

        const response = await cancel(order.id)

        expect(response.status).toBe(200)
        expect(response.data.cancellation.refund).toMatchObject({
          status: "failed",
        })
        expect(JSON.stringify(response.data)).not.toContain("secret-detail")
        expect((await recordOf(order.id)).state).toBe("cancelled")
        const refunds = await api.get("/admin/refunds", {
          headers: operator.headers,
        })
        expect(refunds.data.refunds).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ order_id: order.id, status: "failed" }),
          ]),
        )
      })

      it.each([
        { reason: "EP: Restaurant staff", caller: () => staff },
        {
          reason: "EP: a Delivery agent",
          caller: () => ({
            authorization: tokenFor("agent_cancel_test", "delivery_agent"),
          }),
        },
        { reason: "EP: a signed-out caller", caller: () => ({}) },
      ])("refuses $reason without effects", async ({ caller }) => {
        const { order } = await orderAt("accepted")

        const response = await cancel(order.id, undefined, caller())

        expect(response.status).toBe(401)
        expect((await recordOf(order.id)).state).toBe("accepted")
      })
    })

    describe("races under the Order's guard", () => {
      it("gives one consistent outcome when a cancellation races the handover", async () => {
        for (let round = 0; round < 3; round++) {
          const { order, agent } = await orderAt("picked_up")

          const [cancelled, delivered] = await Promise.all([
            cancel(order.id),
            deliver(agent!, order.id),
          ])

          const ended = await deliveryOf(order.id)
          const record = await recordOf(order.id)
          if (delivered.status === 200) {
            expect(cancelled.data.code).toBe("order_delivered")
            expect(ended.terminal_outcome).toBe("delivered")
            expect(record.state).not.toBe("cancelled")
            expect(await obligationOf(order.id)).toBeUndefined()
          } else {
            expect(cancelled.status).toBe(200)
            expect(delivered.data.code).toBe("delivery_not_active")
            expect(ended.terminal_outcome).toBe("cancelled")
            expect(record.state).toBe("cancelled")
          }
        }
      })

      it("leaves no live claim or pickup on a cancelled Order", async () => {
        for (let round = 0; round < 2; round++) {
          const claimed = await orderAt("ready")
          const claimer = await agentFor()
          const assigned = await orderAt("ready")
          const collector = await agentFor()
          expect((await claim(collector, assigned.order.id)).status).toBe(200)

          const results = await Promise.all([
            cancel(claimed.order.id),
            claim(claimer, claimed.order.id),
            cancel(assigned.order.id),
            pickup(collector, assigned.order.id),
          ])

          expect(results[0].status).toBe(200)
          expect(results[2].status).toBe(200)
          for (const { order } of [claimed, assigned]) {
            expect((await recordOf(order.id)).state).toBe("cancelled")
            expect(await deliveryOf(order.id)).toMatchObject({
              terminal_outcome: "cancelled",
              active_agent_id: null,
            })
          }
          expect(await current(claimer)).toBeNull()
          expect(await current(collector)).toBeNull()
        }
      })
    })
  },
})
