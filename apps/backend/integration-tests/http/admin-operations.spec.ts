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

    describe("Order volume (#261)", () => {
      const HOUR = 60 * MINUTE
      /** Moves an Order's recorded placement to `at`, as history would hold it. */
      const placedAt = async (orderId: string, at: Date) => {
        const [record] = await operations().listOrderOperations({
          order_id: orderId,
        })
        await operations().updateOrderOperations({
          id: record.id,
          placed_at: at,
        })
      }
      const placeAt = async (at: Date, restaurantId = pizzeriaId) => {
        const order = await placePaidOrder(restaurantId)
        await placedAt(order.id, at)
        return order
      }
      const readAt = async (
        now: Date,
        scope:
          | { type: "platform" }
          | { type: "restaurant"; restaurant_id: string } = {
          type: "platform",
        },
      ) =>
        (
          await readOperationsWorkflow(getContainer()).run({
            input: { scope, now: now.toISOString() },
          })
        ).result

      it("counts placements from exactly 24 hours before now, inclusive, to now, exclusive", async () => {
        const now = new Date(Date.parse("2026-11-28T13:00:00.000Z"))
        // At 14:00: yesterday 13:30 is outside, 14:30 inside.
        await placeAt(new Date(now.getTime() - 24 * HOUR - 30 * MINUTE))
        await placeAt(new Date(now.getTime() - 23 * HOUR - 30 * MINUTE))
        // BVA: the first second of the period is in, now itself is out.
        await placeAt(new Date(now.getTime() - 24 * HOUR))
        await placeAt(new Date(now.getTime() - 24 * HOUR - 1000))
        await placeAt(now)

        const { placements } = await readAt(now)
        expect(placements.total).toBe(2)
        expect(placements.period).toEqual({
          starts_at: "2026-11-27T13:00:00.000Z",
          ends_at: "2026-11-28T13:00:00.000Z",
        })
      })

      it("keeps cancelled Orders in the volume and counts them by cancellation category", async () => {
        await placePaidOrder(pizzeriaId)
        await accepted()
        const rejected = await placePaidOrder(pizzeriaId)
        expect((await reject(staff, rejected.id)).status).toBe(200)
        const withdrawn = await placePaidOrder(pizzeriaId)
        expect((await harness.cancel(customer, withdrawn.id)).status).toBe(200)

        const response = await read()
        expect(response.status).toBe(200)
        expect(response.data.placements.total).toBe(4)
        expect(response.data.placements.cancelled).toEqual({
          total: 2,
          categories: [
            { category: "restaurant_rejected", count: 1 },
            { category: "acceptance_timeout", count: 0 },
            { category: "customer_cancelled", count: 1 },
            { category: "unassigned_timeout", count: 0 },
            { category: "operator_cancelled", count: 0 },
          ],
        })
        expect(response.data.orders_per_hour.total).toBe(4)
        expect(response.data.orders_per_hour.hours.at(-1)).toMatchObject({
          is_current: true,
          count: 4,
        })
      })

      it("counts the repeated 02:00 hour of 25 October 2026 as two hours", async () => {
        // 02:30 at +02:00, then 02:30 again at +01:00.
        await placeAt(new Date("2026-10-25T00:30:00.000Z"))
        await placeAt(new Date("2026-10-25T01:30:00.000Z"))
        await placeAt(new Date("2026-10-25T01:45:00.000Z"))

        const { orders_per_hour } = await readAt(
          new Date("2026-10-25T09:20:00.000Z"),
        )
        expect(
          orders_per_hour.hours
            .filter(({ local_time }) => local_time === "02:00")
            .map(({ utc_offset, count }) => ({ utc_offset, count })),
        ).toEqual([
          { utc_offset: "+02:00", count: 1 },
          { utc_offset: "+01:00", count: 2 },
        ])
        expect(orders_per_hour.total).toBe(3)
      })

      it("counts placements per Copenhagen day over the previous seven complete days and averages them over seven", async () => {
        // 00:30 and 23:30 Copenhagen time on the 25-hour 25 October.
        await placeAt(new Date("2026-10-24T22:30:00.000Z"))
        await placeAt(new Date("2026-10-25T22:30:00.000Z"))
        // 23:30 on 18 October, before the seven days.
        await placeAt(new Date("2026-10-18T21:30:00.000Z"))
        await placeAt(new Date("2026-10-20T10:00:00.000Z"))
        // 00:30 on 26 October: today, not a complete day yet.
        await placeAt(new Date("2026-10-25T23:30:00.000Z"))

        const { placements_per_day } = await readAt(
          new Date("2026-10-26T10:00:00.000Z"),
        )
        expect(placements_per_day.days).toEqual([
          { date: "2026-10-19", count: 0 },
          { date: "2026-10-20", count: 1 },
          { date: "2026-10-21", count: 0 },
          { date: "2026-10-22", count: 0 },
          { date: "2026-10-23", count: 0 },
          { date: "2026-10-24", count: 0 },
          { date: "2026-10-25", count: 2 },
        ])
        expect(placements_per_day.total).toBe(3)
        expect(placements_per_day.average_per_day).toBe(0.4)
      })

      it("narrows the volume to one Restaurant", async () => {
        const now = new Date()
        await placeAt(new Date(now.getTime() - HOUR))
        const { burgerId } = harness.seeded()
        await placeAt(new Date(now.getTime() - HOUR), burgerId)

        const own = await readAt(now, {
          type: "restaurant",
          restaurant_id: pizzeriaId,
        })
        expect(own.placements.total).toBe(1)
        expect(own.orders_per_hour.total).toBe(1)
        expect((await readAt(now)).placements.total).toBe(2)
        const other = await readAt(now, {
          type: "restaurant",
          restaurant_id: "rest_another_restaurant",
        })
        expect(other.placements.total).toBe(0)
      })

      it("reads placements through the placement-time index", async () => {
        const knex = getContainer().resolve(
          ContainerRegistrationKeys.PG_CONNECTION,
        )
        const seen: { sql: string; bindings: unknown[] }[] = []
        const capture = (query: { sql: string; bindings: unknown[] }) => {
          // Not the delivered Orders without a handover time (#262), which
          // the processing time also selects by placement.
          if (
            /placed_at"?\s*>=/.test(query.sql) &&
            !/delivery_ended_at/.test(query.sql)
          )
            seen.push(query)
        }
        knex.on("query", capture)
        try {
          await readAt(new Date())
        } finally {
          knex.removeListener("query", capture)
        }
        // Placements, Orders per hour and placements per day.
        expect(seen).toHaveLength(3)
        for (const { sql, bindings } of seen) {
          // The test database is tiny, so a sequential scan would be
          // cheaper; ruling it out shows whether the index can serve.
          const plan = (await knex.transaction(async (trx) => {
            await trx.raw("set local enable_seqscan = off")
            // The captured text is in the driver's `$1` form.
            const text = sql.replace(/\$\d+/g, "?")
            return trx.raw(`explain ${text}`, bindings as never)
          })) as unknown as { rows: Record<string, string>[] }
          const text = plan.rows.map((row) => row["QUERY PLAN"]).join("\n")
          expect(text).toMatch(/IDX_order_operation_placed_at/)
        }
      })
    })

    describe("Order processing time and Delivery transit time (#262)", () => {
      /**
       * Moves an Order's recorded times as history would hold them: the
       * placement and the copied pickup and handover on its operation record,
       * and the pickup and handover on its delivery. `null` removes a time.
       */
      const retime = async (
        orderId: string,
        times: {
          placed_at?: Date | null
          picked_up_at?: Date | null
          handed_over_at?: Date | null
        },
      ) => {
        const [record] = await operations().listOrderOperations({
          order_id: orderId,
        })
        await operations().updateOrderOperations({
          id: record.id,
          ...("placed_at" in times && { placed_at: times.placed_at }),
          ...("picked_up_at" in times && {
            delivery_picked_up_at: times.picked_up_at,
          }),
          ...("handed_over_at" in times && {
            delivery_ended_at: times.handed_over_at,
          }),
        })
        const [intended] = await delivery().listIntendedDeliveries({
          order_id: orderId,
        })
        await delivery().updateIntendedDeliveries({
          id: intended.id,
          ...("picked_up_at" in times && { picked_up_at: times.picked_up_at }),
          ...("handed_over_at" in times && {
            terminal_at: times.handed_over_at,
          }),
        })
      }
      const readAt = async (
        now: Date,
        scope:
          | { type: "platform" }
          | { type: "restaurant"; restaurant_id: string } = {
          type: "platform",
        },
      ) =>
        (
          await readOperationsWorkflow(getContainer()).run({
            input: { scope, now: now.toISOString() },
          })
        ).result

      it("averages 40 minutes over 3 Orders, excludes the legacy Order and leaves the cancelled and not-delivered Orders out", async () => {
        const handedOver = new Date(Date.now() - 60 * MINUTE)
        for (const minutes of [30, 40, 50]) {
          const order = await delivered()
          await retime(order.id, {
            placed_at: new Date(handedOver.getTime() - minutes * MINUTE),
            handed_over_at: handedOver,
          })
        }
        const legacy = await delivered()
        await retime(legacy.id, { placed_at: null })
        const rejected = await placePaidOrder(pizzeriaId)
        expect((await reject(staff, rejected.id)).status).toBe(200)
        // Cancelled after pickup: the delivery ends without handover.
        const { order: notDelivered } = await pickedUp()
        expect(
          (
            await api.post(
              `/admin/orders/${notDelivered.id}/operator-cancel`,
              { reason: "Restaurant lost power" },
              { headers: admin, validateStatus: () => true },
            )
          ).status,
        ).toBe(200)
        const [ended] = await operations().listOrderOperations({
          order_id: notDelivered.id,
        })
        expect(ended.delivery_outcome).toBe("not_delivered")

        const response = await read()
        expect(response.status).toBe(200)
        expect(response.data.processing_time).toMatchObject({
          period: response.data.placements.period,
          included: 3,
          average_seconds: 40 * 60,
          exclusions: [
            { reason: "no_placement_time", count: 1 },
            { reason: "no_handover_time", count: 0 },
          ],
        })
      })

      it("excludes a delivered Order without a handover time instead of averaging it as zero", async () => {
        const order = await delivered()
        await retime(order.id, { handed_over_at: null })

        const response = await read()
        expect(response.status).toBe(200)
        const { processing_time } = response.data
        expect(processing_time.included).toBe(0)
        expect(processing_time.average_seconds).toBeNull()
        expect(processing_time.exclusions).toEqual([
          { reason: "no_placement_time", count: 0 },
          { reason: "no_handover_time", count: 1 },
        ])
      })

      it("counts handovers from exactly 24 hours before now, inclusive, to now, exclusive", async () => {
        const now = new Date("2026-11-28T13:00:00.000Z")
        const handedOverAt = async (at: Date) => {
          const order = await delivered()
          await retime(order.id, {
            placed_at: new Date(at.getTime() - 30 * MINUTE),
            picked_up_at: new Date(at.getTime() - 10 * MINUTE),
            handed_over_at: at,
          })
        }
        // BVA: the first second of the period is in, now itself is out.
        await handedOverAt(new Date(now.getTime() - 24 * 60 * MINUTE))
        await handedOverAt(new Date(now.getTime() - 24 * 60 * MINUTE - 1000))
        await handedOverAt(now)

        const figures = await readAt(now)
        expect(figures.processing_time.included).toBe(1)
        expect(figures.delivery_transit_time.included).toBe(1)
        expect(figures.delivery_transit_time.period).toEqual({
          starts_at: "2026-11-27T13:00:00.000Z",
          ends_at: "2026-11-28T13:00:00.000Z",
        })
      })

      it("measures picked up 18:05, handed over 18:25 as 20 minutes in transit and excludes a delivery without a pickup time", async () => {
        // 18:05 and 18:25 on a clock 20 minutes apart, an hour before now.
        const handedOver = Date.now() - 60 * MINUTE
        const order = await delivered()
        await retime(order.id, {
          placed_at: new Date(handedOver - 45 * MINUTE),
          picked_up_at: new Date(handedOver - 20 * MINUTE),
          handed_over_at: new Date(handedOver),
        })
        const withoutPickup = await delivered()
        await retime(withoutPickup.id, {
          placed_at: new Date(handedOver - 40 * MINUTE),
          picked_up_at: null,
          handed_over_at: new Date(handedOver),
        })

        const response = await read()
        expect(response.status).toBe(200)
        expect(response.data.delivery_transit_time).toMatchObject({
          period: response.data.placements.period,
          included: 1,
          average_seconds: 20 * 60,
          exclusions: [{ reason: "no_pickup_time", count: 1 }],
        })
        // Both were placed, so both count for processing time.
        expect(response.data.processing_time.included).toBe(2)

        const now = new Date()
        const other = await readAt(now, {
          type: "restaurant",
          restaurant_id: "rest_another_restaurant",
        })
        expect(other.processing_time.included).toBe(0)
        expect(other.delivery_transit_time.included).toBe(0)
        expect(other.delivery_transit_time.exclusions).toEqual([
          { reason: "no_pickup_time", count: 0 },
        ])
        const own = await readAt(now, {
          type: "restaurant",
          restaurant_id: pizzeriaId,
        })
        expect(own.delivery_transit_time.included).toBe(1)
      })

      it("averages the previous seven Copenhagen days, one average per day, and compares the last 24 hours with them", async () => {
        // 10:00 on Monday 26 October 2026, Copenhagen time.
        const now = new Date("2026-10-26T09:00:00.000Z")
        const handedOverAt = async (
          at: string,
          processingMinutes: number,
          transitMinutes: number,
        ) => {
          const order = await delivered()
          const handover = Date.parse(at)
          await retime(order.id, {
            placed_at: new Date(handover - processingMinutes * MINUTE),
            picked_up_at: new Date(handover - transitMinutes * MINUTE),
            handed_over_at: new Date(handover),
          })
        }
        await handedOverAt("2026-10-20T12:00:00.000Z", 45, 10)
        await handedOverAt("2026-10-20T18:00:00.000Z", 55, 20)
        // 23:30 on the 25-hour 25 October: in the seven days and the 24 hours.
        await handedOverAt("2026-10-25T22:30:00.000Z", 30, 10)
        // Today: in the 24 hours only.
        await handedOverAt("2026-10-26T08:00:00.000Z", 40, 14)

        const figures = await readAt(now)
        expect(figures.times_per_day.period).toEqual({
          starts_at: "2026-10-18T22:00:00.000Z",
          ends_at: "2026-10-25T23:00:00.000Z",
        })
        // (45 + 55 + 30) / 3 and (10 + 20 + 10) / 3 minutes.
        expect(figures.times_per_day.processing_time).toMatchObject({
          included: 3,
          average_seconds: 2600,
        })
        expect(figures.times_per_day.delivery_transit_time).toMatchObject({
          included: 3,
          average_seconds: 800,
        })
        expect(
          figures.times_per_day.days.map(
            ({ date, processing_time, delivery_transit_time }) => [
              date,
              processing_time.average_seconds,
              delivery_transit_time.average_seconds,
            ],
          ),
        ).toEqual([
          ["2026-10-19", null, null],
          ["2026-10-20", 3000, 900],
          ["2026-10-21", null, null],
          ["2026-10-22", null, null],
          ["2026-10-23", null, null],
          ["2026-10-24", null, null],
          ["2026-10-25", 1800, 600],
        ])
        // 35 minutes against 43.3 is 19% faster; 12 against 13.3 is 10%.
        expect(figures.processing_time).toMatchObject({
          included: 2,
          average_seconds: 2100,
          change_from_previous_7_days_percent: -19,
        })
        expect(figures.delivery_transit_time).toMatchObject({
          included: 2,
          average_seconds: 720,
          change_from_previous_7_days_percent: -10,
        })
      })

      it("reads handovers through the delivery-end-time indexes", async () => {
        const knex = getContainer().resolve(
          ContainerRegistrationKeys.PG_CONNECTION,
        )
        const seen: { sql: string; bindings: unknown[] }[] = []
        const capture = (query: { sql: string; bindings: unknown[] }) => {
          if (/(delivery_ended_at|terminal_at)"?\s*>=/.test(query.sql))
            seen.push(query)
        }
        knex.on("query", capture)
        try {
          await readAt(new Date())
        } finally {
          knex.removeListener("query", capture)
        }
        // On the Order and on the delivery: the last 24 hours, the seven
        // days and the seven days per day.
        expect(seen).toHaveLength(6)
        const plans: string[] = []
        for (const { sql, bindings } of seen) {
          // The test database is tiny, so a sequential scan would be
          // cheaper; ruling it out shows whether the index can serve.
          const plan = (await knex.transaction(async (trx) => {
            await trx.raw("set local enable_seqscan = off")
            const text = sql.replace(/\$\d+/g, "?")
            return trx.raw(`explain ${text}`, bindings as never)
          })) as unknown as { rows: Record<string, string>[] }
          plans.push(plan.rows.map((row) => row["QUERY PLAN"]).join("\n"))
        }
        for (const plan of plans)
          expect(plan).toMatch(
            /IDX_order_operation_delivery_ended_at|IDX_intended_delivery_(delivered_terminal_at_id|restaurant_id_terminal_at_id)/,
          )
        expect(plans.join("\n")).toMatch(
          /IDX_order_operation_delivery_ended_at/,
        )
        expect(plans.join("\n")).toMatch(
          // Either delivered handover-time index serves it.
          /IDX_intended_delivery_(delivered_terminal_at_id|restaurant_id_terminal_at_id)/,
        )
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
