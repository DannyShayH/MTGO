import { test } from "node:test"
import assert from "node:assert/strict"
import { resolveLocale } from "../locale.ts"

// Decision table for spec stories 44-45: a remembered choice wins, then the
// browser's languages in quality order, then Danish.
const cases = [
  { reason: "DT: first visit, no header", expected: "da" },
  { reason: "EP: browser in Danish", accept: "da-DK,da;q=0.9", expected: "da" },
  {
    reason: "EP: browser in English",
    accept: "en-US,en;q=0.9",
    expected: "en",
  },
  {
    reason: "EP: unsupported language falls back",
    accept: "fr-FR,fr;q=0.9",
    expected: "da",
  },
  {
    reason: "DT: first supported language in the list",
    accept: "fr-FR,en;q=0.8",
    expected: "en",
  },
  {
    reason: "DT: highest quality wins over order",
    accept: "en;q=0.5,da;q=0.9",
    expected: "da",
  },
  { reason: "EP: tags are case-insensitive", accept: "EN-gb", expected: "en" },
  {
    reason: "BVA: quality 0 means not acceptable",
    accept: "en;q=0",
    expected: "da",
  },
  { reason: "EP: wildcard only", accept: "*", expected: "da" },
  { reason: "EP: malformed header", accept: ";;,q=", expected: "da" },
  {
    reason: "DT: remembered English beats a Danish browser",
    chosen: "en",
    accept: "da-DK",
    expected: "en",
  },
  {
    reason: "DT: remembered Danish beats an English browser",
    chosen: "da",
    accept: "en-US",
    expected: "da",
  },
  {
    reason: "EP: unknown remembered value is ignored",
    chosen: "de",
    accept: "en",
    expected: "en",
  },
] as const

for (const row of cases) {
  test(`resolves ${row.expected} (${row.reason})`, () => {
    assert.equal(
      resolveLocale({
        chosen: "chosen" in row ? row.chosen : undefined,
        acceptLanguage: "accept" in row ? row.accept : undefined,
      }),
      row.expected,
    )
  })
}
