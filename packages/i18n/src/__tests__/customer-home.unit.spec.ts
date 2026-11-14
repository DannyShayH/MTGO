import { test } from "node:test"
import assert from "node:assert/strict"
import { CUSTOMER_HOME_TEXT } from "../customer-home.ts"
import { CUSTOMER_NAVIGATION_TEXT } from "../customer-navigation.ts"

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort()

for (const [name, texts] of [
  ["homepage", CUSTOMER_HOME_TEXT],
  ["navigation", CUSTOMER_NAVIGATION_TEXT],
] as const) {
  test(`${name}: Danish and English have the same texts, none blank, with the same placeholders`, () => {
    const da = texts.da as Record<string, string>
    const en = texts.en as Record<string, string>
    assert.deepEqual(Object.keys(da).sort(), Object.keys(en).sort())
    for (const key of Object.keys(da)) {
      assert.ok(da[key].trim().length > 0, `${key} is blank in Danish`)
      assert.ok(en[key].trim().length > 0, `${key} is blank in English`)
      assert.deepEqual(placeholders(da[key]), placeholders(en[key]), key)
    }
  })
}

test("the homepage texts name the glossary's Restaurant and say the same thing in both languages", () => {
  assert.equal(CUSTOMER_HOME_TEXT.en.clear_location, "Show all Restaurants")
  assert.equal(CUSTOMER_HOME_TEXT.da.clear_location, "Vis alle restauranter")
  assert.match(
    CUSTOMER_HOME_TEXT.en.serves_part_of_town,
    /\{served\}.*\{count\}/,
  )
})
