import type { Writable } from "node:stream"

export type LogEvent =
  | "auth.sign_in.succeeded"
  | "auth.sign_in.failed"
  | "auth.session.ended"
  | "access.denied"
  | "input.rejected"
  | "upstream.request.failed"
  | "request.failed"
export type LogFields = {
  request_id?: string
  route?: string
  method?: string
  status?: number
  actor_type?: string
  actor_id?: string
  restaurant_id?: string
  order_id?: string
  err?: unknown
}
export type Service = "partner" | "storefront" | "backend"
export type LogRecord = LogFields & {
  time: string
  level: string
  service: Service
  env: string
  event: LogEvent
  msg: string
}
export function requestId(value?: unknown): string
export function httpStatus(error: unknown): number | undefined
export function safeError(error: unknown): { type: string }
export function createLogRecord(
  service: Service,
  event: LogEvent,
  fields?: LogFields,
  env?: string,
): LogRecord
export function createApplicationLogger(
  service: Service,
  options?: { env?: string; stream?: Writable },
): ((event: LogEvent, fields?: LogFields) => void) & { close(): void }
