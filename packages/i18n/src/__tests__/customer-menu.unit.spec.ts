import { test } from "node:test"
import assert from "node:assert/strict"
import {
  ALLERGEN_SHORT_NAMES,
  CUSTOMER_MENU_TEXT,
  allergenShortName,
  formatDkk,
} from "../customer-menu.ts"

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

test("EP: a long catalogue name gets its short name, any other keeps its own", () => {
  const cereals = {
    code: "cereals",
    name: {
      da: "Korn, der indeholder gluten",
      en: "Cereals containing gluten",
    },
  }
  assert.equal(allergenShortName(cereals, "da"), "Gluten")
  assert.equal(allergenShortName(cereals, "en"), "Gluten")
  const fish = { code: "fish", name: { da: "Fisk", en: "Fish" } }
  assert.equal(allergenShortName(fish, "da"), "Fisk")
  assert.equal(allergenShortName(fish, "en"), "Fish")
})

test("Short names exist for the same codes in both languages", () => {
  assert.deepEqual(
    Object.keys(ALLERGEN_SHORT_NAMES.da).sort(),
    Object.keys(ALLERGEN_SHORT_NAMES.en).sort(),
  )
})
