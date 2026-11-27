import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { IFlagRouter } from "@medusajs/framework/feature-flags"
import RestaurantStatementsFeatureFlag from "../feature-flags/restaurant-statements"
import {
  STATEMENT_NAVIGATION,
  syncFlaggedNavigationWorkflow,
} from "../workflows/operator-sidebar"

/**
 * Keeps Earnings (#256) out of the Admin sidebar while Restaurant statements
 * are not released, and puts it back once they are (ADR-0022). The first
 * tick after a restart applies the flag Medusa loaded at boot.
 */
export default async function syncStatementNavigation(
  container: MedusaContainer,
) {
  const isReleased = container
    .resolve<IFlagRouter>(ContainerRegistrationKeys.FEATURE_FLAG_ROUTER)
    .isFeatureEnabled(RestaurantStatementsFeatureFlag.key)
  await syncFlaggedNavigationWorkflow(container).run({
    input: { navigation: STATEMENT_NAVIGATION, isReleased },
  })
}

export const config = {
  name: "sync-statement-navigation",
  schedule: "* * * * *",
}
