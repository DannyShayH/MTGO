import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import winston from "winston"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
} from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import type DeliveryModuleService from "../../src/modules/delivery/service"
import { establishIntendedDeliveryWorkflow } from "../../src/workflows/delivery/available"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(240000)

/**
 * A stand-in for openrouteservice (#191): no network calls leave the test.
 * Each known street sits at fixed coordinates; the matrix answers a fixed
 * distance per pickup, so nearest-first order is known in advance.
 */
const PLACES: Record<string, [number, number]> = {
  "Nørrebrogade 1": [12.5536, 55.6926], // Pizzeria Nørrebro
  "Nørrebrogade 2": [12.5541, 55.6931], // Burgerbaren
  "Testvej 1": [12.5391, 55.7012], // the Customer
}
const FROM_AGENT: Record<string, number> = {
  "12.5536,55.6926": 2449,
  "12.5541,55.6931": 751,
}
type Mode = "ok" | "error" | "quota"
const provider = {
  mode: "ok" as Mode,
  calls: [] as { path: string; body: any; authorization?: string }[],
}
let server: Server

// Decimal coordinates the agent sends; never to be found in logs or records.
const AGENT = { latitude: 55.681234, longitude: 12.571234 }
const AGENT_TRACE = /55\.6812|12\.5712/

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = ""
    req.on("data", (chunk) => (raw += chunk))
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://ors.test")
      const body = raw ? JSON.parse(raw) : null
      provider.calls.push({
        path: url.pathname,
        body,
        authorization: req.headers.authorization,
      })
      const reply = (status: number, payload: unknown) => {
        res.writeHead(status, { "content-type": "application/json" })
        res.end(JSON.stringify(payload))
      }
      if (provider.mode === "error") return reply(502, { error: "down" })
      if (provider.mode === "quota") return reply(429, { error: "quota" })
      if (url.pathname === "/pelias/v1/search/structured") {
        const place = PLACES[url.searchParams.get("address") ?? ""]
        return reply(200, {
          // Like openrouteservice: an unknown address falls back to the
          // centre of Denmark, which must never be taken for the address.
          features: [
            place
              ? {
                  geometry: { coordinates: place },
                  properties: { layer: "address", match_type: "exact" },
                }
              : {
                  geometry: { coordinates: [10, 56] },
                  properties: { layer: "country", match_type: "fallback" },
                },
          ],
        })
      }
      if (url.pathname === "/openrouteservice/v2/directions/cycling-regular")
        return reply(200, { routes: [{ summary: { distance: 3249.7 } }] })
      if (url.pathname === "/openrouteservice/v2/matrix/cycling-regular")
        return reply(200, {
          distances: [
            body.destinations.map(
              (index: number) =>
                FROM_AGENT[body.locations[index].join(",")] ?? null,
            ),
          ],
        })
      reply(404, {})
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  // Set before the runner loads medusa-config, which it does before `env`.
  process.env.ORS_API_KEY = "ci-only-ors-key"
  process.env.ORS_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => {
  delete process.env.ORS_API_KEY
  delete process.env.ORS_BASE_URL
  await new Promise((resolve) => server.close(resolve))
})

