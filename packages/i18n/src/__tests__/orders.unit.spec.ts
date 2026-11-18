import { test } from "node:test"
import assert from "node:assert/strict"
import { ORDER_TEXT, formatOrderTime } from "../orders.ts"

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
