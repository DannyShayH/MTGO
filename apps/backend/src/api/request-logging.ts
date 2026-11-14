import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createLogRecord, requestId, type LogEvent } from "@dtc/logging"

/** Only these constant route names are emitted; never a URL or query string. */
export function correlatedRoute(req: MedusaRequest): string | undefined {
  // Express strips a mounted middleware's path from req.path. Compare the
  // original path to constants; never emit the untrusted original URL.
  const path = req.originalUrl.split("?")[0].replace(/\/$/, "").toLowerCase()
  if (path === "/auth/restaurant_staff/emailpass" && req.method === "POST")
    return "/auth/restaurant_staff/emailpass"
  if (path === "/partner/me" && req.method === "GET") return "/partner/me"
  return undefined
}

/** Runs before authentication, including refusals that send a response directly. */
export function correlateRequest(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
) {
  initializeRequestCorrelation(req, res)
  next()
}

/** Also called after early parser failures; attach at most one finish listener. */
export function initializeRequestCorrelation(
  req: MedusaRequest,
  res: MedusaResponse,
) {
  if (res.locals.requestLoggingInitialized) return
  res.locals.requestLoggingInitialized = true
  const id = requestId(req.headers["x-request-id"])
  req.headers["x-request-id"] = id
  Object.assign(req, { requestId: id })
  res.setHeader("x-request-id", id)
  const route = correlatedRoute(req)
  if (route)
    res.once("finish", () => {
      const status = res.statusCode
      if (status < 400) return
      const event = failureEvent(status)
      const record = createLogRecord("backend", event, {
        request_id: id,
        route,
        method: req.method,
        status,
        err: res.locals.loggingError,
      })
      // Medusa's CLI formatter displays only `message`. Keep correlation visible
      // locally too, while production retains structured top-level fields.
      req.scope
        .resolve(ContainerRegistrationKeys.LOGGER)
        .log(
          record.level,
          record.env === "development" ? JSON.stringify(record) : record.msg,
          record,
        )
    })
}

function failureEvent(status: number): LogEvent {
  if (status >= 500) return "request.failed"
  if (status === 401 || status === 403) return "access.denied"
  return "input.rejected"
}
