module.exports = {
  presets: [require("@dtc/ui/tailwind-preset")],
  content: [
    "./src/**/*.{ts,tsx}",
    // The shared charts (@dtc/charts) ship source with class names in it.
    "../../packages/charts/src/**/*.{ts,tsx}",
    "../../node_modules/@medusajs/ui/dist/**/*.{js,jsx,ts,tsx}",
  ],
}
