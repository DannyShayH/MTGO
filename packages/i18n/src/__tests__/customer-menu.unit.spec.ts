import { test } from "node:test"
import assert from "node:assert/strict"
import { CUSTOMER_MENU_TEXT, formatDkk } from "../customer-menu.ts"

// Intl separates the currency with a no-break space; compare on plain spaces.
const plain = (text: string) => text.replace(/\s/g, " ")

test("EP: Danish shows kroner after the amount with a decimal comma", () => {
  assert.equal(plain(formatDkk(129, "da")), "129,00 kr.")
})

test("EP: English shows DKK before the amount with a decimal point", () => {
  assert.equal(plain(formatDkk(129, "en")), "DKK 129.00")
})

test("BVA: a decimal amount is shown as given, never as cents or rounded", () => {
  assert.equal(plain(formatDkk(109.5, "da")), "109,50 kr.")
  assert.equal(plain(formatDkk(95.55, "en")), "DKK 95.55")
  assert.equal(plain(formatDkk(0.01, "en")), "DKK 0.01")
})

test("Danish and English have the same texts, none of them blank", () => {
  assert.deepEqual(
    Object.keys(CUSTOMER_MENU_TEXT.da).sort(),
    Object.keys(CUSTOMER_MENU_TEXT.en).sort(),
  )
  for (const locale of ["da", "en"] as const)
    for (const text of Object.values(CUSTOMER_MENU_TEXT[locale]))
      assert.ok(text.trim().length > 0)
})
