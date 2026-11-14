import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
} from "@medusajs/framework/utils"

jest.setTimeout(120000)

medusaIntegrationTestRunner({
  dbName: "medusa_ci_request_logging_http",
  env: { JWT_SECRET: "ci-only-logging-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer }) => {
    let output = ""
    const records = () =>
      output
        .split("\n")
        .filter((line) => line.startsWith("{"))
        .map((line) => JSON.parse(line))
        .filter((record) => record.service === "backend")
    beforeEach(() => {
      output = ""
      jest.spyOn(process.stdout, "write").mockImplementation((chunk) => {
        output += String(chunk)
        return true
      })
    })
    afterEach(() => {
      jest.restoreAllMocks()
    })

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
      expect(output + JSON.stringify(response.data)).not.toContain(
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
  },
})
