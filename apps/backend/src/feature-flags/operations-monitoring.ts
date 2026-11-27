import type { FlagSettings } from "@medusajs/framework/feature-flags"

/**
 * Operations monitoring (#54), default off (ADR-0022). Off, the Admin
 * operations read answers 404 and the Operations page leaves the sidebar.
 * Release it with `MTOGO_FF_OPERATIONS_MONITORING=true` and a restart.
 */
const OperationsMonitoringFeatureFlag: FlagSettings = {
  key: "operations_monitoring",
  env_key: "MTOGO_FF_OPERATIONS_MONITORING",
  default_val: false,
  description: "Operations monitoring (#54)",
}

export default OperationsMonitoringFeatureFlag
