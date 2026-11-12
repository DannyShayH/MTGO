import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { formatText } from "../format.ts"

describe("formatText", () => {
  const cases = [
    {
      reason: "EP: one placeholder",
      template: "MTOGO has invited you to operate {restaurant}.",
      values: { restaurant: "Pizzeria Nørrebro" },
      expected: "MTOGO has invited you to operate Pizzeria Nørrebro.",
    },
    {
      reason: "EP: a number",
      template: "{count} postal codes",
      values: { count: 2 },
      expected: "2 postal codes",
    },
    {
      reason: "EP: the same placeholder twice",
      template: "{a} and {a}",
      values: { a: "x" },
      expected: "x and x",
    },
    {
      reason: "EP: an unknown placeholder is kept",
      template: "Hello {name}",
      values: {},
      expected: "Hello {name}",
    },
    {
      reason: "EP: a value that looks like a placeholder is not replaced again",
      template: "{a} {b}",
      values: { a: "{b}", b: "B" },
      expected: "{b} B",
    },
  ]
  for (const { reason, template, values, expected } of cases)
    it(`fills placeholders: ${reason}`, () => {
      assert.equal(formatText(template, values), expected)
    })
})
