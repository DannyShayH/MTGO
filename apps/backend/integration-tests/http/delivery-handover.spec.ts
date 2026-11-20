import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
} from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import type DeliveryModuleService from "../../src/modules/delivery/service"
import { endDeliveryWorkflow } from "../../src/workflows/delivery/terminal"
import { recoverDeliveryFulfillmentsWorkflow } from "../../src/workflows/delivery/native-fulfillment"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(240000)

medusaIntegrationTestRunner({
  dbName: "medusa_ci_delivery_handover_http",
  env: { JWT_SECRET: "ci-only-delivery-handover-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer, dbUtils }) => {
    const harness = restaurantOrdersHarness({ api, getContainer, dbUtils })
    const {
      placePaidOrder,
      signInAsStaffOf,
      accept,
      startPreparation,
      markReady,
    } = harness
    let pizzeriaId: string
    let staff: Record<string, string>
    beforeEach(async () => {
      ;({ pizzeriaId } = harness.seeded())
      staff = (await signInAsStaffOf(pizzeriaId, "handover-staff@example.test"))
        .headers
    })

    const delivery = () =>
      getContainer().resolve<DeliveryModuleService>(DELIVERY_MODULE)
    const query = () => getContainer().resolve(ContainerRegistrationKeys.QUERY)
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
        name: `Handover agent ${agents}`,
        email: `handover-agent-${agents}@example.test`,
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
    type Agent = Awaited<ReturnType<typeof agentFor>>
    let requests = 0
    const post = (
      path: string,
      headers: Record<string, string>,
      body: Record<string, unknown>,
    ) => api.post(path, body, { headers, validateStatus: () => true })
    const get = (path: string, headers: Record<string, string>) =>
      api.get(path, { headers, validateStatus: () => true })
    const claim = (headers: Record<string, string>, orderId: string) =>
      post(`/partner/delivery-agent/available/${orderId}/claim`, headers, {
        request_id: `claim-${++requests}`,
      })
    const pickup = (headers: Record<string, string>, orderId: string) =>
      post(`/partner/deliveries/${orderId}/pickup`, headers, {
        request_id: `pickup-${++requests}`,
      })
    const deliver = (
      headers: Record<string, string>,
      orderId: string,
      body: Record<string, unknown> = { request_id: `deliver-${++requests}` },
    ) => post(`/partner/deliveries/${orderId}/deliver`, headers, body)
    const current = (headers: Record<string, string>) =>
      get("/partner/delivery-agent/current", headers)
    const history = (headers: Record<string, string>, search = "") =>
      get(`/partner/delivery-agent/history${search}`, headers)
    const historyEntry = (headers: Record<string, string>, orderId: string) =>
      get(`/partner/delivery-agent/history/${orderId}`, headers)

    /** A ready Order the agent claimed and, unless told otherwise, collected. */
    const collectedOrder = async (
      agent?: Agent,
      { collected = true }: { collected?: boolean } = {},
    ) => {
      const order = await placePaidOrder(pizzeriaId)
      expect((await accept(staff, order.id)).status).toBe(200)
      const responsible = agent ?? (await agentFor())
      expect((await claim(responsible.headers, order.id)).status).toBe(200)
      expect((await startPreparation(staff, order.id)).status).toBe(200)
      expect((await markReady(staff, order.id)).status).toBe(200)
      if (collected)
        expect((await pickup(responsible.headers, order.id)).status).toBe(200)
      return { order, agent: responsible }
    }
    const nativeFulfillments = async (order_id: string) => {
      const { data } = await query().graph({
        entity: "order",
        fields: ["fulfillments.id", "fulfillments.delivered_at"],
        filters: { id: order_id },
      })
      return (
        (
          data[0] as unknown as {
            fulfillments?: { id: string; delivered_at: string | null }[]
          }
        ).fulfillments ?? []
      )
    }

    describe("POST /partner/deliveries/:id/deliver", () => {
      it("records the responsible agent's confirmed handover once, frees capacity for new work and marks the native fulfillment delivered", async () => {
        const { order, agent } = await collectedOrder()
        expect((await current(agent.headers)).data.delivery).toMatchObject({
          allowed_actions: ["confirm_handover"],
        })

        const started = Date.now()
        const delivered = await deliver(agent.headers, order.id, {
          request_id: "handover-tap",
        })
        expect(delivered.status).toBe(200)
        const entry = delivered.data.delivery
        expect(entry).toMatchObject({
          order_id: order.id,
          outcome: "delivered",
          picked_up_at: expect.any(String),
        })
        expect(new Date(entry.ended_at).getTime()).toBeGreaterThanOrEqual(
          started - 1000,
        )

        // A double tap or a retry after a lost response keeps the original.
        for (const request_id of ["handover-tap", "handover-second-tap"]) {
          const repeat = await deliver(agent.headers, order.id, { request_id })
          expect(repeat.status).toBe(200)
          expect(repeat.data.delivery).toEqual(entry)
        }

        // The phone shows no current work and the agent may claim again.
        expect((await current(agent.headers)).data.delivery).toBeNull()
        await collectedOrder(agent, { collected: false })

        // The historical responsibility and milestones stay.
        const [record] = await delivery().listIntendedDeliveries({
          order_id: order.id,
        })
        expect(record).toMatchObject({
          assigned_agent_id: agent.id,
          assigned_by: agent.id,
          picked_up_by: agent.id,
          active_agent_id: null,
          terminal_outcome: "delivered",
          terminal_by: agent.id,
          handover_request_id: "handover-tap",
        })
        const fulfillments = await nativeFulfillments(order.id)
        expect(fulfillments).toHaveLength(1)
        expect(fulfillments[0].delivered_at).toBeTruthy()
        expect(record.native_delivered_at).toBeTruthy()
        const admin = await api.get(
          `/admin/orders/${order.id}?fields=fulfillment_status`,
          { headers: harness.seeded().admin },
        )
        expect(admin.data.order.fulfillment_status).toBe("delivered")
      })

      it("refuses handover before pickup, by other agents, other actors and on unknown Orders without ending anything", async () => {
        const { order, agent } = await collectedOrder(undefined, {
          collected: false,
        })
        expect((await current(agent.headers)).data.delivery).toMatchObject({
          allowed_actions: ["confirm_pickup"],
        })
        const early = await deliver(agent.headers, order.id)
        expect(early.status).toBe(400)
        expect(early.data.code).toBe("pickup_not_recorded")

        expect((await pickup(agent.headers, order.id)).status).toBe(200)
        const other = await agentFor()
        const foreign = await deliver(other.headers, order.id)
        expect(foreign.status).toBe(400)
        expect(foreign.data.code).toBe("delivery_not_responsible")
        // The refusal carries no Customer or agent details.
        expect(Object.keys(foreign.data).sort()).toEqual([
          "code",
          "message",
          "type",
        ])

        // Restaurant staff and anonymous callers are not delivery agents.
        expect((await deliver(staff, order.id)).status).toBe(401)
        expect((await deliver({}, order.id)).status).toBe(401)
        expect((await deliver(agent.headers, "order_unknown")).status).toBe(404)
        // The body sets nothing but the retry identity: no time, location or proof.
        for (const extra of [
          { delivered_at: "2020-01-01T00:00:00Z" },
          { latitude: 55.7, longitude: 12.5 },
          { photo: "data:image/png;base64,AAAA" },
        ]) {
          const forged = await deliver(agent.headers, order.id, {
            request_id: "forged",
            ...extra,
          })
          expect(forged.status).toBe(400)
        }

        const [record] = await delivery().listIntendedDeliveries({
          order_id: order.id,
        })
        expect(record).toMatchObject({
          terminal_outcome: null,
          active_agent_id: agent.id,
        })
      })

      it("refuses a revoked agent and a retry identity used for another delivery", async () => {
        const first = await collectedOrder()
        const second = await collectedOrder()
        expect(
          (
            await deliver(first.agent.headers, first.order.id, {
              request_id: "shared-handover",
            })
          ).status,
        ).toBe(200)
        const reused = await deliver(second.agent.headers, second.order.id, {
          request_id: "shared-handover",
        })
        expect(reused.status).toBe(409)
        expect(reused.data.code).toBe("handover_request_reused")

        await delivery().revokeAgent({
          agent_id: second.agent.id,
          revoked_by: "operator",
        })
        expect(
          (await deliver(second.agent.headers, second.order.id)).status,
        ).toBe(403)
        // Revoked access also ends reading the history.
        expect((await history(second.agent.headers)).status).toBe(403)
        const [record] = await delivery().listIntendedDeliveries({
          order_id: second.order.id,
        })
        expect(record.terminal_outcome).toBeNull()
      })

      it("records one handover when competing requests arrive at once", async () => {
        const { order, agent } = await collectedOrder()
        const results = await Promise.all(
          ["race-a", "race-b", "race-c"].map((request_id) =>
            deliver(agent.headers, order.id, { request_id }),
          ),
        )
        expect(results.map(({ status }) => status)).toEqual([200, 200, 200])
        expect(
          new Set(results.map(({ data }) => data.delivery.ended_at)).size,
        ).toBe(1)
        const fulfillments = await nativeFulfillments(order.id)
        expect(fulfillments).toHaveLength(1)
        expect(fulfillments[0].delivered_at).toBeTruthy()
      })

      it("refuses a stale decision with delivery_changed and keeps the original outcome, even if the locks were lost", async () => {
        const { order, agent } = await collectedOrder()
        const delivered = await deliver(agent.headers, order.id)
        expect(delivered.status).toBe(200)
        const stale = await delivery().endDelivery(
          {
            order_id: order.id,
            outcome: "cancelled",
            actor_id: "system",
            order_active: false,
            now: new Date(Date.now() + 60000),
          },
          () => ({ outcome: "end" }),
        )
        expect(stale.decision).toEqual({
          outcome: "refused",
          code: "delivery_changed",
        })
        const entry = await historyEntry(agent.headers, order.id)
        expect(entry.data.delivery).toEqual(delivered.data.delivery)
      })
    })

    describe("the shared terminal boundary for cancellation and failure", () => {
      it("ends active work with the authoritative outcome, frees capacity and blocks later handover, keeping history", async () => {
        const { order, agent } = await collectedOrder()
        const { result } = await endDeliveryWorkflow(getContainer()).run({
          input: {
            order_id: order.id,
            outcome: "cancelled",
            actor_id: "system",
          },
        })
        expect(result).toEqual({ outcome: "end" })
        // A repeat keeps the original outcome.
        const repeat = await endDeliveryWorkflow(getContainer()).run({
          input: { order_id: order.id, outcome: "failed", actor_id: "user_1" },
        })
        expect(repeat.result).toEqual({
          outcome: "already_ended",
          terminal_outcome: "cancelled",
        })

        expect((await current(agent.headers)).data.delivery).toBeNull()
        const late = await deliver(agent.headers, order.id)
        expect(late.status).toBe(400)
        expect(late.data.code).toBe("delivery_not_active")
        const entry = await historyEntry(agent.headers, order.id)
        expect(entry.data.delivery).toMatchObject({
          outcome: "cancelled",
          picked_up_at: expect.any(String),
        })
        // Cancelled work is never marked delivered natively.
        expect(
          (await nativeFulfillments(order.id)).map(
            ({ delivered_at }) => delivered_at,
          ),
        ).toEqual([null])
        await collectedOrder(agent, { collected: false })
      })

      it("never rewrites a delivered outcome as cancelled", async () => {
        const { order, agent } = await collectedOrder()
        expect((await deliver(agent.headers, order.id)).status).toBe(200)
        const { result } = await endDeliveryWorkflow(getContainer()).run({
          input: {
            order_id: order.id,
            outcome: "cancelled",
            actor_id: "system",
          },
        })
        expect(result).toEqual({
          outcome: "already_ended",
          terminal_outcome: "delivered",
        })
      })

      it("leaves an Order without accepted work alone", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const { result } = await endDeliveryWorkflow(getContainer()).run({
          input: {
            order_id: order.id,
            outcome: "cancelled",
            actor_id: "system",
          },
        })
        expect(result).toEqual({ outcome: "no_delivery" })
      })
    })

    describe("recovery of native delivery owed by a handover", () => {
      it("marks the fulfillment delivered after an interruption between the outcome and synchronization", async () => {
        const { order, agent } = await collectedOrder()
        // The outcome committed; the process stopped before native sync.
        const [record] = await delivery().listIntendedDeliveries({
          order_id: order.id,
        })
        await delivery().updateIntendedDeliveries({
          id: record.id,
          terminal_outcome: "delivered",
          terminal_at: new Date(),
          terminal_by: agent.id,
          active_agent_id: null,
        })
        expect((await nativeFulfillments(order.id))[0].delivered_at).toBeNull()

        const recover = () =>
          recoverDeliveryFulfillmentsWorkflow(getContainer()).run({ input: {} })
        expect((await recover()).result.synced).toContain(order.id)
        expect(
          (await nativeFulfillments(order.id))[0].delivered_at,
        ).toBeTruthy()
        // A second sweep owes nothing more.
        expect((await recover()).result.synced).not.toContain(order.id)
      })
    })

    describe("GET /partner/delivery-agent/history", () => {
      it("lists only the agent's own ended work, newest first and paged, without Customer contact or destination", async () => {
        const agent = await agentFor()
        const ended: string[] = []
        for (let i = 0; i < 3; i++) {
          const { order } = await collectedOrder(agent)
          expect((await deliver(agent.headers, order.id)).status).toBe(200)
          ended.push(order.id)
        }
        // Active work and another agent's work are not history.
        const active = await collectedOrder(agent)
        const other = await collectedOrder()
        expect(
          (await deliver(other.agent.headers, other.order.id)).status,
        ).toBe(200)

        const first = await history(agent.headers, "?limit=2")
        expect(first.status).toBe(200)
        expect(first.data.deliveries.map(({ order_id }) => order_id)).toEqual([
          ended[2],
          ended[1],
        ])
        expect(first.data.has_more).toBe(true)
        const second = await history(agent.headers, "?limit=2&offset=2")
        expect(second.data.deliveries.map(({ order_id }) => order_id)).toEqual([
          ended[0],
        ])
        expect(second.data.has_more).toBe(false)

        const entry = first.data.deliveries[0]
        expect(Object.keys(entry).sort()).toEqual(
          [
            "id",
            "order_id",
            "order_reference",
            "restaurant_name",
            "pickup_address",
            "accepted_at",
            "assigned_at",
            "assignment_source",
            "picked_up_at",
            "ended_at",
            "outcome",
          ].sort(),
        )
        const { data } = await query().graph({
          entity: "order",
          fields: ["shipping_address.phone", "shipping_address.address_1"],
          filters: { id: ended[2] },
        })
        const address = (
          data[0] as { shipping_address: { phone: string; address_1: string } }
        ).shipping_address
        const text = JSON.stringify(first.data)
        // The fixture always has a Customer phone, so this check never skips.
        expect(address.phone).toBeTruthy()
        expect(text).not.toContain(address.address_1)
        expect(text).not.toContain(address.phone)

        // The detail route keeps the same privacy and ownership.
        const detail = await historyEntry(agent.headers, ended[2])
        expect(detail.status).toBe(200)
        expect(detail.data.delivery).toEqual(entry)
        expect(JSON.stringify(detail.data)).not.toContain(address.phone)
        for (const orderId of [
          other.order.id,
          active.order.id,
          "order_unknown",
        ]) {
          const hidden = await historyEntry(agent.headers, orderId)
          expect(hidden.status).toBe(404)
          expect(JSON.stringify(hidden.data)).not.toContain(address.address_1)
          expect(JSON.stringify(hidden.data)).not.toContain(address.phone)
        }
        expect((await history(staff)).status).toBe(401)
        expect((await history(agent.headers, "?limit=0")).status).toBe(400)
      })

      it("answers an agent without completed work with an empty page", async () => {
        const agent = await agentFor()
        const empty = await history(agent.headers)
        expect(empty.status).toBe(200)
        expect(empty.data).toMatchObject({ deliveries: [], has_more: false })
      })
    })

    describe("GET /store/orders/:id/progress", () => {
      it("shows the owning Customer the committed delivery milestones, without the agent's identity", async () => {
        const { order, agent } = await collectedOrder()
        const { customer } = harness.seeded()
        const before = await harness.progress(customer, order.id)
        expect(before.status).toBe(200)
        expect(before.data.progress.delivery).toMatchObject({
          assigned_at: expect.any(String),
          picked_up_at: expect.any(String),
          delivered_at: null,
          outcome: null,
        })

        const delivered = await deliver(agent.headers, order.id)
        const after = await harness.progress(customer, order.id)
        expect(after.data.progress.delivery).toEqual({
          assigned_at: expect.any(String),
          picked_up_at: delivered.data.delivery.picked_up_at,
          delivered_at: delivered.data.delivery.ended_at,
          outcome: "delivered",
        })
        // Paid placement facts stay as they were.
        expect(after.data.progress).toMatchObject({
          order_id: order.id,
          placed_at: expect.any(String),
          state: "ready",
        })
        expect(JSON.stringify(after.data)).not.toContain(agent.id)
      })
    })
  },
})
