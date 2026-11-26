import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
} from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import type DeliveryModuleService from "../../src/modules/delivery/service"
import { endDeliveryWorkflow } from "../../src/workflows/delivery/terminal"
import { recoverOrderDeliveryOutcomesWorkflow } from "../../src/workflows/delivery/order-outcome"
import backfillOrderDeliveryOutcomes from "../../src/migration-scripts/order-delivery-outcomes"
import { recoverOrderDeliveryPickupsWorkflow } from "../../src/workflows/delivery/order-pickup"
import backfillOrderDeliveryPickups from "../../src/migration-scripts/order-delivery-pickups"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(240000)

/**
 * #204: the end of an Order's delivery moves it from the kitchen's In
 * progress view to History, with how and when the delivery ended. #254: the
 * agent's pickup reaches the kitchen before that, with its time only.
 */
medusaIntegrationTestRunner({
  dbName: "medusa_ci_partner_order_delivery_outcome_http",
  env: { JWT_SECRET: "ci-only-delivery-outcome-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer, dbUtils }) => {
    const harness = restaurantOrdersHarness({ api, getContainer, dbUtils })
    const {
      placePaidOrder,
      signInAsStaffOf,
      accept,
      startPreparation,
      markReady,
      queue,
      detail,
      recordOf,
      operations,
    } = harness
    let pizzeriaId: string
    let burgerId: string
    let staff: Record<string, string>
    beforeEach(async () => {
      ;({ pizzeriaId, burgerId } = harness.seeded())
      staff = (await signInAsStaffOf(pizzeriaId, "outcome-staff@example.test"))
        .headers
    })

    const delivery = () =>
      getContainer().resolve<DeliveryModuleService>(DELIVERY_MODULE)
    let agents = 0
    const agentFor = async () => {
      agents += 1
      const agent = await delivery().createDeliveryAgents({
        name: `Outcome agent ${agents}`,
        email: `outcome-agent-${agents}@example.test`,
        status: "authorized",
        invited_by: "operator",
      })
      await delivery().createDeliveryAgentAreas([
        { agent_id: agent.id, postal_code: "2200" },
      ])
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
      return { authorization: `Bearer ${token}` }
    }
    let requests = 0
    const post = (path: string, headers: Record<string, string>) =>
      api.post(
        path,
        { request_id: `outcome-${++requests}` },
        { headers, validateStatus: () => true },
      )

    /** A ready Order claimed by an agent who has not collected it yet. */
    const readyOrder = async () => {
      const order = await placePaidOrder(pizzeriaId)
      expect((await accept(staff, order.id)).status).toBe(200)
      const agent = await agentFor()
      const claimed = await post(
        `/partner/delivery-agent/available/${order.id}/claim`,
        agent,
      )
      expect(claimed.status).toBe(200)
      expect((await startPreparation(staff, order.id)).status).toBe(200)
      expect((await markReady(staff, order.id)).status).toBe(200)
      return { order, agent }
    }
    const pickUp = (agent: Record<string, string>, orderId: string) =>
      post(`/partner/deliveries/${orderId}/pickup`, agent)
    /** A ready Order collected by its agent, still in the kitchen's In progress. */
    const collectedOrder = async () => {
      const { order, agent } = await readyOrder()
      expect((await pickUp(agent, order.id)).status).toBe(200)
      return { order, agent }
    }
    const deliver = (agent: Record<string, string>, orderId: string) =>
      post(`/partner/deliveries/${orderId}/deliver`, agent)
    const idsIn = async (search: string) => {
      const response = await queue(staff, search)
      expect(response.status).toBe(200)
      return (response.data.orders as { id: string }[]).map(({ id }) => id)
    }
    /** The ended delivery as if the process stopped before the Order heard of it. */
    const interruptBeforeOrderRecord = async (order_id: string) => {
      const record = await recordOf(order_id)
      await operations().updateOrderOperations({
        id: record.id,
        delivery_outcome: null,
        delivery_ended_at: null,
      })
      await delivery().updateIntendedDeliveries({
        selector: { order_id },
        data: { order_outcome_recorded_at: null },
      })
    }
    const terminalAtOf = async (order_id: string) =>
      (await delivery().listIntendedDeliveries({ order_id }))[0].terminal_at
    const pickedUpAtOf = async (order_id: string) =>
      new Date(
        (await delivery().listIntendedDeliveries({ order_id }))[0]
          .picked_up_at as Date,
      ).toISOString()
    /** The pickup as if the process stopped before the Order heard of it. */
    const interruptBeforePickupRecord = async (order_id: string) => {
      const record = await recordOf(order_id)
      await operations().updateOrderOperations({
        id: record.id,
        delivery_picked_up_at: null,
      })
      await delivery().updateIntendedDeliveries({
        selector: { order_id },
        data: { order_pickup_recorded_at: null },
      })
    }

    describe("after the agent confirms pickup", () => {
      it("shows the pickup time in In progress and the Order, once, under a newer revision", async () => {
        const { order, agent } = await readyOrder()
        const before = await recordOf(order.id)

        expect((await pickUp(agent, order.id)).status).toBe(200)

        const pickedUpAt = await pickedUpAtOf(order.id)
        const expected = {
          picked_up_at: pickedUpAt,
          outcome: null,
          ended_at: null,
        }
        const active = await queue(staff, "?view=active")
        const row = active.data.orders.find(
          ({ id }: { id: string }) => id === order.id,
        )
        expect(row).toMatchObject({ state: "ready", delivery: expected })
        const read = await detail(staff, order.id)
        expect(read.data.order.delivery).toEqual(expected)
        // The kitchen feed announces the pickup through a newer revision.
        const after = await recordOf(order.id)
        expect(after.revision).toBe(before.revision + 1)

        // A retry of the pickup keeps the one time and announces nothing new.
        expect((await pickUp(agent, order.id)).status).toBe(200)
        expect((await recordOf(order.id)).revision).toBe(after.revision)
        expect((await detail(staff, order.id)).data.order.delivery).toEqual(
          expected,
        )
      })

      it("never shows the agent's name or position to the Restaurant", async () => {
        const { order } = await collectedOrder()
        const read = JSON.stringify((await detail(staff, order.id)).data)
        expect(read).not.toContain("Outcome agent")
        expect(read).not.toContain("outcome-agent-")
        expect(read).not.toMatch(/latitude|longitude|agent_id|picked_up_by/)
      })

      it("keeps the pickup time once the delivery ends", async () => {
        const { order, agent } = await collectedOrder()
        expect((await deliver(agent, order.id)).status).toBe(200)

        expect((await detail(staff, order.id)).data.order.delivery).toEqual({
          picked_up_at: await pickedUpAtOf(order.id),
          outcome: "delivered",
          ended_at: new Date(
            (await terminalAtOf(order.id)) as Date,
          ).toISOString(),
        })
      })
    })

    describe("recovery of the pickup owed to the Order", () => {
      it("records a pickup the Order never heard of, once, at the pickup's own time", async () => {
        const { order } = await collectedOrder()
        await interruptBeforePickupRecord(order.id)
        expect((await detail(staff, order.id)).data.order.delivery).toBeNull()

        const { result } = await recoverOrderDeliveryPickupsWorkflow(
          getContainer(),
        ).run({ input: {} })
        expect(result.recorded).toEqual([order.id])
        const record = await recordOf(order.id)
        expect(
          (await detail(staff, order.id)).data.order.delivery.picked_up_at,
        ).toBe(await pickedUpAtOf(order.id))

        const repeat = await recoverOrderDeliveryPickupsWorkflow(
          getContainer(),
        ).run({ input: {} })
        expect(repeat.result.recorded).toEqual([])
        expect((await recordOf(order.id)).revision).toBe(record.revision)
      })

      it("backfills pickups made before the Order recorded them when migrations run", async () => {
        const { order } = await collectedOrder()
        await interruptBeforePickupRecord(order.id)

        await backfillOrderDeliveryPickups({ container: getContainer() })

        expect(
          (await detail(staff, order.id)).data.order.delivery.picked_up_at,
        ).toBe(await pickedUpAtOf(order.id))
      })
    })

    describe("after the agent confirms handover", () => {
      it("moves the Order from In progress to History as delivered, with the handover time, under a newer revision", async () => {
        const { order, agent } = await collectedOrder()
        expect(await idsIn("?view=active")).toContain(order.id)
        const before = await recordOf(order.id)

        expect((await deliver(agent, order.id)).status).toBe(200)

        const active = await queue(staff, "?view=active")
        expect(
          active.data.orders.map(({ id }: { id: string }) => id),
        ).not.toContain(order.id)
        expect(active.data.count).toBe(0)
        const history = await queue(staff, "?view=history")
        const row = history.data.orders.find(
          ({ id }: { id: string }) => id === order.id,
        )
        const endedAt = (await terminalAtOf(order.id)) as Date
        expect(row).toMatchObject({
          state: "ready",
          cancellation: null,
          delivery: {
            outcome: "delivered",
            ended_at: new Date(endedAt).toISOString(),
          },
        })
        // The kitchen feed announces the change through a newer revision.
        expect((await recordOf(order.id)).revision).toBe(before.revision + 1)
        const read = await detail(staff, order.id)
        expect(read.data.order.delivery).toEqual(row.delivery)
        expect(read.data.order.available_actions).toEqual([])
      })

      it("finds it with the Delivered filter and Order search, and not with Not delivered or a cancellation reason", async () => {
        const { order, agent } = await collectedOrder()
        expect((await deliver(agent, order.id)).status).toBe(200)

        expect(await idsIn("?view=history&delivery_outcome=delivered")).toEqual(
          [order.id],
        )
        expect(await idsIn(`?view=history&q=${order.display_id}`)).toEqual([
          order.id,
        ])
        expect(
          await idsIn("?view=history&delivery_outcome=not_delivered"),
        ).toEqual([])
        expect(
          await idsIn("?view=history&cancellation_category=customer_cancelled"),
        ).toEqual([])
      })

      it("refuses an unknown delivery outcome filter", async () => {
        const response = await queue(
          staff,
          "?view=history&delivery_outcome=lost",
        )
        expect(response.status).toBe(400)
      })

      it("never shows the Order to another Restaurant's staff", async () => {
        const { order, agent } = await collectedOrder()
        expect((await deliver(agent, order.id)).status).toBe(200)
        const other = (
          await signInAsStaffOf(burgerId, "outcome-other@example.test")
        ).headers

        for (const view of ["active", "history"]) {
          const response = await queue(other, `?view=${view}`)
          expect(
            response.data.orders.map(({ id }: { id: string }) => id),
          ).not.toContain(order.id)
        }
        const searched = await queue(
          other,
          `?view=history&q=${order.display_id}&delivery_outcome=delivered`,
        )
        expect(searched.data.orders).toEqual([])
        expect((await detail(other, order.id)).status).toBe(404)
      })
    })

    describe("when the delivery ends without handover", () => {
      it("moves the Order to History as not delivered", async () => {
        const { order } = await collectedOrder()
        await endDeliveryWorkflow(getContainer()).run({
          input: { order_id: order.id, outcome: "failed", actor_id: "user_1" },
        })

        expect(await idsIn("?view=active")).not.toContain(order.id)
        expect(
          await idsIn("?view=history&delivery_outcome=not_delivered"),
        ).toEqual([order.id])
        const read = await detail(staff, order.id)
        expect(read.data.order.delivery).toEqual({
          picked_up_at: await pickedUpAtOf(order.id),
          outcome: "not_delivered",
          ended_at: new Date(
            (await terminalAtOf(order.id)) as Date,
          ).toISOString(),
        })
      })
    })

    describe("recovery of the outcome owed to the Order", () => {
      it("records an ended delivery the Order never heard of, once, at the delivery's own time", async () => {
        const { order, agent } = await collectedOrder()
        expect((await deliver(agent, order.id)).status).toBe(200)
        await interruptBeforeOrderRecord(order.id)
        expect(await idsIn("?view=active")).toContain(order.id)

        const { result } = await recoverOrderDeliveryOutcomesWorkflow(
          getContainer(),
        ).run({ input: {} })
        expect(result.recorded).toEqual([order.id])
        const record = await recordOf(order.id)
        expect(record).toMatchObject({
          delivery_outcome: "delivered",
          delivery_ended_at: await terminalAtOf(order.id),
        })
        expect(await idsIn("?view=active")).not.toContain(order.id)

        // Nothing is owed any more, so a repeat writes nothing.
        const repeat = await recoverOrderDeliveryOutcomesWorkflow(
          getContainer(),
        ).run({ input: {} })
        expect(repeat.result.recorded).toEqual([])
        expect((await recordOf(order.id)).revision).toBe(record.revision)
      })

      it("backfills deliveries that ended before the Order recorded them when migrations run", async () => {
        const delivered = await collectedOrder()
        expect(
          (await deliver(delivered.agent, delivered.order.id)).status,
        ).toBe(200)
        const failed = await collectedOrder()
        await endDeliveryWorkflow(getContainer()).run({
          input: {
            order_id: failed.order.id,
            outcome: "failed",
            actor_id: "user_1",
          },
        })
        await interruptBeforeOrderRecord(delivered.order.id)
        await interruptBeforeOrderRecord(failed.order.id)

        await backfillOrderDeliveryOutcomes({ container: getContainer() })

        expect((await recordOf(delivered.order.id)).delivery_outcome).toBe(
          "delivered",
        )
        expect((await recordOf(failed.order.id)).delivery_outcome).toBe(
          "not_delivered",
        )
        expect(await idsIn("?view=active")).toEqual([])
      })
    })
  },
})