medusaIntegrationTestRunner({
  dbName: "medusa_ci_delivery_distance_http",
  env: {
    JWT_SECRET: "ci-only-delivery-distance-secret",
    REDIS_URL: "",
  },
  testSuite: ({ api, getContainer, dbUtils }) => {
    const harness = restaurantOrdersHarness({ api, getContainer, dbUtils })
    const { placePaidOrder, signInAsStaffOf, accept } = harness
    let pizzeriaId: string
    let burgerId: string
    let pizzeriaStaff: Record<string, string>
    let burgerStaff: Record<string, string>
    let output = ""
    beforeEach(async () => {
      ;({ pizzeriaId, burgerId } = harness.seeded())
      pizzeriaStaff = (
        await signInAsStaffOf(pizzeriaId, "distance-pizza@example.test")
      ).headers
      burgerStaff = (
        await signInAsStaffOf(burgerId, "distance-burger@example.test")
      ).headers
      provider.mode = "ok"
      provider.calls = []
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
    const agentFor = async (postal_codes = ["2200"]) => {
      agents += 1
      const agent = await delivery().createDeliveryAgents({
        name: `Distance agent ${agents}`,
        email: `distance-agent-${agents}@example.test`,
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
        headers: { authorization: tokenFor(agent.id, "delivery_agent") },
      }
    }
    const acceptedOrder = async (
      restaurantId = pizzeriaId,
      staff = pizzeriaStaff,
    ) => {
      const order = await placePaidOrder(restaurantId)
      expect((await accept(staff, order.id)).status).toBe(200)
      return order
    }
    const recordOf = async (order_id: string) =>
      (await delivery().listIntendedDeliveries({ order_id }))[0]
    const available = (headers: Record<string, string>) =>
      api.get("/partner/delivery-agent/available", {
        headers,
        validateStatus: () => true,
      })
    const detail = (headers: Record<string, string>, orderId: string) =>
      api.get(`/partner/delivery-agent/available/${orderId}`, {
        headers,
        validateStatus: () => true,
      })
    const current = (headers: Record<string, string>) =>
      api.get("/partner/delivery-agent/current", {
        headers,
        validateStatus: () => true,
      })
    let claims = 0
    const claim = (headers: Record<string, string>, orderId: string) =>
      api.post(
        `/partner/delivery-agent/available/${orderId}/claim`,
        { request_id: `distance-claim-${++claims}` },
        { headers, validateStatus: () => true },
      )
    const distances = (headers: Record<string, string>, body: unknown) =>
      api.post("/partner/delivery-agent/pickup-distances", body, {
        headers,
        validateStatus: () => true,
      })

    describe("trip distance on acceptance", () => {
      it("stores both points and one rounded trip distance, and shows only the distance before assignment", async () => {
        const order = await acceptedOrder()
        expect(await recordOf(order.id)).toMatchObject({
          pickup_latitude: expect.closeTo(55.6926, 4),
          pickup_longitude: expect.closeTo(12.5536, 4),
          destination_latitude: expect.closeTo(55.7012, 4),
          destination_longitude: expect.closeTo(12.5391, 4),
          trip_distance_m: 3200,
          trip_measured_at: expect.any(Date),
        })
        // The key goes in a header; no route geometry is ever requested.
        expect(provider.calls.map(({ path }) => path).sort()).toEqual([
          "/openrouteservice/v2/directions/cycling-regular",
          "/pelias/v1/search/structured",
          "/pelias/v1/search/structured",
        ])
        expect(
          provider.calls.every(
            ({ authorization }) => authorization === "ci-only-ors-key",
          ),
        ).toBe(true)

        const agent = await agentFor()
        const list = (await available(agent.headers)).data
        expect(list.deliveries[0]).toMatchObject({
          order_id: order.id,
          trip_distance_km: 3.2,
        })
        const one = (await detail(agent.headers, order.id)).data
        expect(one.delivery.trip_distance_km).toBe(3.2)
        // No projection before assignment holds the destination's position.
        for (const body of [list, one])
          expect(JSON.stringify(body)).not.toMatch(
            /55\.70|12\.539|latitude|longitude|Testvej|geometry/,
          )

        expect((await claim(agent.headers, order.id)).status).toBe(200)
        expect((await current(agent.headers)).data.delivery).toMatchObject({
          order_id: order.id,
          trip_distance_km: 3.2,
        })
      })

      it("does not call the provider again or change the trip on a retried acceptance", async () => {
        const order = await acceptedOrder()
        const measured = await recordOf(order.id)
        provider.calls = []
        await accept(pizzeriaStaff, order.id)
        expect(provider.calls).toEqual([])
        expect(await recordOf(order.id)).toMatchObject({
          trip_distance_m: measured.trip_distance_m,
          trip_measured_at: measured.trip_measured_at,
        })
      })

      it.each(["error", "quota"] as Mode[])(
        "accepts and lists the work without a distance on a provider %s",
        async (mode) => {
          provider.mode = mode
          const order = await acceptedOrder()
          expect(await recordOf(order.id)).toMatchObject({
            trip_distance_m: null,
            trip_measured_at: expect.any(Date),
          })
          const agent = await agentFor()
          const list = (await available(agent.headers)).data
          expect(list.deliveries[0]).toMatchObject({
            order_id: order.id,
            trip_distance_km: null,
          })
          expect((await claim(agent.headers, order.id)).status).toBe(200)
        },
      )

      it("shows legacy work without coordinates as having no distance", async () => {
        const order = await acceptedOrder()
        const record = await recordOf(order.id)
        await delivery().updateIntendedDeliveries({
          id: record.id,
          pickup_latitude: null,
          pickup_longitude: null,
          destination_latitude: null,
          destination_longitude: null,
          trip_distance_m: null,
          trip_measured_at: null,
        })
        const agent = await agentFor()
        expect(
          (await available(agent.headers)).data.deliveries[0].trip_distance_km,
        ).toBeNull()
        provider.calls = []
        const reply = await distances(agent.headers, {
          ...AGENT,
          order_ids: [order.id],
        })
        expect(reply.status).toBe(200)
        expect(reply.data.distances).toEqual([
          { order_id: order.id, distance_km: null },
        ])
        expect(provider.calls).toEqual([])
      })
    })

    describe("recovery and paging", () => {
      it("leaves an Order that is not accepted without a delivery", async () => {
        const order = await placePaidOrder(pizzeriaId)
        const { result } = await establishIntendedDeliveryWorkflow(
          getContainer(),
        ).run({ input: { order_id: order.id } })
        expect(result).toBeNull()
        expect(await recordOf(order.id)).toBeUndefined()
      })

      it("establishes one delivery when two recovery runs race, without calling the provider", async () => {
        const order = await acceptedOrder()
        const lost = await recordOf(order.id)
        const attention = await delivery().listDeliveryAttentions({
          order_id: order.id,
        })
        await delivery().deleteDeliveryAttentions(attention.map(({ id }) => id))
        await delivery().deleteIntendedDeliveries(lost.id)
        provider.calls = []
        const runs = await Promise.all(
          [1, 2].map(() =>
            establishIntendedDeliveryWorkflow(getContainer()).run({
              input: { order_id: order.id },
            }),
          ),
        )
        const [first, second] = runs.map(({ result }) => result)
        expect(first?.id).toBeDefined()
        expect(second?.id).toBe(first?.id)
        // The recovery run establishes the facts; it never measures a trip.
        expect(await recordOf(order.id)).toMatchObject({
          id: first?.id,
          trip_distance_m: null,
          trip_measured_at: null,
        })
        expect(provider.calls).toEqual([])
      })

      it("pages the available list by offset, oldest acceptance first", async () => {
        await acceptedOrder()
        const newer = await acceptedOrder(burgerId, burgerStaff)
        const agent = await agentFor()
        const page = await api.get(
          "/partner/delivery-agent/available?limit=1&offset=1",
          { headers: agent.headers },
        )
        expect(page.data.deliveries.map(({ order_id }) => order_id)).toEqual([
          newer.id,
        ])
        expect(page.data.deliveries[0].trip_distance_km).toBe(3.2)
      })
    })

    describe("POST /partner/delivery-agent/pickup-distances", () => {
      it("returns route distances to the listed pickups and keeps the position nowhere", async () => {
        const pizza = await acceptedOrder()
        const burger = await acceptedOrder(burgerId, burgerStaff)
        const agent = await agentFor()
        provider.calls = []
        output = ""
        const reply = await distances(agent.headers, {
          ...AGENT,
          order_ids: [pizza.id, burger.id],
        })
        expect(reply.status).toBe(200)
        expect(reply.data).toEqual({
          distances: [
            { order_id: pizza.id, distance_km: 2.4 },
            { order_id: burger.id, distance_km: 0.8 },
          ],
        })
        // One matrix call from the agent to both pickups.
        expect(provider.calls).toHaveLength(1)
        expect(provider.calls[0].body.locations[0]).toEqual([
          AGENT.longitude,
          AGENT.latitude,
        ])
        // Used for the calculation only: never logged, never stored.
        expect(output).not.toMatch(AGENT_TRACE)
        for (const order of [pizza, burger])
          expect(JSON.stringify(await recordOf(order.id))).not.toMatch(
            AGENT_TRACE,
          )
        expect(
          JSON.stringify(await delivery().listDeliveryAgents({ id: agent.id })),
        ).not.toMatch(AGENT_TRACE)
      })

      it("answers only for deliveries in the agent's available or current view", async () => {
        const mine = await acceptedOrder()
        const elsewhere = await acceptedOrder(burgerId, burgerStaff)
        const agent = await agentFor()
        const outsider = await agentFor(["8000"])
        expect((await claim(agent.headers, mine.id)).status).toBe(200)

        // The current delivery is in view; another agent's is not.
        const reply = await distances(agent.headers, {
          ...AGENT,
          order_ids: [mine.id, elsewhere.id, "order_unknown"],
        })
        expect(reply.status).toBe(200)
        expect(reply.data.distances).toEqual([
          { order_id: mine.id, distance_km: 2.4 },
          { order_id: elsewhere.id, distance_km: 0.8 },
        ])
        const other = await agentFor()
        expect(
          (
            await distances(other.headers, {
              ...AGENT,
              order_ids: [mine.id, elsewhere.id],
            })
          ).data.distances,
        ).toEqual([{ order_id: elsewhere.id, distance_km: 0.8 }])
        provider.calls = []
        expect(
          (
            await distances(outsider.headers, {
              ...AGENT,
              order_ids: [mine.id, elsewhere.id],
            })
          ).data.distances,
        ).toEqual([])
        expect(provider.calls).toEqual([])
      })

      it("refuses other actors, revoked agents and missing credentials", async () => {
        const order = await acceptedOrder()
        const body = { ...AGENT, order_ids: [order.id] }
        expect((await distances({}, body)).status).toBe(401)
        expect((await distances(pizzeriaStaff, body)).status).toBe(401)
        const agent = await agentFor()
        await delivery().updateDeliveryAgents({
          id: agent.id,
          status: "revoked",
        })
        const revoked = await distances(agent.headers, body)
        expect(revoked.status).toBe(403)
        expect(revoked.data.code).toBe("delivery_agent_access_revoked")
        expect(provider.calls.map(({ path }) => path)).not.toContain(
          "/openrouteservice/v2/matrix/cycling-regular",
        )
      })

      const ids = (count: number, length = 10) =>
        Array.from({ length: count }, (_, i) =>
          `order_${i}`.padEnd(length, "x"),
        )
      it.each([
        {
          reason: "BVA: latitude exactly 90 is accepted",
          body: { latitude: 90, longitude: 12 },
          status: 200,
        },
        {
          reason: "BVA: latitude above 90 is refused",
          body: { latitude: 90.0001, longitude: 12 },
          status: 400,
        },
        {
          reason: "BVA: latitude exactly -90 is accepted",
          body: { latitude: -90, longitude: 12 },
          status: 200,
        },
        {
          reason: "BVA: latitude below -90 is refused",
          body: { latitude: -90.0001, longitude: 12 },
          status: 400,
        },
        {
          reason: "BVA: longitude exactly 180 is accepted",
          body: { latitude: 55, longitude: 180 },
          status: 200,
        },
        {
          reason: "BVA: longitude above 180 is refused",
          body: { latitude: 55, longitude: 180.0001 },
          status: 400,
        },
        {
          reason: "BVA: longitude exactly -180 is accepted",
          body: { latitude: 55, longitude: -180 },
          status: 200,
        },
        {
          reason: "BVA: longitude below -180 is refused",
          body: { latitude: 55, longitude: -180.0001 },
          status: 400,
        },
        {
          reason: "EP: a text coordinate is refused",
          body: { latitude: "55.6", longitude: 12 },
          status: 400,
        },
        {
          reason: "EP: a missing coordinate is refused",
          body: { latitude: 55.6 },
          status: 400,
        },
        {
          reason: "BVA: no deliveries is refused",
          body: { latitude: 55.6, longitude: 12, order_ids: [] },
          status: 400,
        },
        {
          reason: "BVA: one delivery is accepted",
          body: { latitude: 55.6, longitude: 12, order_ids: ids(1) },
          status: 200,
        },
        {
          reason: "BVA: 25 deliveries are accepted",
          body: { latitude: 55.6, longitude: 12, order_ids: ids(25) },
          status: 200,
        },
        {
          reason: "BVA: 26 deliveries are refused",
          body: { latitude: 55.6, longitude: 12, order_ids: ids(26) },
          status: 400,
        },
        {
          reason: "BVA: a 64-character ID is accepted",
          body: { latitude: 55.6, longitude: 12, order_ids: ids(1, 64) },
          status: 200,
        },
        {
          reason: "BVA: a 65-character ID is refused",
          body: { latitude: 55.6, longitude: 12, order_ids: ids(1, 65) },
          status: 400,
        },
        {
          reason: "BVA: an empty ID is refused",
          body: { latitude: 55.6, longitude: 12, order_ids: [""] },
          status: 400,
        },
        {
          reason: "EP: an unknown field is refused",
          body: {
            latitude: 55.6,
            longitude: 12,
            order_ids: ["x"],
            accuracy: 5,
          },
          status: 400,
        },
      ])("$reason", async ({ body, status }) => {
        const agent = await agentFor()
        const reply = await distances(agent.headers, {
          order_ids: ["order_x"],
          ...body,
        })
        expect(reply.status).toBe(status)
        if (status === 200)
          // Unknown work is simply left out; nothing is measured.
          expect(reply.data).toEqual({ distances: [] })
        else expect(reply.data.code).toBe("position_invalid")
        expect(JSON.stringify(reply.data) + output).not.toMatch(
          /55\.6|90\.0001|180\.0/,
        )
        expect(provider.calls).toEqual([])
      })

      it("refuses an oversized body", async () => {
        const agent = await agentFor()
        const reply = await distances(agent.headers, {
          ...AGENT,
          order_ids: ["x".repeat(5000)],
        })
        expect(reply.status).toBe(413)
        expect(reply.data.code).toBe("position_too_large")
        expect(JSON.stringify(reply.data) + output).not.toMatch(AGENT_TRACE)
      })

      it.each(["error", "quota"] as Mode[])(
        "answers with no distances on a provider %s",
        async (mode) => {
          const order = await acceptedOrder()
          const agent = await agentFor()
          provider.mode = mode
          output = ""
          const reply = await distances(agent.headers, {
            ...AGENT,
            order_ids: [order.id],
          })
          expect(reply.status).toBe(200)
          expect(reply.data.distances).toEqual([
            { order_id: order.id, distance_km: null },
          ])
          expect(output).not.toMatch(AGENT_TRACE)
        },
      )
    })
  },
})
