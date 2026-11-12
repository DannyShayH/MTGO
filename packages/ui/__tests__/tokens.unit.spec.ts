import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { contrastRatio } from "../contrast.cjs"
import tokens from "../tokens.cjs"

const mtogo: Record<string, string> = tokens.colors.mtogo

// WCAG 2.2 AA: text needs 4.5:1, boundaries and state indicators 3:1.
const TEXT = 4.5
const BOUNDARY = 3

// The pairings the design brief promises (apps/docs product/design-brief).
// Add a row for every new pairing before using it in a screen.
const cases = [
  {
    reason: "Primary button label",
    foreground: "text-on-primary",
    background: "action-primary",
    minimum: TEXT,
  },
  {
    reason: "Hovered primary button label",
    foreground: "text-on-primary",
    background: "action-primary-hover",
    minimum: TEXT,
  },
  {
    reason: "Pressed primary button label",
    foreground: "text-on-primary",
    background: "action-primary-pressed",
    minimum: TEXT,
  },
  {
    reason: "Wordmark on the logo tile",
    foreground: "text-on-primary",
    background: "brand-logo",
    minimum: TEXT,
  },
  {
    reason: "Body text on the page",
    foreground: "text-primary",
    background: "surface-page",
    minimum: TEXT,
  },
  {
    reason: "Body text on a card",
    foreground: "text-primary",
    background: "surface-card",
    minimum: TEXT,
  },
  {
    reason: "Body text on a selected option",
    foreground: "text-primary",
    background: "surface-selected",
    minimum: TEXT,
  },
  {
    reason: "Supporting text on the page",
    foreground: "text-secondary",
    background: "surface-page",
    minimum: TEXT,
  },
  {
    reason: "Supporting text on a card",
    foreground: "text-secondary",
    background: "surface-card",
    minimum: TEXT,
  },
  {
    reason: "Supporting text on a selected option",
    foreground: "text-secondary",
    background: "surface-selected",
    minimum: TEXT,
  },
  {
    reason: "Link on the page",
    foreground: "text-link",
    background: "surface-page",
    minimum: TEXT,
  },
  {
    reason: "Link on a card",
    foreground: "text-link",
    background: "surface-card",
    minimum: TEXT,
  },
  {
    reason: "Link on a selected option",
    foreground: "text-link",
    background: "surface-selected",
    minimum: TEXT,
  },
  {
    reason: "Discovery badge text",
    foreground: "accent-peach-text",
    background: "accent-peach-surface",
    minimum: TEXT,
  },
  {
    reason: "Success message",
    foreground: "status-success-text",
    background: "status-success-surface",
    minimum: TEXT,
  },
  {
    reason: "Warning message",
    foreground: "status-warning-text",
    background: "status-warning-surface",
    minimum: TEXT,
  },
  {
    reason: "Error message",
    foreground: "status-error-text",
    background: "status-error-surface",
    minimum: TEXT,
  },
  {
    reason: "Focus ring on the page (the offset shows the page)",
    foreground: "focus-ring",
    background: "surface-page",
    minimum: BOUNDARY,
  },
  {
    reason: "Focus ring on a card (the offset shows the card)",
    foreground: "focus-ring",
    background: "surface-card",
    minimum: BOUNDARY,
  },
  {
    reason: "Input outline on the page",
    foreground: "border-control",
    background: "surface-page",
    minimum: BOUNDARY,
  },
  {
    reason: "Input outline on a card",
    foreground: "border-control",
    background: "surface-card",
    minimum: BOUNDARY,
  },
  {
    reason: "Input outline on a selected option",
    foreground: "border-control",
    background: "surface-selected",
    minimum: BOUNDARY,
  },
  {
    reason: "Primary button edge and current step on the page",
    foreground: "action-primary",
    background: "surface-page",
    minimum: BOUNDARY,
  },
  {
    reason: "Primary button edge and current step on a card",
    foreground: "action-primary",
    background: "surface-card",
    minimum: BOUNDARY,
  },
]

describe("MTOGO colour tokens", () => {
  for (const { reason, foreground, background, minimum } of cases) {
    it(`${reason}: ${foreground} on ${background} reaches ${minimum}:1`, () => {
      assert.ok(mtogo[foreground], `missing token ${foreground}`)
      assert.ok(mtogo[background], `missing token ${background}`)
      const ratio = contrastRatio(mtogo[foreground], mtogo[background])
      assert.ok(ratio >= minimum, `${ratio.toFixed(2)}:1 is below ${minimum}:1`)
    })
  }
})
