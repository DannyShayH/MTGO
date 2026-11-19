import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
} from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import type DeliveryModuleService from "../../src/modules/delivery/service"
import { recoverDeliveryAttentionWorkflow } from "../../src/workflows/delivery/attention"
import scheduleDeliveryAttention from "../../src/migration-scripts/schedule-delivery-attention"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(240000)

const TEN_MINUTES = 10 * 60 * 1000

medusaIntegrationTestRunner({
  dbName: "medusa_ci_delivery_attention_http",
  env: { JWT_SECRET: "ci-only-delivery-attention-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer, dbUtils }) => {
    const harness = restaurantOrdersHarness({ api, getContainer, dbUtils })
    const { operations, placePaidOrder, signInAsStaffOf, accept } = harness
    let admin: { authorization: string }
    let pizzeriaId: string
    let staff: Record<string, string>
    beforeEach(async () => {
      ;({ admin, pizzeriaId } = harness.seeded())
      staff = (
        await signInAsStaffOf(pizzeriaId, "attention-staff@example.test")
      ).headers
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
        name: `Attention agent ${agents}`,
        email: `attention-agent-${agents}@example.test`,
        status: "authorized",
        invited_by: "operator",
      })
      await delivery().createDeliveryAgentAreas([
        { agent_id: agent.id, postal_code: "2200" },
      ])
      return {
        id: agent.id,
        name: agent.name,
        headers: { authorization: tokenFor(agent.id, "delivery_agent") },
      }
    }
    /** An accepted Order and its durable acceptance time. */
    const acceptedOrder = async () => {
      const order = await placePaidOrder(pizzeriaId)
      expect((await accept(staff, order.id)).status).toBe(200)
      const [record] = await delivery().listIntendedDeliveries({
        order_id: order.id,
      })
      return { order, acceptedAt: new Date(record.accepted_at).getTime() }
    }
    /** The production recovery entry point, at a controlled processing time. */
    const sweep = (now: number) =>
      recoverDeliveryAttentionWorkflow(getContainer()).run({
        input: { now: new Date(now).toISOString() },
      })
    const attention = (
      query: Record<string, unknown> = {},
      headers: Record<string, string> = admin,
    ) =>
      api.get("/admin/deliveries/attention", {
        headers,
        params: query,
        validateStatus: () => true,
      })
    const listed = async () => {
      const response = await attention()
      expect(response.status).toBe(200)
      return response.data.attention as Record<string, unknown>[]
    }
    let requests = 0
    const claim = (headers: Record<string, string>, orderId: string) =>
      api.post(
        `/partner/delivery-agent/available/${orderId}/claim`,
        { request_id: `attention-claim-${++requests}` },
        { headers, validateStatus: () => true },
      )
    const assign = (orderId: string, agent_id: string) =>
      api.post(
        `/admin/deliveries/${orderId}/assign`,
        { agent_id, request_id: `attention-assign-${++requests}` },
        { headers: admin, validateStatus: () => true },
      )

    describe("GET /admin/deliveries/attention", () => {
      it("raises unassigned attention exactly at acceptance plus ten minutes, with the Order's real facts", async () => {
        const { order, acceptedAt } = await acceptedOrder()
        const due = acceptedAt + TEN_MINUTES
        await sweep(due - 1)
        expect(await listed()).toEqual([])
        await sweep(due)
        const [raised, ...rest] = await listed()
        expect(rest).toEqual([])
        expect(raised).toEqual({
          id: expect.stringMatching(/^datt_/),
          type: "unassigned",
          order_id: order.id,
          order_reference: order.display_id,
          restaurant_name: expect.any(String),
          pickup_postal_code: "2200",
          destination_postal_code: "2200",
          preparation_status: "accepted",
          accepted_at: new Date(acceptedAt).toISOString(),
          due_at: new Date(due).toISOString(),
          raised_at: new Date(due).toISOString(),
          claim_deadline: new Date(acceptedAt + 3 * TEN_MINUTES).toISOString(),
          assignment: null,
        })
      })

      it("keeps the effective deadline through downtime and never duplicates or re-raises on repeated sweeps", async () => {
        const { acceptedAt } = await acceptedOrder()
        const due = acceptedAt + TEN_MINUTES
        // The first sweep after two hours of downtime.
        const late = due + 2 * 60 * 60 * 1000
        await sweep(late)
        await sweep(late + 60_000)
        await Promise.all([sweep(late + 120_000), sweep(late + 120_000)])
        const items = await listed()
        expect(items).toHaveLength(1)
        expect(items[0]).toMatchObject({
          due_at: new Date(due).toISOString(),
          raised_at: new Date(late).toISOString(),
        })
        expect(
          await delivery().listDeliveryAttentions({}, { take: null }),
        ).toHaveLength(1)
      })

      it("a claim or an operator's assignment removes the outstanding condition", async () => {
        const claimed = await acceptedOrder()
        const assigned = await acceptedOrder()
        const due =
          Math.max(claimed.acceptedAt, assigned.acceptedAt) + TEN_MINUTES
        await sweep(due)
        expect(await listed()).toHaveLength(2)
        const first = await agentFor()
        expect((await claim(first.headers, claimed.order.id)).status).toBe(200)
        const second = await agentFor()
        expect((await assign(assigned.order.id, second.id)).status).toBe(200)
        expect(await listed()).toEqual([])
        await sweep(due + 60_000)
        expect(await listed()).toEqual([])
      })

      it("an assignment before the deadline means attention is never raised", async () => {
        const { order, acceptedAt } = await acceptedOrder()
        const agent = await agentFor()
        expect((await claim(agent.headers, order.id)).status).toBe(200)
        await sweep(acceptedAt + TEN_MINUTES)
        expect(await listed()).toEqual([])
        const [record] = await delivery().listDeliveryAttentions({
          order_id: order.id,
        })
        expect(record).toMatchObject({
          raised_at: null,
          resolution: "assigned",
        })
      })

      it("leaves one consistent outcome when a sweep races an assignment", async () => {
        const { order, acceptedAt } = await acceptedOrder()
        const agent = await agentFor()
        const [assigned] = await Promise.all([
          assign(order.id, agent.id),
          sweep(acceptedAt + TEN_MINUTES),
        ])
        expect(assigned.status).toBe(200)
        expect(await listed()).toEqual([])
        const [record] = await delivery().listDeliveryAttentions({
          order_id: order.id,
        })
        expect(record.resolution).toBe("assigned")
      })

      it("attention never cancels, releases or assigns the work", async () => {
        const { order, acceptedAt } = await acceptedOrder()
        await sweep(acceptedAt + TEN_MINUTES)
        expect(await listed()).toHaveLength(1)
        const [operation] = await operations().listOrderOperations({
          order_id: order.id,
        })
        expect(operation.state).toBe("accepted")
        const [record] = await delivery().listIntendedDeliveries({
          order_id: order.id,
        })
        expect(record.assigned_agent_id).toBeNull()
        const unclaimed = await api.get("/admin/deliveries/unclaimed", {
          headers: admin,
        })
        expect(
          unclaimed.data.deliveries.map(
            ({ order_id }: { order_id: string }) => order_id,
          ),
        ).toContain(order.id)
      })

      it("stops listing an Order that has ended and resolves it on the next sweep", async () => {
        const { order, acceptedAt } = await acceptedOrder()
        await sweep(acceptedAt + TEN_MINUTES)
        const [operation] = await operations().listOrderOperations({
          order_id: order.id,
        })
        await operations().updateOrderOperations({
          id: operation.id,
          state: "cancelled",
        })
        expect(await listed()).toEqual([])
        await sweep(acceptedAt + TEN_MINUTES + 60_000)
        const [record] = await delivery().listDeliveryAttentions({
          order_id: order.id,
        })
        expect(record.resolution).toBe("order_ended")
      })

      it("is a bounded page, oldest deadline first", async () => {
        const first = await acceptedOrder()
        const second = await acceptedOrder()
        await sweep(second.acceptedAt + TEN_MINUTES)
        const page = await attention({ limit: 1 })
        expect(page.data).toMatchObject({
          limit: 1,
          offset: 0,
          has_more: true,
          server_time: expect.any(String),
        })
        expect(page.data.attention[0].order_id).toBe(first.order.id)
        const next = await attention({ limit: 1, offset: 1 })
        expect(next.data.has_more).toBe(false)
        expect(next.data.attention[0].order_id).toBe(second.order.id)
        expect((await attention({ limit: 51 })).status).toBe(400)
        expect((await attention({ offset: 501 })).status).toBe(400)
        expect((await attention({ unknown: "x" })).status).toBe(400)
      })

      it("is for operators only", async () => {
        const agent = await agentFor()
        expect((await attention({}, {})).status).toBe(401)
        expect((await attention({}, agent.headers)).status).toBe(401)
        expect((await attention({}, staff)).status).toBe(401)
      })
    })

    describe("recovery of work accepted before attention existed", () => {
      it("schedules the obligation for unassigned work from its acceptance time", async () => {
        const { order, acceptedAt } = await acceptedOrder()
        const [scheduled] = await delivery().listDeliveryAttentions({
          order_id: order.id,
        })
        await delivery().deleteDeliveryAttentions(scheduled.id)
        await scheduleDeliveryAttention({
          container: getContainer() as MedusaContainer,
        })
        await scheduleDeliveryAttention({
          container: getContainer() as MedusaContainer,
        })
        await sweep(acceptedAt + TEN_MINUTES)
        const items = await listed()
        expect(items).toHaveLength(1)
        expect(items[0].due_at).toBe(
          new Date(acceptedAt + TEN_MINUTES).toISOString(),
        )
      })
    })
  },
})
