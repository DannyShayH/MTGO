import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { IFlagRouter } from "@medusajs/framework/feature-flags"
import OperationsMonitoringFeatureFlag from "../feature-flags/operations-monitoring"
import {
  OPERATIONS_NAVIGATION,
  OPERATIONS_RELEASED_ORDER,
  syncFlaggedNavigationWorkflow,
} from "../workflows/operator-sidebar"

/**
 * Keeps Operations (#259) out of the Admin sidebar while operations
 * monitoring is not released, and puts it back once it is (ADR-0022),
 * directly under Search as the operator's first stop. The
 * first tick after a restart applies the flag Medusa loaded at boot.
 */
export default async function syncOperationsNavigation(
  container: MedusaContainer,
) {
  const isReleased = container
    .resolve<IFlagRouter>(ContainerRegistrationKeys.FEATURE_FLAG_ROUTER)
    .isFeatureEnabled(OperationsMonitoringFeatureFlag.key)
  await syncFlaggedNavigationWorkflow(container).run({
    input: {
      navigation: OPERATIONS_NAVIGATION,
      isReleased,
      releasedOrder: OPERATIONS_RELEASED_ORDER,
    },
  })
}

export const config = {
  name: "sync-operations-navigation",
  schedule: "* * * * *",
}
