import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
} from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import type DeliveryModuleService from "../../src/modules/delivery/service"
import {
  recoverDeliveryAttentionWorkflow,
  scheduleDeliveryAttentionWorkflow,
} from "../../src/workflows/delivery/attention"
import { endDeliveryWorkflow } from "../../src/workflows/delivery/terminal"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(240000)

const TEN_MINUTES = 10 * 60 * 1000

medusaIntegrationTestRunner({
  dbName: "medusa_ci_delivery_arrival_http",
  env: { JWT_SECRET: "ci-only-delivery-arrival-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer, dbUtils }) => {
    const harness = restaurantOrdersHarness({ api, getContainer, dbUtils })
    const {
      operations,
      placePaidOrder,
      signInAsStaffOf,
      accept,
      startPreparation,
      markReady,
    } = harness
    let admin: { authorization: string }
    let pizzeriaId: string
    let staff: Record<string, string>
    beforeEach(async () => {
      ;({ admin, pizzeriaId } = harness.seeded())
      staff = (await signInAsStaffOf(pizzeriaId, "arrival-staff@example.test"))
        .headers
    })

    const delivery = () =>
      getContainer().resolve<DeliveryModuleService>(DELIVERY_MODULE)
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
    let agents = 0
    const agentFor = async () => {
      agents += 1
      const agent = await delivery().createDeliveryAgents({
        name: `Arrival agent ${agents}`,
        email: `arrival-agent-${agents}@example.test`,
        status: "authorized",
        invited_by: "operator",
      })
      await delivery().createDeliveryAgentAreas([
        { agent_id: agent.id, postal_code: "2200" },
      ])
      return {
        id: agent.id,
        headers: { authorization: tokenFor(agent.id, "delivery_agent") },
      }
    }
    let requests = 0
    const post = (
      path: string,
      headers: Record<string, string>,
      body: Record<string, unknown>,
    ) => api.post(path, body, { headers, validateStatus: () => true })
    const claim = (headers: Record<string, string>, orderId: string) =>
      post(`/partner/delivery-agent/available/${orderId}/claim`, headers, {
        request_id: `arrival-claim-${++requests}`,
      })
    const pickup = (headers: Record<string, string>, orderId: string) =>
      post(`/partner/deliveries/${orderId}/pickup`, headers, {
        request_id: `arrival-pickup-${++requests}`,
      })
    const arrive = (
      headers: Record<string, string>,
      orderId: string,
      body: Record<string, unknown> = { request_id: `arrive-${++requests}` },
    ) => post(`/partner/deliveries/${orderId}/arrive`, headers, body)
    const contact = (
      headers: Record<string, string>,
      orderId: string,
      body: Record<string, unknown> = { request_id: `contact-${++requests}` },
    ) => post(`/partner/deliveries/${orderId}/contact-attempts`, headers, body)
    const deliver = (headers: Record<string, string>, orderId: string) =>
      post(`/partner/deliveries/${orderId}/deliver`, headers, {
        request_id: `arrival-deliver-${++requests}`,
      })
    const current = async (headers: Record<string, string>) => {
      const response = await api.get("/partner/delivery-agent/current", {
        headers,
        validateStatus: () => true,
      })
      expect(response.status).toBe(200)
      return response.data.delivery
    }
    /** The production recovery entry point, at a controlled processing time. */
    const sweep = (now: number) =>
      recoverDeliveryAttentionWorkflow(getContainer()).run({
        input: { now: new Date(now).toISOString() },
      })
    const listed = async () => {
      const response = await api.get("/admin/deliveries/attention", {
        headers: admin,
      })
      expect(response.status).toBe(200)
      return (response.data.attention as Record<string, unknown>[]).filter(
        ({ type }) => type === "arrived_without_handover",
      )
    }
    const arrivalAttentionOf = (order_id: string) =>
      delivery().listDeliveryAttentions({
        order_id,
        type: "arrived_without_handover",
      })
    const recordOf = async (order_id: string) =>
      (await delivery().listIntendedDeliveries({ order_id }))[0]

    /** Collected work held by a fresh agent; arrived if asked. */
    const collectedOrder = async ({
      arrived = false,
    }: { arrived?: boolean } = {}) => {
      const order = await placePaidOrder(pizzeriaId)
      expect((await accept(staff, order.id)).status).toBe(200)
      const agent = await agentFor()
      expect((await claim(agent.headers, order.id)).status).toBe(200)
      expect((await startPreparation(staff, order.id)).status).toBe(200)
      expect((await markReady(staff, order.id)).status).toBe(200)
      expect((await pickup(agent.headers, order.id)).status).toBe(200)
      if (!arrived) return { order, agent, arrivedAt: 0 }
      const response = await arrive(agent.headers, order.id)
      expect(response.status).toBe(200)
      return {
        order,
        agent,
        arrivedAt: new Date(response.data.delivery.arrived_at).getTime(),
      }
    }

    describe("POST /partner/deliveries/:id/arrive", () => {
      it("records the responsible agent's explicit arrival once after pickup, with the server's time", async () => {
        const { order, agent } = await collectedOrder()
        expect(await current(agent.headers)).toMatchObject({
          arrived_at: null,
          contact_attempts: [],
          allowed_actions: ["record_arrival", "confirm_handover"],
        })

        const started = Date.now()
        const arrived = await arrive(agent.headers, order.id, {
          request_id: "arrive-tap",
        })
        expect(arrived.status).toBe(200)
        const arrivedAt = arrived.data.delivery.arrived_at
        expect(new Date(arrivedAt).getTime()).toBeGreaterThanOrEqual(
          started - 1000,
        )
        expect(arrived.data.delivery).toMatchObject({
          order_id: order.id,
          allowed_actions: ["record_contact_attempt", "confirm_handover"],
        })
        expect(await current(agent.headers)).toEqual(arrived.data.delivery)

        // A double tap or a retry after a lost response keeps the original.
        for (const request_id of ["arrive-tap", "arrive-second-tap"]) {
          const repeat = await arrive(agent.headers, order.id, { request_id })
          expect(repeat.status).toBe(200)
          expect(repeat.data.delivery.arrived_at).toBe(arrivedAt)
        }
        expect(await recordOf(order.id)).toMatchObject({
          arrived_by: agent.id,
          arrival_request_id: "arrive-tap",
          // Arrival is never handover.
          terminal_outcome: null,
          active_agent_id: agent.id,
        })
        const [operation] = await operations().listOrderOperations({
          order_id: order.id,
        })
        expect(operation.state).toBe("ready")
      })

      it("never takes a time, location or outcome from the client", async () => {
        const { order, agent } = await collectedOrder()
        for (const forged of [
          { request_id: "arrive-forged-1", arrived_at: "2026-01-01T00:00:00Z" },
          { request_id: "arrive-forged-2", latitude: 55.7, longitude: 12.5 },
          { request_id: "arrive-forged-3", agent_id: "dagt_other" },
          {},
        ])
          expect((await arrive(agent.headers, order.id, forged)).status).toBe(
            400,
          )
        expect((await recordOf(order.id)).arrived_at).toBeNull()
      })

      it("refuses arrival before pickup, by other agents and actors and on unknown Orders", async () => {
        const order = await placePaidOrder(pizzeriaId)
        expect((await accept(staff, order.id)).status).toBe(200)
        const agent = await agentFor()
        expect((await claim(agent.headers, order.id)).status).toBe(200)

        const early = await arrive(agent.headers, order.id)
        expect(early.status).toBe(400)
        expect(early.data.code).toBe("pickup_not_recorded")

        const other = await agentFor()
        const foreign = await arrive(other.headers, order.id)
        expect(foreign.status).toBe(400)
        expect(foreign.data.code).toBe("delivery_not_responsible")
        // The refusal never leaks the Customer or the responsible agent.
        expect(JSON.stringify(foreign.data)).not.toMatch(/address|phone|dagt_/)

        expect((await arrive(staff, order.id)).status).toBe(401)
        expect((await arrive({}, order.id)).status).toBe(401)
        expect((await arrive(agent.headers, "order_unknown")).status).toBe(404)
        expect((await recordOf(order.id)).arrived_at).toBeNull()
      })

      it("refuses a revoked agent, a retry identity used for another delivery and ended work", async () => {
        const first = await collectedOrder({ arrived: true })
        const second = await collectedOrder()
        const [{ arrival_request_id }] =
          await delivery().listIntendedDeliveries({ order_id: first.order.id })
        const reused = await arrive(second.agent.headers, second.order.id, {
          request_id: arrival_request_id,
        })
        expect(reused.status).toBe(409)
        expect(reused.data.code).toBe("arrival_request_reused")

        await endDeliveryWorkflow(getContainer()).run({
          input: {
            order_id: second.order.id,
            outcome: "failed",
            actor_id: "user_op",
          },
        })
        const ended = await arrive(second.agent.headers, second.order.id)
        expect(ended.status).toBe(400)
        expect(ended.data.code).toBe("delivery_not_active")

        await delivery().revokeAgent({
          agent_id: first.agent.id,
          revoked_by: "operator",
        })
        const revoked = await arrive(first.agent.headers, first.order.id)
        expect(revoked.status).toBe(403)
        expect(revoked.data.code).toBe("delivery_agent_access_revoked")
      })

      it("refuses a stale decision with delivery_changed and keeps the original arrival, even if the locks were lost", async () => {
        const { order, agent, arrivedAt } = await collectedOrder({
          arrived: true,
        })
        // A decision made on a stale read, as if the locks had been lost: the
        // guarded write itself still requires an unrecorded arrival.
        const later = new Date(arrivedAt + 60_000)
        const stale = await delivery().recordArrival(
          {
            order_id: order.id,
            agent_id: agent.id,
            request_id: "arrive-stale-decision",
            order_active: true,
            now: later,
            arrival_attention_due_at: later,
          },
          () => ({ outcome: "arrive" }),
        )
        expect(stale.outcome).toEqual({
          outcome: "refused",
          code: "delivery_changed",
        })
        const record = await recordOf(order.id)
        expect(new Date(record.arrived_at as Date).getTime()).toBe(arrivedAt)
        expect(record.arrival_request_id).not.toBe("arrive-stale-decision")
        expect(await arrivalAttentionOf(order.id)).toHaveLength(1)
      })

      it("records one arrival and one obligation when competing requests arrive at once", async () => {
        const { order, agent } = await collectedOrder()
        const responses = await Promise.all(
          ["race-1", "race-2", "race-3"].map((request_id) =>
            arrive(agent.headers, order.id, { request_id }),
          ),
        )
        expect(responses.map(({ status }) => status)).toEqual([200, 200, 200])
        const times = new Set(
          responses.map(({ data }) => data.delivery.arrived_at),
        )
        expect(times.size).toBe(1)
        const [obligation, ...rest] = await arrivalAttentionOf(order.id)
        expect(rest).toEqual([])
        expect(new Date(obligation.due_at).getTime()).toBe(
          new Date([...times][0]).getTime() + TEN_MINUTES,
        )
      })
    })

    describe("POST /partner/deliveries/:id/contact-attempts", () => {
      it("records each distinct attempt after arrival with the server's time, and a repeat only once", async () => {
        const { order, agent } = await collectedOrder()
        const early = await contact(agent.headers, order.id)
        expect(early.status).toBe(400)
        expect(early.data.code).toBe("arrival_not_recorded")

        expect((await arrive(agent.headers, order.id)).status).toBe(200)
        const started = Date.now()
        const first = await contact(agent.headers, order.id, {
          request_id: "contact-a",
        })
        expect(first.status).toBe(200)
        expect(first.data.delivery.contact_attempts).toEqual([
          { attempted_at: expect.any(String) },
        ])
        const firstAt = first.data.delivery.contact_attempts[0].attempted_at
        expect(new Date(firstAt).getTime()).toBeGreaterThanOrEqual(
          started - 1000,
        )

        // A lost response retried with the same identity is the same attempt.
        const repeat = await contact(agent.headers, order.id, {
          request_id: "contact-a",
        })
        expect(repeat.status).toBe(200)
        expect(repeat.data.delivery.contact_attempts).toEqual([
          { attempted_at: firstAt },
        ])

        const second = await contact(agent.headers, order.id, {
          request_id: "contact-b",
        })
        expect(second.status).toBe(200)
        const attempts = second.data.delivery.contact_attempts
        expect(attempts).toHaveLength(2)
        expect(attempts[0].attempted_at).toBe(firstAt)
        expect(await current(agent.headers)).toEqual(second.data.delivery)

        // An attempt claims nothing about reaching the Customer.
        const record = await recordOf(order.id)
        expect(record).toMatchObject({
          terminal_outcome: null,
          active_agent_id: agent.id,
        })
        expect(
          await delivery().listDeliveryContactAttempts({ order_id: order.id }),
        ).toEqual([
          expect.objectContaining({
            agent_id: agent.id,
            request_id: "contact-a",
          }),
          expect.objectContaining({
            agent_id: agent.id,
            request_id: "contact-b",
          }),
        ])
      })

      it("keeps one attempt per retry identity under competing requests, and distinct attempts apart", async () => {
        const { order, agent } = await collectedOrder({ arrived: true })
        const same = await Promise.all(
          [1, 2, 3].map(() =>
            contact(agent.headers, order.id, { request_id: "contact-same" }),
          ),
        )
        expect(same.map(({ status }) => status)).toEqual([200, 200, 200])
        const distinct = await Promise.all(
          ["contact-x", "contact-y", "contact-z"].map((request_id) =>
            contact(agent.headers, order.id, { request_id }),
          ),
        )
        expect(distinct.map(({ status }) => status)).toEqual([200, 200, 200])
        expect(
          await delivery().listDeliveryContactAttempts({ order_id: order.id }),
        ).toHaveLength(4)
      })

      it("serializes a contact attempt racing the handover: recorded before it, or refused once delivered", async () => {
        const { order, agent } = await collectedOrder({ arrived: true })
        const [attempt, delivered] = await Promise.all([
          contact(agent.headers, order.id, { request_id: "contact-racing" }),
          deliver(agent.headers, order.id),
        ])
        expect(delivered.status).toBe(200)
        const attempts = await delivery().listDeliveryContactAttempts({
          order_id: order.id,
        })
        if (attempt.status === 200) {
          expect(attempts).toHaveLength(1)
        } else {
          expect(attempt.status).toBe(400)
          expect(attempt.data.code).toBe("delivery_not_active")
          expect(attempts).toEqual([])
        }
        expect(await recordOf(order.id)).toMatchObject({
          terminal_outcome: "delivered",
          active_agent_id: null,
        })
        const late = await contact(agent.headers, order.id)
        expect(late.status).toBe(400)
        expect(late.data.code).toBe("delivery_not_active")
      })

      it("refuses other agents, other actors, forged input and a retry identity from another delivery", async () => {
        const { order, agent } = await collectedOrder({ arrived: true })
        expect(
          (
            await contact(agent.headers, order.id, {
              request_id: "contact-held",
            })
          ).status,
        ).toBe(200)
        const other = await collectedOrder({ arrived: true })
        const reused = await contact(other.agent.headers, other.order.id, {
          request_id: "contact-held",
        })
        expect(reused.status).toBe(409)
        expect(reused.data.code).toBe("contact_attempt_request_reused")

        const foreign = await contact(other.agent.headers, order.id)
        expect(foreign.status).toBe(400)
        expect(foreign.data.code).toBe("delivery_not_responsible")
        expect((await contact(staff, order.id)).status).toBe(401)
        expect(
          (
            await contact(agent.headers, order.id, {
              request_id: "contact-forged",
              reached: true,
            })
          ).status,
        ).toBe(400)
        expect(
          await delivery().listDeliveryContactAttempts({ order_id: order.id }),
        ).toHaveLength(1)
      })
    })

    describe("unreachable Customer attention", () => {
      it("raises attention exactly at arrival plus ten minutes, keeping responsibility and never marking delivered", async () => {
        const { order, agent, arrivedAt } = await collectedOrder({
          arrived: true,
        })
        expect((await contact(agent.headers, order.id)).status).toBe(200)
        const due = arrivedAt + TEN_MINUTES
        await sweep(due - 1)
        expect(await listed()).toEqual([])
        expect((await current(agent.headers)).attention).toBeNull()
        await sweep(due)
        await sweep(due + 1)
        await sweep(due + 60_000)
        const [raised, ...rest] = await listed()
        expect(rest).toEqual([])
        expect(raised).toMatchObject({
          order_id: order.id,
          due_at: new Date(due).toISOString(),
          raised_at: new Date(due).toISOString(),
          arrived_at: new Date(arrivedAt).toISOString(),
          contact_attempts: { count: 1, last_attempted_at: expect.any(String) },
          assignment: { agent: { id: agent.id, agent_access: "authorized" } },
        })
        expect(await arrivalAttentionOf(order.id)).toHaveLength(1)
        expect(await current(agent.headers)).toMatchObject({
          attention: {
            type: "arrived_without_handover",
            due_at: new Date(due).toISOString(),
          },
          allowed_actions: ["record_contact_attempt", "confirm_handover"],
        })
        // Elapsed time never delivers, frees capacity or reassigns.
        expect(await recordOf(order.id)).toMatchObject({
          assigned_agent_id: agent.id,
          active_agent_id: agent.id,
          terminal_outcome: null,
        })
        const [operation] = await operations().listOrderOperations({
          order_id: order.id,
        })
        expect(operation.state).toBe("ready")
      })

      it("keeps the clock from the recorded arrival through downtime", async () => {
        const { order, arrivedAt } = await collectedOrder({ arrived: true })
        // The first sweep after two hours of downtime, as after a restart.
        await sweep(arrivedAt + 2 * 60 * 60 * 1000)
        const [raised] = await listed()
        expect(raised).toMatchObject({
          order_id: order.id,
          due_at: new Date(arrivedAt + TEN_MINUTES).toISOString(),
        })
      })

      it("rebuilds a lost obligation from the recorded arrival, with the same deadline", async () => {
        const { order, arrivedAt } = await collectedOrder({ arrived: true })
        const [lost] = await arrivalAttentionOf(order.id)
        await delivery().deleteDeliveryAttentions(lost.id)
        // The production scheduling capability the backfill and recovery use.
        await scheduleDeliveryAttentionWorkflow(getContainer()).run({
          input: { order_id: order.id },
        })
        await scheduleDeliveryAttentionWorkflow(getContainer()).run({
          input: { order_id: order.id },
        })
        const [rebuilt, ...rest] = await arrivalAttentionOf(order.id)
        expect(rest).toEqual([])
        expect(new Date(rebuilt.due_at).getTime()).toBe(arrivedAt + TEN_MINUTES)
        await sweep(arrivedAt + TEN_MINUTES)
        expect(await listed()).toHaveLength(1)
      })

      it("the actual handover resolves the attention, and a later sweep leaves it resolved", async () => {
        const { order, agent, arrivedAt } = await collectedOrder({
          arrived: true,
        })
        await sweep(arrivedAt + TEN_MINUTES)
        expect(await listed()).toHaveLength(1)
        expect((await deliver(agent.headers, order.id)).status).toBe(200)
        expect(await listed()).toEqual([])
        const [obligation] = await arrivalAttentionOf(order.id)
        expect(obligation.resolution).toBe("delivered")
        await sweep(arrivedAt + TEN_MINUTES + 60_000)
        expect(await listed()).toEqual([])
      })

      it("handover before the deadline means attention is never raised", async () => {
        const { order, agent, arrivedAt } = await collectedOrder({
          arrived: true,
        })
        expect((await deliver(agent.headers, order.id)).status).toBe(200)
        await sweep(arrivedAt + TEN_MINUTES)
        const [obligation] = await arrivalAttentionOf(order.id)
        expect(obligation).toMatchObject({
          raised_at: null,
          resolution: "delivered",
        })
      })

      it("an operator-confirmed failure resolves it as the Order ending", async () => {
        const { order, arrivedAt } = await collectedOrder({ arrived: true })
        await sweep(arrivedAt + TEN_MINUTES)
        await endDeliveryWorkflow(getContainer()).run({
          input: { order_id: order.id, outcome: "failed", actor_id: "user_op" },
        })
        expect(await listed()).toEqual([])
        const [obligation] = await arrivalAttentionOf(order.id)
        expect(obligation.resolution).toBe("order_ended")
      })

      it("leaves one consistent outcome when a sweep races the handover", async () => {
        const { order, agent, arrivedAt } = await collectedOrder({
          arrived: true,
        })
        const [delivered] = await Promise.all([
          deliver(agent.headers, order.id),
          sweep(arrivedAt + TEN_MINUTES),
        ])
        expect(delivered.status).toBe(200)
        expect(await listed()).toEqual([])
        const [obligation] = await arrivalAttentionOf(order.id)
        expect(obligation.resolution).toBe("delivered")
      })
    })
  },
})
