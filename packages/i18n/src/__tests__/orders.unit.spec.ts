import { test } from "node:test"
import assert from "node:assert/strict"
import {
  ORDER_ACTION_ERROR_CODES,
  ORDER_ACTION_ERRORS,
  ORDER_TEXT,
  formatOrderDateTime,
  formatOrderTime,
  isOrderActionErrorCode,
  isSameOrderDay,
} from "../orders.ts"

test("Danish and English have the same Orders texts, none of them blank", () => {
  assert.deepEqual(
    Object.keys(ORDER_TEXT.da).sort(),
    Object.keys(ORDER_TEXT.en).sort(),
  )
  for (const locale of ["da", "en"] as const)
    for (const [key, value] of Object.entries(ORDER_TEXT[locale]))
      assert.ok(value.trim(), `${locale}.${key} is blank`)
})

test("EP: a time is shown on the Restaurant's Copenhagen clock in either language", () => {
  // 12:05 UTC is 13:05 in Copenhagen in November (CET).
  assert.equal(formatOrderTime("2026-11-18T12:05:00.000Z", "da"), "13.05")
  assert.equal(formatOrderTime("2026-11-18T12:05:00.000Z", "en"), "13:05")
})

test("EP: an ended Order shows its date with the time, on the Copenhagen clock", () => {
  assert.equal(
    formatOrderDateTime("2026-11-18T12:05:00.000Z", "da"),
    "18. nov. 2026, 13.05",
  )
  assert.equal(
    formatOrderDateTime("2026-11-18T12:05:00.000Z", "en"),
    "18 Nov 2026, 13:05",
  )
})

test("BVA: the Copenhagen day decides whether two times share a date", () => {
  // 23:30 UTC on the 17th is already 00:30 on the 18th in Copenhagen.
  assert.equal(
    isSameOrderDay("2026-11-17T23:30:00.000Z", "2026-11-18T12:00:00.000Z"),
    true,
  )
  assert.equal(
    isSameOrderDay("2026-11-17T22:59:59.999Z", "2026-11-18T12:00:00.000Z"),
    false,
  )
})

test("BVA: summer time moves the Copenhagen clock one hour further", () => {
  assert.equal(formatOrderTime("2026-07-01T12:05:00.000Z", "en"), "14:05")
})

test("every refusal of an Order action has a Danish and an English text", () => {
  for (const locale of ["da", "en"] as const) {
    assert.deepEqual(
      Object.keys(ORDER_ACTION_ERRORS[locale]).sort(),
      [...ORDER_ACTION_ERROR_CODES].sort(),
    )
    for (const code of ORDER_ACTION_ERROR_CODES)
      assert.ok(ORDER_ACTION_ERRORS[locale][code].trim(), `${locale}.${code}`)
  }
})

test("EP: only a known refusal code is recognised", () => {
  assert.equal(isOrderActionErrorCode("acceptance_window_elapsed"), true)
  assert.equal(isOrderActionErrorCode("dish_stale"), false)
  assert.equal(isOrderActionErrorCode(undefined), false)
})

test("the Customer's cancellation and refund texts exist in both languages", async () => {
  const { CUSTOMER_ORDER_DETAIL_TEXT } =
    await import("../customer-order-detail.ts")
  assert.deepEqual(
    Object.keys(CUSTOMER_ORDER_DETAIL_TEXT.da).sort(),
    Object.keys(CUSTOMER_ORDER_DETAIL_TEXT.en).sort(),
  )
  for (const locale of ["da", "en"] as const)
    for (const status of ["pending", "failed", "succeeded"] as const)
      assert.match(
        CUSTOMER_ORDER_DETAIL_TEXT[locale][`refund_${status}`],
        /\{amount\}/,
      )
})

test("EP: the kitchen milestone refusals are recognised", () => {
  for (const code of [
    "order_not_accepted",
    "preparation_not_started",
    "order_cancelled",
  ])
    assert.equal(isOrderActionErrorCode(code), true, code)
})

test("EP: a Customer cancellation refusal maps to a known code, never backend text (#145)", async () => {
  const { customerCancelErrorCode } =
    await import("../customer-order-detail.ts")
  assert.equal(
    customerCancelErrorCode("order_not_awaiting_acceptance"),
    "order_not_awaiting_acceptance",
  )
  assert.equal(customerCancelErrorCode("order_changed"), "order_changed")
  assert.equal(
    customerCancelErrorCode("mock provider declined: secret-detail"),
    "unknown_error",
  )
  assert.equal(customerCancelErrorCode(undefined), "unknown_error")
})

test("every Customer cancellation refusal has text in both languages, with operator guidance after acceptance", async () => {
  const { CUSTOMER_CANCEL_ERROR_CODES, CUSTOMER_ORDER_DETAIL_TEXT } =
    await import("../customer-order-detail.ts")
  for (const locale of ["da", "en"] as const) {
    for (const code of CUSTOMER_CANCEL_ERROR_CODES)
      assert.ok(CUSTOMER_ORDER_DETAIL_TEXT[locale][`cancel_refused_${code}`])
    assert.match(
      CUSTOMER_ORDER_DETAIL_TEXT[locale]
        .cancel_refused_order_not_awaiting_acceptance,
      /MTOGO.*\{number\}/,
    )
  }
})
