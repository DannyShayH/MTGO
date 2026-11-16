const tokens = require("./tokens.cjs")

/**
 * Type rules from the design brief (product/design-brief) that every MTOGO
 * screen shares, added as base styles so no app has to repeat them.
 */
function typeBase({ addBase }) {
  addBase({
    body: {
      // Prices, times and quantities line up in baskets, receipts and lists.
      fontVariantNumeric: "tabular-nums",
      // Long Danish compounds and email addresses wrap instead of overflowing.
      overflowWrap: "break-word",
    },
    "h1, h2, h3": { textWrap: "balance" },
    p: { textWrap: "pretty" },
  })
}

/** Tailwind preset for MTOGO apps: Medusa UI's preset plus our tokens. */
module.exports = {
  darkMode: "class",
  presets: [require("@medusajs/ui-preset")],
  theme: {
    extend: {
      colors: tokens.colors,
      borderRadius: tokens.borderRadius,
      // Motion shared by both apps. Entering and pressed elements use the
      // strong ease-out, so they answer at once; drawers use the drawer curve.
      transitionTimingFunction: {
        "out-strong": "cubic-bezier(0.23, 1, 0.32, 1)",
        drawer: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      keyframes: {
        "mtogo-fade-in": { from: { opacity: "0" } },
        "mtogo-fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
        },
        "mtogo-pop-in": {
          from: { opacity: "0", transform: "scale(0.8)" },
        },
      },
      // Use these through motion-safe:, so reduced motion skips the movement.
      animation: {
        "fade-in": "mtogo-fade-in 200ms cubic-bezier(0.23, 1, 0.32, 1) both",
        "fade-up": "mtogo-fade-up 300ms cubic-bezier(0.23, 1, 0.32, 1) both",
        "pop-in": "mtogo-pop-in 200ms cubic-bezier(0.23, 1, 0.32, 1) both",
      },
    },
  },
  plugins: [typeBase],
}
