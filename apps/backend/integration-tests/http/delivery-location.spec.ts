import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import winston from "winston"
import {
  ContainerRegistrationKeys,
  Modules,
  generateJwtToken,
} from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import type DeliveryModuleService from "../../src/modules/delivery/service"
import { endDeliveryWorkflow } from "../../src/workflows/delivery/terminal"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"
import { openEventStream, type EventStream } from "../helpers/event-stream"

jest.setTimeout(240000)

// Decimal coordinates the phone sends; never to be found in logs or refusals.
const POSITION = { latitude: 55.681234, longitude: 12.571234 }
const TRACE = /55\.6812|12\.5712/

medusaIntegrationTestRunner({
  dbName: "medusa_ci_delivery_location_http",
  env: { JWT_SECRET: "ci-only-delivery-location-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer, dbUtils }) => {
    const harness = restaurantOrdersHarness({ api, getContainer, dbUtils })
    const {
      placePaidOrder,
      signInAsStaffOf,
      accept,
      startPreparation,
      markReady,
    } = harness
    let pizzeriaId: string
    let staff: Record<string, string>
    let customer: Record<string, string>
    let output = ""
    beforeEach(async () => {
      ;({ pizzeriaId, customer } = harness.seeded())
      staff = (await signInAsStaffOf(pizzeriaId, "location-staff@example.test"))
        .headers
      output = ""
      const write = winston.transports.Console.prototype.log
      jest
        .spyOn(winston.transports.Console.prototype, "log")
        .mockImplementation(function (info: any, callback) {
          output += `${info[Symbol.for("message")]}\n`
          write.call(this, info, callback)
        })
    })
    afterEach(() => jest.restoreAllMocks())

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
        name: `Location agent ${agents}`,
        email: `location-agent-${agents}@example.test`,
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
    const post = (
      path: string,
      headers: Record<string, string>,
      body: unknown,
    ) => api.post(path, body, { headers, validateStatus: () => true })
    const claim = (headers: Record<string, string>, orderId: string) =>
      post(`/partner/delivery-agent/available/${orderId}/claim`, headers, {
        request_id: `location-claim-${++requests}`,
      })
    const pickup = (headers: Record<string, string>, orderId: string) =>
      post(`/partner/deliveries/${orderId}/pickup`, headers, {
        request_id: `location-pickup-${++requests}`,
      })
    const deliver = (headers: Record<string, string>, orderId: string) =>
      post(`/partner/deliveries/${orderId}/deliver`, headers, {
        request_id: `location-deliver-${++requests}`,
      })
    const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
    const share = (
      headers: Record<string, string>,
      orderId: string,
      body: unknown = { ...POSITION, accuracy_m: 14, observed_at: ago(2000) },
    ) => post(`/partner/deliveries/${orderId}/location`, headers, body)
    const customerView = (orderId: string, headers = customer) =>
      api.get(`/store/orders/${orderId}/delivery`, {
        headers,
        validateStatus: () => true,
      })
    const trackingView = (orderId: string, headers = customer) =>
      api.get(`/store/orders/${orderId}/tracking`, {
        headers,
        validateStatus: () => true,
      })
    const locationOf = async (order_id: string) =>
      delivery().listDeliveryLocations({ order_id })
    /** Pretend the retained sample arrived long ago, so the next is not coalesced. */
    const ageRetained = async (order_id: string) => {
      const [retained] = await locationOf(order_id)
      await delivery().updateDeliveryLocations({
        id: retained.id,
        received_at: new Date(Date.now() - 30_000),
      })
    }

    const claimedOrder = async () => {
      const order = await placePaidOrder(pizzeriaId)
      expect((await accept(staff, order.id)).status).toBe(200)
      const agent = await agentFor()
      expect((await claim(agent.headers, order.id)).status).toBe(200)
      return { order, agent }
    }
    const collectedOrder = async () => {
      const claimed = await claimedOrder()
      expect((await startPreparation(staff, claimed.order.id)).status).toBe(200)
      expect((await markReady(staff, claimed.order.id)).status).toBe(200)
      expect(
        (await pickup(claimed.agent.headers, claimed.order.id)).status,
      ).toBe(200)
      return claimed
    }

    describe("POST /partner/deliveries/:id/location", () => {
      it("keeps the responsible agent's latest sample after pickup and shows it to the ordering Customer with its observation time", async () => {
        const { order, agent } = await collectedOrder()
        const before = await customerView(order.id)
        expect(
          (await trackingView(order.id)).data.progress.delivery.location,
        ).toMatchObject({
          state: "unavailable",
          latitude: null,
          revision: null,
        })
        expect(before.status).toBe(200)
        expect(before.headers["cache-control"]).toBe("no-store")
        expect(before.data.delivery.location).toEqual({
          state: "unavailable",
          latitude: null,
          longitude: null,
          accuracy_m: null,
          observed_at: null,
          received_at: null,
          stale_at: null,
          revision: null,
        })

        const observed_at = ago(3000)
        const shared = await share(agent.headers, order.id, {
          ...POSITION,
          accuracy_m: 14,
          observed_at,
        })
        expect(shared.status).toBe(200)
        expect(shared.data.location).toEqual({
          accepted: true,
          observed_at,
          received_at: expect.any(String),
        })
        // The phone's answer never echoes the coordinate.
        expect(JSON.stringify(shared.data)).not.toMatch(TRACE)

        const view = await customerView(order.id)
        const tracked = (await trackingView(order.id)).data.progress.delivery
          .location
        expect(tracked).toMatchObject({
          state: "fresh",
          accuracy_m: 14,
          observed_at,
          received_at: shared.data.location.received_at,
          revision: 1,
        })
        expect(tracked.latitude).toBeCloseTo(POSITION.latitude, 4)
        expect(tracked.longitude).toBeCloseTo(POSITION.longitude, 4)
        expect(view.data.delivery).toMatchObject({
          picked_up_at: expect.any(String),
          outcome: null,
          location: {
            state: "fresh",
            accuracy_m: 14,
            observed_at,
            received_at: shared.data.location.received_at,
            stale_at: new Date(Date.parse(observed_at) + 60_000).toISOString(),
            revision: 1,
          },
        })
        expect(view.data.delivery.location.latitude).toBeCloseTo(
          POSITION.latitude,
          4,
        )
        expect(view.data.delivery.location.longitude).toBeCloseTo(
          POSITION.longitude,
          4,
        )
        // No agent identity reaches the Customer.
        expect(JSON.stringify(view.data)).not.toContain(agent.id)

        // A newer sample replaces it: one row, never a route.
        await ageRetained(order.id)
        const next = await share(agent.headers, order.id, {
          latitude: 55.7,
          longitude: 12.6,
          observed_at: ago(500),
        })
        expect(next.status).toBe(200)
        expect(next.data.location.accepted).toBe(true)
        const retained = await locationOf(order.id)
        expect(retained).toHaveLength(1)
        expect(retained[0]).toMatchObject({ revision: 2, accuracy_m: null })
        expect(retained[0].latitude).toBeCloseTo(55.7, 4)
        expect(
          (await customerView(order.id)).data.delivery.location,
        ).toMatchObject({ revision: 2, accuracy_m: null })
        // The coordinate is never logged.
        expect(output).not.toMatch(TRACE)
      })

      it("labels a delayed upload of an old observation stale, whatever its receipt time", async () => {
        const { order, agent } = await collectedOrder()
        const observed_at = ago(61_000)
        expect(
          (await share(agent.headers, order.id, { ...POSITION, observed_at }))
            .status,
        ).toBe(200)
        const view = await customerView(order.id)
        const tracked = (await trackingView(order.id)).data.progress.delivery
          .location
        expect(tracked).toMatchObject({
          state: "stale",
          observed_at,
          revision: 1,
        })
        expect(tracked.latitude).toBeCloseTo(POSITION.latitude, 4)
        expect(tracked.longitude).toBeCloseTo(POSITION.longitude, 4)
        expect(view.data.delivery.location).toMatchObject({
          state: "stale",
          observed_at,
        })
        expect(
          Date.parse(view.data.delivery.location.received_at),
        ).toBeGreaterThan(Date.parse(observed_at) + 60_000)
      })

      it("refuses future, too old and out-of-order observations and coalesces a burst", async () => {
        const { order, agent } = await collectedOrder()
        const future = await share(agent.headers, order.id, {
          ...POSITION,
          observed_at: new Date(Date.now() + 60_000).toISOString(),
        })
        expect(future.status).toBe(400)
        expect(future.data.code).toBe("location_observed_in_future")
        const old = await share(agent.headers, order.id, {
          ...POSITION,
          observed_at: ago(11 * 60_000),
        })
        expect(old.status).toBe(400)
        expect(old.data.code).toBe("location_observation_too_old")
        expect(await locationOf(order.id)).toHaveLength(0)

        const first = ago(10_000)
        expect(
          (
            await share(agent.headers, order.id, {
              ...POSITION,
              observed_at: first,
            })
          ).status,
        ).toBe(200)
        // A newer sample right after is not stored, and nothing is refused.
        const burst = await share(agent.headers, order.id, {
          ...POSITION,
          observed_at: ago(1000),
        })
        expect(burst.status).toBe(200)
        expect(burst.data.location).toMatchObject({
          accepted: false,
          observed_at: first,
        })
        // A delayed older or repeated observation never replaces the newer one.
        await ageRetained(order.id)
        for (const observed_at of [first, ago(20_000)]) {
          const late = await share(agent.headers, order.id, {
            ...POSITION,
            observed_at,
          })
          expect(late.status).toBe(409)
          expect(late.data.code).toBe("location_out_of_order")
        }
        expect((await locationOf(order.id))[0]).toMatchObject({ revision: 1 })
      })

      it("refuses sharing before pickup, by another agent without revealing the delivery, by other actors and after revocation", async () => {
        const { order, agent } = await claimedOrder()
        const early = await share(agent.headers, order.id)
        expect(early.status).toBe(400)
        expect(early.data.code).toBe("pickup_not_recorded")

        expect((await startPreparation(staff, order.id)).status).toBe(200)
        expect((await markReady(staff, order.id)).status).toBe(200)
        expect((await pickup(agent.headers, order.id)).status).toBe(200)
        const other = await agentFor()
        // Another agent's delivery answers exactly like a missing one.
        const foreign = await share(other.headers, order.id)
        const unknown = await share(other.headers, "order_unknown")
        expect(foreign.status).toBe(404)
        expect(unknown.status).toBe(404)
        expect(foreign.data).toEqual(unknown.data)
        expect((await share(staff, order.id)).status).toBe(401)
        expect((await share(customer, order.id)).status).toBe(401)
        expect((await share({}, order.id)).status).toBe(401)
        expect(await locationOf(order.id)).toHaveLength(0)

        // Revocation stops writes; responsibility stays.
        await delivery().revokeAgent({ agent_id: agent.id, revoked_by: "op" })
        const revoked = await share(agent.headers, order.id)
        expect(revoked.status).toBe(403)
        expect(revoked.data.code).toBe("delivery_agent_access_revoked")
        expect(await locationOf(order.id)).toHaveLength(0)
      })

      it("refuses malformed or oversized samples with one code, without echoing or logging them", async () => {
        const { order, agent } = await collectedOrder()
        const observed_at = ago(1000)
        for (const body of [
          { ...POSITION, latitude: 90.5, observed_at },
          { ...POSITION, longitude: -180.5, observed_at },
          { ...POSITION, latitude: "55.681234", observed_at },
          { ...POSITION, observed_at: "yesterday" },
          { ...POSITION },
          { ...POSITION, accuracy_m: -1, observed_at },
          { ...POSITION, observed_at, heading: 90 },
          { ...POSITION, observed_at, agent_id: "dagt_other" },
          [{ ...POSITION, observed_at }],
        ]) {
          const refused = await share(agent.headers, order.id, body)
          expect(refused.status).toBe(400)
          expect(refused.data).toEqual({
            type: "invalid_data",
            code: "location_invalid",
            message: "location_invalid",
          })
        }
        const large = await share(agent.headers, order.id, {
          ...POSITION,
          observed_at,
          padding: "x".repeat(2048),
        })
        expect(large.status).toBe(413)
        expect(large.data.code).toBe("location_too_large")
        expect(await locationOf(order.id)).toHaveLength(0)
        expect(output).not.toMatch(TRACE)
      })
    })

    describe("terminal cleanup", () => {
      it("removes the coordinate with the handover, keeps the milestones and refuses later writes", async () => {
        const { order, agent } = await collectedOrder()
        expect((await share(agent.headers, order.id)).status).toBe(200)
        const delivered = await deliver(agent.headers, order.id)
        expect(delivered.status).toBe(200)
        expect(await locationOf(order.id)).toHaveLength(0)

        const view = await customerView(order.id)
        expect(view.data.delivery).toMatchObject({
          picked_up_at: expect.any(String),
          delivered_at: delivered.data.delivery.ended_at,
          outcome: "delivered",
          location: { state: "ended", latitude: null, observed_at: null },
        })
        expect(
          (await trackingView(order.id)).data.progress.delivery,
        ).toMatchObject({
          outcome: "delivered",
          location: { state: "ended", latitude: null, revision: null },
        })
        const late = await share(agent.headers, order.id, {
          ...POSITION,
          observed_at: ago(100),
        })
        expect(late.status).toBe(400)
        expect(late.data.code).toBe("delivery_not_active")
        expect(await locationOf(order.id)).toHaveLength(0)
      })

      it.each(["failed", "cancelled"] as const)(
        "removes the coordinate when the delivery ends as %s",
        async (outcome) => {
          const { order, agent } = await collectedOrder()
          expect((await share(agent.headers, order.id)).status).toBe(200)
          // The shared terminal boundary of #49's failure and #162's cancellation.
          await endDeliveryWorkflow(getContainer()).run({
            input: { order_id: order.id, outcome, actor_id: "user_op" },
          })
          expect(await locationOf(order.id)).toHaveLength(0)
          expect((await customerView(order.id)).data.delivery).toMatchObject({
            outcome,
            location: { state: "ended", latitude: null, revision: null },
          })
          expect(
            (await trackingView(order.id)).data.progress.delivery,
          ).toMatchObject({
            outcome,
            location: { state: "ended", latitude: null, revision: null },
          })
          const late = await share(agent.headers, order.id, {
            ...POSITION,
            observed_at: ago(100),
          })
          expect(late.status).toBe(400)
          expect(late.data.code).toBe("delivery_not_active")
        },
      )

      it("undoes an accepted sample only while it is still the kept one, never after the end", async () => {
        const { order, agent } = await collectedOrder()
        const first = ago(10_000)
        expect(
          (
            await share(agent.headers, order.id, {
              ...POSITION,
              observed_at: first,
            })
          ).status,
        ).toBe(200)
        const [previous] = await locationOf(order.id)
        await ageRetained(order.id)
        expect(
          (
            await share(agent.headers, order.id, {
              latitude: 55.7,
              longitude: 12.6,
              observed_at: ago(1000),
            })
          ).status,
        ).toBe(200)

        // The step's compensation brings back the replaced sample.
        await delivery().restoreLocation({
          order_id: order.id,
          revision: 2,
          previous,
        })
        const [restored] = await locationOf(order.id)
        expect(restored).toMatchObject({ revision: 3 })
        expect(restored.observed_at.toISOString()).toBe(first)
        expect(restored.latitude).toBeCloseTo(POSITION.latitude, 4)
        // A stale undo of a sample already replaced changes nothing.
        await delivery().restoreLocation({
          order_id: order.id,
          revision: 2,
          previous: null,
        })
        expect(await locationOf(order.id)).toHaveLength(1)

        // After the end, an undo never brings a coordinate back.
        expect((await deliver(agent.headers, order.id)).status).toBe(200)
        await delivery().restoreLocation({
          order_id: order.id,
          revision: 3,
          previous,
        })
        expect(await locationOf(order.id)).toHaveLength(0)
      })

      it("undoes a first sample by removing it, and never lets an older write replace a newer one", async () => {
        const { order, agent } = await collectedOrder()
        const kept = ago(1000)
        expect(
          (
            await share(agent.headers, order.id, {
              ...POSITION,
              observed_at: kept,
            })
          ).status,
        ).toBe(200)
        const command = {
          ...POSITION,
          accuracy_m: null,
          order_id: order.id,
          agent_id: agent.id,
          observed_at: new Date(ago(5000)),
          order_active: true,
          now: new Date(),
        }
        // The write's selector holds even if a decision missed a newer sample.
        const raced = await delivery().recordLocation(command, () => ({
          outcome: "record",
          observed_at: command.observed_at,
        }))
        expect(raced.outcome).toEqual({ outcome: "superseded" })
        const [unchanged] = await locationOf(order.id)
        expect(unchanged.observed_at.toISOString()).toBe(kept)

        await delivery().restoreLocation({
          order_id: order.id,
          revision: 1,
          previous: null,
        })
        expect(await locationOf(order.id)).toHaveLength(0)
      })

      it("leaves no coordinate when uploads race the handover", async () => {
        const { order, agent } = await collectedOrder()
        const results = await Promise.all([
          share(agent.headers, order.id, {
            ...POSITION,
            observed_at: ago(3000),
          }),
          deliver(agent.headers, order.id),
          share(agent.headers, order.id, {
            ...POSITION,
            observed_at: ago(2000),
          }),
          share(agent.headers, order.id, {
            ...POSITION,
            observed_at: ago(1000),
          }),
        ])
        expect(results[1].status).toBe(200)
        for (const response of [results[0], results[2], results[3]])
          expect([200, 400, 409]).toContain(response.status)
        expect(await locationOf(order.id)).toHaveLength(0)
        expect(
          (await customerView(order.id)).data.delivery.location.state,
        ).toBe("ended")
      })

      it("keeps one sample when uploads compete", async () => {
        const { order, agent } = await collectedOrder()
        const results = await Promise.all(
          [4000, 3000, 2000, 1000].map((ms) =>
            share(agent.headers, order.id, {
              ...POSITION,
              observed_at: ago(ms),
            }),
          ),
        )
        for (const response of results)
          expect([200, 409]).toContain(response.status)
        expect(await locationOf(order.id)).toHaveLength(1)
      })
    })

    describe("GET /store/orders/:id/delivery", () => {
      it("is the owning Customer's only", async () => {
        const { order, agent } = await collectedOrder()
        expect((await share(agent.headers, order.id)).status).toBe(200)
        const other = await harness.registerCustomer(
          "location-other@example.test",
        )
        expect((await customerView(order.id, other.headers)).status).toBe(404)
        const { store } = harness.seeded()
        expect((await customerView(order.id, store)).status).toBe(401)
        expect(
          (await customerView(order.id, { ...store, ...agent.headers })).status,
        ).toBe(401)
      })

      it("is not started before pickup, and empty before acceptance", async () => {
        const { order } = await claimedOrder()
        expect((await customerView(order.id)).data.delivery).toMatchObject({
          assigned_at: expect.any(String),
          picked_up_at: null,
          location: { state: "not_started", latitude: null },
        })
        const unaccepted = await placePaidOrder(pizzeriaId)
        expect((await customerView(unaccepted.id)).data).toEqual({
          delivery: null,
          server_time: expect.any(String),
        })
        expect(
          (await trackingView(unaccepted.id)).data.progress.delivery,
        ).toBeNull()
      })

      it("answers twenty simultaneous Customer reads with 95% within two seconds", async () => {
        const { order, agent } = await collectedOrder()
        expect((await share(agent.headers, order.id)).status).toBe(200)
        const durations = await Promise.all(
          Array.from({ length: 20 }, async () => {
            const started = performance.now()
            const response = await customerView(order.id)
            expect(response.status).toBe(200)
            return performance.now() - started
          }),
        )
        const sorted = durations.sort((a, b) => a - b)
        const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]
        expect(p95).toBeLessThan(2000)
      })
    })

    describe("GET /store/orders/:id/tracking/stream", () => {
      const streams: EventStream[] = []
      afterEach(() => streams.splice(0).forEach((stream) => stream.close()))
      const open = async (orderId: string, headers = customer) => {
        const stream = await openEventStream(
          `${api.defaults.baseURL}/store/orders/${orderId}/tracking/stream`,
          headers,
        )
        streams.push(stream)
        return stream
      }
      const secret = () =>
        getContainer().resolve(ContainerRegistrationKeys.CONFIG_MODULE)
          .projectConfig.http.jwtSecret as string
      /** The Customer's own signed-in token, re-signed to expire sooner. */
      const customerExpiringIn = (expiresIn: string) => {
        const token = customer.authorization.replace(/^Bearer /, "")
        const {
          exp: _exp,
          iat: _iat,
          ...claims
        } = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())
        return {
          ...customer,
          authorization: `Bearer ${generateJwtToken(claims, {
            secret: secret(),
            expiresIn,
          })}`,
        }
      }
      const tokens = (stream: EventStream) =>
        stream.events
          .filter((entry) => entry.event === "tracking")
          .map((entry) => entry.data)

      it("gives the tracking read a change token that ignores the read time", async () => {
        const { order, agent } = await collectedOrder()
        expect((await share(agent.headers, order.id)).status).toBe(200)
        const first = await trackingView(order.id)
        await new Promise((resolve) => setTimeout(resolve, 1100))
        const again = await trackingView(order.id)
        expect(first.headers["cache-control"]).toBe("no-store")
        expect(again.data.server_time).not.toBe(first.data.server_time)
        expect(first.data.change_token).toMatch(/^[0-9a-f]{16}$/)
        expect(again.data.change_token).toBe(first.data.change_token)

        await ageRetained(order.id)
        expect((await share(agent.headers, order.id)).status).toBe(200)
        expect((await trackingView(order.id)).data.change_token).not.toBe(
          first.data.change_token,
        )
      })

      it("refuses before opening: signed out, another Customer's and an unknown Order", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const { store } = harness.seeded()
        expect((await open(order.id, store)).response.status).toBe(401)
        const other = await harness.registerCustomer(
          "stream-other@example.test",
        )
        const foreign = await open(order.id, other.headers)
        const unknown = await open("order_unknown", customer)
        expect(foreign.response.status).toBe(404)
        expect(unknown.response.status).toBe(404)
        expect(await foreign.response.text()).toBe(
          await unknown.response.text(),
        )
      })

      it("opens as an uncached event stream and proves itself with a heartbeat", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const stream = await open(order.id)
        expect(stream.response.status).toBe(200)
        expect(stream.response.headers.get("content-type")).toContain(
          "text/event-stream",
        )
        expect(stream.response.headers.get("cache-control")).toContain(
          "no-transform",
        )
        expect(stream.response.headers.get("x-accel-buffering")).toBe("no")
        await stream.next("ready")
        await stream.next("heartbeat")
        expect(tokens(stream)).toEqual([])
      })

      it("hints recorded progress and location changes with a token only, never the position", async () => {
        const { order, agent } = await claimedOrder()
        const stream = await open(order.id)
        await stream.next("ready")
        await stream.next("heartbeat")

        expect((await startPreparation(staff, order.id)).status).toBe(200)
        const preparing = await stream.next("tracking")
        expect(Object.keys(preparing)).toEqual(["change_token"])
        expect(preparing.change_token).toBe(
          (await trackingView(order.id)).data.change_token,
        )

        expect((await markReady(staff, order.id)).status).toBe(200)
        await stream.next("tracking")
        expect((await pickup(agent.headers, order.id)).status).toBe(200)
        await stream.next("tracking")
        expect((await share(agent.headers, order.id)).status).toBe(200)
        await stream.next("tracking")
        expect(stream.raw()).not.toMatch(TRACE)
        expect(stream.raw()).not.toContain(agent.id)
        // A quiet stream repeats nothing.
        await new Promise((resolve) => setTimeout(resolve, 4500))
        expect(tokens(stream)).toEqual([])
      })

      it("ends an open stream when the session token expires", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const stream = await open(order.id, customerExpiringIn("3s"))
        await stream.next("ready")
        expect(await stream.next("ended")).toEqual({ code: "session_expired" })
        expect(await stream.ended()).toBe(true)
      })

      it("ends an open stream when the Customer's sign-in is no longer valid", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const stream = await open(order.id)
        await stream.next("ready")
        await stream.next("heartbeat")
        const auth = getContainer().resolve(Modules.AUTH)
        const [provider] = await auth.listProviderIdentities({
          provider: "customer-emailpass",
          entity_id: "orders-customer@example.test",
        })
        await auth.updateProviderIdentities({
          id: provider.id,
          user_metadata: {
            ...provider.user_metadata,
            security_version: "revoked-elsewhere",
          },
        })
        expect(await stream.next("ended")).toEqual({
          code: "sign_in_required",
        })
        expect(await stream.ended()).toBe(true)
      })

      it("closes without an ended code when a read fails, so the page falls back", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const stream = await open(order.id)
        await stream.next("ready")
        await stream.next("heartbeat")
        jest
          .spyOn(delivery(), "listIntendedDeliveries")
          .mockRejectedValue(new Error("database unavailable"))
        expect(await stream.ended()).toBe(true)
        expect(stream.events.map((entry) => entry.event)).not.toContain("ended")
      })

      it("stops reading once the browser disconnects", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const reads = jest.spyOn(delivery(), "listIntendedDeliveries")
        const orderReads = () =>
          reads.mock.calls.filter(
            ([filters]) =>
              (filters as { order_id?: string } | undefined)?.order_id ===
              order.id,
          ).length
        const stream = await open(order.id)
        await stream.next("ready")
        await stream.next("heartbeat")
        stream.close()
        await new Promise((resolve) => setTimeout(resolve, 2500))
        const settled = orderReads()
        await new Promise((resolve) => setTimeout(resolve, 5000))
        expect(orderReads()).toBe(settled)
      })
    })
  },
})
