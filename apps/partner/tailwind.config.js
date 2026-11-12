module.exports = {
  presets: [require("@dtc/ui/tailwind-preset")],
  content: [
    "./src/**/*.{ts,tsx}",
    "../../node_modules/@medusajs/ui/dist/**/*.{js,jsx,ts,tsx}",
  ],
}
