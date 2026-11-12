/**
 * MTOGO's own tokens, named for the job a colour does. The design brief
 * (apps/docs product/design-brief) says where each one is used.
 * Everything else (greys, spacing, typography, dark mode) comes from Medusa
 * UI's preset, so our screens match the Medusa UI components.
 */
module.exports = {
  colors: {
    mtogo: {
      "brand-logo": "#007F80",

      "action-primary": "#007F80",
      "action-primary-hover": "#006D6F",
      "action-primary-pressed": "#005B5D",
      "text-on-primary": "#FFFFFF",
      "text-link": "#005B5D",
      "focus-ring": "#005B5D",

      "surface-page": "#F8F7F3",
      "surface-card": "#FFFFFF",
      "surface-selected": "#E3F7F4",

      "text-primary": "#172B2D",
      "text-secondary": "#536568",

      "border-subtle": "#D8E2DF",
      "border-control": "#7D8F8C",

      "accent-peach-surface": "#FFD9BA",
      "accent-peach-text": "#7A3D15",

      "status-success-surface": "#E5F5EB",
      "status-success-text": "#17623D",
      "status-warning-surface": "#FFF2D4",
      "status-warning-text": "#754B00",
      "status-error-surface": "#FDEBEC",
      "status-error-text": "#A32638",
    },
  },
  borderRadius: {
    card: "12px",
  },
}
