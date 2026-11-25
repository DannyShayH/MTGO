import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import type DeliveryModuleService from "../../src/modules/delivery/service"
import {
  recoverOrderOperationsWorkflow,
  startPartnerOrderPreparationWorkflow,
} from "../../src/workflows/order-operations"
import { captureLogRecords } from "../helpers/log-records"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(240000)

type Headers = Record<string, string>

medusaIntegrationTestRunner({
  dbName: "medusa_ci_order_milestone_events_http",
  env: { JWT_SECRET: "ci-only-milestone-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer, dbUtils }) => {
    const harness = restaurantOrdersHarness({ api, getContainer, dbUtils })
    const {
      placePaidOrder,
      reviewedCartOf,
      complete,
      signInAsStaffOf,
      accept,
      reject,
      startPreparation,
      markReady,
      cancel,
    } = harness
    const { records } = captureLogRecords()
    let pizzeriaId: string
    let staff: { staffId: string; headers: Headers }
    let operator: { id: string; headers: Headers }
    const delivery = () =>
      getContainer().resolve<DeliveryModuleService>(DELIVERY_MODULE)
    const tokenFor = (actor_id: string, actor_type: string) => ({
      authorization: `Bearer ${generateJwtToken(
        { actor_id, actor_type, auth_identity_id: "auth_test" },
        {
          secret: getContainer().resolve(
            ContainerRegistrationKeys.CONFIG_MODULE,
          ).projectConfig.http.jwtSecret,
          expiresIn: "1h",
        },
      )}`,
    })
    beforeEach(async () => {
      ;({ pizzeriaId } = harness.seeded())
      staff = await signInAsStaffOf(pizzeriaId, "milestones@example.test")
      const user = await getContainer()
        .resolve(Modules.USER)
        .createUsers({ email: "milestone-operator@example.test" })
      operator = { id: user.id, headers: tokenFor(user.id, "user") }
    })

    const authorizedAgent = async () => {
      const agent = await delivery().createDeliveryAgents({
        name: "Milestone agent",
        email: "milestone-agent@example.test",
        status: "authorized",
        invited_by: "operator",
      })
      await delivery().createDeliveryAgentAreas([
        { agent_id: agent.id, postal_code: "2200" },
      ])
      return { id: agent.id, headers: tokenFor(agent.id, "delivery_agent") }
    }
    const post = (
      path: string,
      headers: Headers,
      body: Record<string, unknown> = {},
    ) => api.post(path, body, { headers, validateStatus: () => true })
    /** The Order's milestone records in order, without time and formatting. */
    const milestonesOf = (order_id: string) =>
      records()
        .filter(
          (record) =>
            record.order_id === order_id &&
            /^(order|delivery)\./.test(record.event),
        )
        .map(({ time, timestamp, message, ...record }) => record)
    const milestone = (
      event: string,
      msg: string,
      order_id: string,
      rest: Record<string, unknown>,
    ) => ({
      level: "info",
      service: "backend",
      env: "test",
      event,
      msg,
      order_id,
      restaurant_id: pizzeriaId,
      ...rest,
    })

    it("follows one Order from placement to handover by its ID, once each", async () => {
      const order = await placePaidOrder(pizzeriaId)
      const agent = await authorizedAgent()
      // Every action is repeated: a repeat returns the recorded milestone.
      const twice = async (act: () => Promise<{ status: number }>) => {
        expect((await act()).status).toBe(200)
        expect((await act()).status).toBe(200)
      }
      await twice(() => accept(staff.headers, order.id))
      await twice(() =>
        post(
          `/partner/delivery-agent/available/${order.id}/claim`,
          agent.headers,
          { request_id: "claim" },
        ),
      )
      await twice(() => startPreparation(staff.headers, order.id))
      await twice(() => markReady(staff.headers, order.id))
      await twice(() =>
        post(`/partner/deliveries/${order.id}/pickup`, agent.headers, {
          request_id: "pickup",
        }),
      )
      await twice(() =>
        post(`/partner/deliveries/${order.id}/deliver`, agent.headers, {
          request_id: "deliver",
        }),
      )

      const byStaff = {
        actor_type: "restaurant_staff",
        actor_id: staff.staffId,
      }
      const byAgent = { actor_type: "delivery_agent", actor_id: agent.id }
      expect(milestonesOf(order.id)).toEqual([
        milestone("order.placed", "Order placed", order.id, {
          actor_type: "customer",
        }),
        milestone("order.accepted", "Order accepted", order.id, byStaff),
        milestone("delivery.assigned", "Delivery assigned", order.id, byAgent),
        milestone(
          "order.preparation_started",
          "Order preparation started",
          order.id,
          byStaff,
        ),
        milestone("order.ready", "Order ready", order.id, byStaff),
        milestone(
          "delivery.picked_up",
          "Delivery picked up",
          order.id,
          byAgent,
        ),
        milestone(
          "delivery.handed_over",
          "Delivery handed over",
          order.id,
          byAgent,
        ),
      ])
    })

    it("names the operator who assigned a Delivery", async () => {
      const order = await placePaidOrder(pizzeriaId)
      const agent = await authorizedAgent()
      await accept(staff.headers, order.id)
      const assigned = await post(
        `/admin/deliveries/${order.id}/assign`,
        operator.headers,
        { agent_id: agent.id, request_id: "assign" },
      )
      expect(assigned.status).toBe(200)
      expect(milestonesOf(order.id).at(-1)).toEqual(
        milestone("delivery.assigned", "Delivery assigned", order.id, {
          actor_type: "user",
          actor_id: operator.id,
        }),
      )
    })

    const recover = (now: Date) =>
      recoverOrderOperationsWorkflow(getContainer()).run({
        input: { now: now.toISOString() },
      })
    const cancelled = (order_id: string, rest: Record<string, unknown>) =>
      milestone("order.cancelled", "Order cancelled", order_id, rest)

    it.each([
      {
        category: "restaurant_rejected",
        reason: "EP: staff reject with a private note",
        act: async (id: string) => {
          await reject(staff.headers, id, { reason: "secret-note" })
          await reject(staff.headers, id, { reason: "secret-note" })
        },
        actor: () => ({
          actor_type: "restaurant_staff",
          actor_id: staff.staffId,
        }),
      },
      {
        category: "customer_cancelled",
        reason: "EP: the Customer cancels, and is never named",
        act: async (id: string) => {
          await cancel(harness.seeded().customer, id)
          await cancel(harness.seeded().customer, id)
        },
        actor: () => ({ actor_type: "customer" }),
      },
      {
        category: "acceptance_timeout",
        reason: "EP: the recovery sweep expires an unaccepted Order",
        act: async (id: string) => {
          const { acceptance_deadline } = await harness.recordOf(id)
          const deadline = new Date(acceptance_deadline as Date)
          await recover(deadline)
          await recover(deadline)
        },
        actor: () => ({ actor_type: "system", actor_id: "system" }),
      },
      {
        category: "unassigned_timeout",
        reason: "EP: the recovery sweep expires an unassigned Delivery",
        act: async (id: string) => {
          await accept(staff.headers, id)
          const [work] = await delivery().listIntendedDeliveries({
            order_id: id,
          })
          const deadline = new Date(work.claim_deadline)
          await recover(deadline)
          await recover(deadline)
        },
        actor: () => ({ actor_type: "system", actor_id: "system" }),
      },
      {
        category: "operator_cancelled",
        reason: "EP: an operator cancels with a private reason",
        act: async (id: string) => {
          await accept(staff.headers, id)
          const path = `/admin/orders/${id}/operator-cancel`
          await post(path, operator.headers, { reason: "secret-note" })
          await post(path, operator.headers, { reason: "secret-note" })
        },
        actor: () => ({ actor_type: "user", actor_id: operator.id }),
      },
    ])("$reason: one cancellation as $category", async (example) => {
      const order = await placePaidOrder(pizzeriaId)
      await example.act(order.id)
      expect(
        milestonesOf(order.id).filter(
          ({ event }) => event === "order.cancelled",
        ),
      ).toEqual([
        cancelled(order.id, {
          ...example.actor(),
          category: example.category,
        }),
      ])
      expect(JSON.stringify(milestonesOf(order.id))).not.toContain("secret")
      expect(JSON.stringify(milestonesOf(order.id))).not.toContain(
        harness.seeded().customerId,
      )
    })

    it("undoes nothing when a repeated request fails in a later step", async () => {
      const order = await placePaidOrder(pizzeriaId)
      await accept(staff.headers, order.id)
      await startPreparation(staff.headers, order.id)
      const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
      const graph = query.graph.bind(query)
      jest.spyOn(query, "graph").mockImplementation((config, ...rest) => {
        if ((config as { entity: string }).entity === "order")
          throw new Error("synthetic failure")
        return graph(config as never, ...(rest as []))
      })
      const { transaction, errors } =
        await startPartnerOrderPreparationWorkflow(getContainer()).run({
          input: { staff_id: staff.staffId, order_id: order.id },
          throwOnError: false,
        })
      expect(errors).toHaveLength(1)
      expect(transaction.getState()).toBe("reverted")
      expect((await harness.recordOf(order.id)).state).toBe("preparing")
    })

    it("keeps the business outcome when a record cannot be written", async () => {
      const logger = getContainer().resolve(ContainerRegistrationKeys.LOGGER)
      const write = logger.log.bind(logger)
      jest.spyOn(logger, "log").mockImplementation((...args: unknown[]) => {
        if (/^(Order|Delivery) /.test(String(args[1])))
          throw new Error("synthetic log failure")
        write(...args)
      })
      const order = await placePaidOrder(pizzeriaId)
      expect((await accept(staff.headers, order.id)).status).toBe(200)
      expect(await harness.recordOf(order.id)).toMatchObject({
        state: "accepted",
      })
    })

    it("logs no acceptance when a later step undoes it", async () => {
      const order = await placePaidOrder(pizzeriaId)
      jest
        .spyOn(delivery(), "establishDelivery")
        .mockRejectedValue(new Error("synthetic failure"))
      expect((await accept(staff.headers, order.id)).status).toBe(500)
      expect(milestonesOf(order.id).map(({ event }) => event)).toEqual([
        "order.placed",
      ])
    })

    it("logs no placement when a later step undoes it", async () => {
      const { cartId } = await reviewedCartOf(pizzeriaId)
      const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
      const graph = query.graph.bind(query)
      jest
        .spyOn(query, "graph")
        .mockImplementation(
          (config: { entity: string; fields: string[] }, ...rest) => {
            if (config.fields.includes("order_operation.acceptance_deadline"))
              throw new Error("synthetic failure")
            return graph(config as never, ...(rest as []))
          },
        )
      await expect(complete(cartId)).rejects.toMatchObject({
        response: { status: 500 },
      })
      expect(records().filter(({ event }) => event === "order.placed")).toEqual(
        [],
      )
    })
  },
})
