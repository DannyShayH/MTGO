import { test } from "node:test"
import assert from "node:assert/strict"
import {
  commissionTierLabel,
  formatExactDkk,
  formatExactPercent,
  ORDER_FINANCIAL_BASIS_TEXT,
} from "../order-financial-basis.ts"

/** Intl separates currency and number with a no-break space. */
const plain = (text: string) => text.replace(/\u00a0/g, " ")

test("Danish and English financial-basis text name the same things", () => {
  assert.deepEqual(
    Object.keys(ORDER_FINANCIAL_BASIS_TEXT.da).sort(),
    Object.keys(ORDER_FINANCIAL_BASIS_TEXT.en).sort(),
  )
})

test("an exact amount keeps its third decimal instead of being rounded for display", () => {
  assert.equal(plain(formatExactDkk("40.248", "en")), "DKK 40.248")
  assert.equal(formatExactDkk("40.248", "da"), "40,248 kr.")
})

test("a whole or two-decimal amount reads like any other price", () => {
  assert.equal(plain(formatExactDkk("95", "en")), "DKK 95.00")
  assert.equal(formatExactDkk("1234.5", "da"), "1.234,50 kr.")
})

test("a commission tier reads as its rate on its band of food value", () => {
  const tier = { from_amount: "100", to_amount: "500", rate_percent: "5" }
  assert.equal(
    plain(commissionTierLabel(tier, "en")),
    "5% from DKK 100.00 up to DKK 500.00",
  )
  assert.equal(
    commissionTierLabel({ ...tier, to_amount: null }, "da"),
    "5 % af det, der overstiger 100,00 kr.",
  )
})

test("the disclosure never says payment earned commission", () => {
  for (const text of Object.values(ORDER_FINANCIAL_BASIS_TEXT))
    assert.match(text.commission_note, /deliver|lever/i)
})

test("the VAT rate reads as a percentage from its exact ratio", () => {
  assert.equal(plain(formatExactPercent("0.25", "da")), "25 %")
  assert.equal(formatExactPercent("0.25", "en"), "25%")
})
