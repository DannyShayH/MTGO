import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
} from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import type DeliveryModuleService from "../../src/modules/delivery/service"
import { endDeliveryWorkflow } from "../../src/workflows/delivery/terminal"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(240000)

medusaIntegrationTestRunner({
  dbName: "medusa_ci_delivery_problem_report_http",
  env: { JWT_SECRET: "ci-only-problem-report-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer, dbUtils }) => {
    const harness = restaurantOrdersHarness({ api, getContainer, dbUtils })
    const {
      placePaidOrder,
      signInAsStaffOf,
      accept,
      startPreparation,
      markReady,
    } = harness
    const delivery = () =>
      getContainer().resolve<DeliveryModuleService>(DELIVERY_MODULE)
    const tokenFor = (id: string) =>
      `Bearer ${generateJwtToken(
        {
          actor_id: id,
          actor_type: "delivery_agent",
          auth_identity_id: "auth_test",
        },
        {
          secret: getContainer().resolve(
            ContainerRegistrationKeys.CONFIG_MODULE,
          ).projectConfig.http.jwtSecret,
          expiresIn: "1h",
        },
      )}`
    let sequence = 0
    const agent = async () => {
      const id = ++sequence
      const record = await delivery().createDeliveryAgents({
        name: `Problem agent ${id}`,
        email: `problem-agent-${id}@example.test`,
        status: "authorized",
        invited_by: "operator",
      })
      await delivery().createDeliveryAgentAreas([
        { agent_id: record.id, postal_code: "2200" },
      ])
      return { id: record.id, headers: { authorization: tokenFor(record.id) } }
    }
    const post = (
      orderId: string,
      headers: Record<string, string>,
      body: object,
    ) =>
      api.post(`/partner/deliveries/${orderId}/problem-report`, body, {
        headers,
        validateStatus: () => true,
      })

    it("raises one report immediately, returns the first report on repeats, and leaves delivery unchanged", async () => {
      const { admin, pizzeriaId } = harness.seeded()
      const staff = (
        await signInAsStaffOf(pizzeriaId, "problem-staff@example.test")
      ).headers
      const order = await placePaidOrder(pizzeriaId)
      expect((await accept(staff, order.id)).status).toBe(200)
      const holder = await agent()
      expect(
        (
          await api.post(
            `/partner/delivery-agent/available/${order.id}/claim`,
            { request_id: "problem-claim" },
            { headers: holder.headers },
          )
        ).status,
      ).toBe(200)
      const before = (
        await delivery().listIntendedDeliveries({ order_id: order.id })
      )[0]
      const logger = getContainer().resolve<{
        log: (...args: unknown[]) => void
        info: (...args: unknown[]) => void
        warn: (...args: unknown[]) => void
        error: (...args: unknown[]) => void
      }>(ContainerRegistrationKeys.LOGGER)
      const logged = (["log", "info", "warn", "error"] as const).map((method) =>
        jest.spyOn(logger, method),
      )
      const first = await post(order.id, holder.headers, {
        category: "restaurant_unavailable",
        note: "Closed\u0007 today",
      })
      expect(first.status).toBe(201)
      expect(first.data.report).toMatchObject({
        category: "restaurant_unavailable",
        note: "Closed today",
        reported_by: holder.id,
      })
      const second = await post(order.id, holder.headers, {
        category: "other",
        note: "second",
      })
      expect(second.status).toBe(200)
      expect(second.data).toMatchObject({
        status: "already_reported",
        report: first.data.report,
      })
      expect(JSON.stringify(logged.map((spy) => spy.mock.calls))).not.toContain(
        "Closed today",
      )
      logged.forEach((spy) => spy.mockRestore())
      const attention = await api.get("/admin/deliveries/attention", {
        headers: admin,
      })
      expect(attention.data.attention).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "agent_reported_problem",
            category: "restaurant_unavailable",
            note: "Closed today",
            reported_by: expect.objectContaining({
              id: holder.id,
              name: "Problem agent 1",
            }),
          }),
        ]),
      )
      expect(
        (await delivery().listIntendedDeliveries({ order_id: order.id }))[0],
      ).toMatchObject({
        active_agent_id: before.active_agent_id,
        assigned_agent_id: before.assigned_agent_id,
        picked_up_at: before.picked_up_at,
        terminal_outcome: before.terminal_outcome,
      })
      expect(
        await delivery().listDeliveryAttentions({
          order_id: order.id,
          type: "agent_reported_problem",
        }),
      ).toHaveLength(1)
      await endDeliveryWorkflow(getContainer()).run({
        input: {
          order_id: order.id,
          outcome: "cancelled",
          actor_id: "user_op",
        },
      })
      const ended = await api.get("/admin/deliveries/attention", {
        headers: admin,
      })
      expect(
        ended.data.attention.some(
          (item: { type: string }) => item.type === "agent_reported_problem",
        ),
      ).toBe(false)
    })

    it("refuses unknown categories, unassigned work, another agent, revoked access and ended work", async () => {
      const { pizzeriaId } = harness.seeded()
      const staff = (
        await signInAsStaffOf(pizzeriaId, "problem-refusal-staff@example.test")
      ).headers
      const order = await placePaidOrder(pizzeriaId)
      expect((await accept(staff, order.id)).status).toBe(200)
      const holder = await agent()
      const other = await agent()
      const body = { category: "other", note: "help" }
      expect((await post(order.id, holder.headers, body)).status).toBe(400)
      expect(
        (
          await api.post(
            `/partner/delivery-agent/available/${order.id}/claim`,
            { request_id: "problem-refusal-claim" },
            { headers: holder.headers },
          )
        ).status,
      ).toBe(200)
      expect(
        (await post(order.id, holder.headers, { category: "unknown" })).status,
      ).toBe(400)
      expect(
        (
          await post(order.id, holder.headers, {
            category: "other",
            note: "PRIVATE_REPORT_NOTE".repeat(20),
          })
        ).status,
      ).toBe(400)
      const foreign = await post(order.id, other.headers, body)
      expect(foreign.status).toBe(403)
      expect(JSON.stringify(foreign.data)).not.toMatch(
        /help|Problem agent|address|phone/,
      )
      expect((await post(order.id, {}, body)).status).toBe(401)
      expect((await post("order_unknown", holder.headers, body)).status).toBe(
        404,
      )
      await delivery().revokeAgent({
        agent_id: holder.id,
        revoked_by: "operator",
      })
      const revoked = await post(order.id, holder.headers, body)
      expect(revoked.status).toBe(403)
      expect(revoked.data.code).toBe("delivery_agent_access_revoked")
      await endDeliveryWorkflow(getContainer()).run({
        input: { order_id: order.id, outcome: "failed", actor_id: "user_op" },
      })
      expect((await post(order.id, other.headers, body)).status).toBe(400)
    })

    it("keeps one first report when requests race after pickup", async () => {
      const { pizzeriaId } = harness.seeded()
      const staff = (
        await signInAsStaffOf(pizzeriaId, "problem-race-staff@example.test")
      ).headers
      const order = await placePaidOrder(pizzeriaId)
      expect((await accept(staff, order.id)).status).toBe(200)
      const holder = await agent()
      expect(
        (
          await api.post(
            `/partner/delivery-agent/available/${order.id}/claim`,
            { request_id: "problem-race-claim" },
            { headers: holder.headers },
          )
        ).status,
      ).toBe(200)
      expect((await startPreparation(staff, order.id)).status).toBe(200)
      expect((await markReady(staff, order.id)).status).toBe(200)
      expect(
        (
          await api.post(
            `/partner/deliveries/${order.id}/pickup`,
            { request_id: "problem-race-pickup" },
            { headers: holder.headers },
          )
        ).status,
      ).toBe(200)
      const responses = await Promise.all(
        ["other", "food_missing_or_wrong", "address_not_found"].map(
          (category) => post(order.id, holder.headers, { category }),
        ),
      )
      expect(responses.map(({ status }) => status).sort()).toEqual([
        200, 200, 201,
      ])
      expect(new Set(responses.map(({ data }) => data.report.id)).size).toBe(1)
      expect(
        await delivery().listDeliveryAttentions({
          order_id: order.id,
          type: "agent_reported_problem",
        }),
      ).toHaveLength(1)
    })

    it("resolves the report after delivered handover", async () => {
      const { admin, pizzeriaId } = harness.seeded()
      const staff = (
        await signInAsStaffOf(
          pizzeriaId,
          "problem-delivered-staff@example.test",
        )
      ).headers
      const order = await placePaidOrder(pizzeriaId)
      expect((await accept(staff, order.id)).status).toBe(200)
      const holder = await agent()
      expect(
        (
          await api.post(
            `/partner/delivery-agent/available/${order.id}/claim`,
            { request_id: "problem-delivered-claim" },
            { headers: holder.headers },
          )
        ).status,
      ).toBe(200)
      expect((await startPreparation(staff, order.id)).status).toBe(200)
      expect((await markReady(staff, order.id)).status).toBe(200)
      expect(
        (
          await api.post(
            `/partner/deliveries/${order.id}/pickup`,
            { request_id: "problem-delivered-pickup" },
            { headers: holder.headers },
          )
        ).status,
      ).toBe(200)
      expect(
        (await post(order.id, holder.headers, { category: "other" })).status,
      ).toBe(201)
      expect(
        (
          await api.post(
            `/partner/deliveries/${order.id}/deliver`,
            { request_id: "problem-delivered-handover" },
            { headers: holder.headers },
          )
        ).status,
      ).toBe(200)
      const listed = await api.get("/admin/deliveries/attention", {
        headers: admin,
      })
      expect(
        listed.data.attention.some(
          (item: { type: string }) => item.type === "agent_reported_problem",
        ),
      ).toBe(false)
      const [report] = await delivery().listDeliveryAttentions({
        order_id: order.id,
        type: "agent_reported_problem",
      })
      expect(report.resolution).toBe("delivered")
    })
  },
})
