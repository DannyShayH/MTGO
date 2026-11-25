import type { FlagSettings } from "@medusajs/framework/feature-flags"

/** Delivery agent Bonus points (#236), default off (ADR-0022). */
const AgentBonusFeatureFlag: FlagSettings = {
  key: "agent_bonus",
  env_key: "MTOGO_FF_AGENT_BONUS",
  default_val: false,
  description: "Delivery agent Bonus points (#236)",
}
export default AgentBonusFeatureFlag
