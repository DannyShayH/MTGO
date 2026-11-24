import type { FlagSettings } from "@medusajs/framework/feature-flags"

/**
 * Restaurant fees and statements (#52), default off (ADR-0022). The Order's
 * financial-basis disclosure (#226) and every later statement route follow
 * it. Release it with `MTOGO_FF_RESTAURANT_STATEMENTS=true` and a restart.
 * Off, nothing financial is shown, but purchase facts are still recorded.
 */
const RestaurantStatementsFeatureFlag: FlagSettings = {
  key: "restaurant_statements",
  env_key: "MTOGO_FF_RESTAURANT_STATEMENTS",
  default_val: false,
  description: "Restaurant fees and statements (#52)",
}

export default RestaurantStatementsFeatureFlag
