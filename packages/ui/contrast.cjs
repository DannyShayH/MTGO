/**
 * WCAG 2 contrast ratio between two "#RRGGBB" colours, from 1 to 21.
 * Use it to check a new token pair before adding it to the design brief:
 *   node -p 'require("@dtc/ui/contrast").contrastRatio("#FFFFFF", "#007F80")'
 */
function relativeLuminance(hex) {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground)
  const b = relativeLuminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

module.exports = { contrastRatio }
