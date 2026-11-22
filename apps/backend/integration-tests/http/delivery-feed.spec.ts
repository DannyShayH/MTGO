import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
} from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import type DeliveryModuleService from "../../src/modules/delivery/service"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(240000)

medusaIntegrationTestRunner({
  dbName: "medusa_ci_delivery_feed_http",
  env: { JWT_SECRET: "ci-only-delivery-feed-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer, dbUtils }) => {
    const harness = restaurantOrdersHarness({ api, getContainer, dbUtils })
    const {
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
      staff = (await signInAsStaffOf(pizzeriaId, "feed-staff@example.test"))
        .headers
    })

    const delivery = () =>
      getContainer().resolve<DeliveryModuleService>(DELIVERY_MODULE)
    const secret = () =>
      getContainer().resolve(ContainerRegistrationKeys.CONFIG_MODULE)
        .projectConfig.http.jwtSecret as string
    const tokenFor = (
      actor_id: string,
      actor_type: string,
      expiresIn: string = "1h",
    ) =>
      `Bearer ${generateJwtToken(
        { actor_id, actor_type, auth_identity_id: "auth_test" },
        { secret: secret(), expiresIn },
      )}`
    let agents = 0
    const agentFor = async (postalCodes: string[] = ["2200"]) => {
      agents += 1
      const agent = await delivery().createDeliveryAgents({
        name: `Feed agent ${agents}`,
        email: `feed-agent-${agents}@example.test`,
        status: "authorized",
        invited_by: "operator",
      })
      await delivery().createDeliveryAgentAreas(
        postalCodes.map((postal_code) => ({
          agent_id: agent.id,
          postal_code,
        })),
      )
      return {
        id: agent.id,
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
        { request_id: `feed-claim-${++requests}` },
        { headers, validateStatus: () => true },
      )

    type FeedEvent = { event: string; data: Record<string, unknown> }
    /** A bounded wait: every expectation on the stream fails after this. */
    const WAIT = 10000
    const openStream = async (headers: Record<string, string>) => {
      const controller = new AbortController()
      const response = await fetch(
        `${api.defaults.baseURL}/partner/deliveries/stream`,
        {
          headers: { ...headers, accept: "text/event-stream" },
          signal: controller.signal,
        },
      )
      const events: FeedEvent[] = []
      let waiting: (() => void) | undefined
      let closed = false
      const pump = (async () => {
        if (!response.ok || !response.body) return
        const decoder = new TextDecoder()
        let buffer = ""
        try {
          for await (const chunk of response.body) {
            buffer += decoder.decode(chunk as Uint8Array, { stream: true })
            let end: number
            while ((end = buffer.indexOf("\n\n")) >= 0) {
              const raw = buffer.slice(0, end)
              buffer = buffer.slice(end + 2)
              const field = (name: string) =>
                raw
                  .split("\n")
                  .find((line) => line.startsWith(`${name}: `))
                  ?.slice(name.length + 2)
              const event = field("event")
              if (event)
                events.push({
                  event,
                  data: JSON.parse(field("data") ?? "{}"),
                })
              waiting?.()
            }
          }
        } catch {
          // Aborted by the test.
        } finally {
          closed = true
          waiting?.()
        }
      })()
      const next = async (
        event: string,
        matches: (data: Record<string, unknown>) => boolean = () => true,
      ) => {
        const deadline = Date.now() + WAIT
        for (;;) {
          const index = events.findIndex(
            (entry) => entry.event === event && matches(entry.data),
          )
          if (index >= 0) return events.splice(index, 1)[0].data
          if (closed) throw new Error(`stream closed before "${event}"`)
          const left = deadline - Date.now()
          if (left <= 0) throw new Error(`no "${event}" within ${WAIT} ms`)
          await new Promise<void>((resolve) => {
            waiting = resolve
            setTimeout(resolve, left)
          })
        }
      }
      return {
        response,
        events,
        next,
        ended: () =>
          Promise.race([
            pump.then(() => true),
            new Promise((resolve) => setTimeout(() => resolve(false), WAIT)),
          ]),
        close: () => controller.abort(),
      }
    }
    type Stream = Awaited<ReturnType<typeof openStream>>
    const streams: Stream[] = []
    afterEach(() => streams.splice(0).forEach((stream) => stream.close()))
    const open = async (headers: Record<string, string>) => {
      const stream = await openStream(headers)
      streams.push(stream)
      return stream
    }
    const hinted = (stream: Stream, scope: string) =>
      stream.next("deliveries", (data) =>
        (data.scopes as string[]).includes(scope),
      )

    describe("GET /partner/deliveries/stream", () => {
      it("opens as an event stream, proves itself with a heartbeat and sends no work details", async () => {
        const agent = await agentFor()
        const stream = await open(agent.headers)
        expect(stream.response.status).toBe(200)
        expect(stream.response.headers.get("content-type")).toContain(
          "text/event-stream",
        )
        expect(stream.response.headers.get("cache-control")).toContain(
          "no-transform",
        )
        await stream.next("ready")
        await stream.next("heartbeat")
      })

      it("announces new, claimed and readied work to an eligible agent, as scopes only", async () => {
        const agent = await agentFor()
        const stream = await open(agent.headers)
        await stream.next("ready")
        await stream.next("heartbeat")

        const order = await acceptedOrder()
        await hinted(stream, "available")
        expect((await startPreparation(staff, order.id)).status).toBe(200)
        await hinted(stream, "available")
        expect((await markReady(staff, order.id)).status).toBe(200)
        await hinted(stream, "available")

        expect((await claim(agent.headers, order.id)).status).toBe(200)
        await hinted(stream, "current")
        const text = JSON.stringify(stream.events)
        // Events carry scopes, never identities, addresses or contact data.
        expect(text).not.toContain(order.id)
        expect(text).not.toContain("2200")
      })

      it("does not tell another agent about work outside its approved areas or another agent's claim", async () => {
        const inArea = await agentFor(["2200"])
        const outside = await agentFor(["8000"])
        const stream = await open(outside.headers)
        await stream.next("ready")
        await stream.next("heartbeat")
        const order = await acceptedOrder()
        expect((await claim(inArea.headers, order.id)).status).toBe(200)
        await new Promise((resolve) => setTimeout(resolve, 5000))
        expect(
          stream.events.filter((entry) => entry.event === "deliveries"),
        ).toEqual([])
      })

      it("narrows the announced available work when the approved areas change", async () => {
        const agent = await agentFor(["2200"])
        const stream = await open(agent.headers)
        await stream.next("ready")
        await stream.next("heartbeat")
        const response = await api.post(
          `/admin/delivery-agents/${agent.id}/areas`,
          { postal_codes: ["8000"] },
          { headers: admin },
        )
        expect(response.status).toBe(200)
        await hinted(stream, "available")
        await acceptedOrder()
        await new Promise((resolve) => setTimeout(resolve, 5000))
        expect(
          stream.events.filter((entry) => entry.event === "deliveries"),
        ).toEqual([])
      })

      it.each([
        { actor: "restaurant_staff", status: 403 },
        { actor: "customer", status: 403 },
      ])("refuses a $actor actor and a missing token", async ({ actor }) => {
        const agent = await agentFor()
        const wrong = await fetch(
          `${api.defaults.baseURL}/partner/deliveries/stream`,
          { headers: { authorization: tokenFor(agent.id, actor) } },
        )
        expect(wrong.status).toBeGreaterThanOrEqual(401)
        expect(wrong.headers.get("content-type")).not.toContain(
          "text/event-stream",
        )
        await wrong.body?.cancel()
        const missing = await fetch(
          `${api.defaults.baseURL}/partner/deliveries/stream`,
        )
        expect(missing.status).toBe(401)
        await missing.body?.cancel()
      })

      it("refuses a revoked agent before opening", async () => {
        const agent = await agentFor()
        await api.post(
          `/admin/delivery-agents/${agent.id}/revoke`,
          {},
          { headers: admin },
        )
        const response = await fetch(
          `${api.defaults.baseURL}/partner/deliveries/stream`,
          { headers: agent.headers },
        )
        expect(response.status).toBe(403)
        expect((await response.json()).code).toBe(
          "delivery_agent_access_revoked",
        )
      })

      it("ends an open stream when access is revoked, before announcing further work", async () => {
        const agent = await agentFor()
        const stream = await open(agent.headers)
        await stream.next("ready")
        await api.post(
          `/admin/delivery-agents/${agent.id}/revoke`,
          {},
          { headers: admin },
        )
        expect(await stream.next("ended")).toEqual({
          code: "delivery_agent_access_revoked",
        })
        expect(await stream.ended()).toBe(true)
        await acceptedOrder()
        expect(
          stream.events.filter((entry) => entry.event === "deliveries"),
        ).toEqual([])
      })

      it("ends an open stream when the session token expires", async () => {
        const agent = await agentFor()
        const stream = await open({
          authorization: tokenFor(agent.id, "delivery_agent", "2s"),
        })
        await stream.next("ready")
        expect(await stream.next("ended")).toEqual({ code: "session_expired" })
        expect(await stream.ended()).toBe(true)
      })

      it("takes a fresh baseline on reconnect: no replay of old changes, and later changes are announced", async () => {
        const agent = await agentFor()
        const first = await open(agent.headers)
        await first.next("ready")
        await first.next("heartbeat")
        first.close()
        // Changed while disconnected: the reconnect's own reread covers it.
        await acceptedOrder()
        const second = await open(agent.headers)
        await second.next("ready")
        await second.next("heartbeat")
        expect(
          second.events.filter((entry) => entry.event === "deliveries"),
        ).toEqual([])
        await acceptedOrder()
        await hinted(second, "available")
      })

      it("closes without an ended code when a read fails, so the phone reconnects or polls", async () => {
        const agent = await agentFor()
        const stream = await open(agent.headers)
        await stream.next("ready")
        await stream.next("heartbeat")
        const reads = jest
          .spyOn(delivery(), "listDeliveryAgentAreas")
          .mockRejectedValue(new Error("database unavailable"))
        expect(await stream.ended()).toBe(true)
        expect(stream.events.map((entry) => entry.event)).not.toContain("ended")
        reads.mockRestore()
      })

      it("stops reading once the phone disconnects", async () => {
        const agent = await agentFor()
        const reads = jest.spyOn(delivery(), "listDeliveryAgentAreas")
        const feedReads = () =>
          reads.mock.calls.filter(
            ([filters]) =>
              (filters as { agent_id?: string } | undefined)?.agent_id ===
              agent.id,
          ).length
        const stream = await open(agent.headers)
        await stream.next("ready")
        await new Promise((resolve) => setTimeout(resolve, 2500))
        expect(feedReads()).toBeGreaterThan(0)
        stream.close()
        await new Promise((resolve) => setTimeout(resolve, 2500))
        const settled = feedReads()
        await new Promise((resolve) => setTimeout(resolve, 5000))
        expect(feedReads()).toBe(settled)
        reads.mockRestore()
      })
    })
  },
})
