import { subscribe, unsubscribe } from "node:diagnostics_channel"
import type { ServerResponse } from "node:http"
import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"
import { createLogRecord, requestId, type LogEvent } from "@dtc/logging"
import {
  isExcludedPath,
  matchedRoute,
  pathOf,
  REQUEST_START,
  type RoutedRequest,
} from "../observability/request-paths"
import { writeRecord } from "../observability/write-record"

/** The sign-in path's constant route names, from a path that never leaves here. */
function signInRoute(url: string, method: string): string | undefined {
  const path = pathOf(url).replace(/\/$/, "").toLowerCase()
  if (path === "/auth/restaurant_staff/emailpass" && method === "POST")
    return "/auth/restaurant_staff/emailpass"
  if (path === "/partner/me" && method === "GET") return "/partner/me"
  return undefined
}

/**
 * Whether the request is on the partner sign-in path, whose error responses
 * never repeat provider or validation text. Express strips a mounted
 * middleware's path from `req.path`, so the original URL is compared.
 */
export const isSignInRequest = (req: MedusaRequest) =>
  signInRoute(req.originalUrl, req.method) !== undefined

/**
 * Validates and echoes the request ID and records a refusal or failure when
 * the response ends. Medusa's own Admin authentication and publishable-key
 * check answer before this middleware, so `startRequestLogging` does the same
 * from the moment the request starts; whichever comes first wins.
 */
export function correlateRequest(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
) {
  initializeRequestCorrelation(req, res)
  next()
}

/** Medusa and Express decorate Node's own request and response objects. */
type HttpRequest = RoutedRequest & {
  originalUrl?: string
  scope?: MedusaRequest["scope"]
}
type HttpResponse = ServerResponse & { locals?: Record<string, unknown> }

/** Attaches at most one finish listener, whoever calls it first. */
function initializeRequestCorrelation(req: HttpRequest, res: HttpResponse) {
  // Express keeps locals that already exist.
  const locals = (res.locals ??= Object.create(null) as Record<string, unknown>)
  if (locals.requestLoggingInitialized) return
  locals.requestLoggingInitialized = true
  // Read now: Express rewrites `url` while it dispatches to mounted routers.
  const url = req.originalUrl ?? req.url ?? ""
  const method = req.method ?? ""
  const id = requestId(req.headers["x-request-id"])
  req.headers["x-request-id"] = id
  Object.assign(req, { requestId: id })
  res.setHeader("x-request-id", id)
  if (isExcludedPath(url)) return
  res.once("finish", () => {
    const status = res.statusCode
    // An established stream has already answered 200, so it never logs here.
    // Without a scope the request was not Medusa's, such as a metrics scrape.
    if (status < 400 || !req.scope) return
    const record = createLogRecord("backend", failureEvent(status), {
      request_id: id,
      // A pattern or nothing: the record builder drops anything else.
      route: signInRoute(url, method) ?? matchedRoute(req),
      method,
      status,
      err: locals.loggingError,
    })
    writeRecord(req.scope, record)
  })
}

/**
 * Correlates a request that failed, possibly in Medusa's body parser, before
 * the correlation middleware. Only the safe class of an unexpected error is
 * logged, once, when the response ends.
 */
export function correlateError(
  error: unknown,
  statusCode: number,
  req: MedusaRequest,
  res: MedusaResponse,
) {
  initializeRequestCorrelation(req, res)
  if (statusCode >= 500) res.locals.loggingError = error
}

/**
 * Starts correlation and failure logging for every request of this process,
 * before Medusa's own early refusals (#247). It uses the channel the request
 * metrics use, and is started by `instrumentation.ts`. Returns its stop.
 */
export function startRequestLogging(): () => void {
  const observe = (message: unknown) => {
    const { request, response } = message as {
      request: HttpRequest
      response: HttpResponse
    }
    initializeRequestCorrelation(request, response)
  }
  subscribe(REQUEST_START, observe)
  return () => {
    unsubscribe(REQUEST_START, observe)
  }
}

function failureEvent(status: number): LogEvent {
  if (status >= 500) return "request.failed"
  if (status === 401 || status === 403) return "access.denied"
  return "input.rejected"
}
