import { test } from "node:test"
import assert from "node:assert/strict"
import {
  CATEGORY_SUGGESTIONS,
  remainingCategorySuggestions,
} from "../categories.ts"

test("every suggestion is a complete bilingual name with a unique id", () => {
  const ids = new Set(CATEGORY_SUGGESTIONS.map((suggestion) => suggestion.id))
  assert.equal(ids.size, CATEGORY_SUGGESTIONS.length)
  for (const suggestion of CATEGORY_SUGGESTIONS) {
    assert.ok(suggestion.da.trim().length > 0 && suggestion.da.length <= 120)
    assert.ok(suggestion.en.trim().length > 0 && suggestion.en.length <= 120)
  }
})

test("EP: an empty menu offers every suggestion", () => {
  assert.deepEqual(remainingCategorySuggestions([]), [...CATEGORY_SUGGESTIONS])
})

test("EP: a suggestion already on the menu by either name is hidden", () => {
  const remaining = remainingCategorySuggestions([
    { da: "  drikkevarer ", en: "Beverages" },
    { da: "Søde sager", en: "DESSERTS" },
  ])
  const ids = remaining.map((suggestion) => suggestion.id)
  assert.ok(!ids.includes("drinks"))
  assert.ok(!ids.includes("desserts"))
  assert.equal(remaining.length, CATEGORY_SUGGESTIONS.length - 2)
})

test("EP: an unrelated category hides nothing", () => {
  assert.equal(
    remainingCategorySuggestions([{ da: "Husets specialiteter", en: "House" }])
      .length,
    CATEGORY_SUGGESTIONS.length,
  )
})
