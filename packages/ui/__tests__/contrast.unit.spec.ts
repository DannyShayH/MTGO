import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { contrastRatio } from "../contrast.cjs"

describe("contrastRatio", () => {
  const cases = [
    {
      reason: "BVA: the WCAG maximum, black on white",
      foreground: "#000000",
      background: "#FFFFFF",
      expected: "21.00",
    },
    {
      reason: "BVA: the WCAG minimum, a colour on itself",
      foreground: "#007F80",
      background: "#007F80",
      expected: "1.00",
    },
    {
      reason: "EP: the brief's worked example, white on the primary teal",
      foreground: "#FFFFFF",
      background: "#007F80",
      expected: "4.83",
    },
    {
      reason: "EP: the same pair reversed gives the same ratio",
      foreground: "#007F80",
      background: "#FFFFFF",
      expected: "4.83",
    },
  ]

  for (const { reason, foreground, background, expected } of cases) {
    it(reason, () => {
      assert.equal(contrastRatio(foreground, background).toFixed(2), expected)
    })
  }
})
