import { isDanishPostalCode } from "../postal-code"

describe("Danish postal-code format", () => {
  it.each([
    { value: "999", expected: false, reason: "BVA: three digits" },
    { value: "0000", expected: true, reason: "BVA: lowest four-digit value" },
    { value: "9999", expected: true, reason: "BVA: highest four-digit value" },
    {
      value: "1000",
      expected: true,
      reason: "EP: lowest Danish code in use (issue boundary)",
    },
    {
      value: "9990",
      expected: true,
      reason: "EP: high Danish code in use (issue boundary)",
    },
    { value: "10000", expected: false, reason: "BVA: five digits" },
    { value: "12a4", expected: false, reason: "EP: contains a letter" },
    { value: "", expected: false, reason: "EP: empty" },
    { value: "    ", expected: false, reason: "EP: whitespace only" },
    { value: " 2200", expected: false, reason: "EP: surrounding whitespace" },
    { value: "２２００", expected: false, reason: "EP: non-ASCII digits" },
  ])("$reason", ({ value, expected }) => {
    expect(isDanishPostalCode(value)).toBe(expected)
  })
})
