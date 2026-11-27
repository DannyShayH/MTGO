import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import type { FlagRouter } from "@medusajs/framework/utils"
import type { SettingsTypes } from "@medusajs/framework/types"
import SystemProviderService from "@medusajs/payment/dist/providers/system"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import type DeliveryModuleService from "../../src/modules/delivery/service"
import OperationsMonitoringFeatureFlag from "../../src/feature-flags/operations-monitoring"
import syncOperationsNavigation from "../../src/jobs/sync-operations-navigation"
import { recoverDeliveryAttentionWorkflow } from "../../src/workflows/delivery/attention"
import { readOperationsWorkflow } from "../../src/workflows/operations-monitoring"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(300000)

const MINUTE = 60 * 1000

type Stage = { stage: string; count: number }

/**
 * #259: MTOGO operators see Open Orders by stage on the Admin Operations
 * page, behind the default-off `operations_monitoring` flag (ADR-0022). An
 * Open Order is not cancelled and has no delivery outcome; its stage comes
 * from the kitchen state, the copied assignment and the copied pickup.
 */
medusaIntegrationTestRunner({
  dbName: "medusa_ci_admin_operations_http",
  env: { JWT_SECRET: "ci-only-admin-operations-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer, dbUtils }) => {
    const harness = restaurantOrdersHarness({ api, getContainer, dbUtils })
    const {
      placePaidOrder,
      signInAsStaffOf,
      accept,
      reject,
      startPreparation,
      markReady,
      operations,
    } = harness
    let admin: Record<string, string>
    let customer: Record<string, string>
    let pizzeriaId: string
    let staff: Record<string, string>

    const setFlag = (isReleased: boolean) =>
      getContainer()
        .resolve<FlagRouter>(ContainerRegistrationKeys.FEATURE_FLAG_ROUTER)
        .setFlag(OperationsMonitoringFeatureFlag.key, isReleased)

    beforeEach(async () => {
      ;({ admin, customer, pizzeriaId } = harness.seeded())
      staff = (
        await signInAsStaffOf(
          pizzeriaId,
          `admin-operations-${Date.now()}@example.test`,
        )
      ).headers
      setFlag(true)
    })

    const delivery = () =>
      getContainer().resolve<DeliveryModuleService>(DELIVERY_MODULE)
    let agents = 0
    const agentFor = async () => {
      agents += 1
      const agent = await delivery().createDeliveryAgents({
        name: `Admin operations agent ${agents}`,
        email: `admin-operations-agent-${agents}@example.test`,
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
      return { id: agent.id, headers: { authorization: `Bearer ${token}` } }
    }
    let requests = 0
    const post = (path: string, headers: Record<string, string>, body = {}) =>
      api.post(
        path,
        { request_id: `admin-operations-${++requests}`, ...body },
        { headers, validateStatus: () => true },
      )
    const read = (headers: Record<string, string> = admin) =>
      api.get("/admin/operations", { headers, validateStatus: () => true })

    const accepted = async () => {
      const order = await placePaidOrder(pizzeriaId)
      expect((await accept(staff, order.id)).status).toBe(200)
      return order
    }
    const preparing = async () => {
      const order = await accepted()
      expect((await startPreparation(staff, order.id)).status).toBe(200)
      return order
    }
    const ready = async () => {
      const order = await preparing()
      expect((await markReady(staff, order.id)).status).toBe(200)
      return order
    }
    const claimedAndReady = async () => {
      const order = await accepted()
      const agent = await agentFor()
      const claim = `/partner/delivery-agent/available/${order.id}/claim`
      expect((await post(claim, agent.headers)).status).toBe(200)
      expect((await startPreparation(staff, order.id)).status).toBe(200)
      expect((await markReady(staff, order.id)).status).toBe(200)
      return { order, agent }
    }
    const pickedUp = async () => {
      const { order, agent } = await claimedAndReady()
      const pickup = `/partner/deliveries/${order.id}/pickup`
      expect((await post(pickup, agent.headers)).status).toBe(200)
      return { order, agent }
    }
    const delivered = async () => {
      const { order, agent } = await pickedUp()
      const handover = `/partner/deliveries/${order.id}/deliver`
      expect((await post(handover, agent.headers)).status).toBe(200)
      return order
    }

    /**
     * An accepted, unassigned delivery whose recorded acceptance lies
     * `minutes` before now, with the claim and attention deadlines the
     * acceptance derives moved with it.
     */
    const acceptedMinutesAgo = async (minutes: number) => {
      const order = await accepted()
      const acceptedAt = Date.now() - minutes * MINUTE
      const [record] = await delivery().listIntendedDeliveries({
        order_id: order.id,
      })
      await delivery().updateIntendedDeliveries({
        id: record.id,
        accepted_at: new Date(acceptedAt),
        claim_deadline: new Date(acceptedAt + 30 * MINUTE),
      })
      const [owed] = await delivery().listDeliveryAttentions({
        order_id: order.id,
        type: "unassigned",
      })
      await delivery().updateDeliveryAttentions({
        id: owed.id,
        due_at: new Date(acceptedAt + 10 * MINUTE),
      })
      return order
    }
    /** The production attention sweep, at the current time. */
    const sweep = () =>
      recoverDeliveryAttentionWorkflow(getContainer()).run({
        input: { now: new Date().toISOString() },
      })
    const reportProblem = (
      orderId: string,
      agentHeaders: Record<string, string>,
    ) =>
      api.post(
        `/partner/deliveries/${orderId}/problem-report`,
        { category: "food_missing_or_wrong" },
        { headers: agentHeaders, validateStatus: () => true },
      )

    const stagesOf = (body: { open_orders: { stages: Stage[] } }) =>
      Object.fromEntries(
        body.open_orders.stages.map(({ stage, count }) => [stage, count]),
      )

    it("counts one Open Order in each stage and leaves out the cancelled and delivered Orders", async () => {
      await placePaidOrder(pizzeriaId)
      await preparing()
      await ready()
      await claimedAndReady()
      await pickedUp()
      const cancelled = await placePaidOrder(pizzeriaId)
      expect((await reject(staff, cancelled.id)).status).toBe(200)
      await delivered()

      const before = Date.now()
      const response = await read()
      expect(response.status).toBe(200)
      expect(response.data.open_orders.total).toBe(5)
      expect(stagesOf(response.data)).toEqual({
        awaiting_acceptance: 1,
        accepted_or_preparing: 1,
        ready_unassigned: 1,
        assigned_not_picked_up: 1,
        picked_up: 1,
      })
      // The moment the figures were calculated for, close to the request.
      const asOf = Date.parse(response.data.as_of)
      expect(asOf).toBeGreaterThanOrEqual(before - 1000)
      expect(asOf).toBeLessThanOrEqual(Date.now())
      expect(response.data.scope).toEqual({ type: "platform" })
    })

    it("names every stage, in order, with zero when no Order is open", async () => {
      const response = await read()
      expect(response.status).toBe(200)
      expect(response.data.open_orders).toEqual({
        period: { at: response.data.as_of },
        total: 0,
        stages: [
          { stage: "awaiting_acceptance", count: 0 },
          { stage: "accepted_or_preparing", count: 0 },
          { stage: "ready_unassigned", count: 0 },
          { stage: "assigned_not_picked_up", count: 0 },
          { stage: "picked_up", count: 0 },
        ],
        exclusions: [],
      })
    })

    it("counts an Order an operator assigned as assigned once it is ready", async () => {
      const order = await accepted()
      const agent = await agentFor()
      const assigned = await post(
        `/admin/deliveries/${order.id}/assign`,
        admin,
        { agent_id: agent.id },
      )
      expect(assigned.status).toBe(200)
      expect(stagesOf((await read()).data).accepted_or_preparing).toBe(1)
      expect((await startPreparation(staff, order.id)).status).toBe(200)
      expect((await markReady(staff, order.id)).status).toBe(200)

      const stages = stagesOf((await read()).data)
      expect(stages.assigned_not_picked_up).toBe(1)
      expect(stages.ready_unassigned).toBe(0)
    })

    it("counts a legacy Order without a placement time as open while it has not ended", async () => {
      const order = await preparing()
      const [record] = await operations().listOrderOperations({
        order_id: order.id,
      })
      await operations().updateOrderOperations({
        id: record.id,
        placed_at: null,
        acceptance_deadline: null,
      })

      const response = await read()
      expect(response.data.open_orders.total).toBe(1)
      expect(stagesOf(response.data).accepted_or_preparing).toBe(1)
    })

    describe("unassigned deliveries and attention (#260)", () => {
      it("counts 2 unassigned, 1 waiting over 10 minutes, and leaves assigned work out", async () => {
        await acceptedMinutesAgo(12)
        await accepted()
        await claimedAndReady()

        const response = await read()
        expect(response.status).toBe(200)
        expect(response.data.unassigned_deliveries).toEqual({
          period: { at: response.data.as_of },
          total: 2,
          waiting_over_ten_minutes: 1,
          exclusions: [],
        })
      })

      it.each([
        {
          minutes: 9,
          waiting: 0,
          reason: "BVA: one minute inside ten minutes does not wait over",
        },
        {
          minutes: 10,
          waiting: 0,
          reason: "BVA: exactly ten minutes is not over ten minutes",
        },
        {
          minutes: 11,
          waiting: 1,
          reason: "BVA: one minute past ten minutes waits over",
        },
      ])("$reason", async ({ minutes, waiting }) => {
        const order = await accepted()
        const [record] = await delivery().listIntendedDeliveries({
          order_id: order.id,
        })
        const acceptedAt = new Date(record.accepted_at).getTime()
        const { result } = await readOperationsWorkflow(getContainer()).run({
          input: {
            scope: { type: "platform" },
            now: new Date(acceptedAt + minutes * MINUTE).toISOString(),
          },
        })
        expect(result.unassigned_deliveries).toMatchObject({
          total: 1,
          waiting_over_ten_minutes: waiting,
        })
      })

      it("counts raised attention by type, marks the unassigned item as the Order waiting over 10 minutes, and agrees with the deliveries page", async () => {
        const waiting = await acceptedMinutesAgo(12)
        // Accepted five minutes ago: its unassigned attention is not due.
        await acceptedMinutesAgo(5)
        await sweep()
        const { order: reported, agent } = await claimedAndReady()
        expect((await reportProblem(reported.id, agent.headers)).status).toBe(
          201,
        )
        // A problem on an Order handed over since is no longer outstanding.
        const { order: ended, agent: deliverer } = await pickedUp()
        expect((await reportProblem(ended.id, deliverer.headers)).status).toBe(
          201,
        )
        const handover = `/partner/deliveries/${ended.id}/deliver`
        expect((await post(handover, deliverer.headers)).status).toBe(200)

        const response = await read()
        const counts = Object.fromEntries(
          response.data.attention.types.map(
            ({ type, count }: { type: string; count: number }) => [type, count],
          ),
        )
        expect(counts).toEqual({
          unassigned: 1,
          access_revoked: 0,
          assigned_without_pickup: 0,
          in_transit_without_delivery: 0,
          arrived_without_handover: 0,
          agent_reported_problem: 1,
        })
        expect(response.data.attention.total).toBe(2)
        expect(response.data.attention.types[0]).toEqual({
          type: "unassigned",
          count: 1,
          waiting_unassigned_orders: 1,
        })
        expect(response.data.unassigned_deliveries).toMatchObject({
          total: 2,
          waiting_over_ten_minutes: 1,
        })

        // The same definitions as the #49 list, so the numbers never disagree.
        const list = await api.get("/admin/deliveries/attention", {
          headers: admin,
        })
        expect(list.data.attention).toHaveLength(2)
        expect(
          list.data.attention.find(
            ({ type }: { type: string }) => type === "unassigned",
          ).order_id,
        ).toBe(waiting.id)
      })
    })

    describe("unresolved Full refunds (#260)", () => {
      afterEach(() => jest.restoreAllMocks())
      const providerRefunds = () =>
        jest.spyOn(SystemProviderService.prototype, "refundPayment")
      const statusOf = async (order_id: string) =>
        (await operations().listRefundObligations({ order_id }))[0]?.status

      it("counts 1 pending and 1 failed Full refund and leaves the succeeded one out", async () => {
        // The minute-by-minute recovery job must not settle the deliberately
        // pending refund before it is counted.
        const service = operations()
        const listObligations = service.listRefundObligations.bind(service)
        jest
          .spyOn(service, "listRefundObligations")
          .mockImplementation((filters, options, context) =>
            filters?.status === "pending" && !filters.order_id
              ? Promise.resolve([])
              : listObligations(filters, options, context),
          )

        const succeeded = await placePaidOrder(pizzeriaId)
        expect((await reject(staff, succeeded.id)).status).toBe(200)
        expect(await statusOf(succeeded.id)).toBe("succeeded")

        const failed = await placePaidOrder(pizzeriaId)
        const declined = providerRefunds().mockRejectedValue(
          new Error("mock provider declined"),
        )
        expect((await reject(staff, failed.id)).status).toBe(200)
        declined.mockRestore()
        expect(await statusOf(failed.id)).toBe("failed")

        // The process stops before the attempt records its outcome.
        const pending = await placePaidOrder(pizzeriaId)
        const update = service.updateRefundObligations.bind(service)
        const lost = jest
          .spyOn(service, "updateRefundObligations")
          .mockImplementation(((data: {
            status?: string
            selector?: unknown
          }) =>
            data.selector || data.status === "pending"
              ? update(data as never)
              : Promise.reject(new Error("process stopped"))) as never)
        expect((await reject(staff, pending.id)).status).toBe(200)
        lost.mockRestore()
        expect(await statusOf(pending.id)).toBe("pending")

        const response = await read()
        expect(response.data.full_refunds).toEqual({
          period: { at: response.data.as_of },
          total: 2,
          pending: 1,
          failed: 1,
          exclusions: [],
        })
        const list = await api.get("/admin/refunds", { headers: admin })
        expect(list.data.count).toBe(2)
      })
    })

    it("narrows unassigned deliveries, attention and Full refunds to one Restaurant", async () => {
      await acceptedMinutesAgo(12)
      await sweep()
      const rejected = await placePaidOrder(pizzeriaId)
      const declined = jest
        .spyOn(SystemProviderService.prototype, "refundPayment")
        .mockRejectedValue(new Error("mock provider declined"))
      expect((await reject(staff, rejected.id)).status).toBe(200)
      declined.mockRestore()

      const scoped = async (restaurant_id: string) =>
        (
          await readOperationsWorkflow(getContainer()).run({
            input: {
              scope: { type: "restaurant", restaurant_id },
              now: new Date().toISOString(),
            },
          })
        ).result
      const own = await scoped(pizzeriaId)
      expect(own.unassigned_deliveries).toMatchObject({
        total: 1,
        waiting_over_ten_minutes: 1,
      })
      expect(own.attention.total).toBe(1)
      expect(own.full_refunds).toMatchObject({ failed: 1, pending: 0 })

      const other = await scoped("rest_another_restaurant")
      expect(other.unassigned_deliveries.total).toBe(0)
      expect(other.attention.total).toBe(0)
      expect(other.full_refunds.total).toBe(0)
    })

    it.each([
      { caller: "restaurant_staff", reason: "EP: a Restaurant staff token" },
      { caller: "customer", reason: "EP: a Customer token" },
      { caller: "delivery_agent", reason: "EP: a Delivery agent token" },
      { caller: "signed_out", reason: "EP: no credentials" },
    ] as const)("$reason cannot read operations", async ({ caller }) => {
      await placePaidOrder(pizzeriaId)
      const headers = await {
        restaurant_staff: async () => staff,
        customer: async () => customer,
        delivery_agent: async () => (await agentFor()).headers,
        signed_out: async () => ({}),
      }[caller]()

      const response = await read(headers)
      expect(response.status).toBe(401)
      expect(JSON.stringify(response.data)).not.toMatch(/open_orders/)
    })

    it("answers 404 while the flag is off", async () => {
      await placePaidOrder(pizzeriaId)
      setFlag(false)

      const response = await read()
      expect(response.status).toBe(404)
      expect(JSON.stringify(response.data)).not.toMatch(/open_orders/)
    })

    it("hides Operations in the shared sidebar while the flag is off and shows it first under Search once released", async () => {
      const settings = () =>
        getContainer().resolve<SettingsTypes.ISettingsModuleService>(
          Modules.SETTINGS,
        )
      const operationsNav = async () =>
        (await settings().getSystemDefaultLayoutConfiguration("sidebar"))
          ?.configuration.widgets["core:nav:/operations"]
      await settings().setSystemDefaultLayoutConfiguration("sidebar", {
        widgets: { "core:nav:/products": { order: 2 } },
      })

      setFlag(false)
      await syncOperationsNavigation(getContainer())
      await syncOperationsNavigation(getContainer())
      expect(await operationsNav()).toEqual({ hidden: true })

      setFlag(true)
      await syncOperationsNavigation(getContainer())
      expect(await operationsNav()).toEqual({ hidden: false, order: -1 })
      expect(
        (await settings().getSystemDefaultLayoutConfiguration("sidebar"))
          ?.configuration.widgets["core:Searchbar"],
      ).toEqual({ order: -2 })
      expect(
        (await settings().getSystemDefaultLayoutConfiguration("sidebar"))
          ?.configuration.widgets["core:nav:/products"],
      ).toEqual({ order: 2 })
    })
  },
})
