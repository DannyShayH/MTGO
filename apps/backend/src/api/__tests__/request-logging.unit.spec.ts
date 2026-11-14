import express from "express"
import { createServer, type Server } from "node:http"
import { PassThrough } from "node:stream"
import { once } from "node:events"
import winston from "winston"
import { createContainer, asValue } from "@medusajs/framework/awilix"
import { MedusaError } from "@medusajs/framework/utils"
import { correlateRequest } from "../request-logging"
import { mtogoErrorHandler } from "../error-handler"

// Exercise the HTTP boundary with real JSON output; no database is needed for
// transport, refusals or error handling. Real Medusa routing is covered separately.
describe("safe correlated HTTP failures", () => {
  let server: Server
  let origin: string
  let output: string
  let logger: winston.Logger
  beforeAll(async () => {
    const stream = new PassThrough()
    stream.on("data", (chunk) => {
      output += chunk
    })
    logger = winston.createLogger({
      format: winston.format.json(),
      transports: [new winston.transports.Stream({ stream })],
    })
    const scope = createContainer()
    scope.register("logger", asValue(logger))
    const app = express()
    app.use((req, _res, next) => {
      Object.assign(req, { scope })
      next()
    })
    // Match Medusa: body parsing can fail before application middleware runs.
    app.use(express.json())
    app.use(correlateRequest)
    app.get("/partner/me", (req, res, next) => {
      const status = Number(req.headers["test-status"])
      if (status === 401)
        return res.status(401).json({ message: "Unauthorized" })
      if (status === 400)
        return next(
          new MedusaError(
            MedusaError.Types.INVALID_DATA,
            "secret-password secret@example.test",
          ),
        )
      if (status === 403)
        return next(
          new MedusaError(
            MedusaError.Types.FORBIDDEN,
            "secret-token secret@example.test",
          ),
        )
      next(
        new Error(
          "secret-password secret-token secret-cookie secret@example.test",
        ),
      )
    })
    app.use(mtogoErrorHandler())
    server = createServer(app).listen(0, "127.0.0.1")
    await once(server, "listening")
    const address = server.address()
    if (!address || typeof address === "string")
      throw new Error("Missing test address")
    origin = `http://127.0.0.1:${address.port}`
  })
  beforeEach(() => {
    output = ""
  })
  afterAll(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    logger.close()
  })
  it.each([
    {
      status: 400,
      event: "input.rejected",
      level: "info",
      reason: "EP: invalid input",
    },
    {
      status: 401,
      event: "access.denied",
      level: "warn",
      reason: "EP: unauthenticated refusal",
    },
    {
      status: 403,
      event: "access.denied",
      level: "warn",
      reason: "EP: forbidden refusal",
    },
    {
      status: 500,
      event: "request.failed",
      level: "error",
      reason: "EP: unexpected failure",
    },
  ])(
    "$reason logs once with the same request ID and no secrets",
    async ({ status, event, level }) => {
      const response = await fetch(`${origin}/partner/me?token=secret-query`, {
        headers: {
          "x-request-id": "login-28",
          "test-status": String(status),
          authorization: "Bearer secret-authorization",
          cookie: "secret-cookie",
        },
      })
      expect(response.status).toBe(status)
      expect(response.headers.get("x-request-id")).toBe("login-28")
      const records = output
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
      expect(records).toHaveLength(1)
      expect(records[0]).toMatchObject({
        service: "backend",
        env: "test",
        event,
        level,
        request_id: "login-28",
        route: "/partner/me",
        status,
      })
      expect(output + (await response.text())).not.toContain("secret")
    },
  )
  it.each([
    { id: "parser-28", reason: "EP: valid ID survives a parser refusal" },
    {
      id: "invalid_id",
      reason: "EP: invalid characters are replaced on a parser refusal",
    },
    {
      id: "x".repeat(65),
      reason:
        "BVA: ID above the 64-character limit is replaced on a parser refusal",
    },
  ])("$reason", async ({ id }) => {
    const response = await fetch(`${origin}/auth/restaurant_staff/emailpass`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": id },
      body: '{"password":"secret-password",',
    })
    expect(response.status).toBe(400)
    const acceptedId = response.headers.get("x-request-id")
    if (id === "parser-28") expect(acceptedId).toBe(id)
    else expect(acceptedId).toMatch(/^[0-9a-f-]{36}$/)
    const records = output
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(records).toEqual([
      expect.objectContaining({
        event: "input.rejected",
        level: "info",
        service: "backend",
        request_id: acceptedId,
        route: "/auth/restaurant_staff/emailpass",
        method: "POST",
        status: 400,
      }),
    ])
    expect(output + (await response.text())).not.toContain("secret-password")
  })
  it("replaces an invalid incoming request ID before writing or echoing it", async () => {
    const response = await fetch(`${origin}/partner/me`, {
      headers: { "x-request-id": "x".repeat(65), "test-status": "401" },
    })
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/)
    expect(JSON.parse(output).request_id).toBe(
      response.headers.get("x-request-id"),
    )
    expect(output).not.toContain("x".repeat(65))
  })
})
