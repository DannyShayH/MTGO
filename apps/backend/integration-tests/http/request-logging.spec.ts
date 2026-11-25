import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import { captureLogRecords } from "../helpers/log-records"
import { startRequestLogging } from "../../src/api/request-logging"

jest.setTimeout(120000)

medusaIntegrationTestRunner({
  dbName: "medusa_ci_request_logging_http",
  env: { JWT_SECRET: "ci-only-logging-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer }) => {
    const { output, records } = captureLogRecords()
    // `medusa start` does this through instrumentation.ts; the test runner
    // boots the HTTP app without that hook.
    let stopRequestLogging: () => void
    beforeAll(() => {
      stopRequestLogging = startRequestLogging()
    })
    afterAll(() => stopRequestLogging())
    it("correlates a failed staff sign-in through the real Medusa auth route", async () => {
      const response = await api.post(
        "/auth/restaurant_staff/emailpass",
        {
          email: "logging-secret@example.test",
          password: "logging-secret-password",
        },
        { headers: { "x-request-id": "login-28" }, validateStatus: () => true },
      )
      expect(response.status).toBe(401)
      expect(response.headers["x-request-id"]).toBe("login-28")
      expect(records()).toEqual([
        expect.objectContaining({
          event: "access.denied",
          level: "warn",
          env: "test",
          service: "backend",
          request_id: "login-28",
          status: 401,
        }),
      ])
      expect(
        JSON.stringify(records()) + JSON.stringify(response.data),
      ).not.toContain("logging-secret")
    })

    it.each([
      {
        id: "invalid_id",
        reason: "EP: invalid characters before a direct authentication refusal",
      },
      {
        id: "x".repeat(65),
        reason:
          "BVA: ID above the 64-character limit before a direct authentication refusal",
      },
    ])("$reason", async ({ id }) => {
      const response = await api.get("/partner/me", {
        headers: { "x-request-id": id },
        validateStatus: () => true,
      })
      expect(response.status).toBe(401)
      expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/)
      expect(records()).toEqual([
        expect.objectContaining({
          event: "access.denied",
          level: "warn",
          env: "test",
          request_id: response.headers["x-request-id"],
        }),
      ])
    })

    it.each([
      { id: "parser-28", reason: "EP: valid ID survives the real body parser" },
      {
        id: "invalid_id",
        reason: "EP: invalid ID is replaced after the real body parser fails",
      },
    ])("$reason", async ({ id }) => {
      const response = await api.post(
        "/auth/restaurant_staff/emailpass",
        '{"password":"logging-secret-password",',
        {
          headers: { "content-type": "application/json", "x-request-id": id },
          transformRequest: [(body) => body],
          validateStatus: () => true,
        },
      )
      expect(response.status).toBe(400)
      const acceptedId = response.headers["x-request-id"]
      if (id === "parser-28") expect(acceptedId).toBe(id)
      else expect(acceptedId).toMatch(/^[0-9a-f-]{36}$/)
      expect(records()).toEqual([
        expect.objectContaining({
          event: "input.rejected",
          level: "info",
          service: "backend",
          request_id: acceptedId,
          route: "/auth/restaurant_staff/emailpass",
          status: 400,
        }),
      ])
      expect(output() + JSON.stringify(response.data)).not.toContain(
        "logging-secret",
      )
    })

    it("correlates an authorized token whose Restaurant staff access has ended", async () => {
      const token = generateJwtToken(
        {
          actor_id: "rstaff_missing",
          actor_type: "restaurant_staff",
          auth_identity_id: "auth_logging",
        },
        {
          secret: getContainer().resolve(
            ContainerRegistrationKeys.CONFIG_MODULE,
          ).projectConfig.http.jwtSecret,
          expiresIn: "1h",
        },
      )
      const response = await api.get("/partner/me", {
        headers: {
          authorization: `Bearer ${token}`,
          "x-request-id": "ended-28",
        },
        validateStatus: () => true,
      })
      expect(response.status).toBe(403)
      expect(response.data.code).toBe("staff_access_revoked")
      expect(records()).toEqual([
        expect.objectContaining({
          event: "access.denied",
          level: "warn",
          env: "test",
          request_id: "ended-28",
          status: 403,
        }),
      ])
      expect(JSON.stringify(records())).not.toContain(token)
    })

    // Beyond sign-in (#247): the same failure events on every ordinary route.
    const publishableKey = async () => {
      const key = await getContainer().resolve(Modules.API_KEY).createApiKeys({
        title: "Logging",
        type: "publishable",
        created_by: "test",
      })
      return { "x-publishable-api-key": key.token }
    }
    const failures = () => records().filter(({ request_id }) => request_id)

    it.each([
      {
        reason: "EP: core Admin authentication refuses before any route",
        method: "get",
        path: "/admin/orders/order_secret?secret=query",
        status: 401,
        event: "access.denied",
        level: "warn",
      },
      {
        reason: "EP: a missing publishable key refuses before any route",
        method: "get",
        path: "/store/restaurants?secret=query",
        status: 400,
        event: "input.rejected",
        level: "info",
      },
      {
        reason: "EP: an unknown URL",
        method: "get",
        path: "/no-such-route/secret",
        status: 404,
        event: "input.rejected",
        level: "info",
      },
    ] as const)(
      "$reason is logged once, without the URL",
      async ({ method, path, status, event, level }) => {
        const response = await api[method](path, {
          headers: { "x-request-id": "wide-247" },
          validateStatus: () => true,
        })
        expect(response.status).toBe(status)
        expect(response.headers["x-request-id"]).toBe("wide-247")
        expect(failures()).toEqual([
          expect.objectContaining({
            event,
            level,
            service: "backend",
            request_id: "wide-247",
            method: "GET",
            status,
          }),
        ])
        expect(JSON.stringify(failures())).not.toContain("secret")
      },
    )

    it("logs a body the parser refuses on an ordinary route", async () => {
      const response = await api.post("/store/carts", '{"secret":', {
        headers: {
          ...(await publishableKey()),
          "content-type": "application/json",
          "x-request-id": "parser-247",
        },
        transformRequest: [(body) => body],
        validateStatus: () => true,
      })
      expect(response.status).toBe(400)
      expect(failures()).toEqual([
        expect.objectContaining({
          event: "input.rejected",
          request_id: "parser-247",
          method: "POST",
          status: 400,
        }),
      ])
      expect(JSON.stringify(failures())).not.toContain("secret")
    })

    it("logs a validation refusal with its route pattern", async () => {
      const response = await api.get("/store/restaurants?limit=secret", {
        headers: { ...(await publishableKey()), "x-request-id": "invalid-247" },
        validateStatus: () => true,
      })
      expect(response.status).toBe(400)
      expect(failures()).toEqual([
        expect.objectContaining({
          event: "input.rejected",
          request_id: "invalid-247",
          route: expect.stringMatching(/^\/store\/restaurants/),
          status: 400,
        }),
      ])
      expect(JSON.stringify(failures())).not.toContain("secret")
    })

    it("logs an unexpected failure once with its route pattern and no message or stack", async () => {
      const headers = await publishableKey()
      const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
      const graph = query.graph.bind(query)
      jest
        .spyOn(query, "graph")
        .mockImplementation((config: { entity: string }, ...rest) => {
          if (config.entity === "restaurant")
            throw new TypeError("secret-failure")
          return graph(config as never, ...(rest as []))
        })
      const response = await api.get("/store/restaurants/rest_secret/menu", {
        headers: { ...headers, "x-request-id": "failed-247" },
        validateStatus: () => true,
      })
      expect(response.status).toBe(500)
      expect(failures()).toHaveLength(1)
      const { time, timestamp, message, ...record } = failures()[0]
      expect(record).toEqual({
        level: "error",
        service: "backend",
        env: "test",
        event: "request.failed",
        msg: "Request failed",
        request_id: "failed-247",
        status: 500,
        route: "/store/restaurants/:id/menu",
        method: "GET",
        err: { type: expect.stringMatching(/^(Type)?Error$/) },
      })
      expect(JSON.stringify(failures())).not.toContain("secret")
    })

    it("logs no failure for a success, the health check or Admin static files", async () => {
      const headers = { ...(await publishableKey()), "x-request-id": "ok-247" }
      for (const path of ["/store/restaurants", "/health", "/app/no-such-file"])
        await api.get(path, { headers, validateStatus: () => true })
      expect(failures()).toEqual([])
    })
  },
})
