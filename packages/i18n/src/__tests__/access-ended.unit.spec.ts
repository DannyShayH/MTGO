import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { accessEndedMessage } from "../access-ended.ts"
import { MESSAGES } from "../messages.ts"

describe("access-ended message", () => {
  const cases = [
    {
      reason: "EP: Danish with the Restaurant's name",
      locale: "da",
      restaurant: "Pizzeria Nørrebro",
      expected:
        "Din adgang til Pizzeria Nørrebro er ophørt. Kontakt MTOGO, hvis det er en fejl.",
    },
    {
      reason: "EP: English with the Restaurant's name",
      locale: "en",
      restaurant: "Pizzeria Nørrebro",
      expected:
        "Your access to Pizzeria Nørrebro has ended. Contact MTOGO if this is a mistake.",
    },
    {
      reason: "EP: Danish without a name",
      locale: "da",
      restaurant: undefined,
      expected:
        "Din adgang til restauranten er ophørt. Kontakt MTOGO, hvis det er en fejl.",
    },
    {
      reason: "BVA: an English blank name counts as none",
      locale: "en",
      restaurant: "  ",
      expected:
        "Your access to the Restaurant has ended. Contact MTOGO if this is a mistake.",
    },
  ] as const

  for (const { reason, locale, restaurant, expected } of cases)
    it(`names the Restaurant when known (${reason})`, () => {
      assert.equal(accessEndedMessage(MESSAGES[locale], restaurant), expected)
    })
})
