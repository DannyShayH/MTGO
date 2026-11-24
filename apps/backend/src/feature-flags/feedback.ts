import type { FlagSettings } from "@medusajs/framework/feature-flags"

/**
 * Customer Feedback on delivered Orders (#51), default off (ADR-0022).
 * Release it with `MTOGO_FF_FEEDBACK=true` and a restart; no build needed.
 */
const FeedbackFeatureFlag: FlagSettings = {
  key: "feedback",
  env_key: "MTOGO_FF_FEEDBACK",
  default_val: false,
  description: "Customer Feedback on delivered Orders (#51)",
}

export default FeedbackFeatureFlag
