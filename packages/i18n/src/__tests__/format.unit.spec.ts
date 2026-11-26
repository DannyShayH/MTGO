import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { formatPhoneNumber, formatText } from "../format.ts"

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

describe("formatPhoneNumber (#252)", () => {
  const cases = [
    {
      reason: "EP: a Danish mobile number reads in pairs",
      phone: "+4522949411",
      expected: "+45 22 94 94 11",
    },
    {
      reason: "EP: spaces already typed are normalised",
      phone: " +45 2294 9411 ",
      expected: "+45 22 94 94 11",
    },
    {
      reason: "EP: a foreign number is shown as entered",
      phone: "+46701234567",
      expected: "+46701234567",
    },
    {
      reason: "BVA: a Danish number with seven digits is shown as entered",
      phone: "+452294941",
      expected: "+452294941",
    },
    { reason: "BVA: no number shows nothing", phone: null, expected: "" },
  ]
  for (const { reason, phone, expected } of cases)
    it(reason, () => assert.equal(formatPhoneNumber(phone), expected))
})
