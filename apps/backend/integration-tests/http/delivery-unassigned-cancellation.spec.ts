import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import SystemProviderService from "@medusajs/payment/dist/providers/system"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import type DeliveryModuleService from "../../src/modules/delivery/service"
import { claimDeliveryWorkflow } from "../../src/workflows/delivery/assignment"
import { recoverDeliveryAttentionWorkflow } from "../../src/workflows/delivery/attention"
import { recoverOrderOperationsWorkflow } from "../../src/workflows/order-operations"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(240000)

type RefundRow = { id: string }

medusaIntegrationTestRunner({
  dbName: "medusa_ci_delivery_unassigned_cancellation_http",
  env: { JWT_SECRET: "ci-only-unassigned-cancellation-secret", REDIS_URL: "" },
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
    } = harness
    type Seeded = ReturnType<typeof harness.seeded>
    let admin: Seeded["admin"]
    let customer: Seeded["customer"]
    let pizzeriaId: string
    let staff: Record<string, string>
    beforeEach(async () => {
      ;({ admin, customer, pizzeriaId } = harness.seeded())
      staff = (
        await signInAsStaffOf(pizzeriaId, "unassigned-staff@example.test")
      ).headers
    })
    afterEach(() => jest.restoreAllMocks())

    const delivery = () =>
      getContainer().resolve<DeliveryModuleService>(DELIVERY_MODULE)
    let agents = 0
    const agentFor = async () => {
      agents += 1
      const agent = await delivery().createDeliveryAgents({
        name: `Agent ${agents}`,
        email: `unassigned-agent-${agents}@example.test`,
        status: "authorized",
        invited_by: "operator",
      })
      await delivery().createDeliveryAgentAreas({
        agent_id: agent.id,
        postal_code: "2200",
      })
      const token = generateJwtToken(
        {
          actor_id: agent.id,
          actor_type: "delivery_agent",
          auth_identity_id: "auth_test",
        },
        {
          secret: getContainer().resolve(
            ContainerRegistrationKeys.CONFIG_MODULE,
          ).projectConfig.http.jwtSecret,
          expiresIn: "1h",
        },
      )
      return { id: agent.id, headers: { authorization: `Bearer ${token}` } }
    }
    const acceptedOrder = async (quantity = 1) => {
      const order = await placePaidOrder(pizzeriaId, quantity)
      expect((await accept(staff, order.id)).status).toBe(200)
      return order
    }
    const deliveryOf = async (order_id: string) =>
      (await delivery().listIntendedDeliveries({ order_id }))[0]
    const deadlineOf = async (order_id: string) =>
      new Date((await deliveryOf(order_id)).claim_deadline)
    /** Moves accepted work so its claim deadline is `offset` ms from now. */
    const deadlineIn = async (order_id: string, offset: number) => {
      const deadline = new Date(Date.now() + offset)
      const accepted_at = new Date(deadline.getTime() - 30 * 60 * 1000)
      const record = await deliveryOf(order_id)
      await delivery().updateIntendedDeliveries({
        id: record.id,
        accepted_at,
        claim_deadline: deadline,
      })
      const operation = await recordOf(order_id)
      await operations().updateOrderOperations({
        id: operation.id,
        accepted_at,
      })
      // The stored attention deadline derives from the same acceptance.
      const [attention] = await delivery().listDeliveryAttentions({
        order_id,
        type: "unassigned",
      })
      await delivery().updateDeliveryAttentions({
        id: attention.id,
        due_at: new Date(accepted_at.getTime() + 10 * 60 * 1000),
      })
      return deadline
    }
    const at = (time: Date, offset = 0) =>
      new Date(time.getTime() + offset).toISOString()
    const recover = (now?: Date | string) =>
      recoverOrderOperationsWorkflow(getContainer()).run({
        input: { now: now && new Date(now).toISOString() },
      })
    let requests = 0
    const claimAt = (order_id: string, agent_id: string, now: string) =>
      claimDeliveryWorkflow(getContainer()).run({
        input: {
          order_id,
          agent_id,
          request_id: `unassigned-claim-${++requests}`,
          now,
        },
        throwOnError: false,
      })
    const claim = (headers: Record<string, string>, order_id: string) =>
      api.post(
        `/partner/delivery-agent/available/${order_id}/claim`,
        { request_id: `unassigned-http-claim-${++requests}` },
        { headers, validateStatus: () => true },
      )
    const assign = (order_id: string, agent_id: string) =>
      api.post(
        `/admin/deliveries/${order_id}/assign`,
        { agent_id, request_id: `unassigned-assign-${++requests}` },
        { headers: admin, validateStatus: () => true },
      )
    const creditsOf = (order_id: string) =>
      operations().listFoodCredits({ order_id })
    const obligationOf = async (order_id: string) =>
      (await operations().listRefundObligations({ order_id }))[0]
    const providerRefunds = () =>
      jest.spyOn(SystemProviderService.prototype, "refundPayment")
    const nativeOf = async (order_id: string) => {
      const { data } = await getContainer()
        .resolve(ContainerRegistrationKeys.QUERY)
        .graph({
          entity: "order",
          fields: [
            "status",
            "items.unit_price",
            "items.quantity",
            "payment_collections.payments.id",
          ],
          filters: { id: order_id },
        })
      const order = data[0] as unknown as {
        status: string
        items: { unit_price: number; quantity: number }[]
        payment_collections: { payments: { id: string }[] }[]
      }
      const refunds = (await getContainer()
        .resolve(Modules.PAYMENT)
        .listRefunds({
          payment_id: order.payment_collections[0].payments[0].id,
        })) as unknown as RefundRow[]
      return { order, refunds }
    }

    describe("the recovery sweep at acceptance plus thirty minutes", () => {
      it("BVA: leaves unassigned work alone 1 ms before the deadline and cancels it exactly at it with a full refund", async () => {
        const order = await acceptedOrder()
        const deadline = await deadlineOf(order.id)

        const early = await recover(at(deadline, -1))
        expect(early.result.unassigned_expired).toEqual([])
        expect((await recordOf(order.id)).state).toBe("accepted")
        expect(await obligationOf(order.id)).toBeUndefined()

        const onTime = await recover(deadline)
        expect(onTime.result.unassigned_expired).toEqual([order.id])
        expect(await recordOf(order.id)).toMatchObject({
          state: "cancelled",
          cancellation_category: "unassigned_timeout",
          cancelled_by: "system",
          cancelled_at: deadline,
        })
        const staffView = (await detail(staff, order.id)).data.order
        expect(staffView).toMatchObject({
          state: "cancelled",
          available_actions: [],
          cancellation: {
            category: "unassigned_timeout",
            effective_at: deadline.toISOString(),
            note: null,
          },
          refund: { status: "succeeded" },
          // Accepted but never prepared: no prepared-food loss to credit.
          food_credit: null,
        })
        expect(
          (await progress(customer, order.id)).data.progress,
        ).toMatchObject({
          state: "cancelled",
          cancellation: {
            category: "unassigned_timeout",
            effective_at: deadline.toISOString(),
          },
          refund: { status: "succeeded" },
        })
        const native = await nativeOf(order.id)
        expect(native.order.status).toBe("canceled")
        expect(native.refunds).toHaveLength(1)
        expect(await creditsOf(order.id)).toEqual([])
      })

      it("keeps one MTOGO-funded prepared-food credit with its evidence, the full food value excluding VAT and no commission", async () => {
        const order = await acceptedOrder(2)
        expect((await startPreparation(staff, order.id)).status).toBe(200)
        expect((await markReady(staff, order.id)).status).toBe(200)
        const prepared = await recordOf(order.id)
        const deadline = await deadlineOf(order.id)
        const provider = providerRefunds()

        await recover(deadline)
        await recover(at(deadline, 60 * 1000))

        const { order: native } = await nativeOf(order.id)
        const including = native.items.reduce(
          (total, { unit_price, quantity }) =>
            total + Number(unit_price) * Number(quantity),
          0,
        )
        const credits = await creditsOf(order.id)
        expect(credits).toHaveLength(1)
        expect(credits[0]).toMatchObject({
          restaurant_id: pizzeriaId,
          currency_code: "dkk",
          funded_by: "mtogo",
          reason: "unassigned_timeout",
          preparation_started_at: prepared.preparation_started_at,
          ready_at: prepared.ready_at,
        })
        // 25% VAT included in the menu price (ADR-0006).
        expect(Number(credits[0].amount)).toBe(
          Math.round((including / 1.25) * 100) / 100,
        )
        expect(Number(credits[0].commission_amount)).toBe(0)
        expect(provider).toHaveBeenCalledTimes(1)
        expect((await nativeOf(order.id)).refunds).toHaveLength(1)
        const staffView = (await detail(staff, order.id)).data.order
        expect(staffView).toMatchObject({
          state: "cancelled",
          // Preparation history is retained on the cancelled Order.
          preparation_started_at: expect.any(String),
          ready_at: expect.any(String),
          food_credit: {
            amount_excluding_vat: Number(credits[0].amount),
            currency_code: "dkk",
            funded_by: "mtogo",
          },
        })
        // The Customer sees the refund, not the Restaurant's credit.
        const shown = (await progress(customer, order.id)).data.progress
        expect(shown.food_credit).toBeUndefined()
        // Cancellation blocks the kitchen's and the agent's next actions.
        expect((await markReady(staff, order.id)).data.code).toBe(
          "order_cancelled",
        )
        const agent = await agentFor()
        expect((await claim(agent.headers, order.id)).data.code).toBe(
          "delivery_not_active",
        )
      })

      it("never cancels assigned work, however late, and an assignment 1 ms before the deadline wins", async () => {
        const order = await acceptedOrder()
        const deadline = await deadlineOf(order.id)
        const agent = await agentFor()

        expect(
          (await claimAt(order.id, agent.id, at(deadline, -1))).errors,
        ).toEqual([])
        const swept = await recover(at(deadline, 2 * 60 * 60 * 1000))

        expect(swept.result.unassigned_expired).toEqual([])
        expect(await recordOf(order.id)).toMatchObject({ state: "accepted" })
        expect(await obligationOf(order.id)).toBeUndefined()
        expect((await deliveryOf(order.id)).assigned_agent_id).toBe(agent.id)
      })

      it("recovers a deadline that passed during downtime without resetting it, and a repeat adds nothing", async () => {
        const order = await acceptedOrder()
        const deadline = await deadlineOf(order.id)
        const restart = new Date(deadline.getTime() + 3 * 60 * 60 * 1000)

        const swept = await recover(restart)
        const again = await recover(new Date(restart.getTime() + 60 * 1000))

        expect(swept.result.unassigned_expired).toEqual([order.id])
        expect(again.result.unassigned_expired).toEqual([])
        expect(await recordOf(order.id)).toMatchObject({
          cancelled_at: restart,
          revision: (await recordOf(order.id)).revision,
        })
        const shown = (await detail(staff, order.id)).data.order
        expect(shown.cancellation).toMatchObject({
          effective_at: deadline.toISOString(),
          cancelled_at: restart.toISOString(),
        })
        // The delivery ends through the shared terminal boundary (#161).
        expect(await deliveryOf(order.id)).toMatchObject({
          terminal_outcome: "cancelled",
          terminal_at: restart,
          assigned_agent_id: null,
        })
        expect((await nativeOf(order.id)).refunds).toHaveLength(1)
      })
    })

    describe("claims and assignments at the boundary, before any sweep", () => {
      it("BVA: refuses a claim exactly at acceptance plus thirty minutes and cancels the work at once", async () => {
        const order = await acceptedOrder()
        const deadline = await deadlineOf(order.id)
        const agent = await agentFor()

        const exactly = await claimAt(order.id, agent.id, at(deadline))

        expect(exactly.errors[0]?.error.message).toBe("claim_deadline_passed")
        expect(await recordOf(order.id)).toMatchObject({
          state: "cancelled",
          cancellation_category: "unassigned_timeout",
          cancelled_at: deadline,
        })
        expect(await obligationOf(order.id)).toMatchObject({
          status: "succeeded",
        })
        // The refused claim triggered the system's cancellation, not the agent's.
        expect(await refundAttemptsOf(order.id)).toEqual([
          expect.objectContaining({
            attempted_by: "system",
            outcome: "succeeded",
          }),
        ])
        expect((await deliveryOf(order.id)).assigned_agent_id).toBeNull()
        // The sweep finds nothing left to do.
        expect(
          (await recover(at(deadline, 1))).result.unassigned_expired,
        ).toEqual([])
      })

      it("refuses an HTTP claim and an operator assignment after the deadline with one cancellation and one refund", async () => {
        const order = await acceptedOrder()
        await deadlineIn(order.id, -1000)
        const agent = await agentFor()
        const provider = providerRefunds()

        const [claimed, assigned] = await Promise.all([
          claim(agent.headers, order.id),
          assign(order.id, agent.id),
          recover(),
        ])

        expect(claimed.status).toBe(400)
        expect(assigned.status).toBe(400)
        for (const refused of [claimed, assigned])
          expect(["claim_deadline_passed", "delivery_not_active"]).toContain(
            refused.data.code,
          )
        expect(await recordOf(order.id)).toMatchObject({
          state: "cancelled",
          cancellation_category: "unassigned_timeout",
        })
        expect(provider).toHaveBeenCalledTimes(1)
        expect((await nativeOf(order.id)).refunds).toHaveLength(1)
        expect((await deliveryOf(order.id)).assigned_agent_id).toBeNull()
      })

      it("keeps one consistent outcome when a claim just before the deadline races the sweep at it", async () => {
        for (let round = 0; round < 3; round++) {
          const order = await acceptedOrder()
          const deadline = await deadlineOf(order.id)
          const agent = await agentFor()

          const [claimed] = await Promise.all([
            claimAt(order.id, agent.id, at(deadline, -1)),
            recover(deadline),
          ])

          const record = await recordOf(order.id)
          const assignment = await deliveryOf(order.id)
          if (claimed.errors.length === 0) {
            // The claim was first: responsibility stands, nothing is owed.
            expect(record.state).toBe("accepted")
            expect(assignment.assigned_agent_id).toBe(agent.id)
            expect(await obligationOf(order.id)).toBeUndefined()
          } else {
            // The sweep was first: no claim survives the cancellation.
            expect(claimed.errors[0].error.message).toBe("delivery_not_active")
            expect(record.cancellation_category).toBe("unassigned_timeout")
            expect(assignment.assigned_agent_id).toBeNull()
            expect(assignment.active_agent_id).toBeNull()
          }
        }
      })
    })

    describe("kitchen milestones after the deadline", () => {
      it("cancels instead of recording preparation that starts after the cutoff, and owes no food credit for it", async () => {
        const order = await acceptedOrder()
        await deadlineIn(order.id, -1000)

        const late = await startPreparation(staff, order.id)

        expect(late.status).toBe(400)
        expect(late.data.code).toBe("order_cancelled")
        expect(late.data.order).toMatchObject({
          state: "cancelled",
          preparation_started_at: null,
          cancellation: { category: "unassigned_timeout" },
        })
        expect(await creditsOf(order.id)).toEqual([])
        // The next sweep settles what the kitchen request committed.
        await recover()
        expect(await obligationOf(order.id)).toMatchObject({
          status: "succeeded",
        })
        expect((await deliveryOf(order.id)).terminal_outcome).toBe("cancelled")
      })

      it("keeps the credit for food prepared before the cutoff when readiness comes after it", async () => {
        const order = await acceptedOrder()
        expect((await startPreparation(staff, order.id)).status).toBe(200)
        await deadlineIn(order.id, -1000)
        // Preparation started at real time, after the moved acceptance; put
        // it back inside the claim window, as it would have been.
        const record = await recordOf(order.id)
        const { accepted_at } = record
        await operations().updateOrderOperations({
          id: record.id,
          preparation_started_at: new Date(
            new Date(accepted_at!).getTime() + 5 * 60 * 1000,
          ),
        })

        expect((await markReady(staff, order.id)).data.code).toBe(
          "order_cancelled",
        )
        expect(await creditsOf(order.id)).toHaveLength(1)
        expect((await recordOf(order.id)).ready_at).toBeNull()
      })
    })

    describe("financial outcomes and recovery", () => {
      it("writes nothing for a stale decision and decides again on the next sweep", async () => {
        const order = await acceptedOrder()
        const deadline = await deadlineOf(order.id)
        const service = operations()
        const list = service.listOrderOperations.bind(service)
        // Another transition commits between the guarded read and the write:
        // the commit's first read of this Order sees an older revision.
        let isStale = true
        const stale = jest
          .spyOn(service, "listOrderOperations")
          .mockImplementation((async (
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

        const first = await recover(deadline)
        stale.mockRestore()

        expect(first.result.unassigned_expired).toEqual([])
        expect((await recordOf(order.id)).state).toBe("accepted")
        expect(await obligationOf(order.id)).toBeUndefined()
        expect((await deliveryOf(order.id)).terminal_outcome).toBeNull()
        const second = await recover(at(deadline, 60 * 1000))
        expect(second.result.unassigned_expired).toEqual([order.id])
      })

      it("keeps the Order cancelled and the refund visibly failed when the mock provider fails", async () => {
        const order = await acceptedOrder()
        const deadline = await deadlineOf(order.id)
        jest
          .spyOn(SystemProviderService.prototype, "refundPayment")
          .mockRejectedValue(new Error("mock provider declined: secret-detail"))

        await recover(deadline)
        await recover(at(deadline, 60 * 1000))

        expect(await obligationOf(order.id)).toMatchObject({
          status: "failed",
          failure_code: "refund_provider_failed",
        })
        // The second sweep leaves the failure owed and adds no entry.
        expect(await refundAttemptsOf(order.id)).toEqual([
          expect.objectContaining({
            attempted_by: "system",
            outcome: "failed",
            failure_code: "refund_provider_failed",
          }),
        ])
        expect((await recordOf(order.id)).state).toBe("cancelled")
        const staffView = await detail(staff, order.id)
        expect(staffView.data.order).toMatchObject({
          state: "cancelled",
          refund: { status: "failed" },
        })
        expect(JSON.stringify(staffView.data)).not.toContain("secret-detail")
        expect(
          (await progress(customer, order.id)).data.progress,
        ).toMatchObject({ state: "cancelled", refund: { status: "failed" } })
        expect((await nativeOf(order.id)).order.status).toBe("canceled")
      })

      it("resumes a refund interrupted after the cancellation committed, without moving money or crediting twice", async () => {
        const order = await acceptedOrder()
        expect((await startPreparation(staff, order.id)).status).toBe(200)
        const deadline = await deadlineOf(order.id)
        const provider = providerRefunds()
        const service = operations()
        const update = service.updateRefundObligations.bind(service)
        // The refund goes through, but the process stops before recording it.
        const lost = jest
          .spyOn(service, "updateRefundObligations")
          .mockImplementation(((data: { status?: string }) =>
            data.status === "pending"
              ? update(data as never)
              : Promise.reject(new Error("process stopped"))) as never)

        await recover(deadline)
        expect(await obligationOf(order.id)).toMatchObject({
          status: "pending",
        })
        lost.mockRestore()

        const resumed = await recover(at(deadline, 60 * 1000))

        expect(resumed.result.resumed).toContain(order.id)
        expect(provider).toHaveBeenCalledTimes(1)
        expect(await obligationOf(order.id)).toMatchObject({
          status: "succeeded",
        })
        expect((await nativeOf(order.id)).refunds).toHaveLength(1)
        expect(await creditsOf(order.id)).toHaveLength(1)
        expect(await refundAttemptsOf(order.id)).toEqual([
          expect.objectContaining({
            attempted_by: "system",
            outcome: "succeeded",
          }),
        ])
      })
    })

    describe("operator attention and available work", () => {
      it("removes cancelled work from attention, the available list and the operator's unclaimed list", async () => {
        const order = await acceptedOrder()
        await deadlineIn(order.id, -1000)
        const agent = await agentFor()
        await recoverDeliveryAttentionWorkflow(getContainer()).run({
          input: {},
        })
        const listed = async () =>
          (
            await api.get("/admin/deliveries/attention", { headers: admin })
          ).data.attention.map(({ order_id }: { order_id: string }) => order_id)
        expect(await listed()).toContain(order.id)

        await recover()
        await recoverDeliveryAttentionWorkflow(getContainer()).run({
          input: {},
        })

        expect(await listed()).not.toContain(order.id)
        const [attention] = await delivery().listDeliveryAttentions({
          order_id: order.id,
          type: "unassigned",
        })
        expect(attention).toMatchObject({ resolution: "order_ended" })
        const available = await api.get("/partner/delivery-agent/available", {
          headers: agent.headers,
        })
        expect(JSON.stringify(available.data)).not.toContain(order.id)
        const unclaimed = await api.get("/admin/deliveries/unclaimed", {
          headers: admin,
        })
        expect(JSON.stringify(unclaimed.data)).not.toContain(order.id)
      })
    })
  },
})
