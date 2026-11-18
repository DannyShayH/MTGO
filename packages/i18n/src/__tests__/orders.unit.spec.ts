import { test } from "node:test"
import assert from "node:assert/strict"
import {
  ORDER_ACTION_ERROR_CODES,
  ORDER_ACTION_ERRORS,
  ORDER_TEXT,
  formatOrderTime,
  isOrderActionErrorCode,
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
