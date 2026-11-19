import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
} from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import type DeliveryModuleService from "../../src/modules/delivery/service"
import { claimDeliveryWorkflow } from "../../src/workflows/delivery/assignment"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(240000)

// Customer facts that only the responsible agent may read (spec #48 story 19).
const PRIVATE = /Ada|Lovelace|Testvej|12 34 56 78/

medusaIntegrationTestRunner({
  dbName: "medusa_ci_delivery_assignment_http",
  env: { JWT_SECRET: "ci-only-delivery-assignment-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer, dbUtils }) => {
    const harness = restaurantOrdersHarness({ api, getContainer, dbUtils })
    const { operations, placePaidOrder, signInAsStaffOf, accept } = harness
    let admin: { authorization: string }
    let pizzeriaId: string
    let staff: Record<string, string>
    beforeEach(async () => {
      ;({ admin, pizzeriaId } = harness.seeded())
      staff = (
        await signInAsStaffOf(pizzeriaId, "assignment-staff@example.test")
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
    const agentFor = async (postal_codes = ["2200"], name = "Agent") => {
      agents += 1
      const agent = await delivery().createDeliveryAgents({
        name: `${name} ${agents}`,
        email: `assignment-agent-${agents}@example.test`,
        status: "authorized",
        invited_by: "operator",
      })
      if (postal_codes.length)
        await delivery().createDeliveryAgentAreas(
          postal_codes.map((postal_code) => ({
            agent_id: agent.id,
            postal_code,
          })),
        )
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
    const claim = (
      headers: Record<string, string>,
      orderId: string,
      body: Record<string, unknown> = { request_id: `claim-${++requests}` },
    ) =>
      api.post(`/partner/delivery-agent/available/${orderId}/claim`, body, {
        headers,
        validateStatus: () => true,
      })
    const current = (headers: Record<string, string>) =>
      api.get("/partner/delivery-agent/current", {
        headers,
        validateStatus: () => true,
      })
    const available = (headers: Record<string, string>) =>
      api.get("/partner/delivery-agent/available", {
        headers,
        validateStatus: () => true,
      })
    const unclaimed = () =>
      api.get("/admin/deliveries/unclaimed", {
        headers: admin,
        validateStatus: () => true,
      })
    const assign = (
      orderId: string,
      body: Record<string, unknown>,
      headers: Record<string, string> = admin,
    ) =>
      api.post(`/admin/deliveries/${orderId}/assign`, body, {
        headers,
        validateStatus: () => true,
      })
    const assignmentsOf = async (order_id: string) =>
      (await delivery().listIntendedDeliveries({ order_id }))[0]

    describe("POST /partner/delivery-agent/available/:id/claim", () => {
      it("makes the agent responsible before preparation and reveals Customer contact only to them", async () => {
        const order = await acceptedOrder()
        const agent = await agentFor()
        const other = await agentFor()

        expect((await current(agent.headers)).data).toEqual({
          delivery: null,
          server_time: expect.any(String),
        })
        const before = Date.now()
        const claimed = await claim(agent.headers, order.id, {
          request_id: "first-tap",
        })
        expect(claimed.status).toBe(200)
        expect(claimed.data.delivery).toMatchObject({
          order_id: order.id,
          order_reference: order.display_id,
          restaurant_name: "Pizzeria Nørrebro",
          pickup_address: "Nørrebrogade 1, 2200 København N",
          preparation_status: "accepted",
          assignment_source: "agent_claim",
          customer: {
            name: "Ada Lovelace",
            phone: "+45 12 34 56 78",
            address_1: "Testvej 1",
            postal_code: "2200",
            city: "København N",
          },
        })
        const assignedAt = claimed.data.delivery.assigned_at
        expect(new Date(assignedAt).getTime()).toBeGreaterThanOrEqual(
          before - 1000,
        )
        expect(JSON.stringify(claimed.data)).not.toContain(agent.id)

        // The current view is the same projection; others see nothing of it.
        expect((await current(agent.headers)).data.delivery).toEqual(
          claimed.data.delivery,
        )
        expect((await current(other.headers)).data.delivery).toBeNull()
        expect((await available(other.headers)).data.deliveries).toEqual([])
        expect(
          JSON.stringify((await available(agent.headers)).data),
        ).not.toMatch(PRIVATE)

        // A double tap or a retry after a lost response keeps the original.
        for (const request_id of ["first-tap", "second-tap"]) {
          const repeat = await claim(agent.headers, order.id, { request_id })
          expect(repeat.status).toBe(200)
          expect(repeat.data.delivery.assigned_at).toBe(assignedAt)
        }
        const record = await assignmentsOf(order.id)
        expect(record).toMatchObject({
          assigned_agent_id: agent.id,
          active_agent_id: agent.id,
          assigned_by: agent.id,
          assignment_source: "agent_claim",
          assignment_request_id: "first-tap",
        })

        // The loser learns only that the work is taken.
        const lost = await claim(other.headers, order.id)
        expect(lost.status).toBe(409)
        expect(lost.data).toMatchObject({ code: "delivery_already_assigned" })
        expect(JSON.stringify(lost.data)).not.toMatch(PRIVATE)
        expect(JSON.stringify(lost.data)).not.toContain(agent.name)
      })

      it("gives exactly one agent the delivery when two claim at once", async () => {
        const order = await acceptedOrder()
        const first = await agentFor()
        const second = await agentFor()
        const results = await Promise.all([
          claim(first.headers, order.id),
          claim(second.headers, order.id),
        ])
        expect(results.map(({ status }) => status).sort()).toEqual([200, 409])
        const loser = results.find(({ status }) => status === 409)!
        expect(loser.data.code).toBe("delivery_already_assigned")
        expect(JSON.stringify(loser.data)).not.toMatch(PRIVATE)
        const winner = results[0].status === 200 ? first : second
        expect(await assignmentsOf(order.id)).toMatchObject({
          assigned_agent_id: winner.id,
          active_agent_id: winner.id,
        })
      })

      it("gives one agent at most one active delivery when they claim two at once", async () => {
        const one = await acceptedOrder()
        const two = await acceptedOrder()
        const agent = await agentFor()
        const results = await Promise.all([
          claim(agent.headers, one.id),
          claim(agent.headers, two.id),
        ])
        expect(results.map(({ status }) => status).sort()).toEqual([200, 409])
        expect(results.find(({ status }) => status === 409)!.data.code).toBe(
          "delivery_agent_has_active_delivery",
        )
        const held = await delivery().listIntendedDeliveries({
          active_agent_id: agent.id,
        })
        expect(held).toHaveLength(1)
        // The other delivery stays available to someone else.
        const other = await agentFor()
        expect((await available(other.headers)).data.deliveries).toHaveLength(1)
      })

      it("refuses a retry identity reused for another delivery", async () => {
        const one = await acceptedOrder()
        const two = await acceptedOrder()
        const agent = await agentFor()
        expect(
          (await claim(agent.headers, one.id, { request_id: "reused" })).status,
        ).toBe(200)
        const reused = await claim(agent.headers, two.id, {
          request_id: "reused",
        })
        expect(reused.status).toBe(409)
        expect(reused.data.code).toBe("assignment_request_reused")
        expect((await assignmentsOf(two.id)).assigned_agent_id).toBeNull()
      })

      it("refuses work outside both approved areas, after the deadline or no longer active", async () => {
        const order = await acceptedOrder()
        for (const codes of [["2100"], []]) {
          const outside = await claim((await agentFor(codes)).headers, order.id)
          expect(outside.status).toBe(400)
          expect(outside.data.code).toBe("delivery_outside_approved_areas")
        }
        const agent = await agentFor()
        const record = await assignmentsOf(order.id)
        await delivery().updateIntendedDeliveries({
          id: record.id,
          claim_deadline: new Date(Date.now() - 1000),
        })
        const late = await claim(agent.headers, order.id)
        expect(late.status).toBe(400)
        expect(late.data.code).toBe("claim_deadline_passed")

        const cancelled = await acceptedOrder()
        const [operation] = await operations().listOrderOperations({
          order_id: cancelled.id,
        })
        await operations().updateOrderOperations({
          id: operation.id,
          state: "cancelled",
        })
        const inactive = await claim(agent.headers, cancelled.id)
        expect(inactive.status).toBe(400)
        expect(inactive.data.code).toBe("delivery_not_active")

        // Unaccepted work has no delivery to claim.
        const awaiting = await placePaidOrder(pizzeriaId)
        const unknown = await claim(agent.headers, awaiting.id)
        expect(unknown.status).toBe(404)
        expect((await current(agent.headers)).data.delivery).toBeNull()
      })

      it("decides the deadline at the server's time, refusing exactly at acceptance plus thirty minutes", async () => {
        const order = await acceptedOrder()
        const agent = await agentFor()
        const { claim_deadline } = await assignmentsOf(order.id)
        const deadline = new Date(claim_deadline).getTime()
        const run = (now: number) =>
          claimDeliveryWorkflow(getContainer()).run({
            input: {
              order_id: order.id,
              agent_id: agent.id,
              request_id: `boundary-${now}`,
              now: new Date(now).toISOString(),
            },
            throwOnError: false,
          })
        const exactly = await run(deadline)
        expect(exactly.errors[0]?.error.message).toBe("claim_deadline_passed")
        const before = await run(deadline - 1)
        expect(before.errors).toEqual([])
        expect((await assignmentsOf(order.id)).assigned_agent_id).toBe(agent.id)
      })

      it("takes the actor from authentication and refuses other identities", async () => {
        const order = await acceptedOrder()
        const agent = await agentFor()
        const smuggled = await claim(agent.headers, order.id, {
          request_id: "smuggled",
          agent_id: "dagt_someone_else",
        })
        expect(smuggled.status).toBe(400)
        expect((await claim(agent.headers, order.id, {})).status).toBe(400)
        expect((await claim({}, order.id)).status).toBe(401)
        expect((await claim(staff, order.id)).status).toBe(401)
        expect((await claim(admin, order.id)).status).toBe(401)
        expect((await assignmentsOf(order.id)).assigned_agent_id).toBeNull()

        await delivery().revokeAgent({
          agent_id: agent.id,
          revoked_by: "operator",
        })
        expect((await claim(agent.headers, order.id)).status).toBe(403)
      })

      it("keeps responsibility after an area change, and ends access on revocation", async () => {
        const order = await acceptedOrder()
        const agent = await agentFor()
        expect((await claim(agent.headers, order.id)).status).toBe(200)
        await delivery().replaceApprovedAreas({
          agent_id: agent.id,
          postal_codes: [],
        })
        const kept = await current(agent.headers)
        expect(kept.status).toBe(200)
        expect(kept.data.delivery.order_id).toBe(order.id)
        expect((await claim(agent.headers, order.id)).status).toBe(200)

        await delivery().revokeAgent({
          agent_id: agent.id,
          revoked_by: "operator",
        })
        expect((await current(agent.headers)).status).toBe(403)
        // Revocation retains the historical responsibility.
        expect(await assignmentsOf(order.id)).toMatchObject({
          assigned_agent_id: agent.id,
          active_agent_id: agent.id,
        })
      })
    })

    describe("operator initial assignment", () => {
      it("lists unclaimed work with eligible agents and assigns one, recording the operator", async () => {
        const order = await acceptedOrder()
        const eligible = await agentFor(["2200"], "Eligible")
        await agentFor(["2100"], "Outside")
        const busy = await agentFor(["2200"], "Busy")
        expect(
          (await claim(busy.headers, (await acceptedOrder()).id)).status,
        ).toBe(200)
        const pending = await delivery().createDeliveryAgents({
          name: "Pending",
          email: "assignment-pending@example.test",
          status: "pending",
          invited_by: "operator",
        })
        await delivery().createDeliveryAgentAreas({
          agent_id: pending.id,
          postal_code: "2200",
        })

        const listed = await unclaimed()
        expect(listed.status).toBe(200)
        expect(listed.data.deliveries).toEqual([
          expect.objectContaining({
            order_id: order.id,
            order_reference: order.display_id,
            restaurant_name: "Pizzeria Nørrebro",
            pickup_postal_code: "2200",
            destination_postal_code: "2200",
            eligible_agents: [{ id: eligible.id, name: eligible.name }],
          }),
        ])
        expect(JSON.stringify(listed.data)).not.toMatch(PRIVATE)

        const assigned = await assign(order.id, {
          agent_id: eligible.id,
          request_id: "operator-1",
        })
        expect(assigned.status).toBe(200)
        const { data: users } = await api.get("/admin/users/me", {
          headers: admin,
        })
        expect(assigned.data.assignment).toMatchObject({
          order_id: order.id,
          agent: { id: eligible.id, name: eligible.name },
          assigned_by: users.user.id,
          source: "operator_assignment",
        })
        expect(await assignmentsOf(order.id)).toMatchObject({
          assigned_agent_id: eligible.id,
          active_agent_id: eligible.id,
          assigned_by: users.user.id,
        })
        const shown = await current(eligible.headers)
        expect(shown.data.delivery).toMatchObject({
          order_id: order.id,
          assignment_source: "operator_assignment",
          customer: { name: "Ada Lovelace" },
        })
        expect((await unclaimed()).data.deliveries).toEqual([])
        // A retry returns the same assignment; no reassignment is possible.
        const retry = await assign(order.id, {
          agent_id: eligible.id,
          request_id: "operator-1",
        })
        expect(retry.status).toBe(200)
        expect(retry.data.assignment.assigned_at).toBe(
          assigned.data.assignment.assigned_at,
        )
        const other = await agentFor()
        const reassign = await assign(order.id, {
          agent_id: other.id,
          request_id: "operator-2",
        })
        expect(reassign.status).toBe(409)
        expect(reassign.data.code).toBe("delivery_already_assigned")
      })

      it("applies the claim guards to the selected agent", async () => {
        const order = await acceptedOrder()
        const outside = await agentFor(["2100"])
        const refused = await assign(order.id, {
          agent_id: outside.id,
          request_id: "outside",
        })
        expect(refused.status).toBe(400)
        expect(refused.data.code).toBe("delivery_outside_approved_areas")
        const revoked = await agentFor()
        await delivery().revokeAgent({
          agent_id: revoked.id,
          revoked_by: "operator",
        })
        const notAuthorized = await assign(order.id, {
          agent_id: revoked.id,
          request_id: "revoked",
        })
        expect(notAuthorized.status).toBe(400)
        expect(notAuthorized.data.code).toBe("delivery_agent_not_authorized")
        const missing = await assign(order.id, {
          agent_id: "dagt_missing",
          request_id: "missing",
        })
        expect(missing.status).toBe(404)
        expect((await assign(order.id, { agent_id: outside.id })).status).toBe(
          400,
        )
        expect(
          (
            await assign(
              order.id,
              { agent_id: outside.id, request_id: "agent" },
              outside.headers,
            )
          ).status,
        ).toBe(401)
        expect((await assignmentsOf(order.id)).assigned_agent_id).toBeNull()
      })

      it("yields one responsibility when an operator races an agent's claim or another operator", async () => {
        const order = await acceptedOrder()
        const claimer = await agentFor()
        const selected = await agentFor()
        const raced = await Promise.all([
          claim(claimer.headers, order.id),
          assign(order.id, { agent_id: selected.id, request_id: "race-1" }),
        ])
        expect(raced.map(({ status }) => status).sort()).toEqual([200, 409])
        const record = await assignmentsOf(order.id)
        expect([claimer.id, selected.id]).toContain(record.assigned_agent_id)
        expect(record.active_agent_id).toBe(record.assigned_agent_id)

        const next = await acceptedOrder()
        const a = await agentFor()
        const b = await agentFor()
        const operators = await Promise.all([
          assign(next.id, { agent_id: a.id, request_id: "race-a" }),
          assign(next.id, { agent_id: b.id, request_id: "race-b" }),
        ])
        expect(operators.map(({ status }) => status).sort()).toEqual([200, 409])
      })

      it("is consistent when the agent's areas change or access ends during assignment", async () => {
        const order = await acceptedOrder()
        const agent = await agentFor()
        const [assigned] = await Promise.all([
          assign(order.id, { agent_id: agent.id, request_id: "area-race" }),
          delivery().replaceApprovedAreas({
            agent_id: agent.id,
            postal_codes: ["2100"],
          }),
        ])
        const record = await assignmentsOf(order.id)
        if (assigned.status === 200)
          expect(record.assigned_agent_id).toBe(agent.id)
        else {
          expect(assigned.data.code).toBe("delivery_outside_approved_areas")
          expect(record.assigned_agent_id).toBeNull()
        }

        const next = await acceptedOrder()
        const revoked = await agentFor()
        const [result] = await Promise.all([
          assign(next.id, { agent_id: revoked.id, request_id: "revoke-race" }),
          delivery().revokeAgent({
            agent_id: revoked.id,
            revoked_by: "operator",
          }),
        ])
        const after = await assignmentsOf(next.id)
        if (result.status === 200)
          expect(after.assigned_agent_id).toBe(revoked.id)
        else expect(after.assigned_agent_id).toBeNull()
        // Never a capacity hold without the responsibility, or the reverse.
        expect(after.active_agent_id).toBe(after.assigned_agent_id)
      })
    })

    it("names the town of each approved postal code, so the phone can filter by town", async () => {
      const agent = await agentFor(["2200", "2100"])
      const me = await api.get("/partner/delivery-agent/me", {
        headers: agent.headers,
      })
      expect(me.data.postal_codes).toEqual(["2100", "2200"])
      expect(me.data.areas).toEqual([
        { postal_code: "2100", name: "København Ø" },
        { postal_code: "2200", name: "København N" },
      ])
    })

    it("serves twenty simultaneous current-delivery reads within two seconds at p95", async () => {
      const agent = await agentFor()
      expect(
        (await claim(agent.headers, (await acceptedOrder()).id)).status,
      ).toBe(200)
      const samples = await Promise.all(
        Array.from({ length: 20 }, async () => {
          const started = performance.now()
          expect((await current(agent.headers)).status).toBe(200)
          return performance.now() - started
        }),
      )
      const p95 = samples.sort((x, y) => x - y)[18]
      console.log(
        `Current delivery, 20 concurrent reads: p95 ${Math.round(p95)} ms`,
      )
      expect(p95).toBeLessThan(2000)
    })
  },
})
