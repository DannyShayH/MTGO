import type { Writable } from "node:stream"

export type LogEvent =
  | "auth.sign_in.succeeded"
  | "auth.sign_in.failed"
  | "auth.session.ended"
  | "access.denied"
  | "input.rejected"
  | "upstream.request.failed"
  | "request.failed"
  | "pickup_location_missing"
  | "refund.attempted"
  | "menu.read.slow"
  | "monitoring.exporter.unavailable"
  | "monitoring.demo_read.succeeded"
export type LogFields = {
  request_id?: string
  route?: string
  method?: string
  status?: number
  actor_type?: string
  actor_id?: string
  restaurant_id?: string
  order_id?: string
  /** `refund.attempted` only: its outcome class; anything else is discarded. */
  outcome?: "succeeded" | "failed" | "in_progress"
  err?: unknown
  /** `menu.read.slow` only: whole milliseconds and counts, 0 up to a day. */
  whole_read_ms?: number
  restaurant_ms?: number
  dish_prices_ms?: number
  photos_ms?: number
  photo_urls_ms?: number
  food_information_ms?: number
  dishes?: number
  photos?: number
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
