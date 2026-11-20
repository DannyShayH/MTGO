import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import type DeliveryModuleService from "../../src/modules/delivery/service"
import { recoverDeliveryFulfillmentsWorkflow } from "../../src/workflows/delivery/native-fulfillment"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(240000)

medusaIntegrationTestRunner({
  dbName: "medusa_ci_delivery_pickup_http",
  env: { JWT_SECRET: "ci-only-delivery-pickup-secret", REDIS_URL: "" },
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
    let pizzeriaId: string
    let staff: Record<string, string>
    beforeEach(async () => {
      ;({ pizzeriaId } = harness.seeded())
      staff = (await signInAsStaffOf(pizzeriaId, "pickup-staff@example.test"))
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
        name: `Pickup agent ${agents}`,
        email: `pickup-agent-${agents}@example.test`,
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
    const claim = (headers: Record<string, string>, orderId: string) =>
      api.post(
        `/partner/delivery-agent/available/${orderId}/claim`,
        { request_id: `claim-${++requests}` },
        { headers, validateStatus: () => true },
      )
    const pickup = (
      headers: Record<string, string>,
      orderId: string,
      body: Record<string, unknown> = { request_id: `pickup-${++requests}` },
    ) =>
      api.post(`/partner/deliveries/${orderId}/pickup`, body, {
        headers,
        validateStatus: () => true,
      })
    const current = (headers: Record<string, string>) =>
      api.get("/partner/delivery-agent/current", {
        headers,
        validateStatus: () => true,
      })
    /** An accepted Order the agent is responsible for, prepared to `until`. */
    const claimedOrder = async (until: "accepted" | "preparing" | "ready") => {
      const order = await placePaidOrder(pizzeriaId)
      expect((await accept(staff, order.id)).status).toBe(200)
      const agent = await agentFor()
      expect((await claim(agent.headers, order.id)).status).toBe(200)
      if (until !== "accepted")
        expect((await startPreparation(staff, order.id)).status).toBe(200)
      if (until === "ready")
        expect((await markReady(staff, order.id)).status).toBe(200)
      return { order, agent }
    }
    const nativeOrder = async (order_id: string) => {
      const { data } = await query().graph({
        entity: "order",
        fields: [
          "fulfillments.id",
          "fulfillments.location_id",
          "fulfillments.shipped_at",
          "fulfillments.delivered_at",
        ],
        filters: { id: order_id },
      })
      return data[0] as unknown as {
        fulfillments: {
          id: string
          location_id: string
          shipped_at: string | null
          delivered_at: string | null
        }[]
      }
    }
    /** The stock location the starter's delivery service zone belongs to. */
    const configuredLocationId = async () => {
      const { data } = await query().graph({
        entity: "stock_location",
        fields: ["id", "fulfillment_sets.id"],
      })
      const configured = (
        data as { id: string; fulfillment_sets?: unknown[] }[]
      ).filter(({ fulfillment_sets }) => fulfillment_sets?.length)
      expect(configured).toHaveLength(1)
      return configured[0].id
    }

    describe("POST /partner/deliveries/:id/pickup", () => {
      it("records the responsible agent's collection of ready food once and ships the native Order from its pickup location", async () => {
        const { order, agent } = await claimedOrder("ready")
        const before = (await current(agent.headers)).data.delivery
        expect(before).toMatchObject({
          preparation_status: "ready",
          picked_up_at: null,
          allowed_actions: ["confirm_pickup"],
        })

        const started = Date.now()
        const picked = await pickup(agent.headers, order.id, {
          request_id: "pickup-tap",
        })
        expect(picked.status).toBe(200)
        const pickedUpAt = picked.data.delivery.picked_up_at
        expect(new Date(pickedUpAt).getTime()).toBeGreaterThanOrEqual(
          started - 1000,
        )
        // Once collected, the next step is handover (#161).
        expect(picked.data.delivery).toMatchObject({
          order_id: order.id,
          allowed_actions: ["confirm_handover"],
        })
        expect((await current(agent.headers)).data.delivery).toEqual(
          picked.data.delivery,
        )

        // A double tap or a retry after a lost response keeps the original.
        for (const request_id of ["pickup-tap", "pickup-second-tap"]) {
          const repeat = await pickup(agent.headers, order.id, { request_id })
          expect(repeat.status).toBe(200)
          expect(repeat.data.delivery.picked_up_at).toBe(pickedUpAt)
        }

        // Readiness stays the kitchen's own fact, separate from pickup.
        const [operation] = await operations().listOrderOperations({
          order_id: order.id,
        })
        expect(operation.state).toBe("ready")
        expect(new Date(operation.ready_at!).getTime()).toBeLessThanOrEqual(
          new Date(pickedUpAt).getTime(),
        )

        // One native fulfillment, shipped from the configured location, not delivered.
        const native = await nativeOrder(order.id)
        expect(native.fulfillments).toHaveLength(1)
        expect(native.fulfillments[0]).toMatchObject({
          location_id: await configuredLocationId(),
          shipped_at: expect.anything(),
          delivered_at: null,
        })
        const admin = await api.get(
          `/admin/orders/${order.id}?fields=fulfillment_status`,
          { headers: harness.seeded().admin },
        )
        expect(admin.data.order.fulfillment_status).toBe("shipped")
        const [record] = await delivery().listIntendedDeliveries({
          order_id: order.id,
        })
        expect(record).toMatchObject({
          picked_up_by: agent.id,
          pickup_request_id: "pickup-tap",
          native_fulfillment_id: native.fulfillments[0].id,
        })
      })

      it("keeps pickup unavailable until the Restaurant records the food ready, while claiming did not wait", async () => {
        const { order, agent } = await claimedOrder("accepted")
        for (const step of ["accepted", "preparing"] as const) {
          if (step === "preparing")
            expect((await startPreparation(staff, order.id)).status).toBe(200)
          expect((await current(agent.headers)).data.delivery).toMatchObject({
            preparation_status: step,
            picked_up_at: null,
            allowed_actions: [],
          })
          const early = await pickup(agent.headers, order.id)
          expect(early.status).toBe(400)
          expect(early.data.code).toBe("food_not_ready")
        }
        expect((await nativeOrder(order.id)).fulfillments ?? []).toEqual([])

        expect((await markReady(staff, order.id)).status).toBe(200)
        expect((await pickup(agent.headers, order.id)).status).toBe(200)
      })

      it("refuses other agents, unassigned work, other actors and unknown Orders without recording anything", async () => {
        const { order, agent } = await claimedOrder("ready")
        const other = await agentFor()
        const foreign = await pickup(other.headers, order.id)
        expect(foreign.status).toBe(400)
        expect(foreign.data.code).toBe("delivery_not_responsible")

        const unassigned = await placePaidOrder(pizzeriaId)
        expect((await accept(staff, unassigned.id)).status).toBe(200)
        expect((await startPreparation(staff, unassigned.id)).status).toBe(200)
        expect((await markReady(staff, unassigned.id)).status).toBe(200)
        const unclaimed = await pickup(other.headers, unassigned.id)
        expect(unclaimed.status).toBe(400)
        expect(unclaimed.data.code).toBe("delivery_not_responsible")

        // Restaurant staff and anonymous callers are not delivery agents.
        expect((await pickup(staff, order.id)).status).toBe(401)
        expect((await pickup({}, order.id)).status).toBe(401)
        const awaiting = await placePaidOrder(pizzeriaId)
        expect((await pickup(agent.headers, awaiting.id)).status).toBe(404)
        expect((await pickup(agent.headers, "order_unknown")).status).toBe(404)
        // A delivery-agent identity without an agent record has no access.
        const stranger = {
          authorization: tokenFor("agent_unknown", "delivery_agent"),
        }
        expect((await pickup(stranger, order.id)).status).toBe(403)
        // The body sets nothing but the retry identity.
        const forged = await pickup(agent.headers, order.id, {
          request_id: "forged",
          picked_up_at: "2020-01-01T00:00:00Z",
        })
        expect(forged.status).toBe(400)

        const [record] = await delivery().listIntendedDeliveries({
          order_id: order.id,
        })
        expect(record.picked_up_at).toBeNull()
        expect((await nativeOrder(order.id)).fulfillments ?? []).toEqual([])
      })

      it("refuses cancelled work and revoked agents, even as a repeat of a recorded pickup", async () => {
        const { order, agent } = await claimedOrder("ready")
        expect((await pickup(agent.headers, order.id)).status).toBe(200)
        const [operation] = await operations().listOrderOperations({
          order_id: order.id,
        })
        await operations().updateOrderOperations({
          id: operation.id,
          state: "cancelled",
        })
        const late = await pickup(agent.headers, order.id)
        expect(late.status).toBe(400)
        expect(late.data.code).toBe("delivery_not_active")

        const second = await claimedOrder("ready")
        await delivery().revokeAgent({
          agent_id: second.agent.id,
          revoked_by: "operator",
        })
        const revoked = await pickup(second.agent.headers, second.order.id)
        expect(revoked.status).toBe(403)
        const [record] = await delivery().listIntendedDeliveries({
          order_id: second.order.id,
        })
        expect(record.picked_up_at).toBeNull()
      })

      it("refuses a retry identity already used for another delivery's pickup", async () => {
        const first = await claimedOrder("ready")
        const second = await claimedOrder("ready")
        expect(
          (
            await pickup(first.agent.headers, first.order.id, {
              request_id: "shared-id",
            })
          ).status,
        ).toBe(200)
        const reused = await pickup(second.agent.headers, second.order.id, {
          request_id: "shared-id",
        })
        expect(reused.status).toBe(409)
        expect(reused.data.code).toBe("pickup_request_reused")
      })

      it("refuses a stale decision with delivery_changed and keeps the original milestone, even if the locks were lost", async () => {
        const { order, agent } = await claimedOrder("ready")
        const picked = await pickup(agent.headers, order.id)
        expect(picked.status).toBe(200)
        // A decision made on a stale read, as if the locks had been lost: the
        // guarded write itself still requires an unrecorded milestone.
        const stale = await delivery().recordPickup(
          {
            order_id: order.id,
            agent_id: agent.id,
            request_id: "stale-decision",
            order: { state: "ready", ready_at: new Date() },
            now: new Date(Date.now() + 60000),
          },
          () => ({ outcome: "pick_up" }),
        )
        expect(stale.outcome).toEqual({
          outcome: "refused",
          code: "delivery_changed",
        })
        const [record] = await delivery().listIntendedDeliveries({
          order_id: order.id,
        })
        expect(new Date(record.picked_up_at!).toISOString()).toBe(
          picked.data.delivery.picked_up_at,
        )
        expect(record.pickup_request_id).not.toBe("stale-decision")
      })

      it("records one pickup and one native fulfillment when competing requests arrive at once", async () => {
        const { order, agent } = await claimedOrder("ready")
        const results = await Promise.all(
          ["race-a", "race-b", "race-c"].map((request_id) =>
            pickup(agent.headers, order.id, { request_id }),
          ),
        )
        expect(results.map(({ status }) => status)).toEqual([200, 200, 200])
        const times = new Set(
          results.map(({ data }) => data.delivery.picked_up_at),
        )
        expect(times.size).toBe(1)
        expect((await nativeOrder(order.id)).fulfillments).toHaveLength(1)
      })
    })

    describe("recovery of native fulfillment owed by a pickup", () => {
      const recover = () =>
        recoverDeliveryFulfillmentsWorkflow(getContainer()).run({ input: {} })

      it("keeps the pickup when no pickup location is configured, requeues the owed fulfillment and finishes it once configured", async () => {
        const { order, agent } = await claimedOrder("ready")
        const { data: sets } = await query().graph({
          entity: "fulfillment_set",
          fields: ["id", "location.id"],
        })
        const configured = (
          sets as { id: string; location?: { id: string } | null }[]
        ).filter(({ location }) => location?.id)
        const link = getContainer().resolve(ContainerRegistrationKeys.LINK)
        const links = configured.map(({ id, location }) => ({
          [Modules.STOCK_LOCATION]: { stock_location_id: location!.id },
          [Modules.FULFILLMENT]: { fulfillment_set_id: id },
        }))
        await link.dismiss(links)

        const picked = await pickup(agent.headers, order.id)
        expect(picked.status).toBe(200)
        expect(picked.data.delivery.picked_up_at).toBeTruthy()
        expect((await nativeOrder(order.id)).fulfillments ?? []).toEqual([])
        const [owed] = await delivery().listIntendedDeliveries({
          order_id: order.id,
        })
        expect(owed.native_fulfillment_id).toBeNull()

        // A failed sweep moves the obligation behind newer work.
        expect((await recover()).result.synced).not.toContain(order.id)
        const [requeued] = await delivery().listIntendedDeliveries({
          order_id: order.id,
        })
        expect(
          new Date(requeued.native_sync_queued_at!).getTime(),
        ).toBeGreaterThan(new Date(owed.native_sync_queued_at!).getTime())

        await link.create(links)
        expect((await recover()).result.synced).toContain(order.id)
        expect((await nativeOrder(order.id)).fulfillments[0]).toMatchObject({
          location_id: await configuredLocationId(),
        })
      })

      it("creates the owed fulfillment after an interruption between the milestone and synchronization", async () => {
        const { order, agent } = await claimedOrder("ready")
        // The milestone committed; the process stopped before native sync.
        const [record] = await delivery().listIntendedDeliveries({
          order_id: order.id,
        })
        await delivery().updateIntendedDeliveries({
          id: record.id,
          picked_up_at: new Date(),
          picked_up_by: agent.id,
          pickup_request_id: "interrupted",
        })
        expect((await nativeOrder(order.id)).fulfillments ?? []).toEqual([])

        const { result } = await recover()
        expect(result.synced).toContain(order.id)
        const native = await nativeOrder(order.id)
        expect(native.fulfillments).toHaveLength(1)
        expect(native.fulfillments[0].shipped_at).toBeTruthy()
        // A second sweep owes nothing more.
        expect((await recover()).result.synced).not.toContain(order.id)
        expect((await nativeOrder(order.id)).fulfillments).toHaveLength(1)
      })

      it("finds the existing fulfillment when its record was lost, instead of fulfilling twice", async () => {
        const { order, agent } = await claimedOrder("ready")
        expect((await pickup(agent.headers, order.id)).status).toBe(200)
        const [record] = await delivery().listIntendedDeliveries({
          order_id: order.id,
        })
        const fulfillmentId = record.native_fulfillment_id
        await delivery().updateIntendedDeliveries({
          id: record.id,
          native_fulfillment_id: null,
        })

        expect((await recover()).result.synced).toContain(order.id)
        const native = await nativeOrder(order.id)
        expect(native.fulfillments.map(({ id }) => id)).toEqual([fulfillmentId])
        const [after] = await delivery().listIntendedDeliveries({
          order_id: order.id,
        })
        expect(after.native_fulfillment_id).toBe(fulfillmentId)
      })
    })
  },
})
