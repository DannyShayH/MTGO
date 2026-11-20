import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
} from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import type DeliveryModuleService from "../../src/modules/delivery/service"
import { recoverDeliveryAttentionWorkflow } from "../../src/workflows/delivery/attention"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(240000)

medusaIntegrationTestRunner({
  dbName: "medusa_ci_delivery_agent_revocation_http",
  env: { JWT_SECRET: "ci-only-delivery-revocation-secret", REDIS_URL: "" },
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
      staff = (
        await signInAsStaffOf(pizzeriaId, "revocation-staff@example.test")
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
        name: `Revocation agent ${agents}`,
        email: `revocation-agent-${agents}@example.test`,
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
    const acceptedOrder = async () => {
      const order = await placePaidOrder(pizzeriaId)
      expect((await accept(staff, order.id)).status).toBe(200)
      return order
    }
    let requests = 0
    const claim = (headers: Record<string, string>, orderId: string) =>
      api.post(
        `/partner/delivery-agent/available/${orderId}/claim`,
        { request_id: `revocation-claim-${++requests}` },
        { headers, validateStatus: () => true },
      )
    const revoke = (agentId: string, headers: Record<string, string> = admin) =>
      api.post(
        `/admin/delivery-agents/${agentId}/revoke`,
        {},
        { headers, validateStatus: () => true },
      )
    const attention = async () => {
      const response = await api.get("/admin/deliveries/attention", {
        headers: admin,
        validateStatus: () => true,
      })
      expect(response.status).toBe(200)
      return response.data.attention as Record<string, any>[]
    }
    const record = async (orderId: string) =>
      (await delivery().listIntendedDeliveries({ order_id: orderId }))[0]

    describe("POST /admin/delivery-agents/:id/revoke", () => {
      it("keeps the active assignment and its capacity, and raises attention at once", async () => {
        const order = await acceptedOrder()
        const agent = await agentFor()
        expect((await claim(agent.headers, order.id)).status).toBe(200)
        expect(await attention()).toEqual([])

        const response = await revoke(agent.id)
        expect(response.status).toBe(200)

        const [stored] = await delivery().listDeliveryAgents({ id: agent.id })
        expect(stored).toMatchObject({ status: "revoked", name: agent.name })
        expect(await record(order.id)).toMatchObject({
          assigned_agent_id: agent.id,
          active_agent_id: agent.id,
        })
        const listed = await attention()
        expect(listed).toHaveLength(1)
        expect(listed[0]).toMatchObject({
          type: "access_revoked",
          order_id: order.id,
          assignment: { agent: { id: agent.id, name: agent.name } },
        })
        expect(listed[0].assignment.agent.agent_access).toBe("revoked")
        expect(Date.parse(listed[0].raised_at)).toBeLessThanOrEqual(Date.now())
      })

      it("denies every further agent read and action, including a repeat claim", async () => {
        const order = await acceptedOrder()
        const other = await acceptedOrder()
        const agent = await agentFor()
        expect((await claim(agent.headers, order.id)).status).toBe(200)
        await revoke(agent.id)
        const denied = [
          await api.get("/partner/delivery-agent/me", {
            headers: agent.headers,
            validateStatus: () => true,
          }),
          await api.get("/partner/delivery-agent/current", {
            headers: agent.headers,
            validateStatus: () => true,
          }),
          await api.get("/partner/delivery-agent/available", {
            headers: agent.headers,
            validateStatus: () => true,
          }),
          await claim(agent.headers, order.id),
          await claim(agent.headers, other.id),
          await api.post(
            `/partner/deliveries/${order.id}/pickup`,
            { request_id: "revoked-pickup" },
            { headers: agent.headers, validateStatus: () => true },
          ),
        ]
        for (const response of denied) {
          expect(response.status).toBe(403)
          expect(response.data.message).toBe("delivery_agent_access_revoked")
        }
        expect((await record(other.id)).assigned_agent_id).toBeNull()
      })

      it("raises no attention when the agent holds no active delivery, and repeats change nothing", async () => {
        const agent = await agentFor()
        expect((await revoke(agent.id)).status).toBe(200)
        expect(await attention()).toEqual([])
        const order = await acceptedOrder()
        expect((await claim(agent.headers, order.id)).status).toBe(403)

        const busy = await agentFor()
        const held = await acceptedOrder()
        expect((await claim(busy.headers, held.id)).status).toBe(200)
        expect((await revoke(busy.id)).status).toBe(200)
        expect((await revoke(busy.id)).status).toBe(200)
        expect(await attention()).toHaveLength(1)
        expect(
          await delivery().listDeliveryAttentions({
            order_id: held.id,
            type: "access_revoked",
          }),
        ).toHaveLength(1)
      })

      it("is for operators only", async () => {
        const agent = await agentFor()
        expect((await revoke(agent.id, agent.headers)).status).toBe(401)
        expect((await revoke(agent.id, staff)).status).toBe(401)
        expect((await revoke(agent.id, {})).status).toBe(401)
        const [stored] = await delivery().listDeliveryAgents({ id: agent.id })
        expect(stored.status).toBe("authorized")
      })

      it("leaves the delivery assigned through later sweeps and resolves attention when the Order ends", async () => {
        const order = await acceptedOrder()
        const agent = await agentFor()
        await claim(agent.headers, order.id)
        await revoke(agent.id)
        await recoverDeliveryAttentionWorkflow(getContainer()).run({
          input: {
            now: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
          },
        })
        // Hours later the uncollected work is also overdue (#163).
        expect(
          (await attention()).map(({ type }: { type: string }) => type),
        ).toEqual(["access_revoked", "assigned_without_pickup"])
        expect(await record(order.id)).toMatchObject({
          assigned_agent_id: agent.id,
          active_agent_id: agent.id,
        })

        const [operation] = await operations().listOrderOperations({
          order_id: order.id,
        })
        await operations().updateOrderOperations({
          id: operation.id,
          state: "cancelled",
        })
        expect(await attention()).toEqual([])
        await recoverDeliveryAttentionWorkflow(getContainer()).run({
          input: {
            now: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
          },
        })
        const [stored] = await delivery().listDeliveryAttentions({
          order_id: order.id,
          type: "access_revoked",
        })
        expect(stored.resolution).toBe("order_ended")
      })

      it("leaves one consistent outcome when a claim races the revocation", async () => {
        const order = await acceptedOrder()
        const agent = await agentFor()
        const [claimed, revoked] = await Promise.all([
          claim(agent.headers, order.id),
          revoke(agent.id),
        ])
        expect(revoked.status).toBe(200)
        const stored = await record(order.id)
        if (claimed.status === 200) {
          // The claim committed first: responsibility is kept and visible.
          expect(stored.assigned_agent_id).toBe(agent.id)
          expect(await attention()).toHaveLength(1)
        } else {
          // Revocation committed first: the stale permission set up nothing.
          expect(claimed.status).toBe(403)
          expect(stored.assigned_agent_id).toBeNull()
          expect(await attention()).toEqual([])
        }
      })
    })

    describe("approved-area removal alone", () => {
      it("lets the responsible agent complete the current delivery, refuses new claims there and raises no attention", async () => {
        const order = await acceptedOrder()
        const agent = await agentFor()
        expect((await claim(agent.headers, order.id)).status).toBe(200)
        const edited = await api.post(
          `/admin/delivery-agents/${agent.id}/areas`,
          { postal_codes: [] },
          { headers: admin, validateStatus: () => true },
        )
        expect(edited.status).toBe(200)

        const current = await api.get("/partner/delivery-agent/current", {
          headers: agent.headers,
          validateStatus: () => true,
        })
        expect(current.status).toBe(200)
        expect(current.data.delivery.order_id).toBe(order.id)

        // The held delivery still moves forward: the agent collects the food.
        expect((await startPreparation(staff, order.id)).status).toBe(200)
        expect((await markReady(staff, order.id)).status).toBe(200)
        const picked = await api.post(
          `/partner/deliveries/${order.id}/pickup`,
          { request_id: "area-removed-pickup" },
          { headers: agent.headers, validateStatus: () => true },
        )
        expect(picked.status).toBe(200)
        expect((await record(order.id)).picked_up_by).toBe(agent.id)

        // New work in the removed area is refused for the area, before capacity.
        const next = await acceptedOrder()
        const refused = await claim(agent.headers, next.id)
        expect(refused.status).toBe(400)
        expect(refused.data.code).toBe("delivery_outside_approved_areas")
        expect((await record(next.id)).assigned_agent_id).toBeNull()

        expect(await attention()).toEqual([])
      })
    })
  },
})
