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
