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
    },
  },
  plugins: [typeBase],
}
