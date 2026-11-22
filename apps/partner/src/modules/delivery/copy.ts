import type { DELIVERY_AGENT_TEXT } from "@dtc/i18n"

/** The Delivery agent texts in the viewer's language. */
export type DeliveryCopy = {
  [K in keyof typeof DELIVERY_AGENT_TEXT.en]: string
}

/** Press feedback for every tappable control: instant, small, and off for reduced motion. */
export const PRESSABLE =
  "transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"

/** The one card surface of the workspace. */
export const CARD =
  "rounded-card bg-mtogo-surface-card shadow-elevation-card-rest min-w-0"

/** The one visible explanation of claiming, shared by every claim button. */
export const CLAIM_HINT_ID = "claim-hint"

/** The cookie that remembers the agent turned Share my location on (#191). */
export const SHARE_CHOICE_COOKIE = "mtogo_share_location"
