import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import type { FlagRouter } from "@medusajs/framework/utils"
import type { SettingsTypes } from "@medusajs/framework/types"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import type DeliveryModuleService from "../../src/modules/delivery/service"
import OperationsMonitoringFeatureFlag from "../../src/feature-flags/operations-monitoring"
import syncOperationsNavigation from "../../src/jobs/sync-operations-navigation"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(300000)

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
