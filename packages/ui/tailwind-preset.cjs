const tokens = require("./tokens.cjs")

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
}
